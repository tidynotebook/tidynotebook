/**
 * Attachment HTTP handlers.
 *
 * Implements uploadAttachment, finalizeAttachment, and getAttachmentRevision.
 *
 * The upload reads a streamed body, so it carries two bounds that the rest of
 * the boundary does not: the byte bound of `config.limits.attachmentBytes`, and the idle
 * bound of `plugins/body-idle-timeout.ts`, which refuses a sender that holds
 * the connection while it delivers almost nothing.
 *
 * The upload keeps its body in a file of this server for its own request
 * only. It inspects the image there, then writes the checked bytes to a
 * staging key of the object store before it answers, so the finalize that
 * follows can reach any server instance (record 0192).
 *
 * The download names its file. `plugins/content-disposition.ts` decides what
 * the browser does with the bytes and encodes the name that the person gave
 * the file, so no name can reach the header field unencoded.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Busboy } from '@fastify/busboy';
import type { AttachmentStore } from '@notesapp/storage-server';
import type { WorkspaceStore } from '@notesapp/core';
import {
  commitChangeset,
  createAttachmentChangeset,
  isAllowedMediaType,
  readHeadForWrite,
  readMutationReceipt,
  requestDigest,
} from '@notesapp/core';
import { requireActor } from '../auth/actor.ts';
import { mebibyte } from '../config.ts';
import { inspectImage } from '../jobs/inspect-image.ts';
import { watchBodyIdle } from '../plugins/body-idle-timeout.ts';
import {
  contentDisposition,
  dispositionKind,
  downloadName,
} from '../plugins/content-disposition.ts';
import {
  answerAccepted,
  header,
  parseTagList,
  readOptionalText,
  readText,
} from './files.ts';
import {
  DomainProblemError,
  ForbiddenError,
  InvalidContentError,
  NotFoundError,
  PayloadTooLargeError,
  PreconditionRequiredError,
  RequestContractError,
  RequestTimeoutError,
  UnsupportedMediaTypeError,
} from '../plugins/problem.ts';
import type { HandlerMap, HandlerResult } from '../plugins/register.ts';

/** The name of a download whose stored path holds none. */
const fallbackAttachmentName = 'image';

/**
 * Builds the attachment operation handlers.
 *
 * @param limits the largest attachment file, and the longest gap between two
 * chunks of an upload body, both from `config.limits`.
 * @param scratch the folder of the files of one request, from
 * `scratchFolder`.
 */
export function createAttachmentHandlers(
  workspaceStore: WorkspaceStore,
  attachmentStore: AttachmentStore,
  limits: {
    readonly attachmentBytes: number;
    readonly uploadIdleTimeoutMs: number;
  },
  scratch: string,
): HandlerMap {
  const { attachmentBytes, uploadIdleTimeoutMs } = limits;
  const tooLarge = `Attachment exceeds ${String(attachmentBytes / mebibyte)} MiB limit.`;
  return {
    uploadAttachment: async (request): Promise<HandlerResult> => {
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      const grant = actor.grants.find(
        (item) => item.workspaceId === workspaceId,
      );
      if (!grant || !grant.actions.includes('write')) {
        throw new ForbiddenError();
      }

      const objectId = randomUUID();
      const tmpPath = join(scratch, `upload-${objectId}`);
      await mkdir(scratch, { recursive: true });

      const hasher = createHash('sha256');
      let bytesCount = 0;
      let declaredMimeType = '';
      let fileReceived = false;
      let streamError: Error | null = null;
      /**
       * Stops the write of the file part, once one is open.
       *
       * The idle bound below needs it. A body that stopped arriving must not
       * leave an open writer on a file that the failure path already removed.
       */
      let stopFilePart: ((failure: Error) => void) | null = null;
      let writeFinishedResolve: () => void;
      let writeFinishedReject: (err: Error) => void;
      const writeFinished = new Promise<void>((resolve, reject) => {
        writeFinishedResolve = resolve;
        writeFinishedReject = reject;
      });

      // Busboy needs the media type and its boundary. A request without one
      // cannot be read as a form, and 415 is the declared answer for it.
      const contentType = request.headers['content-type'];
      if (contentType === undefined)
        throw new UnsupportedMediaTypeError(
          'The upload states no content type.',
        );
      const bb = new Busboy({
        headers: { ...request.headers, 'content-type': contentType },
        limits: {
          fileSize: attachmentBytes,
          files: 1,
          parts: 10,
        },
      });

      bb.on(
        'file',
        (_fieldname, fileStream, _filename, _encoding, mimetype) => {
          if (fileReceived) {
            fileStream.resume();
            return;
          }
          fileReceived = true;
          declaredMimeType = mimetype.toLowerCase();
          if (!isAllowedMediaType(declaredMimeType)) {
            streamError = new UnsupportedMediaTypeError(
              `Unsupported media type ${declaredMimeType}.`,
            );
            fileStream.resume();
            writeFinishedResolve();
            return;
          }

          const out = createWriteStream(tmpPath);
          out.on('error', (err) => {
            if (!streamError) {
              streamError = err;
              writeFinishedReject(err);
            } else {
              writeFinishedResolve();
            }
          });
          out.on('finish', () => {
            writeFinishedResolve();
          });

          const stopWriting = (err: Error): void => {
            if (!streamError) {
              streamError = err;
            }
            fileStream.unpipe(out);
            out.destroy();
            fileStream.resume();
          };
          stopFilePart = stopWriting;

          fileStream.on('data', (chunk: Buffer) => {
            bytesCount += chunk.length;
            if (bytesCount > attachmentBytes) {
              stopWriting(new PayloadTooLargeError(tooLarge));
              return;
            }
            hasher.update(chunk);
          });

          fileStream.on('limit', () => {
            stopWriting(new PayloadTooLargeError(tooLarge));
          });

          fileStream.on('error', (err) => {
            if (!streamError) {
              streamError = err;
              writeFinishedReject(err);
            } else {
              writeFinishedResolve();
            }
          });

          fileStream.pipe(out);
        },
      );

      bb.on('filesLimit', () => {
        streamError = new PayloadTooLargeError('Too many files uploaded.');
      });

      bb.on('partsLimit', () => {
        streamError = new PayloadTooLargeError('Too many form parts uploaded.');
      });

      const parseFinished = new Promise<void>((resolve, reject) => {
        bb.on('finish', () => {
          // No file part means no writer was ever opened, so nothing else can
          // settle the write promise. Without this the request would wait for
          // a stream that does not exist and hold its slot until the peer
          // gave up.
          if (!fileReceived) writeFinishedResolve();
          resolve();
        });
        bb.on('error', (err: unknown) => {
          reject(
            err instanceof Error
              ? err
              : new Error('The upload could not be read as a form.'),
          );
        });
      });

      // The bound is armed after the pipe, so no chunk of the body is lost to
      // the watch, and it is stopped in every exit of the read below.
      let idleReject: (error: Error) => void = () => {};
      const idle = new Promise<never>((_resolve, reject) => {
        idleReject = reject;
      });
      request.raw.pipe(bb);
      const watch = watchBodyIdle({
        body: request.raw,
        idleMs: uploadIdleTimeoutMs,
        onIdle: () => {
          const failure = new RequestTimeoutError(
            'The upload stopped. Send the image again.',
          );
          stopFilePart?.(failure);
          streamError ??= failure;
          idleReject(failure);
        },
      });

      try {
        await Promise.race([
          (async (): Promise<void> => {
            await parseFinished;
            await writeFinished;
          })(),
          idle,
        ]);
      } catch (err: unknown) {
        if (existsSync(tmpPath)) {
          await unlink(tmpPath).catch(() => {});
        }
        if (streamError) throw streamError;
        throw err;
      } finally {
        watch.stop();
      }

      if (streamError) {
        if (existsSync(tmpPath)) {
          await unlink(tmpPath).catch(() => {});
        }
        throw streamError;
      }

      if (!fileReceived || bytesCount === 0) {
        if (existsSync(tmpPath)) {
          await unlink(tmpPath).catch(() => {});
        }
        throw new RequestContractError('body', [
          { path: '/file', message: 'Missing file in upload payload.' },
        ]);
      }

      const digest = hasher.digest('hex');
      const inspection = await inspectImage(tmpPath, declaredMimeType);
      if (!inspection.ok) {
        if (existsSync(tmpPath)) {
          await unlink(tmpPath).catch(() => {});
        }
        if (inspection.error === 'payload_too_large') {
          throw new PayloadTooLargeError(inspection.reason);
        }
        if (inspection.error === 'unsupported_media_type') {
          throw new UnsupportedMediaTypeError(inspection.reason);
        }
        throw new InvalidContentError(inspection.reason);
      }

      // The checked bytes reach the store before the row names them, so a
      // row of a temporary object always has its bytes. Bytes with no row go
      // with the daily cleanup of staging keys.
      try {
        await attachmentStore.stageAttachmentBytes(
          objectId,
          createReadStream(tmpPath),
          bytesCount,
        );
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
      await attachmentStore.saveTemporaryAttachment(actor, workspaceId, {
        id: objectId,
        digest,
        size: BigInt(bytesCount),
        mediaType: inspection.mediaType,
        width: inspection.width,
        height: inspection.height,
      });

      return {
        status: 201,
        mediaType: 'application/json',
        body: {
          objectId,
          digest,
          size: bytesCount,
          mediaType: inspection.mediaType,
          width: inspection.width,
          height: inspection.height,
        },
      };
    },

    finalizeAttachment: async (request, reply): Promise<HandlerResult> => {
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      const objectId = readText(request.params, 'objectId');
      const grant = actor.grants.find(
        (item) => item.workspaceId === workspaceId,
      );
      if (!grant || !grant.actions.includes('write')) {
        throw new ForbiddenError();
      }

      const body = request.body;
      const fileId = readText(body, 'fileId');
      const revisionId = readText(body, 'revisionId');
      const mutationId = readText(body, 'mutationId');
      const deviceId = readText(body, 'deviceId');
      const path = readText(body, 'path');
      const digest = readText(body, 'digest').toLowerCase();
      const message = readOptionalText(body, 'message');

      const ifMatchHeader = header(request, 'if-match');
      const tags =
        ifMatchHeader !== undefined
          ? parseTagList(ifMatchHeader).revisionIds
          : null;

      const reqDigest = await requestDigest(
        'finalizeAttachment',
        { workspaceId, objectId, ifMatch: tags },
        body,
      );

      const receiptResult = await readMutationReceipt(
        workspaceStore,
        actor,
        workspaceId,
        mutationId,
      );
      if (receiptResult.ok && receiptResult.value !== null) {
        const receipt = receiptResult.value;
        if (receipt.digest !== reqDigest) {
          throw new DomainProblemError({
            code: 'mutation_reused',
            fileIds: [fileId],
          });
        }
        return answerAccepted(reply, receipt.outcome, 200);
      }

      const headResult = await readHeadForWrite(
        workspaceStore,
        actor,
        workspaceId,
        fileId,
      );
      let expectedHead: string | null = null;
      if (headResult.ok) {
        if (tags === null) {
          throw new PreconditionRequiredError(
            'This operation needs the If-Match entity tag of the head that was read.',
          );
        }
        if (!tags.includes(headResult.value.revisionId)) {
          throw new DomainProblemError({
            code: 'stale_head',
            fileIds: [fileId],
          });
        }
        expectedHead = headResult.value.revisionId;
      } else {
        if (tags !== null) {
          throw new DomainProblemError({
            code: 'stale_head',
            fileIds: [fileId],
          });
        }
        expectedHead = null;
      }

      const finalization = await attachmentStore.finalizeAttachmentObject(
        actor,
        workspaceId,
        objectId,
        digest,
      );
      if (!finalization.ok) {
        if (finalization.error === 'not_found') {
          throw new NotFoundError('The attachment object does not exist.');
        }
        if (finalization.error === 'already_unavailable') {
          throw new NotFoundError('The attachment object is unavailable.');
        }
        throw new DomainProblemError({
          code: 'invalid_content',
          fileIds: [fileId],
        });
      }

      const changeset = createAttachmentChangeset({
        workspaceId,
        fileId,
        revisionId,
        path,
        objectId,
        digest,
        expectedHead,
        message,
        ids: {
          mutationId,
          deviceId,
          clientTime: new Date().toISOString(),
        },
      });

      const acceptResult = await commitChangeset(
        workspaceStore,
        actor,
        changeset,
        reqDigest,
      );
      if (!acceptResult.ok) {
        throw new DomainProblemError(acceptResult.error);
      }

      return answerAccepted(reply, acceptResult.value, 200);
    },

    getAttachmentRevision: async (request, reply): Promise<HandlerResult> => {
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      const revisionId = readText(request.params, 'revisionId');
      const grant = actor.grants.find(
        (item) => item.workspaceId === workspaceId,
      );
      if (!grant || !grant.actions.includes('read')) {
        throw new ForbiddenError();
      }

      const result = await attachmentStore.readAttachmentRevision(
        actor,
        workspaceId,
        revisionId,
      );
      if (result === null) {
        throw new NotFoundError('The attachment revision does not exist.');
      }

      reply.header('content-length', String(result.size));
      reply.header('etag', `"${result.revisionId}"`);
      return {
        status: 200,
        mediaType: result.mediaType,
        body: result.stream,
        headers: [
          [
            'content-disposition',
            contentDisposition({
              kind: dispositionKind(result.mediaType),
              name: downloadName(result.path),
              fallback: fallbackAttachmentName,
            }),
          ],
        ],
      };
    },
  };
}
