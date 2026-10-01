/**
 * The public operations that make an account (record 0108).
 *
 * First-run setup makes the first account, an administrator, while no account
 * exists. The registration of an invited person makes a member for the
 * address of the invitation. Both go through `registerIdentity`, the one
 * registration path, and both start the session of the new account after it
 * exists. An open sign-up and its verification (record 0114) live in
 * `open-registration.ts`, and the person signs in after the verification.
 * None of these operations declares a security scheme, so each applies the
 * origin rule itself.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ConsentVersions, WorkspaceStore } from '@notesapp/core';
import { consentMatches, readInvitation, verifyActor } from '@notesapp/core';
import type { IdentityStoreHandle } from '@notesapp/storage-server';
import type { HandlerMap, HandlerResult } from '../plugins/register.ts';
import { DomainProblemError, ForbiddenError } from '../plugins/problem.ts';
import { readProperty } from '../values.ts';
import { requireWriteOrigin } from './actor.ts';
import type { NotesappAuth } from './better-auth.ts';
import { secretDigest } from './publication-secrets.ts';
import { registerIdentity, startSession } from './registration.ts';
import { seedWelcomeNote } from './welcome-note.ts';
import {
  openRegistration,
  signUpOpen,
  verifyOpen,
  type OpenRegistrationDependencies,
} from './open-registration.ts';
import type { ServedOrigin } from '../served-origins.ts';

const jsonMediaType = 'application/json';

function text(value: unknown, key: string): string {
  const member = readProperty(value, key);
  if (typeof member !== 'string' || member === '')
    throw new Error(`notesapp: validated input has no ${key}.`);
  return member;
}

/** The consent of a validated body, or `null` when it carries none. */
function consentOf(body: unknown): ConsentVersions | null {
  const consent = readProperty(body, 'consent');
  return consent === undefined
    ? null
    : {
        termsVersion: text(consent, 'termsVersion'),
        privacyVersion: text(consent, 'privacyVersion'),
      };
}

/** The one refusal of an invitation, whatever its cause. */
function invitationRefused(): DomainProblemError {
  return new DomainProblemError({ code: 'invitation_invalid', fileIds: [] });
}

/** What the account operations of a first run and a registration need. */
export type SetupDependencies = {
  readonly auth: NotesappAuth;
  readonly identity: IdentityStoreHandle;
  readonly content: WorkspaceStore;
  /** The served origins of the deployment, from `config.servedOrigins`. */
  readonly servedOrigins: readonly ServedOrigin[];
  /** The byte limit that a new account starts with. */
  readonly accountLimitBytes: bigint;
  /** What an open sign-up and its verification need (record 0114). */
  readonly open: Omit<
    OpenRegistrationDependencies,
    'auth' | 'identity' | 'accounts' | 'limitBytes'
  >;
};

/** Builds the public operations that make an account. */
export function createSetupHandlers(
  dependencies: SetupDependencies,
): HandlerMap {
  const { auth, identity, content, servedOrigins } = dependencies;
  const open: OpenRegistrationDependencies = {
    ...dependencies.open,
    auth,
    identity,
    accounts: identity,
    limitBytes: dependencies.accountLimitBytes,
  };

  /** Writes the welcome note into the personal workspace of an account. */
  const welcome = async (accountId: string): Promise<void> => {
    const [membership] = await identity.memberships(accountId);
    if (membership !== undefined)
      await seedWelcomeNote(content, accountId, membership.workspaceId);
  };

  return {
    getSetupStatus: async (): Promise<HandlerResult> => ({
      status: 200,
      mediaType: jsonMediaType,
      body: {
        initialized: await identity.hasAccount(),
        openRegistration: await openRegistration(identity, open.mail),
        // A reset link goes by mail, so a reset needs a transport (record
        // 0141).
        passwordReset: await dependencies.open.mail.available(),
        legalDocuments: await dependencies.open.documents(),
      },
    }),

    createOwner: async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<HandlerResult> => {
      // This is a write that a stranger can reach, and it answers with a
      // session cookie. It reads the one served origin list of
      // [decision 0039](../../../../docs/decisions/0039-one-list-of-served-origins.md),
      // the same list that every guarded write reads, so no page of another
      // origin can start the installation on behalf of the person who runs it.
      requireWriteOrigin(servedOrigins, request);
      if (await identity.hasAccount())
        throw new ForbiddenError('The first account already exists.');
      const email = text(request.body, 'email');
      const password = text(request.body, 'password');
      const made = await registerIdentity(auth, identity, {
        email,
        name: email,
        password,
        ground: { kind: 'first-run' },
        limitBytes: dependencies.accountLimitBytes,
      });
      if (!made.ok) {
        if (made.error.code === 'password_breached')
          throw new DomainProblemError(made.error);
        throw new ForbiddenError('The first account already exists.');
      }
      // The one welcome note is written through the same commit path that the
      // create operation uses, so it has a revision and reaches every device.
      await welcome(made.value.accountId);
      const cookies = await startSession(auth, made.value.email, password);
      if (cookies.length === 0)
        throw new Error('notesapp: the first account got no session.');
      reply.header('set-cookie', [...cookies]);
      return {
        status: 201,
        mediaType: jsonMediaType,
        body: { initialized: true },
      };
    },

    readInvitation: async (request): Promise<HandlerResult> => {
      requireWriteOrigin(servedOrigins, request);
      const token = text(request.body, 'invitation');
      const read = await readInvitation(identity, secretDigest.digest(token));
      if (!read.ok) throw invitationRefused();
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: { email: read.value },
      };
    },

    registerAccount: async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<HandlerResult> => {
      requireWriteOrigin(servedOrigins, request);
      const token = text(request.body, 'invitation');
      const password = text(request.body, 'password');
      const digest = secretDigest.digest(token);
      // The address comes from the invitation, so the person cannot change it
      // while they accept. The registration function checks the invitation
      // again under its row lock, so a read here that races a revocation still
      // makes nothing.
      const address = await readInvitation(identity, digest);
      if (!address.ok) throw invitationRefused();
      // An invited person accepts the current terms and privacy notice when
      // the installation names them, as a sign-up does (record 0120).
      const documents = await dependencies.open.documents();
      const consent = consentOf(request.body);
      if (documents !== null && !consentMatches(documents, consent))
        throw new DomainProblemError({
          code: 'consent_required',
          fileIds: [],
        });
      const name = readProperty(request.body, 'name');
      const made = await registerIdentity(auth, identity, {
        email: address.value,
        name: typeof name === 'string' && name !== '' ? name : address.value,
        password,
        ground: { kind: 'invitation', tokenDigest: digest },
        limitBytes: dependencies.accountLimitBytes,
      });
      if (!made.ok) {
        if (made.error.code === 'password_breached')
          throw new DomainProblemError(made.error);
        throw invitationRefused();
      }
      const actor = verifyActor(made.value.accountId, []);
      if (documents !== null && consent !== null && actor.ok)
        await identity.account(actor.value, (tx) => tx.recordConsent(consent));
      await welcome(made.value.accountId);
      const cookies = await startSession(auth, made.value.email, password);
      if (cookies.length === 0)
        throw new Error('notesapp: the new account got no session.');
      reply.header('set-cookie', [...cookies]);
      return {
        status: 201,
        mediaType: jsonMediaType,
        body: { registered: true },
      };
    },

    getSignUpChallenge: async (): Promise<HandlerResult> => {
      if (!(await openRegistration(identity, open.mail)))
        throw new DomainProblemError({
          code: 'registration_closed',
          fileIds: [],
        });
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: open.challenges.issue(open.clock()),
      };
    },

    signUpAccount: async (request): Promise<HandlerResult> => {
      requireWriteOrigin(servedOrigins, request);
      const name = readProperty(request.body, 'name');
      const proof = readProperty(request.body, 'proof');
      const taken = await signUpOpen(open, {
        email: text(request.body, 'email'),
        password: text(request.body, 'password'),
        name: typeof name === 'string' && name !== '' ? name : null,
        proof: {
          challenge: text(proof, 'challenge'),
          solution: text(proof, 'solution'),
        },
        consent: consentOf(request.body),
      });
      if (!taken.ok) throw new DomainProblemError(taken.error);
      return {
        status: 202,
        mediaType: jsonMediaType,
        body: { accepted: true },
      };
    },

    verifyAddress: async (request): Promise<HandlerResult> => {
      requireWriteOrigin(servedOrigins, request);
      const verified = await verifyOpen(open, text(request.body, 'token'));
      if (!verified.ok) throw new DomainProblemError(verified.error);
      if (verified.value.created) await welcome(verified.value.accountId);
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: { email: verified.value.email },
      };
    },
  };
}
