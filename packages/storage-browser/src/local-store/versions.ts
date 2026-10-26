/**
 * The versions area of the local store.
 *
 * A checkpoint is one transaction that writes the content, the immutable
 * checkpoint with its parent, the local head, and the queue entry. Either all
 * of them exist or none does, so a queued mutation always has the bytes it
 * refers to and a stored checkpoint always has a parent. `listCheckpoints`
 * reads the local history of one file.
 */
import {
  deletionSave,
  foldTextIntoDocument,
  freezeDocument,
  frozenText,
  generationOf,
  pendingDocumentUpdates,
  pendingUpdatesPassBound,
  readDocumentRow,
  readStoredDocumentRow,
  refuseOtherGeneration,
  writeDocumentRow,
  type DocumentKey,
} from './documents.ts';
import {
  applyDocumentUpdate,
  documentStateVector,
  startDocument,
} from '@notesapp/note-document';
import { contentDigest } from '@notesapp/core';
import type { ChangesetInput } from '@notesapp/core';
import {
  LocalStorageError,
  shouldCheckpoint,
  type CheckpointRecord,
  type CheckpointSource,
  type Draft,
  type LocalStore,
  type NoteDocument,
  type QueueEntry,
} from '@notesapp/sync';
import { guard, type CheckpointRow, type FileRow } from '../database.ts';
import {
  validateAcceptedFile,
  validateCheckpoint,
  validateContent,
  validateDraft,
} from '../migrations.ts';
import {
  anchorOfDraft,
  byteLength,
  draftRow,
  expectedHeadOfParent,
  nextCheckpointSequence,
  nextQueueSequence,
  parentOfNextSave,
  type LocalStoreContext,
} from './shared.ts';

type VersionsSlice = Pick<
  LocalStore,
  | 'checkpoint'
  | 'listCheckpoints'
  | 'readRevisionText'
  | 'readNoteDocument'
  | 'mergeNoteWork'
  | 'appendNoteWork'
>;

/** How often a checkpoint reads a document that moved under it again. */
const frozenTextAttempts = 3;

export function createVersionsSlice(ctx: LocalStoreContext): VersionsSlice {
  const { serverOrigin, deviceId, db, tables, nowIso, newId, publish } = ctx;

  /** The public view of a stored checkpoint. */
  const checkpointOf = (row: CheckpointRow): CheckpointRecord => ({
    serverOrigin: row.serverOrigin,
    accountId: row.accountId,
    workspaceId: row.workspaceId,
    revisionId: row.revisionId,
    fileId: row.fileId,
    workingCopyId: row.workingCopyId,
    parents: row.parents,
    path: row.path,
    deleted: row.deleted,
    digest: row.digest,
    message: row.message,
    clientTime: row.clientTime,
    mutationId: row.mutationId,
    accepted: row.accepted,
  });

  /**
   * Merges one piece of work of generation `epoch` into the stored document
   * of a note, inside the transaction of the caller. The pending updates of
   * the note join the written row.
   */
  const mergeWork = async (
    key: DocumentKey,
    epoch: number,
    update: Uint8Array,
  ): Promise<NoteDocument> => {
    const row = await readStoredDocumentRow(tables, key);
    refuseOtherGeneration(row, epoch);
    if (row === null) {
      // Work of an editor that started its own document for a note that the
      // server holds would start that note from Markdown on this device
      // (record 0084). The working copy keeps the text.
      const stored: unknown = await tables.acceptedFiles.get([
        key.serverOrigin,
        key.accountId,
        key.workspaceId,
        key.fileId,
      ]);
      if (
        stored !== undefined &&
        validateAcceptedFile(stored).acceptedHeadRevisionId !== null
      )
        throw new LocalStorageError(
          'stale',
          'this device does not hold the document of this note yet',
        );
    }
    const before = row?.bytes ?? startDocument('');
    const applied = applyDocumentUpdate(before, update);
    if (!applied.ok)
      throw new LocalStorageError(
        'corrupt',
        `the document of this note refused the work: ${applied.refusal}`,
      );
    const written = await writeDocumentRow(tables, {
      ...key,
      bytes: applied.value.document,
      epoch: generationOf(row),
      // The work of this device is not accepted work, so the state the
      // server holds does not move (record 0085).
      appliedVector: row?.appliedVector ?? documentStateVector(before),
    });
    return { bytes: written.bytes, epoch: written.epoch };
  };

  /** One try of `checkpoint`, or `moved` when the document moved under it. */
  const checkpointOnce = async (
    draft: Draft,
    message: string | null,
    source: CheckpointSource,
  ): Promise<QueueEntry | null | 'moved'> => {
    const { accountId, workspaceId, fileId } = draft;
    const key = { serverOrigin, accountId, workspaceId, fileId };
    // A tombstone carries no text. The revision before it still holds the
    // content of the note, and a deletion that submitted Markdown would add
    // content while it claims to remove a file, which the server refuses.
    // An open editor saves the text of its document, never its own text,
    // which can lag the document (record 0133).
    const revisionText = draft.deleted
      ? ''
      : source !== 'text'
        ? await guard('creating a checkpoint', () =>
            db.transaction(
              'r',
              [tables.documents, tables.documentUpdates],
              () => frozenText(tables, key),
            ),
          )
        : draft.text;
    // The digest is computed before the transaction. WebCrypto is not a
    // database promise, so awaiting it inside a Dexie transaction would
    // leave the transaction zone and the transaction would already be gone.
    // A browser without WebCrypto cannot address content, so the caller
    // receives the same typed failure as for a refused write.
    const digest = await guard('creating a checkpoint', () =>
      contentDigest(revisionText),
    );
    const clientTime = nowIso();
    const revisionId = newId();
    const mutationId = newId();
    const created = await guard('creating a checkpoint', () =>
      db.transaction(
        'rw',
        [
          tables.drafts,
          tables.checkpoints,
          tables.contents,
          tables.acceptedFiles,
          tables.queue,
          tables.documents,
          tables.documentUpdates,
          tables.legacySaves,
        ],
        async (): Promise<QueueEntry | null | 'moved'> => {
          const storedDraft: unknown = await tables.drafts.get([
            serverOrigin,
            accountId,
            workspaceId,
            draft.workingCopyId,
          ]);
          const current =
            storedDraft === undefined ? null : validateDraft(storedDraft);
          // A caller that supplies an older buffer than the stored draft
          // would commit older text as an immutable version. The write is
          // refused, so the newer draft stays intact and the caller can
          // flush it and try again.
          if (current !== null && current.sequence > draft.sequence)
            throw new LocalStorageError(
              'stale',
              'a newer draft of this working copy is stored',
            );
          const storedFile: unknown = await tables.acceptedFiles.get([
            serverOrigin,
            accountId,
            workspaceId,
            fileId,
          ]);
          const file =
            storedFile === undefined ? null : validateAcceptedFile(storedFile);

          // A note that reached Trash comes back only through a restore,
          // which the server owns. A live revision over a tombstone would
          // undo the deletion, so it is refused and nothing is written. The
          // screen that asked cannot know better than the store: the
          // deletion may have arrived from another tab, another device, or
          // the sidebar while this editor was still open (record 0032).
          if (!draft.deleted && file?.deleted === true)
            throw new LocalStorageError(
              'stale',
              'this file is in Trash, so it takes no new version',
            );

          const lastCheckpointId = current?.lastCheckpointId ?? null;
          // The revision this working copy builds on, which is never a
          // checkpoint that left the device (record 0183).
          const anchor = await anchorOfDraft(
            ctx,
            {
              accountId,
              workspaceId,
              lastCheckpointId,
              baseRevisionId: draft.baseRevisionId,
            },
            file,
          );
          let previous: {
            revisionId: string;
            digest: string;
            path: string;
            deleted: boolean;
          } | null = null;
          if (lastCheckpointId !== null) {
            const stored: unknown = await tables.checkpoints.get([
              serverOrigin,
              accountId,
              workspaceId,
              lastCheckpointId,
            ]);
            if (stored !== undefined) previous = validateCheckpoint(stored);
          }
          // A working copy that has not checkpointed yet is compared with
          // the accepted head it started from, so opening a file and leaving
          // it writes no version.
          if (
            previous === null &&
            file !== null &&
            file.acceptedHeadRevisionId !== null &&
            file.acceptedHeadDigest !== null &&
            file.acceptedHeadRevisionId === anchor
          )
            previous = {
              revisionId: file.acceptedHeadRevisionId,
              digest: file.acceptedHeadDigest,
              path: file.path,
              deleted: file.deleted,
            };

          if (
            !shouldCheckpoint(
              previous,
              { digest, path: draft.path, deleted: draft.deleted },
              message,
            )
          ) {
            // A no-op still proves which version holds this work. Keep that
            // receipt on the draft, including the first draft of a clean
            // open. A later recovery write must not lose the proof and
            // report already versioned text as uncheckpointed work.
            await tables.drafts.put(
              draftRow(ctx, draft, previous?.revisionId ?? lastCheckpointId),
            );
            return null;
          }

          // A note that the server holds gets its document from the server,
          // never from this text (record 0084).
          const noteExists =
            (file?.acceptedHeadRevisionId ?? null) !== null ||
            draft.baseRevisionId !== null;
          // An open editor already wrote its work into the document, so the
          // save freezes that document (record 0133). Any other writer
          // folds its text into the document inside this transaction, so a
          // second tab that wrote first keeps its work (records 0081, 0085).
          const folded = draft.deleted
            ? { row: null, save: await deletionSave(tables, key, noteExists) }
            : source !== 'text'
              ? await freezeDocument(
                  tables,
                  key,
                  revisionText,
                  noteExists,
                  source.epoch,
                )
              : await foldTextIntoDocument(
                  tables,
                  key,
                  revisionText,
                  noteExists,
                );
          if (folded === null) return 'moved';
          if (folded.row !== null) await writeDocumentRow(tables, folded.row);

          // A parked save holds no revision on the server, so the save names
          // the nearest revision of its chain that is not parked, and carries
          // the parked work with its own (record 0183).
          const parentId = await parentOfNextSave(
            ctx,
            accountId,
            workspaceId,
            anchor,
          );
          const parents = parentId === null ? [] : [parentId];
          await tables.contents.put({
            serverOrigin,
            accountId,
            workspaceId,
            digest,
            text: revisionText,
            bytes: null,
            size: byteLength(revisionText),
          });
          const checkpoint: CheckpointRow = {
            serverOrigin,
            accountId,
            workspaceId,
            revisionId,
            fileId,
            workingCopyId: draft.workingCopyId,
            parents,
            path: draft.path,
            deleted: draft.deleted,
            digest,
            message,
            clientTime,
            mutationId,
            accepted: false,
            sequence: await nextCheckpointSequence(ctx, accountId, workspaceId),
          };
          // `add` and not `put`: a checkpoint is immutable, so writing over
          // an existing identifier is a defect, not an update.
          await tables.checkpoints.add(checkpoint);

          const nextFile: FileRow = {
            serverOrigin,
            accountId,
            workspaceId,
            fileId,
            kind: file?.kind ?? 'note',
            path: draft.path,
            deleted: draft.deleted,
            acceptedHeadRevisionId: file?.acceptedHeadRevisionId ?? null,
            acceptedHeadDigest: file?.acceptedHeadDigest ?? null,
            // Local work never moves the path that the server holds.
            acceptedPath: file?.acceptedPath ?? null,
            localHeadRevisionId: revisionId,
            updatedAt: clientTime,
          };
          await tables.acceptedFiles.put(nextFile);
          const input: ChangesetInput = {
            workspaceId,
            mutationId,
            deviceId,
            // The accepted revision this content descends from, read from
            // the parent chain and never from the mirror. The mirror moves
            // when the ordered feed brings a version of another device, and
            // a precondition taken from it would tell the server that this
            // save had seen that version (record 0073).
            expectedHeads: {
              [fileId]: await expectedHeadOfParent(
                ctx,
                accountId,
                workspaceId,
                parentId,
              ),
            },
            revisions: [
              {
                id: revisionId,
                fileId,
                parents,
                path: draft.path,
                deleted: draft.deleted,
                content: { kind: 'markdown', document: folded.save },
                clientTime,
                message,
                restoredFrom: null,
              },
            ],
          };
          await tables.queue.add({
            serverOrigin,
            accountId,
            workspaceId,
            mutationId,
            sequence: await nextQueueSequence(ctx, accountId, workspaceId),
            input,
            state: 'pending',
            digest: null,
            errorCode: null,
            createdAt: clientTime,
          });

          // The draft now says what the version says, so a draft of an
          // open editor that lagged its document does not keep the older
          // text as recovery data.
          await tables.drafts.put({
            ...draftRow(
              ctx,
              draft.deleted ? draft : { ...draft, text: revisionText },
              lastCheckpointId,
            ),
            lastCheckpointId: revisionId,
            savedAt: clientTime,
          });
          return {
            accountId,
            input,
            state: 'pending',
            digest: null,
            errorCode: null,
          };
        },
      ),
    );
    if (created !== null && created !== 'moved')
      publish({
        accountId: draft.accountId,
        workspaceId: draft.workspaceId,
        fileId: draft.fileId,
        kind: 'queue',
      });
    return created;
  };

  return {
    /**
     * The text of one local revision, or null (record 0085).
     *
     * A save carries work, so the text that a refused save kept comes from
     * the checkpoint that froze it and the content row it named.
     */
    readRevisionText(
      accountId: string,
      workspaceId: string,
      revisionId: string,
    ): Promise<string | null> {
      return guard('reading the text of a revision', () =>
        db.transaction('r', [tables.checkpoints, tables.contents], async () => {
          const stored: unknown = await tables.checkpoints.get([
            serverOrigin,
            accountId,
            workspaceId,
            revisionId,
          ]);
          if (stored === undefined) return null;
          const checkpoint = validateCheckpoint(stored);
          const content: unknown = await tables.contents.get([
            serverOrigin,
            accountId,
            workspaceId,
            checkpoint.digest,
          ]);
          return content === undefined ? null : validateContent(content).text;
        }),
      );
    },

    readNoteDocument(
      accountId: string,
      workspaceId: string,
      fileId: string,
    ): Promise<NoteDocument | null> {
      return guard('reading the document of a note', () =>
        db.transaction(
          'r',
          [tables.documents, tables.documentUpdates],
          async () => {
            const row = await readDocumentRow(tables, {
              serverOrigin,
              accountId,
              workspaceId,
              fileId,
            });
            return row === null ? null : { bytes: row.bytes, epoch: row.epoch };
          },
        ),
      );
    },

    async appendNoteWork(
      accountId: string,
      workspaceId: string,
      fileId: string,
      epoch: number,
      update: Uint8Array,
      writer: string,
    ): Promise<void> {
      const key = { serverOrigin, accountId, workspaceId, fileId };
      await guard('writing the document of a note', () =>
        db.transaction(
          'rw',
          [tables.documents, tables.documentUpdates, tables.acceptedFiles],
          async (): Promise<void> => {
            const row = await readStoredDocumentRow(tables, key);
            // The first work of a note that this device starts writes the
            // whole document, which also checks that the server does not
            // hold the note (record 0084).
            if (row === null) {
              await mergeWork(key, epoch, update);
              return;
            }
            // Work that builds on another generation would name items that
            // the stored document lacks, and every read of the note would
            // meet it (record 0181).
            refuseOtherGeneration(row, epoch);
            await tables.documentUpdates.put({
              ...key,
              updateId: newId(),
              epoch,
              bytes: update,
            });
            const pending = await pendingDocumentUpdates(tables, key);
            if (pendingUpdatesPassBound(pending))
              await writeDocumentRow(tables, row);
          },
        ),
      );
      // Only the document took work. The file list, the heads and the path
      // stand, so the readers of those wait for a change of their own, and
      // the editor that wrote the work skips it (record 0175).
      publish({ accountId, workspaceId, fileId, kind: 'document', writer });
    },

    async mergeNoteWork(
      accountId: string,
      workspaceId: string,
      fileId: string,
      epoch: number,
      update: Uint8Array,
    ): Promise<NoteDocument> {
      const key = { serverOrigin, accountId, workspaceId, fileId };
      const merged = await guard('writing the document of a note', () =>
        db.transaction(
          'rw',
          [tables.documents, tables.documentUpdates, tables.acceptedFiles],
          () => mergeWork(key, epoch, update),
        ),
      );
      publish({ accountId, workspaceId, fileId, kind: 'document' });
      return merged;
    },

    async checkpoint(
      draft: Draft,
      message: string | null,
      source: CheckpointSource,
    ): Promise<QueueEntry | null> {
      // Remote work that lands between the read of the frozen text and the
      // write moves the document, so the checkpoint reads it again. Each try
      // needs a write of another device in that short gap, so a few are
      // enough, and the last one refuses rather than guess.
      for (let attempt = 1; attempt <= frozenTextAttempts; attempt += 1) {
        const created = await checkpointOnce(draft, message, source);
        if (created !== 'moved') return created;
      }
      throw new LocalStorageError(
        'stale',
        'the document of this note kept changing while the checkpoint read it',
      );
    },

    listCheckpoints(
      accountId: string,
      workspaceId: string,
      fileId: string,
    ): Promise<readonly CheckpointRecord[]> {
      return guard('reading local history', () =>
        db.transaction('r', tables.checkpoints, async () => {
          const rows: unknown[] = await tables.checkpoints
            .where('[serverOrigin+accountId+workspaceId+fileId]')
            .equals([serverOrigin, accountId, workspaceId, fileId])
            .toArray();
          return rows
            .map((row: unknown) => validateCheckpoint(row))
            .sort((left, right) => left.sequence - right.sequence)
            .map(checkpointOf);
        }),
      );
    },
  };
}
