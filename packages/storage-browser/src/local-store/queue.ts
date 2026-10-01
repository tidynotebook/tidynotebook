/**
 * The queue and receipts area of the local store.
 *
 * The queue orders the mutations of one partition and records their state as
 * they are sent, acknowledged, conflicted, discarded, or reparented. An
 * acknowledgment marks the accepted checkpoints, advances the accepted head,
 * rebases the next pending child, and writes the receipt.
 */
import type { AcceptedChangeset } from '@notesapp/core';
import {
  type LocalChange,
  type LocalConflict,
  type LocalStore,
  type QueueEntry,
} from '@notesapp/sync';
import {
  accountRange,
  guard,
  partitionRange,
  type CheckpointRow,
  type QueueRow,
} from '../database.ts';
import {
  validateAcceptedFile,
  validateCheckpoint,
  validateQueueRow,
} from '../migrations.ts';
import { legacyWorkspaces } from './legacy.ts';
import { recordMergeReview } from './reviews.ts';
import {
  draftsOfFile,
  forgetMutationWork,
  type LocalStoreContext,
} from './shared.ts';

type QueueSlice = Pick<
  LocalStore,
  | 'pending'
  | 'queuedWorkspaces'
  | 'markSending'
  | 'markConflict'
  | 'discardQueueEntry'
  | 'reparentQueueEntry'
  | 'acknowledge'
  | 'listLocalConflicts'
>;

export function createQueueSlice(ctx: LocalStoreContext): QueueSlice {
  const { serverOrigin, db, tables, nowIso, publish } = ctx;

  /** One queued mutation of one account, wherever its workspace is. */
  const queueEntryOf = async (
    accountId: string,
    mutationId: string,
  ): Promise<QueueRow | null> => {
    const stored: unknown = await tables.queue
      .where('[serverOrigin+accountId+mutationId]')
      .equals([serverOrigin, accountId, mutationId])
      .first();
    return stored === undefined ? null : validateQueueRow(stored);
  };

  return {
    pending(
      accountId: string,
      workspaceId: string,
    ): Promise<readonly QueueEntry[]> {
      return guard('reading the queue', () =>
        db.transaction('r', tables.queue, async () => {
          const range = partitionRange(serverOrigin, accountId, workspaceId);
          const rows: unknown[] = await tables.queue
            .where('[serverOrigin+accountId+workspaceId+sequence]')
            .between(range.lower, range.upper, true, true)
            .toArray();
          return rows
            .map((row: unknown) => validateQueueRow(row))
            .map((row) => ({
              accountId: row.accountId,
              input: row.input,
              state: row.state,
              digest: row.digest,
              errorCode: row.errorCode,
            }));
        }),
      );
    },

    queuedWorkspaces(accountId: string): Promise<readonly string[]> {
      return guard('reading the queued workspaces', () =>
        db.transaction(
          'r',
          [tables.queue, tables.legacySaves, tables.legacyDrafts],
          async () => {
            // The account wide index of the queue table answers this without a
            // second index and without a scan of the whole store. Record 0050
            // asks only which workspaces hold work, so the rows are reduced to
            // their distinct workspace.
            const range = accountRange(serverOrigin, accountId);
            const rows: unknown[] = await tables.queue
              .where('[serverOrigin+accountId+mutationId]')
              .between(range.lower, range.upper, true, true)
              .toArray();
            const found = new Set<string>();
            for (const row of rows)
              found.add(validateQueueRow(row).workspaceId);
            // Work of release 0.4 that waits for placement is a save as well,
            // and only the engine of its workspace places it (record 0088).
            for (const workspaceId of await legacyWorkspaces(ctx, accountId))
              found.add(workspaceId);
            return [...found];
          },
        ),
      );
    },

    async markSending(
      accountId: string,
      mutationId: string,
      digest: string,
    ): Promise<void> {
      const changes: LocalChange[] = [];
      await guard('marking a mutation as sending', () =>
        db.transaction('rw', tables.queue, async () => {
          const entry = await queueEntryOf(accountId, mutationId);
          if (entry === null) return;
          // The digest freezes on the first send. A retry repeats the same
          // operation, so a later value would describe a different request.
          await tables.queue.put({
            ...entry,
            state: 'sending',
            digest: entry.digest ?? digest,
          });
          changes.push({
            accountId,
            workspaceId: entry.workspaceId,
            fileId: entry.input.revisions[0]?.fileId ?? null,
            kind: 'queue',
          });
        }),
      );
      for (const change of changes) publish(change);
    },

    async markConflict(
      accountId: string,
      mutationId: string,
      details,
    ): Promise<void> {
      const changes: LocalChange[] = [];
      await guard('marking a mutation as conflicting', () =>
        db.transaction('rw', tables.queue, async () => {
          const entry = await queueEntryOf(accountId, mutationId);
          if (entry === null) return;
          await tables.queue.put({
            ...entry,
            state: 'conflict',
            errorCode: details?.errorCode ?? entry.errorCode,
          });
          changes.push({
            accountId,
            workspaceId: entry.workspaceId,
            fileId: entry.input.revisions[0]?.fileId ?? null,
            kind: 'queue',
          });
        }),
      );
      for (const change of changes) publish(change);
    },

    async discardQueueEntry(
      accountId: string,
      mutationId: string,
    ): Promise<void> {
      const changes: LocalChange[] = [];
      await guard('discarding a queued mutation', () =>
        db.transaction(
          'rw',
          [
            tables.queue,
            tables.checkpoints,
            tables.acceptedFiles,
            tables.drafts,
          ],
          async () => {
            const entry = await queueEntryOf(accountId, mutationId);
            if (entry === null) return;
            const workspaceId = entry.workspaceId;
            await tables.queue.delete([
              serverOrigin,
              accountId,
              workspaceId,
              entry.mutationId,
            ]);
            changes.push(
              ...(await forgetMutationWork(
                ctx,
                accountId,
                workspaceId,
                entry.mutationId,
                entry.input.revisions,
              )),
            );
            changes.push({
              accountId,
              workspaceId,
              fileId: entry.input.revisions[0]?.fileId ?? null,
              kind: 'queue',
            });
          },
        ),
      );
      for (const change of changes) publish(change);
    },

    async reparentQueueEntry(
      accountId: string,
      mutationId: string,
      expectedHeads: Readonly<Record<string, string | null>>,
    ): Promise<QueueEntry | null> {
      const changes: LocalChange[] = [];
      const moved = await guard('reparenting a queued mutation', () =>
        db.transaction('rw', tables.queue, async () => {
          const entry = await queueEntryOf(accountId, mutationId);
          if (entry === null) return null;
          // A sent mutation froze its body. Rewriting it would describe a
          // request that the frozen digest does not cover.
          if (entry.state === 'conflict') return null;
          const next: QueueRow = {
            ...entry,
            state: 'pending',
            digest: null,
            input: {
              ...entry.input,
              expectedHeads: { ...entry.input.expectedHeads, ...expectedHeads },
            },
          };
          await tables.queue.put(next);
          changes.push({
            accountId,
            workspaceId: entry.workspaceId,
            fileId: entry.input.revisions[0]?.fileId ?? null,
            kind: 'queue',
          });
          return {
            accountId: next.accountId,
            input: next.input,
            state: next.state,
            digest: next.digest,
            errorCode: next.errorCode,
          };
        }),
      );
      for (const change of changes) publish(change);
      return moved;
    },

    async acknowledge(
      accountId: string,
      result: AcceptedChangeset,
    ): Promise<void> {
      const changes: LocalChange[] = [];
      await guard('acknowledging a mutation', () =>
        db.transaction(
          'rw',
          [
            tables.queue,
            tables.checkpoints,
            tables.acceptedFiles,
            tables.receipts,
            tables.drafts,
            tables.reviews,
          ],
          async () => {
            const entry = await queueEntryOf(accountId, result.mutationId);
            // The queue entry is gone, so this answer was already applied.
            // Repeating it must change nothing.
            if (entry === null) return;
            const workspaceId = entry.workspaceId;
            for (const revision of entry.input.revisions)
              changes.push({
                accountId,
                workspaceId: entry.workspaceId,
                fileId: revision.fileId,
                kind: 'file',
              });
            // The entry leaves the queue, so every tab reads the queue again.
            // Only the lease tab sends, and the others learn from this alone
            // that the save reached the server.
            changes.push({
              accountId,
              workspaceId,
              fileId: entry.input.revisions[0]?.fileId ?? null,
              kind: 'queue',
            });
            await tables.queue.delete([
              serverOrigin,
              accountId,
              workspaceId,
              entry.mutationId,
            ]);
            const rows: unknown[] = await tables.checkpoints
              .where('[serverOrigin+accountId+workspaceId+mutationId]')
              .equals([serverOrigin, accountId, workspaceId, entry.mutationId])
              .toArray();
            const range = partitionRange(serverOrigin, accountId, workspaceId);
            const laterQueue = (
              await tables.queue
                .where('[serverOrigin+accountId+workspaceId+sequence]')
                .between(range.lower, range.upper, true, true)
                .toArray()
            )
              .map((row: unknown) => validateQueueRow(row))
              .filter((row) => row.sequence > entry.sequence);
            const rebasedQueue = new Map<string, QueueRow>();
            const accepted = new Set(result.revisionIds);
            const newest = new Map<string, CheckpointRow>();
            for (const row of rows) {
              const checkpoint = validateCheckpoint(row);
              if (!accepted.has(checkpoint.revisionId)) continue;
              await tables.checkpoints.put({ ...checkpoint, accepted: true });
              const seen = newest.get(checkpoint.fileId);
              if (seen === undefined || checkpoint.sequence > seen.sequence)
                newest.set(checkpoint.fileId, checkpoint);
            }
            for (const [fileId, checkpoint] of newest) {
              // A save that joined work this device had not seen keeps its
              // own checkpoint for Review, in the transaction that accepts it
              // (record 0087).
              const merged = result.revisions.some(
                (revision) =>
                  revision.revisionId === checkpoint.revisionId &&
                  revision.merged,
              );
              if (merged) {
                await recordMergeReview(
                  ctx,
                  accountId,
                  workspaceId,
                  checkpoint,
                  result.cursor,
                );
                changes.push({
                  accountId,
                  workspaceId,
                  fileId,
                  kind: 'review',
                });
              }
              const stored: unknown = await tables.acceptedFiles.get([
                serverOrigin,
                accountId,
                workspaceId,
                fileId,
              ]);
              const file =
                stored === undefined ? null : validateAcceptedFile(stored);
              const previousAcceptedHead = file?.acceptedHeadRevisionId ?? null;
              // The path and the deletion state follow the accepted
              // checkpoint while it is still the local head. Later local work
              // moves the local head past it, and that work keeps whatever it
              // set, so a checkpoint created after the submission survives.
              const later =
                file !== null &&
                file.localHeadRevisionId !== checkpoint.revisionId
                  ? file
                  : null;
              await tables.acceptedFiles.put({
                serverOrigin,
                accountId,
                workspaceId,
                fileId,
                kind: file?.kind ?? 'note',
                path: later?.path ?? checkpoint.path,
                deleted: later?.deleted ?? checkpoint.deleted,
                acceptedHeadRevisionId: checkpoint.revisionId,
                acceptedHeadDigest: checkpoint.digest,
                localHeadRevisionId:
                  file?.localHeadRevisionId ?? checkpoint.revisionId,
                updatedAt: nowIso(),
              });

              // A tombstone that the server accepted needs no draft. A leftover
              // deleted draft would shadow a later restore of the same file, so
              // it goes once this checkpoint is the local head and no later
              // local work depends on it.
              if (checkpoint.deleted && later === null)
                for (const draft of await draftsOfFile(
                  ctx,
                  accountId,
                  workspaceId,
                  fileId,
                )) {
                  if (!draft.deleted) continue;
                  await tables.drafts.delete([
                    serverOrigin,
                    accountId,
                    workspaceId,
                    draft.workingCopyId,
                  ]);
                }

              // The first later mutation of this file can be a child that was
              // queued while this request was in flight. Its body is still
              // mutable only while it is pending and has no frozen digest.
              // Advance that child's precondition with its accepted parent so
              // the file does not conflict with its own ordered checkpoints.
              const storedSuccessor = laterQueue.find((row) =>
                row.input.revisions.some(
                  (revision) => revision.fileId === fileId,
                ),
              );
              if (storedSuccessor === undefined) continue;
              const successor =
                rebasedQueue.get(storedSuccessor.mutationId) ?? storedSuccessor;
              const directlyFollows = successor.input.revisions.some(
                (revision) =>
                  revision.fileId === fileId &&
                  revision.parents.includes(checkpoint.revisionId),
              );
              if (
                successor.state !== 'pending' ||
                successor.digest !== null ||
                successor.input.expectedHeads[fileId] !==
                  previousAcceptedHead ||
                !directlyFollows
              )
                continue;
              rebasedQueue.set(successor.mutationId, {
                ...successor,
                input: {
                  ...successor.input,
                  expectedHeads: {
                    ...successor.input.expectedHeads,
                    [fileId]: checkpoint.revisionId,
                  },
                },
              });
            }
            for (const row of rebasedQueue.values())
              await tables.queue.put(row);
            await tables.receipts.put({
              serverOrigin,
              accountId,
              workspaceId,
              mutationId: entry.mutationId,
              revisionIds: [...result.revisionIds],
              cursor: result.cursor,
              acknowledgedAt: nowIso(),
            });
          },
        ),
      );
      for (const change of changes) publish(change);
    },

    listLocalConflicts(
      accountId: string,
      workspaceId: string,
    ): Promise<readonly LocalConflict[]> {
      return this.pending(accountId, workspaceId).then((entries) =>
        entries
          .filter((entry) => entry.state === 'conflict')
          .flatMap((entry) =>
            entry.input.revisions.map((revision) => ({
              accountId: entry.accountId,
              fileId: revision.fileId,
              mutationId: entry.input.mutationId,
              input: entry.input,
              errorCode: entry.errorCode,
            })),
          ),
      );
    },
  };
}
