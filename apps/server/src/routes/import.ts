/**
 * Import of one portable workspace tree from a ZIP archive.
 *
 * An import takes every archive that an export writes (issue 243). Both read
 * `maxArchiveEntries` and `maxArchiveBytes` of `@notesapp/core`, which are the
 * bounds of the zip format, so an archive of the largest export is an archive
 * of the largest import.
 *
 * A proxy in front of the server refuses a large request body, so the archive
 * comes in parts (record 0192). The start opens an upload in the object store
 * of the installation, each part goes to that upload, and the completion
 * joins the parts. Any server instance takes each of these requests, because
 * the upload lives in the store and its key names the workspace, the account
 * and the import. The part rule is `importPartsProblem` of `@notesapp/core`.
 *
 * Such an archive does not fit in memory, so the completion keeps it in a file
 * of the server while it reads it. The file is removed from its folder as soon
 * as it is open, so it leaves nothing behind when the import ends, fails, or
 * the process stops. Record 0170 bounds the rest:
 *
 * - An account has one open import: a start removes every earlier import of
 *   the account, and a client that fails removes its own with the abort.
 * - When the store is the disk of the server, a start and each part are
 *   refused with 507 before a byte is read when the free space, less
 *   `archiveDiskReserveBytes`, cannot hold them.
 * - One import of an account and a few of the installation run at once. The
 *   completion holds the job, and a part holds none.
 * - The completion reserves its job with the size of its parts, and an
 *   archive that the free space, less `archiveDiskReserveBytes` and less the
 *   archives of the other running imports, cannot hold is refused with 507
 *   before the parts are joined. The parts stay for a later completion.
 * - A part body that stops ends that part, and the store keeps none of it.
 * - Every entry is checked before the first commit: the paths in NFC, each
 *   free and each once, each note under the limits of the grammar, each
 *   image, and the room of the owner. Only a failure of the service stops the
 *   import after its first commit, and the answer states what came in.
 *
 * Then one entry at a time expands, and the notes go in batches that
 * `maxFilesPerChangeset` and `noteBatchBytes` bound, so the memory of an
 * import is one batch of notes or one image.
 *
 * An Obsidian vault imports as well (record 0172). `import-layout.ts` leaves
 * out the settings of a tool and every file that is neither a note nor a
 * picture, and the answer names them. It moves a picture beside a note into
 * `attachments/`, and turns each wiki link whose target is in the archive
 * into a standard link. The check parses each note, and counts its size, as
 * the commit writes it.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, statfs, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { finished, PassThrough, Readable } from 'node:stream';
import type { FastifyRequest } from 'fastify';
import {
  attachmentMediaTypeOf,
  commitChangeset,
  createAttachmentChangeset,
  createFileChangeset,
  importPartAllowed,
  importPartsBytes,
  importPartsProblem,
  listFiles,
  maxArchiveBytes,
  maxFilesPerChangeset,
  maxImportParts,
  maxPageSize,
  workspaceText,
  normalizePath,
  type Actor,
  type AttachmentMediaType,
  type ChangesetInput,
  type WorkspaceStore,
} from '@notesapp/core';
import { markdownLimits, parseMarkdown } from '@notesapp/markdown';
import {
  accountImportPrefix,
  BodyLengthError,
  importKey,
  markdownLimitCode,
  writeChargeBytes,
  type AttachmentStore,
} from '@notesapp/storage-server';
import { requireActor } from '../auth/actor.ts';
import { inspectImage } from '../jobs/inspect-image.ts';
import { watchBodyIdle } from '../plugins/body-idle-timeout.ts';
import {
  ArchiveRefusedError,
  DomainProblemError,
  ForbiddenError,
  ImportIncompleteError,
  ImportNoteRefusedError,
  InvalidContentError,
  NotFoundError,
  PayloadTooLargeError,
  RequestContractError,
  RequestTimeoutError,
  StorageFullError,
} from '../plugins/problem.ts';
import type { HandlerMap, HandlerResult } from '../plugins/register.ts';
import { mebibyte } from '../config.ts';
import { openArchiveFile, writeArchiveFile } from './archive-file.ts';
import { reserveArchiveJob, type ArchiveJobs } from './archive-jobs.ts';
import {
  archiveLinks,
  entryRole,
  importedNoteText,
  placedPictures,
  skippedFiles,
  utf8Bytes,
  type ArchiveLinks,
  type SkippedFiles,
} from './import-layout.ts';
import { readText } from './files.ts';
import {
  fileSource,
  readArchiveDirectory,
  readArchiveEntry,
  type ArchiveEntry,
  type ArchiveSource,
} from './unzip.ts';

/**
 * The most bytes of Markdown that one changeset of an import holds.
 *
 * A batch of notes is in memory while it commits, so it ends at this size as
 * well as at `maxFilesPerChangeset` files.
 */
const noteBatchBytes = 32 * mebibyte;

/**
 * The free space that an import leaves on the storage volume.
 *
 * The volume also holds the attachments and, on a small installation, the
 * database, so an import never fills it.
 */
export const archiveDiskReserveBytes = 512 * mebibyte;

/** The sentence of a body past the bound of one archive. */
function archiveTooLarge(): PayloadTooLargeError {
  return new PayloadTooLargeError(
    `The workspace archive is larger than ${String(Math.floor(maxArchiveBytes / mebibyte))} MiB.`,
  );
}

/**
 * Why a body is refused before it is read, or `null` (record 0170).
 *
 * A body longer than the bound is too large. A body that the storage volume,
 * less `archiveDiskReserveBytes` and less `otherJobBytes`, cannot hold has no
 * room. A body with no length could be as long as the bound, so the volume
 * must hold the bound for it.
 *
 * `otherJobBytes` is what the other running archive jobs stated when they
 * reserved, with the part that they already wrote and that the free space
 * already lacks. So the rule can refuse a body that fits, but two imports
 * never fill the volume together.
 */
export function bodyRoomRefusal(
  statedBytes: number | null,
  bodyBytes: number,
  freeBytes: number,
  otherJobBytes: number,
): 'too_large' | 'no_room' | null {
  if (statedBytes !== null && statedBytes > bodyBytes) return 'too_large';
  const wanted =
    (statedBytes ?? bodyBytes) + archiveDiskReserveBytes + otherJobBytes;
  return freeBytes < wanted ? 'no_room' : null;
}

/** The length that a request states for its body, or `null`. */
function statedLength(request: FastifyRequest): number | null {
  const stated = Number(request.headers['content-length']);
  return Number.isSafeInteger(stated) && stated >= 0 ? stated : null;
}

/**
 * Refuses a body before it is read, by the rule of `bodyRoomRefusal`.
 *
 * It runs after the job is reserved, so the bodies of the other running
 * imports are in `otherJobBytes`.
 */
async function checkBodyRoom(
  folder: string,
  statedBytes: number | null,
  bodyBytes: number,
  otherJobBytes: number,
): Promise<void> {
  await mkdir(folder, { recursive: true });
  const volume = await statfs(folder);
  const refusal = bodyRoomRefusal(
    statedBytes,
    bodyBytes,
    volume.bavail * volume.bsize,
    otherJobBytes,
  );
  if (refusal === 'too_large') throw archiveTooLarge();
  if (refusal === 'no_room') throw noRoom();
}

/** The image type that the name of an entry states, from the list of core. */
function mediaType(path: string): string | null {
  return attachmentMediaTypeOf(path);
}

async function livePaths(
  store: WorkspaceStore,
  actor: Actor,
  workspaceId: string,
): Promise<Set<string>> {
  const paths = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    const page = await listFiles(store, actor, workspaceId, {
      cursor,
      limit: maxPageSize,
      sort: 'path',
    });
    if (!page.ok) throw new DomainProblemError(page.error);
    for (const file of page.value.files) paths.add(file.path);
    if (page.value.nextCursor === null) return paths;
    cursor = page.value.nextCursor;
  }
}

/**
 * Refuses an entry that is larger than the file that it becomes may be.
 *
 * A note is bounded by the grammar and an image by the upload bound, so an
 * export never writes a larger one, and an entry of another writer cannot
 * hold more memory than one note or one image.
 */
function checkEntrySize(entry: ArchiveEntry, attachmentBytes: number): void {
  const note = entry.path.endsWith('.md');
  const bound = note ? markdownLimits.maxInputBytes : attachmentBytes;
  if (entry.size <= bound) return;
  throw new ArchiveRefusedError(
    'archive_too_large',
    note
      ? `A note of one import holds ${String(bound / mebibyte)} MiB at the most.`
      : `An image of one import holds ${String(bound / mebibyte)} MiB at the most.`,
  );
}

/** One file of the archive that passed every check, at its stored path. */
type CheckedEntry = {
  readonly entry: ArchiveEntry;
  /** The path in NFC, as the workspace stores it. */
  readonly path: string;
  /**
   * The bytes that the workspace stores: the text after its links are
   * rewritten for a note (record 0172), the bytes of the archive for an
   * image.
   */
  readonly bytes: number;
};

/** One image that passed its inspection, with what the store needs of it. */
type CheckedImage = CheckedEntry & {
  readonly digest: string;
  readonly mediaType: AttachmentMediaType;
  readonly width: number;
  readonly height: number;
};

/** A path in NFC, or a refusal that names the kind. */
function storedPath(path: string, kind: 'note' | 'attachment'): string {
  const normalized = normalizePath(path, kind);
  if (!normalized.ok)
    throw new InvalidContentError(
      kind === 'note'
        ? 'The archive has an invalid note path.'
        : 'The archive has an invalid attachment path.',
    );
  return normalized.value;
}

/** Inspects one image of the archive in a file of its own, then removes it. */
async function inspectEntry(
  source: ArchiveSource,
  checked: CheckedEntry,
  declaredType: string,
  scratch: string,
): Promise<CheckedImage> {
  const bytes = await readArchiveEntry(source, checked.entry);
  const path = join(scratch, `inspect-${randomUUID()}`);
  await mkdir(scratch, { recursive: true });
  await writeFile(path, bytes);
  try {
    const inspection = await inspectImage(path, declaredType);
    if (!inspection.ok) throw new InvalidContentError(inspection.reason);
    return {
      ...checked,
      digest: createHash('sha256').update(bytes).digest('hex'),
      mediaType: inspection.mediaType,
      width: inspection.width,
      height: inspection.height,
    };
  } finally {
    await unlink(path).catch(() => undefined);
  }
}

/** Commits one checked image of the archive. */
async function importAttachment(
  source: ArchiveSource,
  image: CheckedImage,
  context: ImportContext,
): Promise<void> {
  const { actor, workspaceId, store, attachments } = context;
  const bytes = await readArchiveEntry(source, image.entry);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== image.digest)
    throw new Error('notesapp: an image of the import changed in its file.');
  const objectId = randomUUID();
  await attachments.stageAttachmentBytes(
    objectId,
    Readable.from([bytes]),
    bytes.length,
  );
  await attachments.saveTemporaryAttachment(actor, workspaceId, {
    id: objectId,
    digest,
    size: BigInt(bytes.length),
    mediaType: image.mediaType,
    width: image.width,
    height: image.height,
  });
  const finalized = await attachments.finalizeAttachmentObject(
    actor,
    workspaceId,
    objectId,
    digest,
  );
  if (!finalized.ok)
    throw new InvalidContentError('The imported image did not finalize.');
  const input = createAttachmentChangeset({
    workspaceId,
    fileId: randomUUID(),
    revisionId: randomUUID(),
    path: image.path,
    objectId,
    digest,
    expectedHead: null,
    message: 'Import attachment.',
    ids: {
      mutationId: randomUUID(),
      deviceId: 'workspace-import',
      clientTime: new Date().toISOString(),
    },
  });
  const accepted = await commitChangeset(
    store,
    actor,
    input,
    `workspace-import-${input.mutationId}`,
  );
  if (!accepted.ok) throw new DomainProblemError(accepted.error);
}

/** The batches of notes that the commits take, in archive order. */
function noteBatches(
  notes: readonly CheckedEntry[],
): readonly (readonly CheckedEntry[])[] {
  const batches: CheckedEntry[][] = [];
  let batch: CheckedEntry[] = [];
  let bytes = 0;
  for (const note of notes) {
    if (
      batch.length === maxFilesPerChangeset ||
      (batch.length > 0 && bytes + note.bytes > noteBatchBytes)
    ) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(note);
    bytes += note.bytes;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

/** Commits one batch of notes as one changeset. */
async function importNoteBatch(
  source: ArchiveSource,
  notes: readonly CheckedEntry[],
  links: ArchiveLinks,
  context: ImportContext,
): Promise<void> {
  const { actor, workspaceId, store } = context;
  const revisions: ChangesetInput['revisions'][number][] = [];
  const expectedHeads: Record<string, null> = {};
  for (const note of notes) {
    const text = importedNoteText(
      (await readArchiveEntry(source, note.entry)).toString('utf8'),
      note.path,
      links,
    );
    const fileId = randomUUID();
    const built = createFileChangeset({
      workspaceId,
      fileId,
      revisionId: randomUUID(),
      path: note.path,
      // An import starts the document of the note on the server (record 0084).
      content: workspaceText(text, 1),
      message: 'Import note.',
      ids: {
        mutationId: randomUUID(),
        deviceId: 'workspace-import',
        clientTime: new Date().toISOString(),
      },
    });
    expectedHeads[fileId] = null;
    revisions.push(...built.revisions);
  }
  const input: ChangesetInput = {
    workspaceId,
    mutationId: randomUUID(),
    deviceId: 'workspace-import',
    expectedHeads,
    revisions,
  };
  const accepted = await commitChangeset(
    store,
    actor,
    input,
    `workspace-import-${input.mutationId}`,
  );
  if (!accepted.ok) throw new DomainProblemError(accepted.error);
}

/** The files of an archive, checked, or the refusal that names the cause. */
async function readDirectory(
  source: ArchiveSource,
): Promise<readonly ArchiveEntry[]> {
  try {
    return await readArchiveDirectory(source);
  } catch (error) {
    // The reader names each cause it knows (issue 243). Anything else that
    // it meets is an archive it cannot read, which is never a digest that
    // does not match.
    if (error instanceof ArchiveRefusedError) throw error;
    throw new ArchiveRefusedError(
      'archive_invalid',
      'The file is not a zip archive that this server can read.',
    );
  }
}

/** What one import works on. */
type ImportContext = {
  readonly actor: Actor;
  readonly workspaceId: string;
  readonly store: WorkspaceStore;
  readonly attachments: AttachmentStore;
  /** The folder of the files of this request, from `scratch.ts`. */
  readonly scratch: string;
};

/** What one import commits, after every check passed. */
type ImportPlan = {
  readonly notes: readonly CheckedEntry[];
  readonly images: readonly CheckedImage[];
  /** The pictures that move and the wiki links of the archive (record 0172). */
  readonly links: ArchiveLinks;
  /** The files of the archive that the import leaves out (record 0172). */
  readonly skipped: SkippedFiles;
};

/**
 * Checks every entry of an archive before the first commit (record 0170).
 *
 * A refusal here leaves the workspace as it was. Each note is read and parsed
 * once under the limits of the grammar, as the commit parses it, and each
 * image is inspected, so a commit later fails only for a cause of the service.
 */
async function checkArchive(
  source: ArchiveSource,
  entries: readonly ArchiveEntry[],
  context: ImportContext,
  attachmentBytes: number,
): Promise<ImportPlan> {
  const noteEntries: { entry: ArchiveEntry; path: string }[] = [];
  const imageEntries: { entry: ArchiveEntry; type: string }[] = [];
  const left: string[] = [];
  // A note and a picture come in. The settings of a tool and every other
  // kind of file stay out, and the answer names them (record 0172).
  for (const entry of entries) {
    const role = entryRole(entry.path);
    if (role === 'skipped') {
      left.push(entry.path);
      continue;
    }
    checkEntrySize(entry, attachmentBytes);
    // A note has no media type and a picture has one, as the role reads it.
    const type = mediaType(entry.path);
    if (type === null)
      noteEntries.push({ entry, path: storedPath(entry.path, 'note') });
    else imageEntries.push({ entry, type });
  }
  // A picture beside a note takes its place in the attachments folder, under
  // a free name when that place is taken.
  const placed = placedPictures(
    imageEntries.map((item) => item.entry.path.normalize('NFC')),
    noteEntries.map((note) => note.path),
  );
  const imageChecks = imageEntries.map((item) => ({
    checked: {
      entry: item.entry,
      path: storedPath(
        placed.get(item.entry.path.normalize('NFC')) ?? item.entry.path,
        'attachment',
      ),
      bytes: item.entry.size,
    },
    type: item.type,
  }));
  // The workspace stores a path in NFC, so two names of one path in another
  // form are one file, and a name in another form of a live file is that file.
  const seen = new Set<string>();
  for (const path of [
    ...noteEntries.map((note) => note.path),
    ...imageChecks.map((item) => item.checked.path),
  ]) {
    if (seen.has(path))
      throw new InvalidContentError('The archive holds one path twice.');
    seen.add(path);
  }
  const taken = await livePaths(
    context.store,
    context.actor,
    context.workspaceId,
  );
  if ([...seen].some((path) => taken.has(path)))
    throw new DomainProblemError({ code: 'path_conflict', fileIds: [] });
  const links = archiveLinks(
    noteEntries.map((note) => note.path),
    placed,
  );
  const notes: CheckedEntry[] = [];
  for (const note of noteEntries) {
    // The text that the commit takes is the text that this check parses and
    // the room of the workspace counts.
    const text = importedNoteText(
      (await readArchiveEntry(source, note.entry)).toString('utf8'),
      note.path,
      links,
    );
    try {
      parseMarkdown(text);
    } catch (error) {
      // Each limit of the grammar has its own code, so the person reads the
      // real cause of the refusal and the note that has it.
      const refused = markdownLimitCode(error);
      if (refused !== null)
        throw new ImportNoteRefusedError(refused, note.path);
      throw error;
    }
    notes.push({ ...note, bytes: utf8Bytes(text) });
  }
  const images: CheckedImage[] = [];
  for (const { checked, type } of imageChecks)
    images.push(await inspectEntry(source, checked, type, context.scratch));
  const contentBytes = [...notes, ...images].reduce(
    (total, item) => total + BigInt(item.bytes),
    0n,
  );
  const charge = writeChargeBytes(
    contentBytes,
    notes.length + images.length,
    noteBatches(notes).length + images.length,
  );
  const room = await context.attachments.workspaceRoom(
    context.actor,
    context.workspaceId,
  );
  if (charge > room)
    throw new DomainProblemError({ code: 'quota', fileIds: [] });
  return { notes, images, links, skipped: skippedFiles(left) };
}

/** The phrase of a count of files, for example `1 file` and `3 files`. */
function filePhrase(count: number): string {
  return count === 1 ? '1 file' : `${String(count)} files`;
}

/**
 * Commits a checked archive, and names what came in when the service stops
 * it on the way.
 */
async function commitArchive(
  source: ArchiveSource,
  plan: ImportPlan,
  context: ImportContext,
): Promise<void> {
  const total = plan.notes.length + plan.images.length;
  let done = 0;
  try {
    for (const batch of noteBatches(plan.notes)) {
      await importNoteBatch(source, batch, plan.links, context);
      done += batch.length;
    }
    for (const image of plan.images) {
      await importAttachment(source, image, context);
      done += 1;
    }
  } catch (error) {
    if (done === 0) throw error;
    throw new ImportIncompleteError(
      `${filePhrase(done)} of ${String(total)} came in before the import stopped, and they stay in the workspace. Import a zip file of the other files to finish.`,
    );
  }
}

/** A whole number of a validated request part. */
function readCount(value: unknown, key: string): number {
  const member: unknown =
    value !== null && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value))[key]
      : undefined;
  if (typeof member !== 'number' || !Number.isSafeInteger(member))
    throw new Error(`notesapp: the validated request has no ${key}.`);
  return member;
}

/** The actor of a request that may write to the workspace of its path. */
function writer(request: FastifyRequest): {
  readonly actor: Actor;
  readonly workspaceId: string;
} {
  const actor = requireActor(request).actor;
  const workspaceId = readText(request.params, 'workspaceId');
  const grant = actor.grants.find((entry) => entry.workspaceId === workspaceId);
  if (grant === undefined || !grant.actions.includes('write'))
    throw new ForbiddenError();
  return { actor, workspaceId };
}

/** The sentence of a refusal for want of room on the disk of the server. */
function noRoom(): StorageFullError {
  return new StorageFullError(
    'The server has no room for this zip file now. Try again later, or ask the administrator for more room.',
  );
}

/**
 * Refuses `bytes` that the store cannot take and still leave
 * `archiveDiskReserveBytes`. A store that states no bound takes them.
 */
async function checkStoreRoom(
  attachments: AttachmentStore,
  bytes: number,
): Promise<void> {
  const room = await attachments.objects.room();
  if (room !== null && room - archiveDiskReserveBytes < bytes) throw noRoom();
}

/**
 * Removes every open import of an account and the archive of every
 * completion of it that a refusal stopped, so one account holds the room of
 * one import at most.
 */
async function removeAccountImports(
  attachments: AttachmentStore,
  accountId: string,
): Promise<void> {
  const prefix = accountImportPrefix(accountId);
  const uploads: string[] = [];
  for await (const upload of attachments.objects.listUploads(prefix))
    uploads.push(upload.key);
  for (const key of uploads) await attachments.objects.abortUpload(key);
  const joined: string[] = [];
  for await (const item of attachments.objects.list(prefix))
    joined.push(item.key);
  for (const key of joined) await attachments.objects.remove(key);
}

/** The answer to a part or a completion of an import that is not there. */
function noImport(): NotFoundError {
  return new NotFoundError(
    'The import is not on the server. Start the import again.',
  );
}

/** The refusal of parts that do not make one archive. */
function partsRefused(): ArchiveRefusedError {
  return new ArchiveRefusedError(
    'archive_invalid',
    'The parts of the zip file do not make one file. Send the zip file again.',
  );
}

/**
 * Writes the body of one part to the store, under the idle bound of an
 * upload.
 *
 * The body goes through a stream of its own, so the watch sees every chunk
 * that the store reads, and a sender that stops or closes its connection
 * stops the write. The store keeps no byte of a part that did not arrive
 * whole.
 */
async function receivePart(
  request: FastifyRequest,
  attachments: AttachmentStore,
  key: string,
  partNumber: number,
  size: number,
  idleMs: number,
): Promise<boolean> {
  // The request feeds `body` and is never destroyed by it, so a refusal of
  // the part still reaches the sender as an answer. A sender that fails or
  // goes away ends `body` with that failure, and so the write.
  const body = new PassThrough();
  request.raw.pipe(body);
  finished(request.raw, (error) => {
    if (error) body.destroy(error);
  });
  let idleReject: (error: Error) => void = () => {};
  const idle = new Promise<never>((_resolve, reject) => {
    idleReject = reject;
  });
  idle.catch(() => undefined);
  // The watch is armed after the pipe, so no chunk of the body is lost to it.
  const watch = watchBodyIdle({
    body: request.raw,
    idleMs,
    onIdle: () => {
      const stopped = new RequestTimeoutError(
        'The import stopped. Send the zip file again.',
      );
      request.raw.unpipe(body);
      body.destroy(stopped);
      idleReject(stopped);
    },
  });
  const written = attachments.objects.writePart(key, partNumber, body, size);
  written.catch(() => undefined);
  try {
    const stored = await Promise.race([written, idle]);
    if (!stored) {
      request.raw.unpipe(body);
      body.destroy();
    }
    return stored;
  } catch (error) {
    // The write ends before the answer, so a stopped part leaves no file.
    await written.catch(() => undefined);
    if (error instanceof RequestTimeoutError) throw error;
    if (error instanceof BodyLengthError || request.raw.destroyed)
      throw new RequestTimeoutError(
        'The part ended before all its bytes came. Send the zip file again.',
      );
    throw error;
  } finally {
    watch.stop();
  }
}

/**
 * Builds the handlers of the portable workspace import in parts.
 *
 * @param limits the largest image of one upload, from
 * `config.limits.attachmentBytes`, which bounds an image of an archive too,
 * the largest part of an import, from `config.limits.importPartBytes`, and
 * the longest gap between two chunks of a part, from
 * `config.limits.uploadIdleTimeoutMs`. One idle bound serves both bodies that
 * this server streams, so a deployment states it once.
 * @param scratch the folder of the files of one request, from `scratch.ts`.
 */
export function createImportHandlers(
  store: WorkspaceStore,
  attachments: AttachmentStore,
  jobs: ArchiveJobs,
  limits: {
    readonly attachmentBytes: number;
    readonly importPartBytes: number;
    readonly uploadIdleTimeoutMs: number;
  },
  scratch: string,
): HandlerMap {
  return {
    startWorkspaceImport: async (request): Promise<HandlerResult> => {
      const { actor, workspaceId } = writer(request);
      const size = readCount(request.body, 'size');
      if (size > maxArchiveBytes) throw archiveTooLarge();
      const importId = randomUUID();
      // The earlier imports of the account go first, so their room counts
      // for this one. Two starts of one account on two processes run one
      // after the other, so neither keeps an import that the other opened.
      await jobs.serializeImportStart(actor.accountId, async () => {
        await removeAccountImports(attachments, actor.accountId);
        await checkStoreRoom(attachments, size);
        await attachments.objects.startUpload(
          importKey(workspaceId, actor.accountId, importId),
        );
      });
      return {
        status: 201,
        mediaType: 'application/json',
        body: { importId, partBytes: limits.importPartBytes },
      };
    },

    sendWorkspaceImportPart: async (request): Promise<HandlerResult> => {
      const { actor, workspaceId } = writer(request);
      const importId = readText(request.params, 'importId');
      const partNumber = readCount(request.params, 'partNumber');
      const stated = statedLength(request);
      if (stated === null || stated === 0)
        throw new RequestContractError('headers', [
          {
            path: '/content-length',
            message: 'A part states the length of its bytes.',
          },
        ]);
      if (stated > limits.importPartBytes)
        throw new PayloadTooLargeError(
          `A part of an import holds ${String(limits.importPartBytes / mebibyte)} MiB at the most.`,
        );
      if (!importPartAllowed(partNumber, stated))
        throw new RequestContractError('params', [
          {
            path: '/partNumber',
            message: `An import has ${String(maxImportParts)} parts at the most.`,
          },
        ]);
      await checkStoreRoom(attachments, stated);
      const stored = await receivePart(
        request,
        attachments,
        importKey(workspaceId, actor.accountId, importId),
        partNumber,
        stated,
        limits.uploadIdleTimeoutMs,
      );
      if (!stored) throw noImport();
      return {
        status: 200,
        mediaType: 'application/json',
        body: { partNumber, size: stated },
      };
    },

    completeWorkspaceImport: async (request, reply): Promise<HandlerResult> => {
      const { actor, workspaceId } = writer(request);
      const key = importKey(
        workspaceId,
        actor.accountId,
        readText(request.params, 'importId'),
      );
      // An open upload states its parts. An upload that a refusal below
      // stopped after the join is one object of the store already.
      const parts = await attachments.objects.listParts(key);
      let size: number;
      if (parts === null) {
        const joined = await attachments.objects.size(key);
        if (joined === null) throw noImport();
        size = joined;
      } else {
        const problem = importPartsProblem(parts);
        if (problem === 'too_large') throw archiveTooLarge();
        if (problem !== null) throw partsRefused();
        size = importPartsBytes(parts);
      }
      const lease = await reserveArchiveJob(jobs, reply, actor.accountId, size);
      try {
        await checkBodyRoom(
          scratch,
          size,
          maxArchiveBytes,
          lease.otherDiskBytes,
        );
        if (parts !== null) {
          // The store joins exactly the parts that passed the check above.
          const joined = await attachments.objects.completeUpload(key, parts);
          if (joined === 'missing') throw noImport();
          if (joined === 'changed') throw partsRefused();
        }
        const handle = await openArchiveFile(scratch, 'import');
        try {
          const stream = await attachments.objects.read(key);
          if (stream === null) throw noImport();
          const written = await writeArchiveFile(handle, stream);
          // The archive is in the file of this request now. The store keeps
          // it no longer, whatever the import answers.
          await attachments.objects.remove(key);
          if (written !== size) throw partsRefused();
          const source = fileSource(handle, size);
          const entries = await readDirectory(source);
          const context = { actor, workspaceId, store, attachments, scratch };
          const plan = await checkArchive(
            source,
            entries,
            context,
            limits.attachmentBytes,
          );
          await commitArchive(source, plan, context);
          return {
            status: 200,
            mediaType: 'application/json',
            body: {
              notes: plan.notes.length,
              attachments: plan.images.length,
              skipped: plan.skipped,
            },
          };
        } finally {
          await handle.close();
        }
      } finally {
        await lease.release();
      }
    },

    abortWorkspaceImport: async (request): Promise<HandlerResult> => {
      const { actor, workspaceId } = writer(request);
      const key = importKey(
        workspaceId,
        actor.accountId,
        readText(request.params, 'importId'),
      );
      await attachments.objects.abortUpload(key);
      await attachments.objects.remove(key);
      return {
        status: 200,
        mediaType: 'application/json',
        body: { removed: true },
      };
    },
  };
}
