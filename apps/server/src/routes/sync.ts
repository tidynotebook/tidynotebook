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
import type { Result, WorkspaceStore } from '@notesapp/core';
import {
  getChanges,
  getSnapshotPage,
  startSnapshot,
  supportedSyncVersions,
} from '@notesapp/core';
import { requireActor } from '../auth/actor.ts';
import { readProperty } from '../values.ts';
import type { HandlerMap, HandlerResult } from '../plugins/register.ts';
import {
  DomainProblemError,
  RequestContractError,
} from '../plugins/problem.ts';
import { readOptionalText, readText } from './files.ts';

const jsonMediaType = 'application/json';

/** Unwraps a domain result or throws the mapped domain problem error. */
function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  throw new DomainProblemError(result.error);
}

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
export function createSyncHandlers(store: WorkspaceStore): HandlerMap {
  return {
    // The list is a fact of the build, not of an account, so the answer reads
    // no session and no store. The client reads it before a push or a pull
    // (record 0086).
    getSyncProtocol: (): Promise<HandlerResult> =>
      Promise.resolve({
        status: 200,
        mediaType: jsonMediaType,
        body: { versions: [...supportedSyncVersions] },
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

      const started = unwrap(
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

      const page = unwrap(
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

      const page = unwrap(
        await getChanges(store, actor, workspaceId, {
          cursor,
          ...(limit === undefined ? {} : { limit }),
        }),
      );

      return {
        status: 200,
        mediaType: jsonMediaType,
        body: {
          changes: page.changes.map((change) => ({
            cursor: change.cursor,
            entityKind: change.entityKind,
            entityId: change.entityId,
            revisionId: change.revisionId,
            deleted: change.deleted,
          })),
          nextCursor: page.nextCursor,
        },
      };
    },
  };
}
