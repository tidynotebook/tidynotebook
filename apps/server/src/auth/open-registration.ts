/**
 * Open registration: a sign-up and the proof of its address (record 0114).
 *
 * A sign-up makes a pending identity user with an unverified address and sends
 * a verification link. No account and no session exist before the person
 * opens the link. The link makes the account through the one registration
 * path, with the `open` ground, and the person then signs in. A pending
 * identity user that nobody verifies expires, and the hourly run removes it.
 *
 * **One answer for every address.** A new address, a pending address and an
 * address that already signs in all end in the same success, so a stranger
 * learns nothing about an address. A pending address is replaced with its
 * password, so a person who signed up first with the address of another
 * person keeps nothing. An address that already signs in gets a message to its
 * owner. Each branch hashes one password and sends one message, so the time of
 * the answer does not show the branch. A leaked password is refused before the
 * address is read, so that refusal is the same for every address as well.
 *
 * **One proof of work for each sign-up.** A sign-up carries the solution of
 * one challenge of this server (record 0115). The proof is checked before the
 * address is read, and a challenge counts once.
 *
 * **Consent to the legal documents.** When the installation names its terms
 * and its privacy notice, a sign-up names the versions that the person
 * accepted (record 0120). The link carries them, and the account stores them
 * when the link makes it.
 *
 * **One message budget for each address.** A message counts against a limit
 * of the target address, so a sign-up cannot flood the mailbox of another
 * person. Over the limit the sign-up still answers the same and sends nothing.
 */
import { randomUUID } from 'node:crypto';
import type {
  ConsentVersions,
  LegalDocuments,
  RegistrationPolicy,
  RegistrationStore,
  Result,
  WorkspaceAdminStore,
} from '@notesapp/core';
import {
  consentMatches,
  fail,
  verifyActor,
  normalizeEmail,
  ok,
  openSignUpAction,
  personalWorkspaceName,
  registerAccount,
} from '@notesapp/core';
import type { NotesappAuth } from './better-auth.ts';
import type { MailTransport } from './mail.ts';
import type { RegistrationIdentity } from './registration.ts';
import type { VerificationTokens } from './verification.ts';
import type { ProofAttempt, SignUpChallenges } from './proof-of-work.ts';
import { readProperty } from '../values.ts';

/** What open registration needs from the composition. */
export type OpenRegistrationDependencies = {
  readonly auth: NotesappAuth;
  readonly identity: RegistrationIdentity &
    Pick<RegistrationStore, 'registrationPolicy'>;
  /** The account store, which keeps the consent of a new account. */
  readonly accounts: WorkspaceAdminStore;
  /** The legal documents of the installation, or `null` (record 0120). */
  readonly documents: LegalDocuments | null;
  /** The mail transport. The open policy needs one (record 0114). */
  readonly mail: MailTransport | null;
  /** The application origin, which every link of a message names. */
  readonly origin: string;
  /** How long a pending sign-up waits for its verification. */
  readonly pendingHours: number;
  readonly tokens: VerificationTokens;
  /** Whether the breach service lists a new password (record 0116). */
  readonly breached: (password: string) => Promise<boolean>;
  /** Whether one more message may go to an address now. */
  readonly mayMail: (email: string) => Promise<boolean>;
  /** The challenges of the proof of work (record 0115). */
  readonly challenges: SignUpChallenges;
  /** Marks one challenge used, and answers whether this was the first use. */
  readonly useChallenge: (digest: string, expiresAt: Date) => Promise<boolean>;
  /** The byte limit that a new account starts with. */
  readonly limitBytes: bigint;
  readonly clock: () => Date;
};

/** What a person gives to sign up. */
export type SignUpInput = {
  readonly email: string;
  readonly password: string;
  readonly name: string | null;
  readonly proof: ProofAttempt;
  /** The versions of the legal documents that the person accepted. */
  readonly consent: ConsentVersions | null;
};

/** The address of the page that opens a verification link. */
export function verificationLink(origin: string, token: string): string {
  return `${origin}/verify#${token}`;
}

/** The message that carries a verification link. */
function verificationMessage(
  to: string,
  link: string,
  hours: number,
): { to: string; subject: string; text: string } {
  return {
    to,
    subject: 'Finish your notesapp account',
    text: [
      'Open this link to prove your address and finish your account.',
      link,
      `The link works for ${String(hours)} ${hours === 1 ? 'hour' : 'hours'}.`,
      'Ignore this message if you did not ask for an account. Nothing is',
      'made without the link.',
    ].join('\n'),
  };
}

/** The message to the owner of an address that already signs in. */
function attemptMessage(
  to: string,
  origin: string,
): { to: string; subject: string; text: string } {
  return {
    to,
    subject: 'A new notesapp account was asked for with your address',
    text: [
      'Somebody asked for a new account with this address. The address',
      'already has an account, so nothing changed.',
      `Sign in here: ${origin}/login`,
      'If you do not know your password, select Forgot password there.',
      'Ignore this message if you asked for the account yourself.',
    ].join('\n'),
  };
}

/** Sends one message when the budget of its address allows it. */
async function send(
  dependencies: OpenRegistrationDependencies,
  message: { to: string; subject: string; text: string },
): Promise<void> {
  if (dependencies.mail === null) return;
  if (!(await dependencies.mayMail(message.to))) return;
  await dependencies.mail.send(message);
}

/**
 * Takes one sign-up. The answer is the same success for every address, and
 * a refusal only for a closed policy or a leaked password.
 */
export async function signUpOpen(
  dependencies: OpenRegistrationDependencies,
  input: SignUpInput,
): Promise<Result<void>> {
  if ((await dependencies.identity.registrationPolicy()) !== 'open')
    return fail('registration_closed');
  const refusal = await dependencies.challenges.check(
    input.proof,
    dependencies.clock(),
    dependencies.useChallenge,
  );
  if (refusal !== null) return fail('proof_invalid');
  const documents = dependencies.documents;
  if (documents !== null && !consentMatches(documents, input.consent))
    return fail('consent_required');
  if (await dependencies.breached(input.password))
    return fail('password_breached');
  const email = normalizeEmail(input.email);
  if (email === null) return ok(undefined);
  const { auth, identity } = dependencies;
  const context = await auth.$context;
  const existing = await context.internalAdapter.findUserByEmail(email);
  const linked =
    existing === null
      ? null
      : { linked: (await identity.accountOf(existing.user.id)) !== null };
  const action = openSignUpAction(linked);
  if (action === 'notify') {
    // The same work as a new sign-up: one hash of the password, one message.
    await context.password.hash(input.password);
    await send(dependencies, attemptMessage(email, dependencies.origin));
    return ok(undefined);
  }
  if (action === 'replace' && existing !== null)
    await context.internalAdapter.deleteUser(existing.user.id);
  let authUserId: string;
  try {
    const created: unknown = await auth.api.signUpEmail({
      body: { email, name: input.name ?? email, password: input.password },
    });
    const id = readProperty(readProperty(created, 'user'), 'id');
    if (typeof id !== 'string' || id === '') return ok(undefined);
    authUserId = id;
  } catch {
    // Two sign-ups for one address race here, and the other one holds the
    // address now. That one sent its own message.
    return ok(undefined);
  }
  const expiresAt = new Date(
    dependencies.clock().getTime() + dependencies.pendingHours * 3_600_000,
  );
  const token = dependencies.tokens.issue(
    authUserId,
    expiresAt,
    documents === null ? null : input.consent,
  );
  await send(
    dependencies,
    verificationMessage(
      email,
      verificationLink(dependencies.origin, token),
      dependencies.pendingHours,
    ),
  );
  return ok(undefined);
}

/** What a verification made. */
export type Verified = {
  readonly accountId: string;
  readonly email: string;
  /** Whether this use made the account, so its first note goes in once. */
  readonly created: boolean;
};

/**
 * Proves the address of one pending sign-up and makes its account.
 *
 * An expired, a forged and a replaced token all answer one refusal. A second
 * use of a valid token answers the account that the first use made.
 */
export async function verifyOpen(
  dependencies: OpenRegistrationDependencies,
  token: string,
): Promise<Result<Verified>> {
  const claim = dependencies.tokens.read(token, dependencies.clock());
  if (claim === null) return fail('verification_invalid');
  const authUserId = claim.authUserId;
  const context = await dependencies.auth.$context;
  const user = await context.internalAdapter.findUserById(authUserId);
  if (user === null) return fail('verification_invalid');
  const before = await dependencies.identity.accountOf(authUserId);
  if (before !== null)
    return ok({ accountId: before, email: user.email, created: false });
  const made = await registerAccount(dependencies.identity, {
    authUserId,
    ground: { kind: 'open' },
    accountId: randomUUID(),
    workspaceId: randomUUID(),
    workspaceName: personalWorkspaceName,
    limitBytes: dependencies.limitBytes,
  });
  if (!made.ok) return fail(made.error.code);
  // The account keeps the versions that the person accepted at the sign-up.
  // A version raised since then asks again at the first sign-in.
  const consent = claim.consent;
  const actor = verifyActor(made.value, []);
  if (consent !== null && actor.ok)
    await dependencies.accounts.account(actor.value, (tx) =>
      tx.recordConsent(consent),
    );
  // The account exists, so the address counts as proved from now on and the
  // person can sign in.
  await context.internalAdapter.updateUser(authUserId, { emailVerified: true });
  return ok({ accountId: made.value, email: user.email, created: true });
}

/** Whether the installation takes a sign-up now. */
export async function openRegistration(identity: {
  registrationPolicy(): Promise<RegistrationPolicy>;
}): Promise<boolean> {
  return (await identity.registrationPolicy()) === 'open';
}
