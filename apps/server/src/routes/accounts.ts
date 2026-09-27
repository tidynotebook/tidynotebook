/**
 * Handlers of the account and settings operations.
 *
 * The boundary has already validated the request against the contract and the
 * identity hook has already verified the actor, so a handler maps validated
 * input to a use case and maps the domain result back to a declared response.
 * No handler repeats a contract shape and no handler reads the database.
 */
import type { FastifyRequest } from 'fastify';
import type {
  LegalDocuments,
  Preferences,
  Result,
  WorkspaceAdminStore,
} from '@notesapp/core';
import {
  acceptLegalDocuments,
  consentRequired,
  listSessions,
  readConsent,
  readOwnStanding,
  readPreferences,
  revokeOtherSessions,
  revokeSession,
  updatePreferences,
} from '@notesapp/core';
import { requireActor } from '../auth/actor.ts';
import { readProperty } from '../values.ts';
import type { HandlerMap, HandlerResult } from '../plugins/register.ts';
import {
  ForbiddenError,
  NotFoundError,
  unwrapDomain,
} from '../plugins/problem.ts';

/** Media type of every answer in this module. */
const jsonMediaType = 'application/json';

/**
 * Turns a domain result into a value or the matching problem.
 *
 * `not_found` is the only code that names a missing record. Every other
 * expected failure of these use cases is a denied permission or a denied rule,
 * and both answer 403 so the answer never says which rule applied.
 */
export function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  if (result.error.code === 'not_found') throw new NotFoundError();
  throw new ForbiddenError();
}

/** Reads a validated string member of a request body. */
export function readString(body: unknown, key: string): string {
  const value = readProperty(body, key);
  if (typeof value !== 'string')
    throw new ForbiddenError(`The request body has no ${key}.`);
  return value;
}

/** Reads a validated boolean member of a request body. */
export function readBoolean(body: unknown, key: string): boolean {
  return readProperty(body, key) === true;
}

/** Reads a validated path parameter. */
export function readParameter(request: FastifyRequest, key: string): string {
  const value = readProperty(request.params, key);
  if (typeof value !== 'string')
    throw new NotFoundError(`The request names no ${key}.`);
  return value;
}

/**
 * Reads a validated member that the body may leave out.
 *
 * The contract states the type of a member that is present, and the use case
 * decides whether its value is one it stores.
 */
function optionalMember<T>(
  body: unknown,
  key: string,
  is: (value: unknown) => value is T,
): T | undefined {
  const value = readProperty(body, key);
  if (value === undefined) return undefined;
  if (!is(value))
    throw new ForbiddenError(`The request body has an invalid ${key}.`);
  return value;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** The public shape of stored settings. */
function preferencesBody(preferences: Preferences): Record<string, unknown> {
  return {
    appearance: preferences.appearance,
    themeFamily: preferences.themeFamily,
    spellCheck: preferences.spellCheck,
  };
}

/** Builds the account and settings handlers. */
export function createAccountHandlers(
  store: WorkspaceAdminStore,
  documents: LegalDocuments | null,
): HandlerMap {
  return {
    getAccount: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const preferences = unwrap(await readPreferences(store, resolved.actor));
      const standing = unwrap(await readOwnStanding(store, resolved.actor));
      const consent = unwrap(await readConsent(store, resolved.actor));
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: {
          accountId: resolved.actor.accountId,
          email: resolved.email,
          name: resolved.name,
          installationRole: standing.role,
          storage: {
            usedBytes: Number(standing.usedBytes),
            limitBytes: Number(standing.limitBytes),
          },
          preferences: preferencesBody(preferences),
          // The application opens only after consent to the current legal
          // documents (record 0120).
          consentRequired: consentRequired(documents, consent),
        },
      };
    },

    acceptLegalDocuments: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      // A refusal names its own code, so the page can say that a version
      // changed while the person read it.
      unwrapDomain(
        await acceptLegalDocuments(store, resolved.actor, documents, {
          termsVersion: readString(request.body, 'termsVersion'),
          privacyVersion: readString(request.body, 'privacyVersion'),
        }),
      );
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: { accepted: true },
      };
    },

    listSessions: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const sessions = unwrap(
        await listSessions(store, resolved.actor, resolved.sessionId),
      );
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: {
          // Each member is named, so no member of the store, and never a
          // token, reaches the answer (record 0122).
          sessions: sessions.map((session) => ({
            sessionId: session.sessionId,
            current: session.current,
            userAgent: session.userAgent,
            createdAt: session.createdAt,
            lastActiveAt: session.lastActiveAt,
            expiresAt: session.expiresAt,
          })),
        },
      };
    },

    revokeSession: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      unwrap(
        await revokeSession(
          store,
          resolved.actor,
          readParameter(request, 'sessionId'),
        ),
      );
      return { status: 200, mediaType: jsonMediaType, body: { removed: true } };
    },

    revokeOtherSessions: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const revoked = unwrap(
        await revokeOtherSessions(store, resolved.actor, resolved.sessionId),
      );
      return { status: 200, mediaType: jsonMediaType, body: { revoked } };
    },

    updatePreferences: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const stored = unwrap(
        await updatePreferences(store, resolved.actor, {
          appearance: optionalMember(request.body, 'appearance', isString),
          themeFamily: optionalMember(request.body, 'themeFamily', isString),
          spellCheck: optionalMember(request.body, 'spellCheck', isBoolean),
        }),
      );
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: preferencesBody(stored),
      };
    },
  };
}
