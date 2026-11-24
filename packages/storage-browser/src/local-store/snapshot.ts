/**
 * The snapshot area of the local store.
 *
 * It owns the offline snapshot lifecycle (stage, store, activate) and the
 * reads over the cached mirror of server state: the accepted files, the local
 * files with the draft overlay, the save state of one file, the search bodies,
 * and content presence. `applyRemoteChanges` folds the change feed into the
 * mirror without overwriting unsubmitted local work.
 */
import { applyServerWork, writeDocumentRow } from './documents.ts';
import { storeSnapshotRevisions } from './snapshot-content.ts';
import { validateLegacySave } from '../legacy-records.ts';
import {
  LocalStorageError,
  type LocalStore,
  type RemoteChange,
  type ServerNote,
  type StagedSnapshot,
} from '@notesapp/sync';
import {
  guard,
  partitionRange,
  type DraftRow,
  type FileRow,
  type SnapshotItemRow,
} from '../database.ts';
import {
  validateAcceptedFile,
  validateContent,
  validateCursor,
  validateQueueRow,
  validateSnapshot,
  validateSnapshotItem,
} from '../migrations.ts';
import {
  bodyOfDigest,
  byteLength,
  draftsOfFile,
  forgetFileRows,
  type HeadState,
  type LocalStoreContext,
} from './shared.ts';

type SnapshotSlice = Pick<
  LocalStore,
  | 'stageSnapshot'
  | 'storeSnapshotRevision'
  | 'storeSnapshotRevisions'
  | 'activateSnapshot'
  | 'readCursor'
  | 'applyRemoteChanges'
  | 'forgetPurgedFiles'
  | 'cacheServerNote'
>;

/**
 * The file that one change of many files names: the file itself when the
 * transaction wrote one, and `null`, the whole workspace, when it wrote more.
 */
export function workspaceChangeFile(fileIds: readonly string[]): string | null {
  const unique = new Set(fileIds);
  return unique.size === 1 ? (fileIds[0] ?? null) : null;
}

/**
 * How long a staging plan of another engine can fill before a new staging
 * takes it over. A first sync ends far sooner, so a plan this old belongs to
 * a tab that closed during its pass.
 */
const abandonedStagingMs = 60 * 60 * 1000;

/** Content bodies to check in one read during activation. */
const snapshotContentCheckBatchSize = 32;

/**
 * Whether a new staging of `owner` can take over an earlier plan: move its
 * revisions and remove it (record 0176).
 */
export function stagingOwnedBy(
  plan: StagedSnapshot,
  owner: string,
  now: number,
): boolean {
  const planOwner = plan.owner ?? null;
  if (planOwner === null || planOwner === owner) return true;
  const created = Date.parse(plan.createdAt);
  return Number.isNaN(created) || now - created >= abandonedStagingMs;
}

export function createSnapshotSlice(ctx: LocalStoreContext): SnapshotSlice {
  const { serverOrigin, db, tables, nowIso, publish } = ctx;

  /**
   * Whether one draft says something that neither head says.
   *
   * A tombstone carries no text, so a deleted draft and a deleted head at the
   * same path say the same thing whatever text the draft still holds. Reading
   * the text of a deleted draft as work would keep the tombstone shadowing
   * the file for ever, and a restore on the server would never reach the
   * device.
   */
  const draftIsUnsentWork = (
    draft: DraftRow,
    heads: readonly HeadState[],
  ): boolean =>
    !heads.some(
      (head) =>
        draft.path === head.path &&
        draft.deleted === head.deleted &&
        (draft.deleted || (head.text !== null && draft.text === head.text)),
    );

  /**
   * Whether a draft of one file holds work that no head of it holds.
   *
   * This is the second half of the dirty test. A local head that is ahead of
   * the accepted head is unsubmitted work, and so is a draft whose text, path
   * or deletion state neither the current accepted head nor the arriving one
   * contains. Without the draft half, an arriving head moves the local head
   * while the draft keeps shadowing it, and the person then edits stale text
   * with no notice.
   *
   * A draft that one of the two heads already contains is not work: the
   * arriving head either states it or supersedes it, so the file follows the
   * server and `readCachedNote` removes the draft on the next open.
   */
  const hasDivergentDraft = async (
    accountId: string,
    workspaceId: string,
    fileId: string,
    heads: readonly HeadState[],
  ): Promise<boolean> => {
    const drafts = await draftsOfFile(ctx, accountId, workspaceId, fileId);
    return drafts.some((draft) => draftIsUnsentWork(draft, heads));
  };

  /**
   * Removes every working copy of one file that holds no unsent work.
   *
   * A draft is recovery data for work that has not reached the server. A head
   * that arrives and already states what a draft says leaves that draft with
   * nothing to recover, and a draft that stays goes on shadowing the newer
   * head: `readCachedNote` opens its text, the person edits a version that
   * somebody else replaced, and a restore has no visible effect on the device
   * that asked for it (record 0073).
   *
   * The caller runs this only where the accepted head follows the server, so
   * every surviving draft is one the dirty test named as real work.
   */
  const dropSettledDrafts = async (
    accountId: string,
    workspaceId: string,
    fileId: string,
    heads: readonly HeadState[],
  ): Promise<void> => {
    for (const draft of await draftsOfFile(ctx, accountId, workspaceId, fileId))
      if (!draftIsUnsentWork(draft, heads))
        await tables.drafts.delete([
          serverOrigin,
          accountId,
          workspaceId,
          draft.workingCopyId,
        ]);
  };

  /** The accepted state of one file as a comparable head. */
  const acceptedHeadState = async (
    accountId: string,
    workspaceId: string,
    file: FileRow | null,
  ): Promise<HeadState | null> => {
    if (file === null || file.acceptedHeadDigest === null) return null;
    return {
      path: file.path,
      deleted: file.deleted,
      text: await bodyOfDigest(
        ctx,
        accountId,
        workspaceId,
        file.acceptedHeadDigest,
      ),
    };
  };

  /**
   * Forgets every local trace of one permanently deleted file.
   *
   * The listing of the server can only say which files exist, so a cache entry
   * that the server dropped stays until something removes it. A purge marker in
   * the ordered change feed, and a full snapshot that leaves the file out, are
   * the two signals. The forget covers the accepted row, the drafts, the
   * checkpoints, the queued mutations, and the recovery copies, so no read,
   * re-send, or later snapshot can revive the note.
   *
   * The call runs inside the transaction of its caller, which must cover the
   * accepted files, the drafts, the checkpoints, the queue, and the recovery
   * tables.
   */
  const forgetFile = (
    accountId: string,
    workspaceId: string,
    fileId: string,
  ): Promise<void> => forgetFileRows(ctx, accountId, workspaceId, fileId);

  return {
    stageSnapshot(
      accountId: string,
      workspaceId: string,
      token: string,
      revisionIds: readonly string[],
      cursor: string,
      owner: string,
    ): Promise<readonly string[]> {
      return guard('staging a snapshot', () =>
        db.transaction(
          'rw',
          [tables.stagedSnapshots, tables.snapshotItems],
          async (): Promise<readonly string[]> => {
            const range = partitionRange(serverOrigin, accountId, workspaceId);
            // A revision is immutable, so a body that an earlier staging of
            // this workspace stored serves this one too. A reload during a
            // first sync, and a save that went first (record 0176), then
            // read only what is still missing.
            const earlier = (
              await tables.stagedSnapshots
                .where('[serverOrigin+accountId+workspaceId+token]')
                .between(range.lower, range.upper, true, true)
                .toArray()
            )
              .map((row: unknown) => validateSnapshot(row))
              .filter((plan) => plan.state === 'staging');
            const wanted = new Set(revisionIds);
            const kept = new Set<string>();
            const now = Date.parse(nowIso());
            for (const plan of earlier) {
              const key = [serverOrigin, accountId, workspaceId, plan.token];
              const items = (
                await tables.snapshotItems
                  .where('[serverOrigin+accountId+workspaceId+token]')
                  .equals(key)
                  .toArray()
              ).map((row: unknown) => validateSnapshotItem(row));
              // A plan of another engine can still fill, for example in a
              // handover of the lease during a pass. Its revisions serve this
              // plan as copies and the plan stays. A plan of this engine, of an
              // earlier release, or one that nobody finished for a long time
              // goes (record 0176).
              const owned = stagingOwnedBy(plan, owner, now);
              if (owned)
                await tables.snapshotItems
                  .where('[serverOrigin+accountId+workspaceId+token]')
                  .equals(key)
                  .delete();
              for (const item of items) {
                if (!wanted.has(item.revisionId) || kept.has(item.revisionId))
                  continue;
                await tables.snapshotItems.put({ ...item, token });
                kept.add(item.revisionId);
              }
              if (owned && plan.token !== token)
                await tables.stagedSnapshots.delete([
                  serverOrigin,
                  accountId,
                  workspaceId,
                  plan.token,
                ]);
            }
            await tables.stagedSnapshots.put({
              serverOrigin,
              accountId,
              workspaceId,
              token,
              revisionIds: [...revisionIds],
              cursor,
              state: 'staging',
              createdAt: nowIso(),
              owner,
            });
            return revisionIds.filter((revisionId) => !kept.has(revisionId));
          },
        ),
      );
    },

    storeSnapshotRevision: (accountId, workspaceId, revision) =>
      storeSnapshotRevisions(ctx, accountId, workspaceId, [revision]),
    storeSnapshotRevisions: (accountId, workspaceId, revisions) =>
      storeSnapshotRevisions(ctx, accountId, workspaceId, revisions),

    async activateSnapshot(token: string): Promise<void> {
      const activated = await guard('activating a snapshot', () =>
        db.transaction(
          'rw',
          [
            tables.stagedSnapshots,
            tables.snapshotItems,
            tables.contents,
            tables.acceptedFiles,
            tables.cursors,
            tables.drafts,
            tables.queue,
            tables.checkpoints,
            tables.recovery,
            tables.documents,
            tables.documentUpdates,
            tables.legacySaves,
            tables.reviews,
          ],
          async () => {
            const plans: unknown[] = await tables.stagedSnapshots.toArray();
            const plan =
              plans
                .map((row: unknown) => validateSnapshot(row))
                .find((row) => row.token === token) ?? null;
            if (plan === null)
              throw new LocalStorageError(
                'corrupt',
                'no staged snapshot carries this token',
              );
            if (plan.state === 'active') return null;
            const { accountId, workspaceId } = plan;
            const stored: unknown[] = await tables.snapshotItems
              .where('[serverOrigin+accountId+workspaceId+token]')
              .equals([serverOrigin, accountId, workspaceId, token])
              .toArray();
            const byRevision = new Map(
              stored.map((row: unknown) => {
                const item = validateSnapshotItem(row);
                return [item.revisionId, item] as const;
              }),
            );
            const requiredDigests = new Set<string>();
            for (const revisionId of plan.revisionIds) {
              const item = byRevision.get(revisionId);
              if (item === undefined)
                throw new LocalStorageError(
                  'aborted',
                  'the staged snapshot is incomplete',
                );
              if (!item.deleted && item.kind === 'note')
                requiredDigests.add(item.digest);
            }
            const digests = [...requiredDigests];
            for (
              let offset = 0;
              offset < digests.length;
              offset += snapshotContentCheckBatchSize
            ) {
              const batch = digests.slice(
                offset,
                offset + snapshotContentCheckBatchSize,
              );
              const bodies = await tables.contents.bulkGet(
                batch.map((digest) => [
                  serverOrigin,
                  accountId,
                  workspaceId,
                  digest,
                ]),
              );
              if (
                bodies.some(
                  (body) =>
                    body === undefined || validateContent(body).text === null,
                )
              )
                throw new LocalStorageError(
                  'aborted',
                  'the staged snapshot is incomplete',
                );
            }
            const byFile = new Map<string, SnapshotItemRow>();
            for (const item of byRevision.values())
              byFile.set(item.fileId, item);
            const range = partitionRange(serverOrigin, accountId, workspaceId);
            // Reuse the pre-snapshot file list when checking for purges. The
            // draft index lets files without drafts skip the head reads.
            const knownFiles = new Map(
              (
                await tables.acceptedFiles
                  .where('[serverOrigin+accountId+workspaceId+fileId]')
                  .between(range.lower, range.upper, true, true)
                  .toArray()
              ).map((row) => {
                const file = validateAcceptedFile(row);
                return [file.fileId, file] as const;
              }),
            );
            const draftKeys = await tables.drafts
              .where('[serverOrigin+accountId+workspaceId+fileId]')
              .between(range.lower, range.upper, true, true)
              .uniqueKeys();
            const filesWithDrafts = new Set<string>();
            for (const key of draftKeys) {
              if (Array.isArray(key) && typeof key[3] === 'string')
                filesWithDrafts.add(key[3]);
            }
            for (const item of byFile.values()) {
              // A snapshot is the whole state of the workspace at its cursor,
              // so it carries the whole document of every note. The device
              // starts from that document, which is what keeps its first save
              // a merge of one text rather than two (record 0081).
              if (item.document !== null && item.epoch !== null) {
                const applied = await applyServerWork(
                  tables,
                  {
                    serverOrigin,
                    accountId,
                    workspaceId,
                    fileId: item.fileId,
                  },
                  item.epoch,
                  { kind: 'document', document: item.document },
                );
                await writeDocumentRow(tables, applied.row);
              }
              const file = knownFiles.get(item.fileId) ?? null;
              const hasDrafts = filesWithDrafts.has(item.fileId);
              const heads: HeadState[] = [];
              if (hasDrafts) {
                const knownHead = await acceptedHeadState(
                  accountId,
                  workspaceId,
                  file,
                );
                if (knownHead !== null) heads.push(knownHead);
                heads.push({
                  path: item.path,
                  deleted: item.deleted,
                  text: await bodyOfDigest(
                    ctx,
                    accountId,
                    workspaceId,
                    item.digest,
                  ),
                });
              }
              const dirty =
                file !== null &&
                ((file.localHeadRevisionId !== null &&
                  file.localHeadRevisionId !== file.acceptedHeadRevisionId) ||
                  (hasDrafts &&
                    (await hasDivergentDraft(
                      accountId,
                      workspaceId,
                      item.fileId,
                      heads,
                    ))));
              if (!dirty) {
                await tables.acceptedFiles.put({
                  serverOrigin,
                  accountId,
                  workspaceId,
                  fileId: item.fileId,
                  kind: item.kind,
                  path: item.path,
                  deleted: item.deleted,
                  acceptedHeadRevisionId: item.revisionId,
                  acceptedHeadDigest: item.digest,
                  acceptedPath: item.deleted ? null : item.path,
                  localHeadRevisionId: item.revisionId,
                  // The file changed when the server accepted this revision,
                  // not when this device received it.
                  updatedAt: item.serverTime ?? nowIso(),
                });
                if (hasDrafts)
                  await dropSettledDrafts(
                    accountId,
                    workspaceId,
                    item.fileId,
                    heads,
                  );
              } else if (file !== null) {
                // The accepted head follows the snapshot, but the path, the
                // deletion state, and the local head keep whatever local
                // work set. A remote head never replaces a dirty copy.
                await tables.acceptedFiles.put({
                  ...file,
                  acceptedHeadRevisionId: item.revisionId,
                  acceptedHeadDigest: item.digest,
                  // The server holds this path while the local work waits,
                  // so a free name avoids it (record 0184).
                  acceptedPath: item.deleted ? null : item.path,
                  updatedAt: nowIso(),
                });
              }
            }
            // A full snapshot is the whole server state at its cursor. Any
            // file this device still holds that the snapshot leaves out was
            // removed on the server, so it is forgotten. A file with queued
            // local work is kept: it is either an unsent new note that the
            // server has not seen yet, or a change on its way up.
            const queuedFiles = new Set<string>();
            for (const row of await tables.queue
              .where('[serverOrigin+accountId+workspaceId+sequence]')
              .between(range.lower, range.upper, true, true)
              .toArray())
              for (const revision of validateQueueRow(row).input.revisions)
                queuedFiles.add(revision.fileId);
            // A moved save of release 0.4 is queued work too. Placement
            // decides its fate once this snapshot has run (record 0088).
            for (const row of await tables.legacySaves
              .where('[serverOrigin+accountId+workspaceId+sequence]')
              .between(range.lower, range.upper, true, true)
              .toArray())
              for (const revision of validateLegacySave(row).revisions)
                queuedFiles.add(revision.fileId);
            const forgotten: string[] = [];
            for (const file of knownFiles.values()) {
              if (byFile.has(file.fileId) || queuedFiles.has(file.fileId))
                continue;
              await forgetFile(accountId, workspaceId, file.fileId);
              forgotten.push(file.fileId);
            }
            await tables.cursors.put({
              serverOrigin,
              accountId,
              workspaceId,
              cursor: plan.cursor,
              updatedAt: nowIso(),
            });
            await tables.stagedSnapshots.put({ ...plan, state: 'active' });
            return {
              accountId,
              workspaceId,
              fileIds: [...byFile.keys(), ...forgotten],
            };
          },
        ),
      );
      if (activated === null) return;
      // One transaction wrote every file of the workspace, so it announces
      // one change of the workspace and not one for each file. A listener
      // reads again once, where a thousand changes made it read a thousand
      // times (record 0176).
      publish({
        accountId: activated.accountId,
        workspaceId: activated.workspaceId,
        fileId: workspaceChangeFile(activated.fileIds),
        kind: 'file',
      });
      publish({
        accountId: activated.accountId,
        workspaceId: activated.workspaceId,
        fileId: null,
        kind: 'cursor',
      });
    },

    async cacheServerNote(
      accountId: string,
      workspaceId: string,
      note: ServerNote,
    ): Promise<void> {
      const written = await guard('keeping a note of the server', () =>
        db.transaction(
          'rw',
          [
            tables.acceptedFiles,
            tables.contents,
            tables.documents,
            tables.documentUpdates,
          ],
          async (): Promise<boolean> => {
            const known: unknown = await tables.acceptedFiles.get([
              serverOrigin,
              accountId,
              workspaceId,
              note.fileId,
            ]);
            // A file this device already holds keeps what it holds. This read
            // of the server is only for a note that reached the screen before
            // the ordered feed reached the store. The one exception is the
            // document of a note that this device holds without one, which
            // only the server can give (records 0084, 0088).
            if (known !== undefined) {
              const held: unknown = await tables.documents.get([
                serverOrigin,
                accountId,
                workspaceId,
                note.fileId,
              ]);
              const served = note.document ?? null;
              if (held !== undefined || served === null) return false;
              const applied = await applyServerWork(
                tables,
                { serverOrigin, accountId, workspaceId, fileId: note.fileId },
                note.epoch ?? 1,
                { kind: 'document', document: served },
              );
              await writeDocumentRow(tables, applied.row);
              return true;
            }
            await tables.contents.put({
              serverOrigin,
              accountId,
              workspaceId,
              digest: note.digest,
              text: note.text,
              bytes: null,
              size: byteLength(note.text),
            });
            await tables.acceptedFiles.put({
              serverOrigin,
              accountId,
              workspaceId,
              fileId: note.fileId,
              kind: note.kind,
              path: note.path,
              deleted: false,
              acceptedHeadRevisionId: note.revisionId,
              acceptedHeadDigest: note.digest,
              acceptedPath: note.path,
              localHeadRevisionId: note.revisionId,
              updatedAt: nowIso(),
            });
            // The document of the workspace comes with the read, so the
            // editor that opens next merges instead of starting again.
            const document = note.document ?? null;
            if (document !== null) {
              const applied = await applyServerWork(
                tables,
                {
                  serverOrigin,
                  accountId,
                  workspaceId,
                  fileId: note.fileId,
                },
                note.epoch ?? 1,
                { kind: 'document', document },
              );
              await writeDocumentRow(tables, applied.row);
            }
            return true;
          },
        ),
      );
      if (!written) return;
      publish({ accountId, workspaceId, fileId: note.fileId, kind: 'file' });
    },

    readCursor(accountId: string, workspaceId: string): Promise<string | null> {
      return guard('reading the sync cursor', () =>
        db.transaction('r', tables.cursors, async () => {
          const stored: unknown = await tables.cursors.get([
            serverOrigin,
            accountId,
            workspaceId,
          ]);
          return stored === undefined ? null : validateCursor(stored).cursor;
        }),
      );
    },

    async applyRemoteChanges(
      accountId: string,
      workspaceId: string,
      changes: readonly RemoteChange[],
      nextCursor: string,
    ): Promise<void> {
      await guard('applying remote changes', () =>
        db.transaction(
          'rw',
          [
            tables.contents,
            tables.acceptedFiles,
            tables.drafts,
            tables.cursors,
            tables.queue,
            tables.checkpoints,
            tables.recovery,
            tables.documents,
            tables.documentUpdates,
            tables.reviews,
          ],
          async () => {
            for (const change of changes) {
              const file = change.file;
              if (file === null) {
                // A permanent deletion leaves nothing to restore, so the
                // cached metadata and the cached working copy of that file go
                // with it. Without this the note would stay in the file tree
                // for as long as the cache lives, because the listing of the
                // server can only say which files exist, not which vanished.
                if (change.purgedFileId !== null)
                  await forgetFile(accountId, workspaceId, change.purgedFileId);
                continue;
              }
              // The accepted work of a note applies to the document that this
              // device holds, and the text that a reader sees comes from the
              // result (record 0085). A device that cannot apply the work
              // keeps what it has; the next snapshot repairs it.
              let acceptedText = file.text;
              if (file.document !== null) {
                const applied = await applyServerWork(
                  tables,
                  { serverOrigin, accountId, workspaceId, fileId: file.fileId },
                  file.document.epoch,
                  file.document.kind === 'document'
                    ? { kind: 'document', document: file.document.bytes }
                    : { kind: 'update', update: file.document.bytes },
                );
                await writeDocumentRow(tables, applied.row);
                acceptedText = applied.text;
              }
              if (acceptedText !== null) {
                await tables.contents.put({
                  serverOrigin,
                  accountId,
                  workspaceId,
                  digest: file.digest,
                  text: acceptedText,
                  bytes: null,
                  size: byteLength(acceptedText),
                });
              }
              const known: unknown = await tables.acceptedFiles.get([
                serverOrigin,
                accountId,
                workspaceId,
                file.fileId,
              ]);
              const current =
                known === undefined ? null : validateAcceptedFile(known);
              // Unsubmitted work is a local head ahead of the accepted head,
              // and it is also a draft that neither the accepted head nor
              // the arriving one contains. Without the draft half this write
              // moves the local head while the draft keeps shadowing it.
              const heads: HeadState[] = [];
              const knownHead = await acceptedHeadState(
                accountId,
                workspaceId,
                current,
              );
              if (knownHead !== null) heads.push(knownHead);
              heads.push({
                path: file.path,
                deleted: file.deleted,
                text:
                  acceptedText ??
                  (await bodyOfDigest(
                    ctx,
                    accountId,
                    workspaceId,
                    file.digest,
                  )),
              });
              const dirty =
                current !== null &&
                ((current.localHeadRevisionId !== null &&
                  current.localHeadRevisionId !==
                    current.acceptedHeadRevisionId) ||
                  (await hasDivergentDraft(
                    accountId,
                    workspaceId,
                    file.fileId,
                    heads,
                  )));
              if (current === null || !dirty) {
                await tables.acceptedFiles.put({
                  serverOrigin,
                  accountId,
                  workspaceId,
                  fileId: file.fileId,
                  kind: file.fileKind,
                  path: file.path,
                  deleted: file.deleted,
                  acceptedHeadRevisionId: file.revisionId,
                  acceptedHeadDigest: file.digest,
                  acceptedPath: file.deleted ? null : file.path,
                  localHeadRevisionId: file.revisionId,
                  updatedAt: nowIso(),
                });
                // Every working copy of this file that holds no unsent work
                // goes with the head it described. A tombstone draft of a note
                // the server restored, and a draft of the version that another
                // device just replaced, both land here.
                await dropSettledDrafts(
                  accountId,
                  workspaceId,
                  file.fileId,
                  heads,
                );
              } else {
                await tables.acceptedFiles.put({
                  ...current,
                  acceptedHeadRevisionId: file.revisionId,
                  acceptedHeadDigest: file.digest,
                  // The server holds this path while the local work waits,
                  // so a free name avoids it (record 0184).
                  acceptedPath: file.deleted ? null : file.path,
                  updatedAt: nowIso(),
                });
              }
            }
            await tables.cursors.put({
              serverOrigin,
              accountId,
              workspaceId,
              cursor: nextCursor,
              updatedAt: nowIso(),
            });
          },
        ),
      );
      // A purge is announced for its file, because a screen of that file
      // closes on it. The files that took work are one change, of the file
      // when the page names one and of the workspace when it names more
      // (record 0176). A record of neither kind only moved the cursor.
      for (const change of changes)
        if (change.purgedFileId !== null)
          publish({
            accountId,
            workspaceId,
            fileId: change.purgedFileId,
            kind: 'purge',
          });
      const written = changes.flatMap((change) =>
        change.file === null ? [] : [change.file.fileId],
      );
      if (written.length > 0)
        publish({
          accountId,
          workspaceId,
          fileId: workspaceChangeFile(written),
          kind: 'file',
        });
      if (
        changes.some(
          (change) => change.file === null && change.purgedFileId === null,
        )
      )
        publish({ accountId, workspaceId, fileId: null, kind: 'cursor' });
    },

    async forgetPurgedFiles(
      accountId: string,
      workspaceId: string,
      fileIds: readonly string[],
    ): Promise<void> {
      if (fileIds.length === 0) return;
      await guard('forgetting purged files', () =>
        db.transaction(
          'rw',
          [
            tables.acceptedFiles,
            tables.drafts,
            tables.checkpoints,
            tables.queue,
            tables.recovery,
            tables.reviews,
          ],
          async () => {
            for (const fileId of fileIds)
              await forgetFile(accountId, workspaceId, fileId);
          },
        ),
      );
      for (const fileId of fileIds)
        publish({ accountId, workspaceId, fileId, kind: 'purge' });
    },
  };
}
