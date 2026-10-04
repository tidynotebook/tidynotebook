/**
 * Maps a request to a verified actor.
 *
 * One transport reaches the core rules. A browser session carries the full
 * role, so its grants are exactly the actions of the current role in every
 * workspace the account belongs to. Membership is therefore checked again on
 * every request.
 *
 * An actor is built only through `verifyActor`, so a parsed request object can
 * never be passed where the core expects a verified actor.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Actor, ControlStanding } from '@notesapp/core';
import { lockedAccountKeeps, sessionGrants, verifyActor } from '@notesapp/core';
import type { IdentityStoreHandle } from '@notesapp/storage-server';
import type { IdentityResolver } from '../plugins/register.ts';
import {
  AccountLockedError,
  AttemptsExceededError,
  ForbiddenError,
  OperatorOffError,
  OriginRequiredError,
  UnauthenticatedError,
} from '../plugins/problem.ts';
import {
  attemptAddress,
  type AttemptCounter,
} from '../plugins/attempt-store.ts';
import { toRequestHeaders, type NotesappAuth } from './better-auth.ts';
import { applicationOrigins, type ServedOrigin } from '../served-origins.ts';

/** A verified actor and what the session knows about it. */
export type ResolvedActor = {
  readonly actor: Actor;
  /** Whether the account uses every operation or the list of record 0201. */
  readonly standing: ControlStanding;
  /** The identity user of the session, which a password check names. */
  readonly authUserId: string;
  /** The identifier of the session, which is not its token (record 0122). */
  readonly sessionId: string;
  /** Sign-in address of the account. */
  readonly email: string | null;
  /** Display name of the account. */
  readonly name: string | null;
};

/** The security scheme name that the session transport satisfies. */
const sessionScheme = 'sessionCookie';

/** The security scheme of the operator API (record 0190). */
export const operatorScheme = 'operatorToken';

/** Methods that change no state, so they need no origin check. */
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Actors of the requests that are being served.
 *
 * A weak map keeps the verified actor out of the request object, so no handler
 * can reach it without asking for it and nothing serializes it by accident.
 */
const actors = new WeakMap<FastifyRequest, ResolvedActor>();

/** The verified actor of a request, or undefined for a public operation. */
export function requestActor(
  request: FastifyRequest,
): ResolvedActor | undefined {
  return actors.get(request);
}

/**
 * The verified actor of a guarded operation.
 *
 * The identity hook has already run for such an operation, so a missing actor
 * here is a defect rather than an unauthenticated caller.
 */
export function requireActor(request: FastifyRequest): ResolvedActor {
  const resolved = actors.get(request);
  if (resolved === undefined)
    throw new UnauthenticatedError('This operation needs a verified actor.');
  return resolved;
}

/**
 * The operator token and the bound of its failures (record 0190).
 *
 * A wrong token counts one attempt of the client address in the counter of
 * record 0121, which every process shares, and a wrong token past the limit
 * gets the answer of the attempt limit. The right token always passes.
 */
export type OperatorAccess = {
  /** The operator secret, or `null` when the installation names none. */
  readonly token: string | null;
  readonly attempts: AttemptCounter;
  readonly windowMs: number;
  readonly max: number;
};

/** What the identity adapter needs from the composition. */
export type IdentityDependencies = {
  readonly auth: NotesappAuth;
  readonly identity: IdentityStoreHandle;
  /** The served origins of the deployment, from `config.servedOrigins`. */
  readonly servedOrigins: readonly ServedOrigin[];
  /** The operator API, or nothing for a composition that serves none. */
  readonly operator?: OperatorAccess;
};

/** The bearer token of an `Authorization` header, or `null`. */
export function bearerToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^Bearer ([\x21-\x7e]{1,512})$/.exec(value);
  return match?.[1] ?? null;
}

/**
 * Whether a presented token is the operator token, in constant time.
 *
 * Both values are hashed first, so the comparison reads two values of one
 * length and its time says nothing about the length or the prefix of the
 * secret.
 */
export function sameSecret(presented: string, secret: string): boolean {
  const digest = (value: string): Buffer =>
    createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(presented), digest(secret));
}

/** The identity adapter of one deployment. */
export type IdentityAdapter = {
  /** The verified actor of a request, or `null` when there is none. */
  resolveActor(request: FastifyRequest): Promise<ResolvedActor | null>;
  /** The hook that `registerOperations` runs before a guarded operation. */
  resolver: IdentityResolver;
};

/** The account call that resolves a session. */
type SessionAccountStore = Pick<IdentityStoreHandle, 'sessionAccount'>;

/**
 * Refuses an operation of a locked account that the list of record 0201
 * does not name. A locked account keeps the way to unlock it, to export its
 * notes and to remove it, and every other operation answers `account_locked`.
 */
export function refuseLocked(
  standing: ControlStanding,
  operationId: string,
): void {
  if (standing === 'locked' && !lockedAccountKeeps(operationId))
    throw new AccountLockedError();
}

/**
 * Returns the account that one session serves.
 *
 * Every account comes in through the registration path (record 0108), so an
 * identity user that no account links is a failed attempt and resolves to
 * nothing. A disabled or removed account resolves to nothing as well
 * (record 0111). Nothing here makes an account.
 */
export async function accountForSession(
  identity: SessionAccountStore,
  authUserId: string,
): Promise<string | null> {
  return identity.sessionAccount(authUserId);
}

/**
 * Reads the session of a request.
 *
 * The shape is narrowed by hand, because the session of a Better Auth instance
 * carries whatever its plugins add and the parts that matter here are only the
 * user identity and the address.
 */
function readSessionUser(
  value: unknown,
): { id: string; email: string; name: string; sessionId: string } | null {
  if (value === null || typeof value !== 'object') return null;
  const record: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  );
  const user = record.user;
  if (user === null || typeof user !== 'object') return null;
  const fields: Record<string, unknown> = Object.fromEntries(
    Object.entries(user),
  );
  const id = fields.id;
  if (typeof id !== 'string' || id === '') return null;
  const session = record.session;
  const sessionFields: Record<string, unknown> =
    session === null || typeof session !== 'object'
      ? {}
      : Object.fromEntries(Object.entries(session));
  const sessionId = sessionFields.id;
  if (typeof sessionId !== 'string' || sessionId === '') return null;
  return {
    id,
    sessionId,
    email: typeof fields.email === 'string' ? fields.email : '',
    name: typeof fields.name === 'string' ? fields.name : '',
  };
}

/** What a cookie authenticated write may do. */
export type OriginDecision = 'accepted' | 'foreign' | 'missing';

/**
 * Decides a cookie authenticated write by its origin headers.
 *
 * A browser always sends `Origin` or the Fetch Metadata headers on a write, so
 * the check is positive rather than permissive: the request must name one of
 * the served origins, or state that it is same-origin. A request with neither
 * header did not come from a browser page.
 *
 * The list is the one that `config.servedOrigins` holds, which is the same
 * list that the identity routes trust. See
 * [decision 0039](../../../../docs/decisions/0039-one-list-of-served-origins.md).
 * Only an `application` origin is trusted, so a page on the published origin
 * cannot write (record 0118).
 */
export function checkWriteOrigin(
  servedOrigins: readonly ServedOrigin[],
  method: string,
  headers: {
    readonly origin?: string | undefined;
    readonly site?: string | undefined;
  },
): OriginDecision {
  if (safeMethods.has(method.toUpperCase())) return 'accepted';
  if (headers.origin !== undefined)
    return applicationOrigins(servedOrigins).includes(headers.origin)
      ? 'accepted'
      : 'foreign';
  if (headers.site !== undefined)
    return headers.site === 'same-origin' ? 'accepted' : 'foreign';
  return 'missing';
}

/**
 * Refuses a cookie authenticated write that does not name a served origin.
 *
 * The identity hook applies this to every guarded operation. An operation that
 * declares no security requirement but still reads or issues a cookie calls
 * this helper itself, so the rule lives in one place and no such operation can
 * forget it. `auth/setup.ts` is the one such operation today.
 */
export function requireWriteOrigin(
  servedOrigins: readonly ServedOrigin[],
  request: FastifyRequest,
): void {
  const decision = checkWriteOrigin(servedOrigins, request.method, {
    origin: headerValue(request.headers.origin),
    site: headerValue(request.headers['sec-fetch-site']),
  });
  if (decision === 'foreign')
    throw new ForbiddenError(
      'A cookie authenticated write must come from an origin that this deployment serves.',
    );
  if (decision === 'missing') throw new OriginRequiredError();
}

/** Reads one header as a single string. */
function headerValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

/** Builds the identity adapter of a deployment. */
export function createIdentityAdapter(
  dependencies: IdentityDependencies,
): IdentityAdapter {
  /** Resolves a browser session cookie. */
  async function fromSession(
    request: FastifyRequest,
  ): Promise<ResolvedActor | null> {
    const session: unknown = await dependencies.auth.api.getSession({
      headers: toRequestHeaders(request),
    });
    const user = readSessionUser(session);
    if (user === null) return null;
    // A session resolves to its enabled account and never makes one.
    const served = await dependencies.identity.sessionStanding(user.id);
    if (served === null) return null;
    const linked = served.accountId;
    const memberships = await dependencies.identity.memberships(linked);
    const verified = verifyActor(linked, sessionGrants(memberships));
    if (!verified.ok) return null;
    return {
      actor: verified.value,
      standing: served.standing,
      authUserId: user.id,
      sessionId: user.sessionId,
      email: user.email === '' ? null : user.email,
      name: user.name === '' ? null : user.name,
    };
  }

  async function resolveActor(
    request: FastifyRequest,
  ): Promise<ResolvedActor | null> {
    // The session cookie is the only credential this deployment accepts. A
    // request that presents an `Authorization` header meant to be
    // authenticated by that credential, so it is refused instead of falling
    // back to the cookie and being authenticated as somebody else.
    if (request.headers.authorization !== undefined) return null;
    return fromSession(request);
  }

  /**
   * Checks the operator token of a request (record 0190). The operation sets
   * no actor, because the operator is no account.
   */
  async function checkOperator(request: FastifyRequest): Promise<void> {
    const access = dependencies.operator;
    if (access === undefined || access.token === null)
      throw new OperatorOffError();
    // The right token always passes, so wrong tokens from an address that
    // the service shares never lock the service out. A wrong token counts
    // in one step, and its answer turns to the attempt limit past the bound.
    // The secret holds at least 32 characters, so the bound limits the noise
    // of the refusals and not the odds of a guess.
    const presented = bearerToken(request.headers.authorization);
    if (presented !== null && sameSecret(presented, access.token)) return;
    const counted = await access.attempts.count(
      `operator:${attemptAddress(request.ip)}`,
      access.windowMs,
      Date.now(),
    );
    if (counted.current > access.max) throw new AttemptsExceededError();
    throw new UnauthenticatedError('This operation needs the operator token.');
  }

  const resolver: IdentityResolver = async (request, operation) => {
    const schemes = operation.security.flatMap((requirement) =>
      Object.keys(requirement),
    );
    // An operator operation takes the operator token alone, and a session
    // never satisfies it.
    if (schemes.includes(operatorScheme)) {
      await checkOperator(request);
      return;
    }
    const resolved = await resolveActor(request);
    if (resolved === null)
      throw new UnauthenticatedError(
        'This operation needs a valid session cookie.',
      );
    const accepted = operation.security.flatMap((requirement) =>
      Object.keys(requirement),
    );
    if (!accepted.includes(sessionScheme))
      throw new UnauthenticatedError(
        'This operation does not accept the supplied credential.',
      );
    requireWriteOrigin(dependencies.servedOrigins, request);
    refuseLocked(resolved.standing, operation.id);
    actors.set(request, resolved);
  };

  return { resolveActor, resolver };
}
