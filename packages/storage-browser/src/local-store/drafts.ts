/**
 * The drafts area of the local store.
 *
 * A draft is recovery data, not a server version. A draft save is one short
 * transaction, so recovery state becomes durable promptly: it writes one draft
 * record and reads the file row only to keep a deletion that the store already
 * holds. `readCachedNote` reconciles a draft with the accepted head and the
 * local head, and drops a draft that says nothing the accepted head does not
 * already say.
 */
import { contentDigest } from '@notesapp/core';
import {
  documentStateVector,
  readDocumentText,
  stateVectorCovers,
} from '@notesapp/note-document';
import {
  type Draft,
  type LocalCachedNote,
  type LocalStore,
  type NoteDocument,
} from '@notesapp/sync';
import {
  guard,
  partitionRange,
  type DraftRow,
  type FileRow,
} from '../database.ts';
import { readDocumentRow } from './documents.ts';
import {
  validateAcceptedFile,
  validateCheckpoint,
  validateDraft,
  validateQueueRow,
} from '../migrations.ts';
import {
  bodyOfDigest,
  draftLeads,
  draftRow,
  draftsOfFile,
  type LocalStoreContext,
} from './shared.ts';

type DraftsSlice = Pick<
  LocalStore,
  'saveDraft' | 'readDraft' | 'readCachedNote' | 'rebaseDraft' | 'dropDraft'
>;

/** One cached note before the document of its read joins it. */
type CachedText = Omit<LocalCachedNote, 'document'>;

export function createDraftsSlice(ctx: LocalStoreContext): DraftsSlice {
  const { serverOrigin, db, tables, nowIso, publish } = ctx;

  /** The editor view of a stored draft. */
  const draftOf = (row: DraftRow): Draft => ({
    accountId: row.accountId,
    workspaceId: row.workspaceId,
    workingCopyId: row.workingCopyId,
    fileId: row.fileId,
    baseRevisionId: row.baseRevisionId,
    text: row.text,
    path: row.path,
    deleted: row.deleted,
    sequence: row.sequence,
    ...(row.documentVector === null || row.documentVector === undefined
      ? {}
      : { documentVector: row.documentVector }),
  });

  /**
   * One note as it reads with no draft applied.
   *
   * The local head wins over the accepted head, because an unsent checkpoint
   * is work this device already promised to send. Returns `null` when the
   * body this device would need is not stored, so the caller can fall back
   * to the server instead of showing an empty note.
   */
  const headNote = async (
    accountId: string,
    workspaceId: string,
    fileId: string,
    file: FileRow | null,
  ): Promise<CachedText | null> => {
    if (file === null || file.kind !== 'note') return null;
    const acceptedPath = file.path;
    const acceptedRevisionId = file.acceptedHeadRevisionId;
    if (file.deleted)
      return {
        fileId,
        path: file.path,
        text: '',
        deleted: true,
        sequence: 0,
        baseRevisionId: file.localHeadRevisionId,
        stale: false,
        acceptedText: null,
        acceptedPath,
        acceptedRevisionId,
      };
    const localHead = file.localHeadRevisionId;
    if (localHead !== null && localHead !== file.acceptedHeadRevisionId) {
      const storedCheckpoint: unknown = await tables.checkpoints.get([
        serverOrigin,
        accountId,
        workspaceId,
        localHead,
      ]);
      if (storedCheckpoint === undefined) return null;
      const checkpoint = validateCheckpoint(storedCheckpoint);
      if (checkpoint.deleted)
        return {
          fileId,
          path: checkpoint.path,
          text: '',
          deleted: true,
          sequence: 0,
          baseRevisionId: checkpoint.revisionId,
          stale: false,
          acceptedText: null,
          acceptedPath,
          acceptedRevisionId,
        };
      const body = await bodyOfDigest(
        ctx,
        accountId,
        workspaceId,
        checkpoint.digest,
      );
      if (body === null) return null;
      return {
        fileId,
        path: checkpoint.path,
        text: body,
        deleted: false,
        sequence: 0,
        baseRevisionId: checkpoint.revisionId,
        stale: false,
        acceptedText: null,
        acceptedPath,
        acceptedRevisionId,
      };
    }
    if (
      file.acceptedHeadRevisionId === null ||
      file.acceptedHeadDigest === null
    )
      return null;
    const body = await bodyOfDigest(
      ctx,
      accountId,
      workspaceId,
      file.acceptedHeadDigest,
    );
    if (body === null) return null;
    return {
      fileId,
      path: file.path,
      text: body,
      deleted: false,
      sequence: 0,
      baseRevisionId: file.acceptedHeadRevisionId,
      stale: false,
      acceptedText: null,
      acceptedPath,
      acceptedRevisionId,
    };
  };

  /**
   * Removes one draft that the accepted head already contains.
   *
   * The removal repeats the check inside its own write transaction: a
   * keystroke may have arrived between the read and this write, and that
   * newer text must survive.
   */
  const dropStaleDraft = async (
    accountId: string,
    workspaceId: string,
    draft: DraftRow,
  ): Promise<void> => {
    const removed = await guard('removing a matched draft', () =>
      db.transaction('rw', tables.drafts, async (): Promise<boolean> => {
        const stored: unknown = await tables.drafts.get([
          serverOrigin,
          accountId,
          workspaceId,
          draft.workingCopyId,
        ]);
        if (stored === undefined) return false;
        const current = validateDraft(stored);
        if (
          current.sequence !== draft.sequence ||
          current.text !== draft.text ||
          current.path !== draft.path ||
          current.deleted !== draft.deleted
        )
          return false;
        await tables.drafts.delete([
          serverOrigin,
          accountId,
          workspaceId,
          draft.workingCopyId,
        ]);
        return true;
      }),
    );
    if (removed)
      publish({
        accountId,
        workspaceId,
        fileId: draft.fileId,
        kind: 'draft',
      });
  };

  return {
    async saveDraft(draft: Draft): Promise<void> {
      await guard('saving a draft', () =>
        db.transaction(
          'rw',
          [tables.drafts, tables.acceptedFiles],
          async () => {
            const stored: unknown = await tables.drafts.get([
              serverOrigin,
              draft.accountId,
              draft.workspaceId,
              draft.workingCopyId,
            ]);
            const current = stored === undefined ? null : validateDraft(stored);
            // A save that arrives after a newer one must not undo it.
            if (current !== null && current.sequence > draft.sequence) return;
            // A draft never states a file live that the store holds as
            // deleted. The text is kept, because a draft is recovery data,
            // but the tombstone stays until a restore clears it. The file row
            // is read here for that one reason; the write still touches one
            // record (record 0032).
            const storedFile: unknown = await tables.acceptedFiles.get([
              serverOrigin,
              draft.accountId,
              draft.workspaceId,
              draft.fileId,
            ]);
            const deleted =
              draft.deleted ||
              (current?.deleted ?? false) ||
              (storedFile === undefined
                ? false
                : validateAcceptedFile(storedFile).deleted);
            await tables.drafts.put(
              draftRow(
                ctx,
                deleted === draft.deleted ? draft : { ...draft, deleted },
                current?.lastCheckpointId ?? null,
              ),
            );
          },
        ),
      );
      publish({
        accountId: draft.accountId,
        workspaceId: draft.workspaceId,
        fileId: draft.fileId,
        kind: 'draft',
      });
    },

    readDraft(
      accountId: string,
      workspaceId: string,
      workingCopyId: string,
    ): Promise<Draft | null> {
      return guard('reading a draft', () =>
        db.transaction('r', tables.drafts, async () => {
          const stored: unknown = await tables.drafts.get([
            serverOrigin,
            accountId,
            workspaceId,
            workingCopyId,
          ]);
          return stored === undefined ? null : draftOf(validateDraft(stored));
        }),
      );
    },

    async readCachedNote(
      accountId: string,
      workspaceId: string,
      fileId: string,
    ): Promise<LocalCachedNote | null> {
      // The read runs first and alone. A digest of the draft text may be
      // needed to compare it with the accepted head, and WebCrypto is not a
      // database promise: awaiting it inside a Dexie transaction would leave
      // the transaction zone. So the comparison and any removal follow the
      // read in their own steps.
      const snapshot = await guard('reading a cached note', () =>
        db.transaction(
          'r',
          [
            tables.acceptedFiles,
            tables.checkpoints,
            tables.contents,
            tables.documents,
            tables.documentUpdates,
            tables.drafts,
          ],
          async () => {
            const drafts = await draftsOfFile(
              ctx,
              accountId,
              workspaceId,
              fileId,
            );
            const draft = drafts[0] ?? null;
            const storedFile: unknown = await tables.acceptedFiles.get([
              serverOrigin,
              accountId,
              workspaceId,
              fileId,
            ]);
            const file =
              storedFile === undefined
                ? null
                : validateAcceptedFile(storedFile);
            const acceptedText =
              file === null || file.acceptedHeadDigest === null
                ? null
                : await bodyOfDigest(
                    ctx,
                    accountId,
                    workspaceId,
                    file.acceptedHeadDigest,
                  );
            // A head this device created has a checkpoint row. A head that
            // has none came from the server, so it is the one that can leave
            // a draft behind. Without this test a queued save of this device
            // would read as a newer version of somebody else.
            const acceptedIsLocal =
              file === null || file.acceptedHeadRevisionId === null
                ? false
                : (await tables.checkpoints.get([
                    serverOrigin,
                    accountId,
                    workspaceId,
                    file.acceptedHeadRevisionId,
                  ])) !== undefined;
            const accepted = {
              revisionId: file?.acceptedHeadRevisionId ?? null,
              digest: file?.acceptedHeadDigest ?? null,
              path: file === null ? null : file.path,
              deleted: file?.deleted ?? false,
              text: acceptedText,
              isLocal: acceptedIsLocal,
            };
            const head = await headNote(accountId, workspaceId, fileId, file);
            const leads = draft === null ? false : draftLeads(file, draft);
            // The document comes from this read, so the text and the document
            // that an editor opens from state the same moment (record 0133).
            const row = await readDocumentRow(tables, {
              serverOrigin,
              accountId,
              workspaceId,
              fileId,
            });
            const document: NoteDocument | null =
              row === null ? null : { bytes: row.bytes, epoch: row.epoch };
            return { draft, accepted, head, leads, document };
          },
        ),
      );
      const withDocument = (note: CachedText | null): LocalCachedNote | null =>
        note === null ? null : { ...note, document: snapshot.document };
      // The editor appends each key to the document at once, and a draft
      // follows only after a pause. A note that no draft leads therefore
      // reads as the text of its document, which can hold keys that no draft
      // and no version holds yet. The text of the head would undo them as
      // new work of the open (record 0175).
      const withHead = (note: CachedText | null): LocalCachedNote | null => {
        const document = snapshot.document;
        return note === null || note.deleted || document === null
          ? withDocument(note)
          : withDocument({ ...note, text: readDocumentText(document.bytes) });
      };

      const draft = snapshot.draft;
      if (draft === null) return withHead(snapshot.head);
      const accepted = snapshot.accepted;
      const draftBase = draft.lastCheckpointId ?? draft.baseRevisionId;

      // A draft that says nothing the accepted head does not already say is
      // recovery data with nothing left to recover. It is removed, so one
      // keystroke cannot shadow newer server text for the life of the
      // device. A pending rename or deletion is never treated as equal.
      if (
        accepted.digest !== null &&
        !draft.deleted &&
        draft.path === accepted.path
      ) {
        const equal =
          accepted.text !== null
            ? accepted.text === draft.text
            : (await guard('reading a cached note', () =>
                contentDigest(draft.text),
              )) === accepted.digest;
        if (equal) {
          await dropStaleDraft(accountId, workspaceId, draft);
          return withHead(snapshot.head);
        }
      }

      // A stale draft is text of this device over a server version it never
      // saw. "Based on an older head" needs a base to compare, the head must
      // be one the server set, and a deleted head is not a version to offer:
      // deletion recovery is the Trash, not this choice.
      const stale =
        !draft.deleted &&
        !accepted.deleted &&
        !accepted.isLocal &&
        draftBase !== null &&
        accepted.revisionId !== null &&
        accepted.text !== null &&
        draftBase !== accepted.revisionId;

      // The draft no longer describes its file and holds no stale text to
      // choose from, so the accepted row is the newer statement of the path
      // and of the deletion state.
      if (!snapshot.leads && !stale) return withHead(snapshot.head);

      // A draft lags the document of its editor, which takes each key at
      // once. A document that holds every change the draft saw is the newer
      // text, and the draft text would undo work as new work (record 0175).
      const document = snapshot.document;
      const covered =
        document !== null &&
        draft.documentVector !== null &&
        draft.documentVector !== undefined &&
        stateVectorCovers(
          documentStateVector(document.bytes),
          draft.documentVector,
        );
      return withDocument({
        fileId,
        path: draft.path,
        text: covered ? readDocumentText(document.bytes) : draft.text,
        deleted: draft.deleted,
        workingCopyId: draft.workingCopyId,
        sequence: draft.sequence,
        baseRevisionId: draftBase,
        stale,
        acceptedText: stale ? accepted.text : null,
        acceptedPath: accepted.path,
        acceptedRevisionId: accepted.revisionId,
      });
    },

    async rebaseDraft(
      accountId: string,
      workspaceId: string,
      workingCopyId: string,
    ): Promise<void> {
      const rebased = await guard('rebasing a draft', () =>
        db.transaction(
          'rw',
          [tables.drafts, tables.acceptedFiles],
          async (): Promise<DraftRow | null> => {
            const stored: unknown = await tables.drafts.get([
              serverOrigin,
              accountId,
              workspaceId,
              workingCopyId,
            ]);
            if (stored === undefined) return null;
            const draft = validateDraft(stored);
            const storedFile: unknown = await tables.acceptedFiles.get([
              serverOrigin,
              accountId,
              workspaceId,
              draft.fileId,
            ]);
            if (storedFile === undefined) return null;
            const file = validateAcceptedFile(storedFile);
            const next: DraftRow = {
              ...draft,
              baseRevisionId: file.acceptedHeadRevisionId,
              // The draft keeps its text and drops its old local parent, so
              // the next checkpoint names the accepted head the server has.
              lastCheckpointId: null,
              savedAt: nowIso(),
            };
            await tables.drafts.put(next);
            return next;
          },
        ),
      );
      if (rebased === null) return;
      publish({
        accountId,
        workspaceId,
        fileId: rebased.fileId,
        kind: 'draft',
      });
    },

    async dropDraft(
      accountId: string,
      workspaceId: string,
      workingCopyId: string,
    ): Promise<void> {
      const removed = await guard('removing a draft', () =>
        db.transaction(
          'rw',
          [tables.drafts, tables.acceptedFiles, tables.queue],
          async (): Promise<string | null> => {
            const stored: unknown = await tables.drafts.get([
              serverOrigin,
              accountId,
              workspaceId,
              workingCopyId,
            ]);
            if (stored === undefined) return null;
            const draft = validateDraft(stored);
            await tables.drafts.delete([
              serverOrigin,
              accountId,
              workspaceId,
              workingCopyId,
            ]);
            // A stale draft kept the old local head while the feed moved
            // the accepted head. Once its owner discards the last working
            // copy, with no queued version left, the accepted head owns the
            // next open. Otherwise a clean editor would save over the old
            // local head and create a new version for already accepted text.
            const remaining = await draftsOfFile(
              ctx,
              accountId,
              workspaceId,
              draft.fileId,
            );
            const queued: unknown[] = await tables.queue
              .where('[serverOrigin+accountId+workspaceId+sequence]')
              .between(
                partitionRange(serverOrigin, accountId, workspaceId).lower,
                partitionRange(serverOrigin, accountId, workspaceId).upper,
                true,
                true,
              )
              .toArray();
            const pending = queued.some((row) =>
              validateQueueRow(row).input.revisions.some(
                (revision) => revision.fileId === draft.fileId,
              ),
            );
            const held: unknown = await tables.acceptedFiles.get([
              serverOrigin,
              accountId,
              workspaceId,
              draft.fileId,
            ]);
            if (remaining.length === 0 && !pending && held !== undefined) {
              const file = validateAcceptedFile(held);
              if (
                file.acceptedHeadRevisionId !== null &&
                file.acceptedPath !== null &&
                !file.deleted
              )
                await tables.acceptedFiles.put({
                  ...file,
                  path: file.acceptedPath,
                  localHeadRevisionId: file.acceptedHeadRevisionId,
                  updatedAt: nowIso(),
                });
            }
            return draft.fileId;
          },
        ),
      );
      if (removed === null) return;
      publish({ accountId, workspaceId, fileId: removed, kind: 'draft' });
    },
  };
}
