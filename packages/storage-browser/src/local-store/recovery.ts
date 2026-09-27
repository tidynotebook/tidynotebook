/**
 * The recovery area of the local store, and the private-data reset.
 *
 * The recovery table backs the Needs attention list: a kept copy is durable
 * change data that other views must learn about. `clearPrivateData` erases
 * one workspace partition or a whole account on sign-out, but keeps the
 * account-wide sign-out marker so reconnect sees it first.
 * `clearIdleAccounts` erases the partitions of absent accounts that hold no
 * work when another account signs in (record 0113).
 */
import {
  LocalStorageError,
  accountWide,
  type LocalStore,
  type RecoveryInput,
  type RecoveryRecord,
} from '@notesapp/sync';
import { guard, partitionRange, type Tables } from '../database.ts';
import {
  validateAcceptedFile,
  validateCheckpoint,
  validateContent,
  validateCursor,
  validateDocument,
  validateDraft,
  validatePreference,
  validateQueueRow,
  validateReceipt,
  validateRecovery,
  validateReview,
  validateSnapshot,
  validateSnapshotItem,
} from '../migrations.ts';
import {
  validateLegacyBase,
  validateLegacyDraft,
  validateLegacySave,
} from '../legacy-records.ts';
import {
  draftHoldsWork,
  matchesAccount,
  matchesPartition,
  signOutMarkerName,
  type AccountRow,
  type LocalStoreContext,
} from './shared.ts';
import { forgetReviews } from './reviews.ts';

type RecoverySlice = Pick<
  LocalStore,
  | 'recover'
  | 'addRecovery'
  | 'removeRecovery'
  | 'clearPrivateData'
  | 'clearIdleAccounts'
>;

/** Every table that holds private rows, which a reset writes in one go. */
const privateTables = (tables: Tables) => [
  tables.drafts,
  tables.checkpoints,
  tables.contents,
  tables.acceptedFiles,
  tables.queue,
  tables.receipts,
  tables.stagedSnapshots,
  tables.snapshotItems,
  tables.cursors,
  tables.preferences,
  tables.recovery,
  tables.documents,
  tables.legacySaves,
  tables.legacyBases,
  tables.legacyDrafts,
  tables.reviews,
];

export function createRecoverySlice(ctx: LocalStoreContext): RecoverySlice {
  const { serverOrigin, db, tables, nowIso, newId, publish } = ctx;

  /** Deletes every private row of one workspace partition. */
  const clearWorkspacePartition = async (
    accountId: string,
    workspaceId: string,
  ): Promise<void> => {
    for (const row of await tables.drafts.toArray()) {
      const parsed = validateDraft(row);
      if (matchesPartition(ctx, parsed, accountId, workspaceId))
        await tables.drafts.delete([
          parsed.serverOrigin,
          parsed.accountId,
          parsed.workspaceId,
          parsed.workingCopyId,
        ]);
    }
    for (const row of await tables.checkpoints.toArray()) {
      const parsed = validateCheckpoint(row);
      if (matchesPartition(ctx, parsed, accountId, workspaceId))
        await tables.checkpoints.delete([
          parsed.serverOrigin,
          parsed.accountId,
          parsed.workspaceId,
          parsed.revisionId,
        ]);
    }
    for (const row of await tables.contents.toArray()) {
      const parsed = validateContent(row);
      if (matchesPartition(ctx, parsed, accountId, workspaceId))
        await tables.contents.delete([
          parsed.serverOrigin,
          parsed.accountId,
          parsed.workspaceId,
          parsed.digest,
        ]);
    }
    for (const row of await tables.acceptedFiles.toArray()) {
      const parsed = validateAcceptedFile(row);
      if (matchesPartition(ctx, parsed, accountId, workspaceId))
        await tables.acceptedFiles.delete([
          parsed.serverOrigin,
          parsed.accountId,
          parsed.workspaceId,
          parsed.fileId,
        ]);
    }
    for (const row of await tables.queue.toArray()) {
      const parsed = validateQueueRow(row);
      if (matchesPartition(ctx, parsed, accountId, workspaceId))
        await tables.queue.delete([
          parsed.serverOrigin,
          parsed.accountId,
          parsed.workspaceId,
          parsed.mutationId,
        ]);
    }
    for (const row of await tables.receipts.toArray()) {
      const parsed = validateReceipt(row);
      if (matchesPartition(ctx, parsed, accountId, workspaceId))
        await tables.receipts.delete([
          parsed.serverOrigin,
          parsed.accountId,
          parsed.workspaceId,
          parsed.mutationId,
        ]);
    }
    for (const row of await tables.stagedSnapshots.toArray()) {
      const parsed = validateSnapshot(row);
      if (matchesPartition(ctx, parsed, accountId, workspaceId))
        await tables.stagedSnapshots.delete([
          parsed.serverOrigin,
          parsed.accountId,
          parsed.workspaceId,
          parsed.token,
        ]);
    }
    for (const row of await tables.snapshotItems.toArray()) {
      const parsed = validateSnapshotItem(row);
      if (matchesPartition(ctx, parsed, accountId, workspaceId))
        await tables.snapshotItems.delete([
          parsed.serverOrigin,
          parsed.accountId,
          parsed.workspaceId,
          parsed.token,
          parsed.revisionId,
        ]);
    }
    await tables.cursors.delete([serverOrigin, accountId, workspaceId]);
    // The document of a note holds its text, and the work of release 0.4
    // holds text as well, so both leave with the partition.
    const range = partitionRange(serverOrigin, accountId, workspaceId);
    await tables.documents
      .where('[serverOrigin+accountId+workspaceId+fileId]')
      .between(range.lower, range.upper, true, true)
      .delete();
    await tables.legacySaves
      .where('[serverOrigin+accountId+workspaceId+mutationId]')
      .between(range.lower, range.upper, true, true)
      .delete();
    await tables.legacyBases
      .where('[serverOrigin+accountId+workspaceId+revisionId]')
      .between(range.lower, range.upper, true, true)
      .delete();
    await tables.legacyDrafts
      .where('[serverOrigin+accountId+workspaceId+workingCopyId]')
      .between(range.lower, range.upper, true, true)
      .delete();
    // A Review names a checkpoint or kept text of the partition, which go
    // with it, so the event goes too.
    await tables.reviews
      .where('[serverOrigin+accountId+workspaceId+reviewId]')
      .between(range.lower, range.upper, true, true)
      .delete();
    for (const row of await tables.recovery.toArray()) {
      const parsed = validateRecovery(row);
      if (matchesPartition(ctx, parsed, accountId, workspaceId))
        await tables.recovery.delete([
          parsed.serverOrigin,
          parsed.accountId,
          parsed.workspaceId,
          parsed.recoveryId,
        ]);
    }
    // Workspace preferences go, but the account-wide sign-out marker stays:
    // reconnect must see it before any private content is restored.
    for (const row of await tables.preferences.toArray()) {
      const parsed = validatePreference(row);
      if (!matchesPartition(ctx, parsed, accountId, workspaceId)) continue;
      if (
        parsed.workspaceId === accountWide &&
        parsed.name === signOutMarkerName
      )
        continue;
      await tables.preferences.delete([
        parsed.serverOrigin,
        parsed.accountId,
        parsed.workspaceId,
        parsed.name,
      ]);
    }
  };

  /** Deletes every workspace partition of one account, keeping the marker. */
  const clearAccountPartition = async (
    accountId: string,
  ): Promise<readonly string[]> => {
    const workspaces = new Set<string>();
    const collect = (row: AccountRow): void => {
      if (matchesAccount(ctx, row, accountId)) workspaces.add(row.workspaceId);
    };
    for (const row of await tables.drafts.toArray())
      collect(validateDraft(row));
    for (const row of await tables.checkpoints.toArray())
      collect(validateCheckpoint(row));
    for (const row of await tables.contents.toArray())
      collect(validateContent(row));
    for (const row of await tables.acceptedFiles.toArray())
      collect(validateAcceptedFile(row));
    for (const row of await tables.queue.toArray())
      collect(validateQueueRow(row));
    for (const row of await tables.receipts.toArray())
      collect(validateReceipt(row));
    for (const row of await tables.stagedSnapshots.toArray())
      collect(validateSnapshot(row));
    for (const row of await tables.snapshotItems.toArray())
      collect(validateSnapshotItem(row));
    for (const row of await tables.cursors.toArray())
      collect(validateCursor(row));
    for (const row of await tables.recovery.toArray())
      collect(validateRecovery(row));
    for (const row of await tables.preferences.toArray())
      collect(validatePreference(row));
    for (const row of await tables.documents.toArray())
      collect(validateDocument(row));
    for (const row of await tables.legacySaves.toArray())
      collect(validateLegacySave(row));
    for (const row of await tables.legacyBases.toArray())
      collect(validateLegacyBase(row));
    for (const row of await tables.legacyDrafts.toArray())
      collect(validateLegacyDraft(row));
    for (const row of await tables.reviews.toArray())
      collect(validateReview(row));
    workspaces.delete(accountWide);
    for (const workspaceId of workspaces)
      await clearWorkspacePartition(accountId, workspaceId);
    await clearAccountWideSettings(accountId);
    return [...workspaces];
  };

  /** Deletes the account-wide settings of one account, keeping the marker. */
  const clearAccountWideSettings = async (accountId: string): Promise<void> => {
    for (const row of await tables.preferences.toArray()) {
      const parsed = validatePreference(row);
      if (!matchesAccount(ctx, parsed, accountId)) continue;
      if (parsed.workspaceId !== accountWide) continue;
      if (parsed.name === signOutMarkerName) continue;
      await tables.preferences.delete([
        parsed.serverOrigin,
        parsed.accountId,
        parsed.workspaceId,
        parsed.name,
      ]);
    }
  };

  /**
   * The partitions of this origin that other accounts hold, by account.
   * With no signed-in account, every account of the origin is another one.
   *
   * Only the keys are read, so the text of a note does not leave the disk
   * for a partition that is only counted. The account-wide part of an
   * account is in the answer as `accountWide`.
   */
  const partitionsOfOthers = async (
    signedInAccountId: string | null,
  ): Promise<Map<string, Set<string>>> => {
    const keyLists: readonly (readonly (readonly string[])[])[] =
      await Promise.all(
        privateTables(tables).map((table) =>
          table.toCollection().primaryKeys(),
        ),
      );
    const partitions = new Map<string, Set<string>>();
    for (const keys of keyLists)
      for (const [keyOrigin, accountId, workspaceId] of keys) {
        if (keyOrigin !== serverOrigin) continue;
        if (accountId === undefined || workspaceId === undefined) continue;
        if (accountId === signedInAccountId) continue;
        const workspaces = partitions.get(accountId) ?? new Set<string>();
        workspaces.add(workspaceId);
        partitions.set(accountId, workspaces);
      }
    return partitions;
  };

  /**
   * Whether one partition holds work that has not reached the server.
   *
   * A queued save in any state, kept text of the recovery area, and work of
   * release 0.4 that waits for placement each count, and so does a draft whose
   * text no version holds (`draftHoldsWork`).
   */
  const partitionHoldsWork = async (
    accountId: string,
    workspaceId: string,
  ): Promise<boolean> => {
    const range = partitionRange(serverOrigin, accountId, workspaceId);
    const counted = [
      tables.queue.where('[serverOrigin+accountId+workspaceId+mutationId]'),
      tables.recovery.where('[serverOrigin+accountId+workspaceId+recoveryId]'),
      tables.legacySaves.where(
        '[serverOrigin+accountId+workspaceId+mutationId]',
      ),
      tables.legacyDrafts.where(
        '[serverOrigin+accountId+workspaceId+workingCopyId]',
      ),
    ];
    for (const clause of counted)
      if (
        (await clause.between(range.lower, range.upper, true, true).count()) > 0
      )
        return true;
    const drafts: unknown[] = await tables.drafts
      .where('[serverOrigin+accountId+workspaceId+workingCopyId]')
      .between(range.lower, range.upper, true, true)
      .toArray();
    for (const row of drafts) {
      const draft = validateDraft(row);
      const storedFile: unknown = await tables.acceptedFiles.get([
        serverOrigin,
        accountId,
        workspaceId,
        draft.fileId,
      ]);
      const file =
        storedFile === undefined ? null : validateAcceptedFile(storedFile);
      if (await draftHoldsWork(ctx, draft, file)) return true;
    }
    return false;
  };

  return {
    recover(
      accountId: string,
      workspaceId: string,
    ): Promise<readonly RecoveryRecord[]> {
      return guard('reading the recovery area', () =>
        db.transaction('r', tables.recovery, async () => {
          const range = partitionRange(serverOrigin, accountId, workspaceId);
          const rows: unknown[] = await tables.recovery
            .where('[serverOrigin+accountId+workspaceId+createdAt]')
            .between(range.lower, range.upper, true, true)
            .toArray();
          return rows.map((row: unknown) => validateRecovery(row));
        }),
      );
    },

    async addRecovery(
      accountId: string,
      workspaceId: string,
      entry: RecoveryInput,
    ): Promise<RecoveryRecord> {
      const record = await guard('keeping a recovery copy', () =>
        db.transaction('rw', tables.recovery, async () => {
          if (entry.fileId === '' || entry.path === '')
            throw new LocalStorageError(
              'corrupt',
              'the recovery copy names no file',
            );
          const record: RecoveryRecord = {
            serverOrigin,
            accountId,
            workspaceId,
            recoveryId: entry.recoveryId ?? newId(),
            fileId: entry.fileId,
            path: entry.path,
            text: entry.text,
            reason: entry.reason,
            code: entry.code ?? null,
            mutationId: entry.mutationId ?? null,
            createdAt: entry.createdAt ?? nowIso(),
          };
          await tables.recovery.put(validateRecovery(record));
          return record;
        }),
      );
      // The Needs attention list reads this table, so a kept copy is a
      // durable change that other views must learn about.
      publish({
        accountId,
        workspaceId,
        fileId: record.fileId,
        kind: 'conflict',
      });
      return record;
    },

    async removeRecovery(
      accountId: string,
      workspaceId: string,
      recoveryId: string,
    ): Promise<void> {
      const removed = await guard('removing a recovery copy', () =>
        db.transaction(
          'rw',
          [tables.recovery, tables.reviews],
          async (): Promise<string | null> => {
            const stored: unknown = await tables.recovery.get([
              serverOrigin,
              accountId,
              workspaceId,
              recoveryId,
            ]);
            if (stored === undefined) return null;
            const record = validateRecovery(stored);
            await tables.recovery.delete([
              serverOrigin,
              accountId,
              workspaceId,
              recoveryId,
            ]);
            // No note may offer a comparison with text that is gone.
            await forgetReviews(
              ctx,
              accountId,
              workspaceId,
              record.fileId,
              recoveryId,
            );
            return record.fileId;
          },
        ),
      );
      if (removed === null) return;
      publish({ accountId, workspaceId, fileId: removed, kind: 'conflict' });
      publish({ accountId, workspaceId, fileId: removed, kind: 'review' });
    },

    async clearPrivateData(
      accountId: string,
      workspaceId?: string,
    ): Promise<void> {
      const clearedWorkspaces = await guard('clearing private local data', () =>
        db.transaction('rw', privateTables(tables), async () => {
          if (workspaceId === undefined) {
            return clearAccountPartition(accountId);
          } else {
            await clearWorkspacePartition(accountId, workspaceId);
            return [workspaceId];
          }
        }),
      );
      for (const clearedWorkspaceId of clearedWorkspaces)
        publish({
          accountId,
          workspaceId: clearedWorkspaceId,
          fileId: null,
          kind: 'reset',
        });
    },

    async clearIdleAccounts(
      signedInAccountId: string | null,
    ): Promise<readonly string[]> {
      const outcome = await guard('clearing the data of absent accounts', () =>
        db.transaction('rw', privateTables(tables), async () => {
          const kept: string[] = [];
          const cleared: { accountId: string; workspaceId: string }[] = [];
          const partitions = await partitionsOfOthers(signedInAccountId);
          for (const [accountId, workspaces] of partitions) {
            let keeps = false;
            for (const workspaceId of workspaces) {
              if (workspaceId === accountWide) continue;
              if (await partitionHoldsWork(accountId, workspaceId)) {
                keeps = true;
                continue;
              }
              await clearWorkspacePartition(accountId, workspaceId);
              cleared.push({ accountId, workspaceId });
            }
            // The settings of an account follow its last partition, so an
            // account whose work waits here opens with its own settings.
            if (keeps) kept.push(accountId);
            else await clearAccountWideSettings(accountId);
          }
          return { kept, cleared };
        }),
      );
      for (const { accountId, workspaceId } of outcome.cleared)
        publish({ accountId, workspaceId, fileId: null, kind: 'reset' });
      return outcome.kept;
    },
  };
}
