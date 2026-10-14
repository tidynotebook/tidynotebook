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
import { AsyncLocalStorage } from 'node:async_hooks';
import type { OperationId } from '@notesapp/api-contract';
import type { FastifyRequest } from 'fastify';
import type { Actor, ControlStanding } from '@notesapp/core';
import { lockedAccountKeeps, sessionGrants, verifyActor } from '@notesapp/core';
import type {
  IdentityStoreHandle,
  OAuthTokenIdentity,
} from '@notesapp/storage-server';
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
import { isApiKeySecret } from './api-key-secrets.ts';
import { secretDigest } from './publication-secrets.ts';
import { applicationOrigins, type ServedOrigin } from '../served-origins.ts';

/** A verified actor and the account facts of its credential. */
export type ResolvedActor = {
  readonly actor: Actor;
  /** Whether the account uses every operation or the list of record 0201. */
  readonly standing: ControlStanding;
  /** The identity user of the account, which a password check names. */
  readonly authUserId: string;
  /** The browser session identifier, or null for a personal key (0208). */
  readonly sessionId: string | null;
  /** Sign-in address of the account. */
  readonly email: string | null;
  /** Display name of the account. */
  readonly name: string | null;
};

/** The security scheme name that the session transport satisfies. */
const sessionScheme = 'sessionCookie';
export const apiKeyScheme = 'personalApiKey';

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

/** A capability exists only in the asynchronous work of one tool call. */
type ToolDelegation = {
  readonly grant: OAuthTokenIdentity;
  readonly operations: ReadonlySet<OperationId>;
  active: boolean;
};
const delegations = new AsyncLocalStorage<ToolDelegation>();

/** No header, body, cookie or request property can install this capability. */
export async function withToolDelegation<T>(
  grant: OAuthTokenIdentity,
  operations: readonly OperationId[],
  run: () => Promise<T>,
): Promise<T> {
  const delegation: ToolDelegation = {
    grant,
    operations: new Set(operations),
    active: true,
  };
  try {
    return await delegations.run(delegation, run);
  } finally {
    // Descendant asynchronous work can retain the context, but never its right.
    delegation.active = false;
  }
}

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

/** An operation that refers to the current browser session must have one. */
export function requireSessionActor(
  request: FastifyRequest,
): ResolvedActor & { readonly sessionId: string } {
  const resolved = requireActor(request);
  if (resolved.sessionId === null)
    throw new UnauthenticatedError('This operation needs a browser session.');
  return { ...resolved, sessionId: resolved.sessionId };
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
  const match = /^Bearer +([\x21-\x7e]{1,512})$/i.exec(value);
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
  /** Both credentials read the same current membership and build the same actor. */
  async function withAccount(
    input: Omit<ResolvedActor, 'actor'> & { readonly accountId: string },
  ): Promise<ResolvedActor | null> {
    const memberships = await dependencies.identity.memberships(
      input.accountId,
    );
    const verified = verifyActor(input.accountId, sessionGrants(memberships));
    if (!verified.ok) return null;
    return {
      actor: verified.value,
      standing: input.standing,
      authUserId: input.authUserId,
      sessionId: input.sessionId,
      email: input.email,
      name: input.name,
    };
  }
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
    return withAccount({
      accountId: served.accountId,
      standing: served.standing,
      authUserId: user.id,
      sessionId: user.sessionId,
      email: user.email === '' ? null : user.email,
      name: user.name === '' ? null : user.name,
    });
  }

  async function resolveActor(
    request: FastifyRequest,
  ): Promise<ResolvedActor | null> {
    // An explicit credential always wins. Its failure never uses a cookie.
    if (request.headers.authorization !== undefined) {
      const token = bearerToken(request.headers.authorization);
      if (token === null || !isApiKeySecret(token)) return null;
      const identity = await dependencies.identity.apiKeyIdentity(
        secretDigest.digest(token),
      );
      if (identity === null) return null;
      return withAccount({ ...identity, sessionId: null });
    }
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
    const delegation = delegations.getStore();
    if (delegation !== undefined) {
      if (
        !delegation.active ||
        !delegation.operations.has(operation.id) ||
        !schemes.includes(apiKeyScheme) ||
        schemes.includes(operatorScheme)
      )
        throw new UnauthenticatedError('This tool cannot call this operation.');
      const current = await dependencies.identity.sessionStanding(
        delegation.grant.authUserId,
      );
      if (current === null || current.accountId !== delegation.grant.accountId)
        throw new UnauthenticatedError('This account cannot use this tool.');
      const resolved = await withAccount({
        ...current,
        authUserId: delegation.grant.authUserId,
        sessionId: null,
        email: null,
        name: null,
      });
      if (resolved === null)
        throw new UnauthenticatedError('This account cannot use this tool.');
      refuseLocked(resolved.standing, operation.id);
      actors.set(request, resolved);
      return;
    }
    // An operator operation takes the operator token alone, and a session
    // never satisfies it.
    if (schemes.includes(operatorScheme)) {
      await checkOperator(request);
      return;
    }
    const resolved = await resolveActor(request);
    if (resolved === null)
      throw new UnauthenticatedError(
        'This operation needs a valid session or API key.',
      );
    if (
      !schemes.includes(
        resolved.sessionId === null ? apiKeyScheme : sessionScheme,
      )
    )
      throw new UnauthenticatedError(
        'This operation does not accept the supplied credential.',
      );
    if (resolved.sessionId !== null)
      requireWriteOrigin(dependencies.servedOrigins, request);
    refuseLocked(resolved.standing, operation.id);
    actors.set(request, resolved);
  };

  return { resolveActor, resolver };
}
