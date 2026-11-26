/**
 * Handlers for history, restore, and purge operations.
 *
 * This module connects the HTTP operations to the core domain services for
 * revisions, restore, and permanent deletion.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { WorkspaceStore } from '@notesapp/core';
import {
  listHistory,
  previewPurge,
  purgeFiles,
  requestDigest,
  restoreRevision,
} from '@notesapp/core';
import { requireActor } from '../auth/actor.ts';
import { readProperty } from '../values.ts';
import type { HandlerMap, HandlerResult } from '../plugins/register.ts';
import { unwrapDomain } from '../plugins/problem.ts';
import {
  acceptedBody,
  header,
  parseTag,
  readOptionalText,
  readText,
  revisionTag,
} from './files.ts';

const jsonMediaType = 'application/json';

/** Builds the history, restore, and purge handlers. */
export function createHistoryHandlers(store: WorkspaceStore): HandlerMap {
  return {
    listHistory: async (request: FastifyRequest): Promise<HandlerResult> => {
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      const fileId = readText(request.params, 'fileId');
      const cursor = readOptionalText(request.query, 'cursor');
      const limitRaw = readProperty(request.query, 'limit');
      const limit = typeof limitRaw === 'number' ? limitRaw : undefined;

      const page = unwrapDomain(
        await listHistory(store, actor, workspaceId, fileId, {
          cursor,
          ...(limit !== undefined ? { limit } : {}),
        }),
      );

      return {
        status: 200,
        mediaType: jsonMediaType,
        body: {
          revisions: page.revisions.map((r) => ({
            revisionId: r.revisionId,
            fileId: r.fileId,
            path: r.path,
            deleted: r.deleted,
            parents: [...r.parents],
            digest: r.digest,
            size: r.size,
            actorAccountId: r.actorAccountId,
            contributors: r.contributors ?? [],
            clientTime: r.clientTime,
            serverTime: r.serverTime,
            message: r.message ?? null,
            isCheckpoint: r.isCheckpoint ?? false,
            checkpointName: r.checkpointName ?? null,
            restoredFrom: r.restoredFrom ?? null,
            text: r.text ?? null,
            objectId: r.objectId ?? null,
            merged: r.merged,
          })),
          nextCursor: page.nextCursor ?? null,
        },
      };
    },

    restoreRevision: async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<HandlerResult> => {
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      const fileId = readText(request.params, 'fileId');
      const body = request.body;

      const mutationId = readText(body, 'mutationId');
      const deviceId = readText(body, 'deviceId');
      const clientTime = readText(body, 'clientTime');
      const targetRevisionId = readText(body, 'targetRevisionId');
      const revisionId = readText(body, 'revisionId');
      const path = readOptionalText(body, 'path') ?? undefined;
      const message = readOptionalText(body, 'message') ?? undefined;

      // Check header or body for expectedHead
      let expectedHead = readOptionalText(body, 'expectedHead');
      const ifMatchHeader = header(request, 'if-match');
      if (ifMatchHeader !== undefined) {
        const parsed = parseTag(ifMatchHeader);
        if (parsed !== null) expectedHead = parsed;
      }

      const digest = await requestDigest(
        'restoreRevision',
        { workspaceId, fileId },
        body,
      );

      const outcome = unwrapDomain(
        await restoreRevision(
          store,
          actor,
          {
            workspaceId,
            fileId,
            targetRevisionId,
            expectedHead,
            revisionId,
            ids: { mutationId, deviceId, clientTime },
            ...(path !== undefined ? { path } : {}),
            ...(message !== undefined ? { message } : {}),
          },
          digest,
        ),
      );

      reply.header('etag', revisionTag(revisionId));
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: acceptedBody(outcome),
      };
    },

    previewPurge: async (request: FastifyRequest): Promise<HandlerResult> => {
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      const body = request.body;
      const fileIdsRaw = readProperty(body, 'fileIds');
      if (!Array.isArray(fileIdsRaw)) {
        throw new Error('notesapp: the validated body has no fileIds.');
      }
      const fileIds = fileIdsRaw.map((id: unknown) => {
        if (typeof id !== 'string') throw new Error('invalid fileId in array');
        return id;
      });

      const preview = unwrapDomain(
        await previewPurge(store, actor, workspaceId, fileIds),
      );

      return {
        status: 200,
        mediaType: jsonMediaType,
        body: {
          fileIds: [...preview.fileIds],
          revisionIds: [...preview.revisionIds],
          contentDigests: [...preview.contentDigests],
          attachmentObjectIds: [...preview.attachmentObjectIds],
          blockingReferences: preview.blockingReferences.map((r) => ({
            kind: r.kind,
            targetId: r.targetId,
            referrerId: r.referrerId,
            description: r.description,
          })),
          dependentRevisionCount: preview.dependentRevisionCount,
          reclaimableBytes: preview.reclaimableBytes,
          canPurge: preview.canPurge,
        },
      };
    },

    purgeFiles: async (request: FastifyRequest): Promise<HandlerResult> => {
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      const body = request.body;
      const mutationId = readText(body, 'mutationId');
      const fileIdsRaw = readProperty(body, 'fileIds');
      if (!Array.isArray(fileIdsRaw)) {
        throw new Error('notesapp: the validated body has no fileIds.');
      }
      const fileIds = fileIdsRaw.map((id: unknown) => {
        if (typeof id !== 'string') throw new Error('invalid fileId in array');
        return id;
      });

      const digest = await requestDigest('purgeFiles', { workspaceId }, body);

      const outcome = unwrapDomain(
        await purgeFiles(
          store,
          actor,
          workspaceId,
          fileIds,
          mutationId,
          digest,
        ),
      );

      return {
        status: 200,
        mediaType: jsonMediaType,
        body: {
          mutationId: outcome.mutationId,
          purgedFileIds: [...outcome.purgedFileIds],
          purgedRevisionIds: [...outcome.purgedRevisionIds],
          reclaimedBytes: outcome.reclaimedBytes,
        },
      };
    },
  };
}
