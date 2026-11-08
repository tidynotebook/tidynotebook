/**
 * The document of each note on this device (records 0081, 0085).
 *
 * A save carries work, not text. This module holds the one place where the
 * text of a working copy becomes that work: the device folds its text into
 * its own document and sends the update that follows the state the server
 * already has. Two devices that write at the same time therefore keep both
 * edits, because each update names the characters it touches.
 *
 * Every write reads the stored document again inside the same transaction and
 * merges into it. A tab never replaces the row with a buffer that it read
 * earlier, so two tabs that write before either reads the other cannot lose
 * work.
 *
 * The open editor appends the update of each frame to `documentUpdates` with
 * no decode (record 0175). `readDocumentRow` returns the row with the updates
 * of its generation folded in, and `writeDocumentRow` folds them into the row
 * that it writes and removes them, so every reader and every writer sees the
 * work of every key. A transaction that reads or writes a document therefore
 * covers `documentUpdates` as well.
 */
import {
  advanceCoverage,
  applyDocumentUpdate,
  documentStateVector,
  encodeDocumentDelta,
  mergeDocumentUpdates,
  mergeStateVectors,
  observeDocument,
  readDocumentText,
  replaceDocumentText,
  startDocument,
  stateVectorCovers,
} from '@notesapp/note-document';
import type { DocumentSave, RevisionInput } from '@notesapp/core';
import { LocalStorageError } from '@notesapp/sync';
import {
  partitionRange,
  type DocumentRow,
  type DocumentUpdateRow,
  type Tables,
} from '../database.ts';
import {
  validateDocument,
  validateDocumentUpdate,
  validateQueueRow,
} from '../migrations.ts';

/** The key of one document row. */
export type DocumentKey = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly fileId: string;
};

/** The updates of one note that wait to be folded into its document. */
export async function pendingDocumentUpdates(
  tables: Tables,
  key: DocumentKey,
): Promise<readonly DocumentUpdateRow[]> {
  const rows: unknown[] = await tables.documentUpdates
    .where('[serverOrigin+accountId+workspaceId+fileId]')
    .equals([key.serverOrigin, key.accountId, key.workspaceId, key.fileId])
    .toArray();
  return rows.map((row: unknown) => validateDocumentUpdate(row));
}

/**
 * The pending updates of a note past which an append folds them into the
 * document. A read decodes the document and applies each update, so the
 * bound keeps that work small, and the fold costs one decode for many keys.
 */
const pendingUpdateBound = { count: 64, bytes: 64 * 1024 } as const;

/** Whether the pending updates of a note are due for a fold. */
export function pendingUpdatesPassBound(
  updates: readonly DocumentUpdateRow[],
): boolean {
  if (updates.length >= pendingUpdateBound.count) return true;
  let bytes = 0;
  for (const update of updates) bytes += update.bytes.byteLength;
  return bytes >= pendingUpdateBound.bytes;
}

/** The updates as one, or `null` when one of them is not an update. */
function mergedUpdate(
  updates: readonly DocumentUpdateRow[],
): Uint8Array | null {
  try {
    return mergeDocumentUpdates(updates.map((update) => update.bytes));
  } catch {
    // Yjs throws on bytes that do not decode. The fold then applies the
    // updates one by one, and the door of the document refuses those bytes.
    return null;
  }
}

/**
 * Applies the updates of one generation to a document, once each.
 *
 * The updates of one note are one merged update in the common case. An
 * update that the document cannot take, for example work that builds on an
 * append that failed, makes the merged update fail as a whole, so the fold
 * then applies one update at a time and repeats while one more applies. The
 * order of the rows is not the order of the writes, and a later pass takes
 * an update whose dependency an earlier pass applied. An update that never
 * applies is left out: it cannot become text, and a fold that refused the
 * whole row made the note unreadable and stopped the sync (record 0181). The
 * editor that wrote it holds the work and writes its whole document, and its
 * draft states no vector meanwhile, so the draft text is the recovery copy.
 */
function foldUpdates(
  bytes: Uint8Array,
  updates: readonly DocumentUpdateRow[],
): Uint8Array {
  if (updates.length === 0) return bytes;
  const merged = mergedUpdate(updates);
  if (merged !== null) {
    const applied = applyDocumentUpdate(bytes, merged);
    if (applied.ok) return applied.value.document;
  }
  let document = bytes;
  let waiting = [...updates];
  let progressed = true;
  while (progressed && waiting.length > 0) {
    progressed = false;
    const refused: DocumentUpdateRow[] = [];
    for (const update of waiting) {
      const applied = applyDocumentUpdate(document, update.bytes);
      if (applied.ok) {
        document = applied.value.document;
        progressed = true;
      } else refused.push(update);
    }
    waiting = refused;
  }
  return document;
}

/** The stored row alone, without its pending updates. */
export async function readStoredDocumentRow(
  tables: Tables,
  key: DocumentKey,
): Promise<DocumentRow | null> {
  const stored: unknown = await tables.documents.get([
    key.serverOrigin,
    key.accountId,
    key.workspaceId,
    key.fileId,
  ]);
  return stored === undefined ? null : validateDocument(stored);
}

/**
 * Reads the document of one note with every update of its generation, or
 * `null` when the device holds neither.
 *
 * A note that this device started and whose first write is still pending
 * reads as an empty document with those updates (record 0175). An update
 * that the document cannot take is left out, so the read never fails on it
 * (record 0181).
 */
export async function readDocumentRow(
  tables: Tables,
  key: DocumentKey,
): Promise<DocumentRow | null> {
  const row = await readStoredDocumentRow(tables, key);
  const epoch = generationOf(row);
  const pending = (await pendingDocumentUpdates(tables, key)).filter(
    (update) => update.epoch === epoch,
  );
  if (row === null && pending.length === 0) return null;
  const base: DocumentRow = row ?? {
    ...key,
    bytes: startDocument(''),
    epoch,
    // A note that this device starts has sent nothing yet.
    appliedVector: documentStateVector(startDocument('')),
  };
  return { ...base, bytes: foldUpdates(base.bytes, pending) };
}

/**
 * Writes the document of one note and folds its pending updates into it.
 *
 * An update of the generation of the row joins it, so no key of an open
 * editor is lost when the row is written: a snapshot, a feed page, a
 * checkpoint and a merge all keep the work that waits. An update of another
 * generation cannot join and goes (record 0084), and so does an update that
 * the document cannot take (record 0181). Every update of the note is
 * removed, so the next read decodes nothing twice.
 */
export async function writeDocumentRow(
  tables: Tables,
  row: DocumentRow,
): Promise<DocumentRow> {
  const pending = await pendingDocumentUpdates(tables, row);
  const written: DocumentRow = {
    ...row,
    bytes: foldUpdates(
      row.bytes,
      pending.filter((update) => update.epoch === row.epoch),
    ),
  };
  await tables.documents.put(written);
  if (pending.length > 0)
    await tables.documentUpdates
      .where('[serverOrigin+accountId+workspaceId+fileId]')
      .equals([row.serverOrigin, row.accountId, row.workspaceId, row.fileId])
      .delete();
  return written;
}

/**
 * Refuses work on an existing note whose document this device does not hold.
 *
 * Record 0084: no device starts an existing note from Markdown. A document
 * that this device started would hold characters that the server never saw,
 * and joining it with the document of the server holds the text twice. The
 * refusal writes nothing, so the text stays in the working copy until the
 * document arrives with a snapshot or a server read.
 */
function refuseWithoutDocument(): never {
  throw new LocalStorageError(
    'stale',
    'this device does not hold the document of this note yet',
  );
}

/** The generation of a stored document. A note that starts here is 1. */
export function generationOf(row: DocumentRow | null): number {
  return row?.epoch ?? 1;
}

/**
 * Refuses work of an open editor that builds on another generation than the
 * stored document (record 0181).
 *
 * The identities of one generation say nothing about another (record 0084),
 * so the work would name items that the stored document lacks, or hold the
 * text twice. Nothing is written, and the editor keeps the work: its draft
 * holds the text, and the next open of the note takes it.
 */
export function refuseOtherGeneration(
  row: DocumentRow | null,
  epoch: number,
): void {
  if (generationOf(row) !== epoch)
    throw new LocalStorageError(
      'stale',
      'the document of this note has a new generation',
    );
}

/** The document that a note holds now, or a started one for a new note. */
function documentOrStart(
  row: DocumentRow | null,
  text: string,
  noteExists: boolean,
): DocumentRow {
  if (row !== null) return row;
  if (noteExists) refuseWithoutDocument();
  const bytes = startDocument(text);
  return {
    serverOrigin: '',
    accountId: '',
    workspaceId: '',
    fileId: '',
    bytes,
    epoch: 1,
    // A note that this device starts has sent nothing yet, so the server has
    // none of its work and the first save carries the whole document.
    appliedVector: documentStateVector(startDocument('')),
  };
}

/**
 * Folds one text into the document of a note and states the save it makes.
 *
 * The text of the working copy is the text a person sees. Writing it into the
 * document keeps every character that stayed, so the update that follows
 * names only what changed and merges with the work of another device.
 * `noteExists` states that the server already holds the note, so this device
 * must not start its document.
 */
export async function foldTextIntoDocument(
  tables: Tables,
  key: DocumentKey,
  text: string,
  noteExists: boolean,
): Promise<{ readonly row: DocumentRow; readonly save: DocumentSave }> {
  const current = await readDocumentRow(tables, key);
  const base = documentOrStart(current, text, noteExists);
  const written = replaceDocumentText(base.bytes, text);
  if (!written.ok)
    throw new LocalStorageError(
      'corrupt',
      `the document of this note refused the text: ${written.refusal}`,
    );
  // The row keeps the acknowledged work of the row it replaces.
  const row: DocumentRow = {
    ...base,
    ...key,
    bytes: written.value.document,
  };
  return { row, save: saveOfDocument(row) };
}

/**
 * The save of one document row: the work since the state the server has.
 *
 * The update follows the state that this device last applied from the
 * server, so it carries every change of this device since then (record 0085).
 */
function saveOfDocument(row: DocumentRow): DocumentSave {
  return {
    work: {
      kind: 'update',
      update: encodeDocumentDelta(row.bytes, row.appliedVector),
    },
    epoch: row.epoch,
    observed: observeDocument(row.bytes),
  };
}

/**
 * The insertions of a document that the server holds or will hold once the
 * document updates of `revisions` that it accepts reach it.
 *
 * The server holds the work that this device applied from it and the work it
 * acknowledged that the feed has not brought yet. Each update continues from
 * what is known, so it moves the known clocks only over ranges that join
 * them. An update of another note or generation moves nothing.
 */
export function coverageAfter(
  row: DocumentRow,
  revisions: readonly RevisionInput[],
): Uint8Array {
  let known = mergeStateVectors(
    row.appliedVector,
    row.acknowledgedVector ?? row.appliedVector,
  );
  for (const { fileId, content } of revisions)
    if (
      fileId === row.fileId &&
      content.kind === 'markdown' &&
      content.document.epoch === row.epoch &&
      content.document.work.kind === 'update'
    )
      known = advanceCoverage(known, content.document.work.update);
  return known;
}

/**
 * Whether the document of a note holds insertions that the server lacks.
 *
 * Undo and redo can write the text of the last version again with new
 * characters, so the text alone says nothing about unsent work. A state
 * vector names every insertion, and text that is equal to the version cannot
 * differ by a deletion alone, so the vectors answer this question. The work
 * that waits in the queue is not unsent.
 */
export async function holdsUnsentWork(
  tables: Tables,
  key: DocumentKey,
): Promise<boolean> {
  const row = await readDocumentRow(tables, key);
  if (row === null) return false;
  const range = partitionRange(
    key.serverOrigin,
    key.accountId,
    key.workspaceId,
  );
  const queued: unknown[] = await tables.queue
    .where('[serverOrigin+accountId+workspaceId+sequence]')
    .between(range.lower, range.upper, true, true)
    .toArray();
  return !stateVectorCovers(
    coverageAfter(
      row,
      queued.flatMap((value) => validateQueueRow(value).input.revisions),
    ),
    documentStateVector(row.bytes),
  );
}

/**
 * Reads the text that a checkpoint of an open note freezes (record 0133).
 *
 * The open editor wrote every change into the document already, so the text
 * of the version is the text of the document. A note with no document yet
 * reads as empty, and `freezeDocument` refuses a note that the server holds.
 */
export async function frozenText(
  tables: Tables,
  key: DocumentKey,
): Promise<string> {
  const row = await readDocumentRow(tables, key);
  return row === null ? '' : readDocumentText(row.bytes);
}

/**
 * Freezes the document of an open note as the save of one checkpoint.
 *
 * No text becomes work here. The text of an open editor can lag its
 * document, because remote work reaches the store before the editor joins
 * it, and a diff of that text would write a revert or a second copy of the
 * remote work as work of this device (record 0133). `text` is the text that
 * the caller read with `frozenText`. When the document no longer holds it,
 * the answer is `null` and the caller reads the text again. `epoch` is the
 * generation of the document of the editor.
 */
export async function freezeDocument(
  tables: Tables,
  key: DocumentKey,
  text: string,
  noteExists: boolean,
  epoch: number,
): Promise<{
  readonly row: DocumentRow | null;
  readonly save: DocumentSave;
} | null> {
  const current = await readDocumentRow(tables, key);
  // The editor wrote its work into its own generation. A document of another
  // generation holds none of it, so a version of it would claim the text of
  // that generation as the work of this editor (record 0181).
  refuseOtherGeneration(current, epoch);
  // A new note that holds no document yet starts an empty one, as the first
  // write of its editor does. A note that the server holds is refused.
  const row = current ?? { ...documentOrStart(null, '', noteExists), ...key };
  if (readDocumentText(row.bytes) !== text) return null;
  // The checkpoint writes the row it froze, which folds the pending updates
  // of the open editor into the stored document (record 0175).
  return { row, save: saveOfDocument(row) };
}

/**
 * The save that a deletion carries.
 *
 * A deletion states the complete state that this device had seen and no text
 * work at all. The workspace refuses it when that state does not cover the
 * text the note holds, so a deletion never hides an edit from another device
 * (record 0083).
 */
export async function deletionSave(
  tables: Tables,
  key: DocumentKey,
  noteExists: boolean,
): Promise<DocumentSave> {
  const current = await readDocumentRow(tables, key);
  // The state of a document that this device started names none of the text
  // that the server holds, so the save would state that it saw nothing.
  if (current === null && noteExists) refuseWithoutDocument();
  const bytes = current?.bytes ?? startDocument('');
  return {
    work: { kind: 'none' },
    epoch: current?.epoch ?? 1,
    observed: observeDocument(bytes),
  };
}

/** What the server sent for one note, as the feed states it. */
export type ServerDocumentWork =
  /** The work that follows the state this device already holds. */
  | { readonly kind: 'update'; readonly update: Uint8Array }
  /** The whole document, which a snapshot and a new generation both send. */
  | { readonly kind: 'document'; readonly document: Uint8Array };

/**
 * Applies accepted server work to the document of one note.
 *
 * The device advances the state it believes the server has only with work
 * that it applied, so a receipt alone never moves it (record 0085). The text
 * that this returns is what the note now reads.
 */
export async function applyServerWork(
  tables: Tables,
  key: DocumentKey,
  epoch: number,
  work: ServerDocumentWork,
): Promise<{ readonly row: DocumentRow; readonly text: string }> {
  const current = await readDocumentRow(tables, key);
  const joined = current?.epoch === epoch ? current : null;
  if (work.kind === 'document') {
    // A whole document replaces what this device holds. Acknowledged work of
    // the same generation that it lacks is still not unsent.
    const row: DocumentRow = {
      ...joined,
      ...key,
      bytes: work.document,
      epoch,
      appliedVector: documentStateVector(work.document),
    };
    return { row, text: readDocumentText(work.document) };
  }
  // Work of another generation cannot join what this device holds, because
  // identities of one generation say nothing about another. Such work, and
  // the work of a note that this device holds no document for, applies to an
  // empty document. The first work of a new note starts from nothing, so it
  // applies whole. Any other work lacks what it depends on and is refused, so
  // the caller reads a snapshot instead of keeping an empty note.
  const empty = startDocument('');
  const applied = applyDocumentUpdate(joined?.bytes ?? empty, work.update);
  if (!applied.ok)
    throw new LocalStorageError(
      'stale',
      `the accepted work does not fit this document: ${applied.refusal}`,
    );
  // Only the accepted work moves the state this device believes the server
  // has, and only over the ranges that continue what it already applied. The
  // unsent work of this device stays unsent (record 0085). The state vector
  // of an update names only writers whose work it holds from clock zero, so
  // it cannot measure work that continues earlier work.
  // The row keeps the acknowledged work of the same generation.
  const row: DocumentRow = {
    ...joined,
    ...key,
    bytes: applied.value.document,
    epoch,
    appliedVector: advanceCoverage(
      joined?.appliedVector ?? documentStateVector(empty),
      work.update,
    ),
  };
  return { row, text: applied.value.text };
}
