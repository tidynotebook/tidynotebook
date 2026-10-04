/**
 * The one registration path of the server (record 0108).
 *
 * First-run setup, `pnpm owner:bootstrap` and the registration of an invited
 * person all call `registerIdentity`. It makes the identity user through the
 * internal API of Better Auth, then calls the one registration function of
 * the database through `registerAccount`, and deletes the identity user again
 * when that function refuses. The identity user and the account live in two
 * stores with two transactions, so this compensation is what keeps a refused
 * attempt from leaving an identity user behind.
 *
 * No session exists before the account does. `startSession` signs the person
 * in after the registration, and the session create hook of `better-auth.ts`
 * refuses a session for an identity user that no enabled account links.
 */
import { randomUUID } from 'node:crypto';
import type {
  NewAccountSettings,
  RegistrationGround,
  RegistrationStore,
  Result,
} from '@notesapp/core';
import {
  fail,
  normalizeEmail,
  personalWorkspaceName,
  registerAccount,
} from '@notesapp/core';
import { breachedPasswordCode, type NotesappAuth } from './better-auth.ts';
import { readProperty } from '../values.ts';

/** What the identity side must answer besides the registration store. */
export type RegistrationIdentity = RegistrationStore & {
  /** The account of a Better Auth user, or `null` when none is linked. */
  accountOf(authUserId: string): Promise<string | null>;
};

/** What one registration needs. */
export type RegistrationInput = {
  readonly email: string;
  readonly name: string;
  readonly password: string;
  readonly ground: RegistrationGround;
  /** The controls that a new account starts with (record 0189). */
  readonly newAccount: NewAccountSettings;
};

/** The account that a registration made, and its identity user. */
export type Registered = {
  readonly accountId: string;
  readonly authUserId: string;
  readonly email: string;
};

/** The code that a refusal of the library carries, or `null`. */
function libraryCodeOf(error: unknown): string | null {
  const code = readProperty(readProperty(error, 'body'), 'code');
  return typeof code === 'string' ? code : null;
}

/** Deletes an identity user. A user that is gone already is no failure. */
async function deleteIdentityUser(
  auth: NotesappAuth,
  authUserId: string,
): Promise<void> {
  const context = await auth.$context;
  const found = await context.internalAdapter.findUserById(authUserId);
  if (found !== null) await context.internalAdapter.deleteUser(authUserId);
}

/** The refusal of a ground, with the one code of that ground. */
function refusal<T>(ground: RegistrationGround): Result<T> {
  return fail(
    ground.kind === 'invitation' ? 'invitation_invalid' : 'forbidden',
  );
}

/**
 * Makes one account through the one registration path.
 *
 * An address that an account already signs in with is refused with the code
 * of the ground, so an invitation answers the same as for any other invalid
 * invitation. An identity user of the address that no account links is a
 * failed earlier attempt, and it goes first.
 */
export async function registerIdentity(
  auth: NotesappAuth,
  identity: RegistrationIdentity,
  input: RegistrationInput,
): Promise<Result<Registered>> {
  const email = normalizeEmail(input.email);
  if (email === null) return refusal(input.ground);
  const context = await auth.$context;
  const existing = await context.internalAdapter.findUserByEmail(email);
  if (existing !== null) {
    if ((await identity.accountOf(existing.user.id)) !== null)
      return refusal(input.ground);
    await deleteIdentityUser(auth, existing.user.id);
  }
  let authUserId: string;
  try {
    const created: unknown = await auth.api.signUpEmail({
      body: { email, name: input.name, password: input.password },
    });
    const id = readProperty(readProperty(created, 'user'), 'id');
    if (typeof id !== 'string' || id === '') return refusal(input.ground);
    authUserId = id;
  } catch (error: unknown) {
    // A leaked password has its own answer, because the person can act on
    // it (record 0116).
    if (libraryCodeOf(error) === breachedPasswordCode)
      return fail('password_breached');
    // Two acceptances of one invitation race here: the second finds the
    // address taken by the identity user of the first. It made nothing.
    return refusal(input.ground);
  }
  let made: Result<string>;
  try {
    made = await registerAccount(identity, {
      authUserId,
      ground: input.ground,
      accountId: randomUUID(),
      workspaceId: randomUUID(),
      workspaceName: personalWorkspaceName,
      newAccount: input.newAccount,
    });
  } catch (error) {
    await deleteIdentityUser(auth, authUserId);
    throw error;
  }
  if (!made.ok) {
    await deleteIdentityUser(auth, authUserId);
    return fail(made.error.code);
  }
  // The address of this account is proved: the operator typed it at the first
  // run, or the invitation bound it (record 0114).
  await context.internalAdapter.updateUser(authUserId, { emailVerified: true });
  return { ok: true, value: { accountId: made.value, authUserId, email } };
}

/**
 * The question of the session create hook: whether an identity user may
 * start a session (record 0111). The composition and every test that builds
 * an auth instance ask it through this one function.
 */
export function sessionAllowedBy(identity: {
  sessionAccount(authUserId: string): Promise<string | null>;
}): (authUserId: string) => Promise<boolean> {
  return async (authUserId) =>
    (await identity.sessionAccount(authUserId)) !== null;
}

/**
 * Starts the session of an account that exists, and answers its cookies.
 *
 * The answer is empty when the library started no session, which the caller
 * treats as a failure of the protocol library.
 */
export async function startSession(
  auth: NotesappAuth,
  email: string,
  password: string,
): Promise<readonly string[]> {
  const response: unknown = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  if (!(response instanceof Response) || !response.ok) return [];
  return response.headers.getSetCookie();
}

/** Whether a password is the current password of one identity user. */
export async function passwordMatches(
  auth: NotesappAuth,
  authUserId: string,
  password: string,
): Promise<boolean> {
  const context = await auth.$context;
  const credential =
    await context.internalAdapter.findCredentialAccount(authUserId);
  const hash = credential?.password;
  if (typeof hash !== 'string' || hash === '') return false;
  return context.password.verify({ hash, password });
}
