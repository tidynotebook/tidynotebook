/**
 * The owner operations of a published link.
 *
 * These operations keep the session security of the document, so the identity
 * hook runs before a handler here and an anonymous call is refused at the
 * boundary. `requireActor` gives the verified actor, exactly as every other
 * owner route does, and the reader path of `published.ts` holds none.
 *
 * Two secrets pass through this file and neither is ever stored here.
 *
 * - **The token.** `newPublishedSecret` draws it, the answer of the create
 *   carries it once, and the store receives its digest. Decision 0030 states
 *   that the server can never show it again, so no later answer of this file
 *   holds it and no log line names it.
 * - **The password.** It reaches the hasher of the account path and the store
 *   receives the slow salted hash. It is never read back: the unlock of
 *   `published.ts` compares inside the storage package.
 *
 * The write itself is the owner repository of `packages/storage-server`, which
 * runs inside the workspace transaction, so the count and the insert of the
 * limit rule of `packages/core` are one transaction.
 */
import type {
  Action,
  Actor,
  PasswordHasher,
  SecretDigest,
} from '@notesapp/core';
import type {
  OwnedPublishedLink,
  PublishedLinkDraft,
  PublishedLinkStore,
} from '@notesapp/storage-server';
import { requireActor } from '../auth/actor.ts';
import { ForbiddenError, unwrapDomain } from '../plugins/problem.ts';
import type { HandlerMap, HandlerResult } from '../plugins/register.ts';
import { readOptionalText, readText } from './files.ts';
import { newPublishedSecret } from '../auth/publication-secrets.ts';

/** What the owner operations need from the composition. */
export type PublicationOwnerDependencies = {
  /** The owner side of published links, which needs a verified actor. */
  readonly links: PublishedLinkStore;
  /** The password rule of a link. */
  readonly hasher: PasswordHasher;
  /** The digest rule of a token. */
  readonly secrets: SecretDigest;
  /** The instant of one request. */
  readonly clock: () => number;
};

/**
 * Refuses an actor that holds no such grant over this workspace.
 *
 * It is the check that every owner route of this server performs, and it runs
 * before the store, so a caller learns nothing about a workspace that it is
 * not a member of. The row policies of the two tables refuse it a second time.
 */
function permit(actor: Actor, workspaceId: string, action: Action): void {
  const grant = actor.grants.find((entry) => entry.workspaceId === workspaceId);
  if (grant === undefined || !grant.actions.includes(action))
    throw new ForbiddenError();
}

/** One link as the contract reports it. No member of it opens anything. */
function answerLink(link: OwnedPublishedLink): Record<string, unknown> {
  return {
    publicationId: link.publicationId,
    scope:
      link.scope.kind === 'note'
        ? { kind: 'note', fileId: link.scope.fileId }
        : { kind: 'folder', path: link.scope.path },
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    passwordProtected: link.passwordProtected,
    takenDown: link.takenDown,
  };
}

/** The scope that the request names, in the shape that the domain reads. */
function readScope(body: unknown): PublishedLinkDraft['scope'] {
  const scope = readProperty(body, 'scope');
  const kind = readText(scope, 'kind');
  return kind === 'note'
    ? { kind: 'note', fileId: readText(scope, 'fileId') }
    : { kind: 'folder', path: readText(scope, 'path') };
}

/** One member of a validated body, without a type assertion. */
function readProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object')
    throw new Error(`notesapp: the validated body has no ${key}.`);
  return Object.fromEntries(Object.entries(value))[key];
}

/** Builds the owner handlers of a published link. */
export function createPublicationHandlers(
  dependencies?: PublicationOwnerDependencies,
): HandlerMap {
  if (dependencies === undefined) return missingHandlers();
  const parts = dependencies;
  return {
    createPublishedLink: async (request): Promise<HandlerResult> => {
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      permit(actor, workspaceId, 'write');
      const password = readOptionalText(request.body, 'password');
      // The token exists in this process and in the address that the owner
      // copies. The store receives its digest and never the value.
      const token = newPublishedSecret();
      const link = unwrapDomain(
        await parts.links.create(actor, workspaceId, {
          tokenDigest: parts.secrets.digest(token),
          scope: readScope(request.body),
          passwordDigest:
            password === null ? null : await parts.hasher.hash(password),
          expiresAt: readOptionalText(request.body, 'expiresAt'),
        }),
      );
      return {
        status: 201,
        mediaType: 'application/json',
        body: { link: answerLink(link), token },
      };
    },

    listPublishedLinks: async (request): Promise<HandlerResult> => {
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      permit(actor, workspaceId, 'read');
      const links = await parts.links.list(actor, workspaceId);
      return {
        status: 200,
        mediaType: 'application/json',
        body: { links: links.map(answerLink) },
      };
    },

    revokePublishedLink: async (request): Promise<HandlerResult> => {
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      const publicationId = readText(request.params, 'publicationId');
      permit(actor, workspaceId, 'write');
      unwrapDomain(
        await parts.links.revoke(
          actor,
          workspaceId,
          publicationId,
          new Date(parts.clock()),
        ),
      );
      return {
        status: 200,
        mediaType: 'application/json',
        body: { removed: true },
      };
    },
  };
}

/** The handlers of a deployment that was built without a publication store. */
function missingHandlers(): HandlerMap {
  const fail = (): Promise<HandlerResult> =>
    Promise.reject(
      new Error('notesapp: the server was built without a publication store.'),
    );
  return {
    createPublishedLink: fail,
    listPublishedLinks: fail,
    revokePublishedLink: fail,
  };
}
