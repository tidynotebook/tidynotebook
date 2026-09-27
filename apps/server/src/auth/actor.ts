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
import type { FastifyRequest } from 'fastify';
import type { Actor } from '@notesapp/core';
import { sessionGrants, verifyActor } from '@notesapp/core';
import type { IdentityStoreHandle } from '@notesapp/storage-server';
import type { IdentityResolver } from '../plugins/register.ts';
import {
  ForbiddenError,
  OriginRequiredError,
  UnauthenticatedError,
} from '../plugins/problem.ts';
import { toRequestHeaders, type NotesappAuth } from './better-auth.ts';
import { applicationOrigins, type ServedOrigin } from '../served-origins.ts';

/** A verified actor and what the session knows about it. */
export type ResolvedActor = {
  readonly actor: Actor;
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

/** What the identity adapter needs from the composition. */
export type IdentityDependencies = {
  readonly auth: NotesappAuth;
  readonly identity: IdentityStoreHandle;
  /** The served origins of the deployment, from `config.servedOrigins`. */
  readonly servedOrigins: readonly ServedOrigin[];
};

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
    const linked = await accountForSession(dependencies.identity, user.id);
    if (linked === null) return null;
    const memberships = await dependencies.identity.memberships(linked);
    const verified = verifyActor(linked, sessionGrants(memberships));
    if (!verified.ok) return null;
    return {
      actor: verified.value,
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

  const resolver: IdentityResolver = async (request, operation) => {
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
    actors.set(request, resolved);
  };

  return { resolveActor, resolver };
}
