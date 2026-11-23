/**
 * Handlers of the two export operations.
 *
 * Export is the promise that the file is the document: nothing is stored that
 * the person cannot take away as plain Markdown. One note leaves as one
 * Markdown file, and the whole workspace leaves as a zip of Markdown files in
 * their folders plus every live image file. Nothing in an
 * archive needs this application to be read again.
 *
 * The export of a workspace plans its archive before its first byte: the
 * path and the size of the head of every live file (record 0170). A workspace
 * past a bound of the format is refused at once with an answer of its own.
 * Otherwise the answer states the exact length of the archive and streams it
 * while it is written, one note or one image in memory at a time, from the
 * planned revisions, which never change. No file of the server holds it, and
 * the first byte leaves at once, so a proxy that waits for it does not give
 * up. `inspectWorkspaceExport`, the HEAD of the same address, plans and sends
 * no body, so a client checks it before the browser reads the address
 * itself (record 0178).
 */
import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Actor, WorkspaceStore } from '@notesapp/core';
import {
  archiveBytesAllowed,
  archiveNamesAllowed,
  listFiles,
  maxArchiveBytes,
  maxArchiveEntries,
  readFile,
} from '@notesapp/core';
import type { ArchivePlanRow, AttachmentStore } from '@notesapp/storage-server';
import { requireActor } from '../auth/actor.ts';
import { readText } from './files.ts';
import {
  ExportTooLargeError,
  ForbiddenError,
  NotFoundError,
  unwrapDomain,
} from '../plugins/problem.ts';
import {
  contentDisposition,
  dispositionKind,
  downloadName,
} from '../plugins/content-disposition.ts';
import {
  noContent,
  type HandlerMap,
  type HandlerResult,
} from '../plugins/register.ts';
import { reserveArchiveJob, type ArchiveJobs } from './archive-jobs.ts';
import { archiveLength, zipArchive, type ZipEntry } from './zip.ts';

/** Media type of one exported note. */
const markdownMediaType = 'text/markdown';

/** Media type of the whole workspace export. */
const archiveMediaType = 'application/zip';

/** Download name of the whole workspace export. */
const archiveName = 'notes.zip';

/** How many files one page of the export plan reads. */
const planPageSize = 1000;

/** How many planned entries can supply Markdown in one database read. */
const exportReadBatchSize = 16;

/**
 * The header of one export download.
 *
 * Neither export is an image, so `dispositionKind` answers `attachment` for
 * both and the browser saves the file. The name is encoded by the one
 * function of `plugins/content-disposition.ts`, so the export path and the
 * attachment path cannot drift apart.
 */
function exportDisposition(input: {
  readonly path: string;
  readonly mediaType: string;
  readonly fallback: string;
}): string {
  return contentDisposition({
    kind: dispositionKind(input.mediaType),
    name: downloadName(input.path),
    fallback: input.fallback,
  });
}

/**
 * The refusal of a planned archive past a bound of the format, or `null`
 * (record 0170). The plan is checked before the first byte, so a refusal is
 * an answer of its own and never a download that stops in the middle.
 */
export function exportRefusal(
  plan: readonly { readonly path: string; readonly size: number }[],
): ExportTooLargeError | null {
  if (plan.length > maxArchiveEntries)
    return new ExportTooLargeError(
      `One zip archive holds ${String(maxArchiveEntries)} files at the most. Move some notes to another workspace, then export each workspace.`,
    );
  if (!archiveBytesAllowed(archiveLength(plan)))
    return new ExportTooLargeError(
      `One zip archive holds ${String(Math.floor(maxArchiveBytes / (1024 * 1024)))} MiB at the most. Move some notes to another workspace, then export each workspace.`,
    );
  // An import keeps the names of an archive together, so an export writes
  // no archive whose names it would refuse.
  const names = plan.reduce(
    (total, entry) => total + Buffer.byteLength(entry.path, 'utf8'),
    0,
  );
  if (!archiveNamesAllowed(names))
    return new ExportTooLargeError(
      'The names of the notes and folders are too long together for one zip archive. Move some notes to another workspace, then export each workspace.',
    );
  return null;
}

/**
 * Refuses an export that a page of another site asked for (record 0178).
 *
 * The browser reads the export address itself, with the session cookie, and
 * a GET changes nothing but the job of the account. The cookie is
 * `SameSite=Lax`, so a request of a page of another site carries it only as
 * the navigation of a whole window, and the browser states that navigation in
 * `Sec-Fetch-Site`. Such a request starts no job. A caller that is not a
 * browser states no such header and is answered as before.
 */
function refuseCrossSite(request: FastifyRequest): void {
  if (request.headers['sec-fetch-site'] === 'cross-site')
    throw new ForbiddenError(
      'An export starts from a page of this installation only.',
    );
}

/** The headers of an archive answer and of its check. */
function archiveHeaders(length: number): [string, string][] {
  return [
    [
      'content-disposition',
      exportDisposition({
        path: archiveName,
        mediaType: archiveMediaType,
        fallback: archiveName,
      }),
    ],
    ['content-length', String(length)],
    ['cache-control', 'no-store'],
  ];
}

/** The whole content of one readable stream. */
async function readAll(stream: Readable): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const chunk of stream)
    parts.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(parts);
}

/** Builds the export handlers. */
export function createExportHandlers(
  store: WorkspaceStore,
  attachments: AttachmentStore,
  jobs: ArchiveJobs,
): HandlerMap {
  /**
   * Reserves the archive job of one account, or refuses it. An export
   * streams from the database and writes nothing to the storage volume.
   */
  const reserveJob = (reply: FastifyReply, accountId: string) =>
    reserveArchiveJob(jobs, reply, accountId, 0);

  /** Every live file of the workspace with the size of its head. */
  async function planArchive(
    actor: Actor,
    workspaceId: string,
  ): Promise<readonly ArchivePlanRow[]> {
    // The core read check runs first, so a member that may not read is
    // refused as the listing refuses it.
    unwrapDomain(
      await listFiles(store, actor, workspaceId, {
        cursor: null,
        limit: 1,
        sort: 'path',
      }),
    );
    const rows: ArchivePlanRow[] = [];
    let after: string | null = null;
    for (;;) {
      const page = await attachments.archivePlan(
        actor,
        workspaceId,
        after,
        planPageSize,
      );
      rows.push(...page);
      // One more file than the format holds is enough to refuse the export.
      if (page.length < planPageSize || rows.length > maxArchiveEntries)
        return rows;
      after = page.at(-1)?.path ?? null;
    }
  }

  /**
   * The entries of the planned archive, in plan order.
   *
   * Each entry is the planned revision, which never changes, so the archive
   * holds exactly the bytes that the plan counted. A revision that a purge
   * removed while the archive streams stops the answer.
   */
  async function* plannedEntries(
    actor: Actor,
    workspaceId: string,
    plan: readonly ArchivePlanRow[],
  ): AsyncGenerator<ZipEntry> {
    for (let offset = 0; offset < plan.length; offset += exportReadBatchSize) {
      const batch = plan.slice(offset, offset + exportReadBatchSize);
      const notes = await attachments.readArchiveNotes(
        actor,
        workspaceId,
        batch
          .filter((row) => row.kind === 'note')
          .map((row) => row.headRevisionId),
      );
      for (const row of batch) {
        let bytes: Buffer;
        if (row.kind === 'attachment') {
          const found = await attachments.readAttachmentRevision(
            actor,
            workspaceId,
            row.headRevisionId,
          );
          if (found === null)
            throw new Error('notesapp: a planned image of the export is gone.');
          bytes = await readAll(found.stream);
        } else {
          const text = notes.get(row.headRevisionId);
          if (text === undefined)
            throw new Error('notesapp: a planned note of the export is gone.');
          bytes = Buffer.from(text, 'utf8');
        }
        if (bytes.length !== row.size)
          throw new Error(
            'notesapp: a planned file of the export changed size.',
          );
        yield { path: row.path, bytes, modified: row.updatedAt };
      }
    }
  }

  return {
    exportNote: async (request): Promise<HandlerResult> => {
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      const fileId = readText(request.params, 'fileId');
      const found = unwrapDomain(
        await readFile(store, actor, workspaceId, fileId),
      );
      const text = found.head?.text;
      if (found.file.kind !== 'note' || typeof text !== 'string')
        throw new NotFoundError('This file holds no Markdown to export.');
      return {
        status: 200,
        mediaType: markdownMediaType,
        body: Buffer.from(text, 'utf8'),
        headers: [
          [
            'content-disposition',
            exportDisposition({
              path: found.file.path,
              mediaType: markdownMediaType,
              fallback: 'note.md',
            }),
          ],
        ],
      };
    },

    inspectWorkspaceExport: async (request): Promise<HandlerResult> => {
      refuseCrossSite(request);
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      const plan = await planArchive(actor, workspaceId);
      const refusal = exportRefusal(plan);
      if (refusal !== null) throw refusal;
      // A HEAD asks for the headers only, so it plans and runs no job.
      return {
        ...noContent(200),
        headers: archiveHeaders(archiveLength(plan)),
      };
    },

    exportWorkspace: async (request, reply): Promise<HandlerResult> => {
      refuseCrossSite(request);
      const actor = requireActor(request).actor;
      const workspaceId = readText(request.params, 'workspaceId');
      const plan = await planArchive(actor, workspaceId);
      const refusal = exportRefusal(plan);
      if (refusal !== null) throw refusal;
      const lease = await reserveJob(reply, actor.accountId);
      const body = zipArchive(plannedEntries(actor, workspaceId, plan));
      // The job ends when the archive ends, fails, or the caller leaves.
      body.once('close', () => {
        void lease.release().catch(() => undefined);
      });
      return {
        status: 200,
        mediaType: archiveMediaType,
        body,
        headers: archiveHeaders(archiveLength(plan)),
      };
    },
  };
}
