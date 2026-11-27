/**
 * Handlers for consistent snapshots and incremental sync reads.
 *
 * This module connects the HTTP sync operations to the core snapshot services.
 * A snapshot captures the accepted metadata with immutable revision
 * identifiers; content transfer reuses the revision read by identifier, never
 * a later current head. None of these operations mutates workspace state, so
 * no request digest is needed.
 */
import type { FastifyRequest } from 'fastify';
import type { WorkspaceStore } from '@notesapp/core';
import {
  getChanges,
  getSnapshotPage,
  getSnapshotRevisions,
  startSnapshot,
  supportedSyncVersions,
} from '@notesapp/core';
import { requireActor } from '../auth/actor.ts';
import { readProperty } from '../values.ts';
import type { HandlerMap, HandlerResult } from '../plugins/register.ts';
import { RequestContractError, unwrapDomain } from '../plugins/problem.ts';
import { readOptionalText, readText } from './files.ts';

const jsonMediaType = 'application/json';

/** An optional integer query value, or undefined when it is absent. */
function readOptionalInteger(value: unknown, key: string): number | undefined {
  const member = readProperty(value, key);
  if (member === undefined || member === null) return undefined;
  if (typeof member !== 'number') {
    throw new RequestContractError('query', [
      { path: `/${key}`, message: 'the value must be an integer' },
    ]);
  }
  return member;
}

/** Builds the snapshot and incremental sync handlers. */
/** One byte string as the base64 that the contract states. */
function base64Of(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function createSyncHandlers(
  store: WorkspaceStore,
  noticeProtocols: () => readonly string[],
): HandlerMap {
  return {
    // The versions are a fact of the build, not of an account, so the answer
    // reads no session and no store. The client reads it before a push or a pull
    // (record 0086).
    getSyncProtocol: (): Promise<HandlerResult> =>
      Promise.resolve({
        status: 200,
        mediaType: jsonMediaType,
        // A subprotocol is offered only while this process can admit a
        // stream, so a client with none reads the feed on its own schedule
        // (records 0129, 0131).
        body: {
          versions: [...supportedSyncVersions],
          snapshotRevisionBatches: true,
          notificationProtocols: [],
          ...(noticeProtocols().length > 0
            ? { liveNotificationProtocol: noticeProtocols()[0] }
            : {}),
        },
      }),

    startSnapshot: async (request: FastifyRequest): Promise<HandlerResult> => {
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      const body = request.body;
      const version = readProperty(body, 'syncVersion');
      if (typeof version !== 'number') {
        throw new RequestContractError('body', [
          { path: '/syncVersion', message: 'the value must be an integer' },
        ]);
      }
      const pageSize = readOptionalInteger(body, 'pageSize');

      const started = unwrapDomain(
        await startSnapshot(store, actor, workspaceId, {
          syncVersion: version,
          ...(pageSize === undefined ? {} : { pageSize }),
        }),
      );

      return {
        status: 200,
        mediaType: jsonMediaType,
        body: {
          token: started.token,
          expiresAt: started.expiresAt,
          cursor: started.cursor,
          itemCount: started.itemCount,
          pageSize: started.pageSize,
        },
      };
    },

    getSnapshotPage: async (
      request: FastifyRequest,
    ): Promise<HandlerResult> => {
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      const token = readText(request.params, 'token');
      const position = readOptionalInteger(request.query, 'position');
      const limit = readOptionalInteger(request.query, 'limit');

      const page = unwrapDomain(
        await getSnapshotPage(store, actor, workspaceId, {
          token,
          ...(position === undefined ? {} : { position }),
          ...(limit === undefined ? {} : { limit }),
        }),
      );

      return {
        status: 200,
        mediaType: jsonMediaType,
        body: {
          token: page.token,
          cursor: page.cursor,
          expiresAt: page.expiresAt,
          position: page.position,
          nextPosition: page.nextPosition,
          totalItems: page.totalItems,
          items: page.items.map((item) => ({
            fileId: item.fileId,
            revisionId: item.revisionId,
            path: item.path,
            kind: item.kind,
            deleted: item.deleted,
          })),
        },
      };
    },

    getSnapshotRevisions: async (
      request: FastifyRequest,
    ): Promise<HandlerResult> => {
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      const ids = readText(request.query, 'ids').split(',');
      const revisions = unwrapDomain(
        await getSnapshotRevisions(store, actor, workspaceId, ids),
      );
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: {
          revisions: revisions.map((revision) => ({
            ...revision,
            document:
              revision.document === null ? null : base64Of(revision.document),
          })),
        },
      };
    },

    getChanges: async (request: FastifyRequest): Promise<HandlerResult> => {
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      const cursor =
        readOptionalText(request.query, 'cursor') ??
        (() => {
          throw new RequestContractError('query', [
            { path: '/cursor', message: 'the value is required' },
          ]);
        })();
      const limit = readOptionalInteger(request.query, 'limit');

      const page = unwrapDomain(
        await getChanges(store, actor, workspaceId, {
          cursor,
          ...(limit === undefined ? {} : { limit }),
        }),
      );

      return {
        status: 200,
        mediaType: jsonMediaType,
        body: {
          // Every record of the feed states its own form, so the reader never
          // fetches a revision to learn what changed (record 0081).
          changes: page.changes.map((change) => {
            if (change.kind === 'membership')
              return {
                kind: 'membership' as const,
                cursor: change.cursor,
                accountId: change.accountId,
                removed: change.removed,
              };
            if (change.kind === 'purge')
              return {
                kind: 'purge' as const,
                cursor: change.cursor,
                fileId: change.fileId,
              };
            if (change.kind === 'document')
              return {
                kind: 'document' as const,
                cursor: change.cursor,
                fileId: change.fileId,
                revisionId: change.revisionId,
                path: change.path,
                deleted: change.deleted,
                digest: change.digest,
                epoch: change.epoch,
                document: base64Of(change.document),
              };
            return {
              kind: 'update' as const,
              cursor: change.cursor,
              fileId: change.fileId,
              revisionId: change.revisionId,
              path: change.path,
              deleted: change.deleted,
              digest: change.digest,
              kindOfFile: change.kindOfFile,
              epoch: change.epoch,
              update: change.update === null ? null : base64Of(change.update),
              stateVector:
                change.stateVector === null
                  ? null
                  : base64Of(change.stateVector),
            };
          }),
          nextCursor: page.nextCursor,
        },
      };
    },
  };
}
