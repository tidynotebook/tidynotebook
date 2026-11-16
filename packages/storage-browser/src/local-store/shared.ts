/**
 * The shared context and the cross-area helpers of the local store.
 *
 * `openLocalStore` builds one `LocalStoreContext` and hands it to every area
 * module. The context carries the opened database, the tables, the origin the
 * store was opened for, the injected clock and identifier source, and the
 * invalidation `publish`. The helpers here read or shape rows that more than
 * one area needs, so no area repeats a partition query or a row mapping.
 */
import type { Draft, LocalChange } from '@notesapp/sync';
import {
  partitionRange,
  type DraftRow,
  type FileRow,
  type LocalDatabase,
  type Tables,
} from '../database.ts';
import {
  validateAcceptedFile,
  validateCheckpoint,
  validateContent,
  validateDraft,
  validateQueueRow,
  validateRecovery,
} from '../migrations.ts';
import { validateLegacySave } from '../legacy-records.ts';
import { forgetReviews } from './reviews.ts';

/**
 * The state every area module shares.
 *
 * The store is opened for one server origin and every key starts with that
 * origin. The clock and the identifier source are injected, so a test produces
 * the same records twice. `publish` fans one durable change out to the local
 * listeners and, when it exists, the broadcast channel.
 */
export type LocalStoreContext = {
  readonly serverOrigin: string;
  readonly deviceId: string;
  readonly db: LocalDatabase['db'];
  readonly tables: Tables;
  readonly clock: () => number;
  readonly newId: () => string;
  readonly nowIso: () => string;
  readonly publish: (change: LocalChange) => void;
};

/** The account-wide preference that records an offline sign-out. */
export const signOutMarkerName = 'signout-marker';

/** One state of a file that a draft can be compared with. */
export type HeadState = {
  readonly path: string;
  readonly deleted: boolean;
  readonly text: string | null;
};

/** The three parts that place a stored row in one partition. */
export type AccountRow = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
};

/** The number of UTF-8 bytes of a string. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/**
 * Whether a working copy still describes the current state of its file.
 *
 * A draft is built on one revision: its last checkpoint, or the head it was
 * opened from. It leads whenever that anchor is still the accepted head, which
 * is the ordinary case of typing into a file that is in sync, and whenever
 * this device holds unsent work, whose local head is past the accepted one.
 *
 * It does not lead when the server moved the file past the anchor and nothing
 * local is pending. The accepted row is then the newer statement of the path
 * and of the deletion state, so a draft left over from an earlier deletion
 * cannot hide a note that the server brought back.
 */
export function draftLeads(
  file: FileRow | null | undefined,
  draft: DraftRow,
): boolean {
  if (file === null || file === undefined) return true;
  if (file.acceptedHeadRevisionId === null) return true;
  const anchor = draft.lastCheckpointId ?? draft.baseRevisionId;
  if (file.acceptedHeadRevisionId === anchor) return true;
  return file.localHeadRevisionId !== file.acceptedHeadRevisionId;
}

/**
 * Whether one draft holds text that no version of this device holds.
 *
 * A confirmed merge compares with its canonical accepted body, because the
 * retained checkpoint holds the original submission for Review. Otherwise,
 * a draft that names no checkpoint holds work. A draft that names one holds
 * work when its text, its path, or its deletion state differs from that
 * checkpoint, or from the accepted head when the checkpoint is gone and the
 * accepted head is that revision. A draft whose version this device cannot
 * read at all counts as work, because text that cannot be compared must not
 * be taken for text that is safe.
 *
 * The save state of a note and the private-data reset of an absent account
 * both read this rule, so what counts as unsaved text is one fact. The caller
 * runs inside a transaction that covers the checkpoints and the contents.
 */
export const draftHoldsWork = async (
  ctx: LocalStoreContext,
  draft: DraftRow,
  file: FileRow | null,
): Promise<boolean> => {
  const { tables } = ctx;
  const readText = async (digest: string): Promise<string | null> => {
    const stored: unknown = await tables.contents.get([
      draft.serverOrigin,
      draft.accountId,
      draft.workspaceId,
      digest,
    ]);
    return stored === undefined ? null : validateContent(stored).text;
  };
  // A merged receipt keeps the submitted checkpoint unchanged for Review.
  // The current accepted body, not that older submitted text, proves what
  // the server holds. A remote join can also write a new draft with no
  // checkpoint receipt after the feed removed the submitted draft.
  if (
    file !== null &&
    !file.deleted &&
    !draft.deleted &&
    file.acceptedHeadRevisionId !== null &&
    (draft.lastCheckpointId ?? draft.baseRevisionId) ===
      file.acceptedHeadRevisionId &&
    file.acceptedHeadDigest !== null
  ) {
    const submitted: unknown = await tables.checkpoints.get([
      draft.serverOrigin,
      draft.accountId,
      draft.workspaceId,
      file.acceptedHeadRevisionId,
    ]);
    const checkpoint =
      submitted === undefined ? null : validateCheckpoint(submitted);
    if (
      checkpoint?.accepted === true &&
      checkpoint.digest !== file.acceptedHeadDigest
    ) {
      const acceptedText = await readText(file.acceptedHeadDigest);
      return (
        acceptedText === null ||
        acceptedText !== draft.text ||
        file.acceptedPath !== draft.path
      );
    }
  }
  if (draft.lastCheckpointId === null) return true;
  const storedCheckpoint: unknown = await tables.checkpoints.get([
    draft.serverOrigin,
    draft.accountId,
    draft.workspaceId,
    draft.lastCheckpointId,
  ]);
  if (storedCheckpoint !== undefined) {
    const checkpoint = validateCheckpoint(storedCheckpoint);
    return (
      (await readText(checkpoint.digest)) !== draft.text ||
      checkpoint.path !== draft.path ||
      checkpoint.deleted !== draft.deleted
    );
  }
  if (
    file?.acceptedHeadRevisionId === draft.lastCheckpointId &&
    file.acceptedHeadDigest !== null
  )
    return (
      (await readText(file.acceptedHeadDigest)) !== draft.text ||
      file.path !== draft.path ||
      file.deleted !== draft.deleted
    );
  return true;
};

/**
 * The accepted revision that one submitted parent chain descends from.
 *
 * A submission states two things about its place in history: `parents` names
 * the revision its content was written over, and `expectedHeads` states the
 * accepted head the server must still hold. The two must name one lineage. The
 * mirror cannot answer the second question, because the ordered feed moves the
 * accepted head under an open working copy and the content stays where it was.
 * A submission that read the precondition from the mirror therefore passed the
 * one server check that keeps a save from replacing text this device never saw
 * (record 0073).
 *
 * The walk starts at the parent and climbs through the unaccepted checkpoints
 * of this device, because the server has none of them yet. It stops at the
 * first revision this device did not create, and at an accepted checkpoint of
 * its own, because both of those are revisions the server holds. A first
 * revision has no parent and answers `null`, which states that the server must
 * not have the file yet.
 *
 * The caller runs inside a transaction that covers the checkpoints table.
 */
export const expectedHeadOfParent = async (
  ctx: LocalStoreContext,
  accountId: string,
  workspaceId: string,
  parentId: string | null,
): Promise<string | null> => {
  const seen = new Set<string>();
  let current = parentId;
  while (current !== null) {
    // An immutable checkpoint always names an earlier parent, so a repeat is a
    // corrupt graph rather than a long chain. Stopping at the repeat keeps the
    // walk finite and leaves the precondition on the last sound revision.
    if (seen.has(current)) return current;
    seen.add(current);
    const stored: unknown = await ctx.tables.checkpoints.get([
      ctx.serverOrigin,
      accountId,
      workspaceId,
      current,
    ]);
    if (stored === undefined) return current;
    const checkpoint = validateCheckpoint(stored);
    if (checkpoint.accepted) return current;
    current = checkpoint.parents[0] ?? null;
  }
  return null;
};

/**
 * The revision that the next save of one working copy builds on.
 *
 * It is the last checkpoint of the working copy, or the revision that the
 * working copy was opened from when it has none. A last checkpoint that the
 * device no longer holds left with its save: Discard, Retry and Save as new
 * note of an earlier release, and the placement of release 0.4, removed it
 * and left the draft naming it. Neither the device nor the server holds that
 * revision, so the draft builds on the accepted head of its file, as a
 * rebased draft does (`rebaseDraft`), and keeps its text (record 0183).
 *
 * The caller runs inside a transaction that covers the checkpoints.
 */
export const anchorOfDraft = async (
  ctx: LocalStoreContext,
  draft: {
    readonly accountId: string;
    readonly workspaceId: string;
    readonly lastCheckpointId: string | null;
    readonly baseRevisionId: string | null;
  },
  file: FileRow | null,
): Promise<string | null> => {
  if (draft.lastCheckpointId === null) return draft.baseRevisionId;
  const stored: unknown = await ctx.tables.checkpoints.get([
    ctx.serverOrigin,
    draft.accountId,
    draft.workspaceId,
    draft.lastCheckpointId,
  ]);
  if (stored !== undefined) return draft.lastCheckpointId;
  return file?.acceptedHeadRevisionId ?? null;
};

/**
 * The parent that the next save of one chain names (record 0183).
 *
 * A save that the server refused for good is parked, and the server holds no
 * revision of it, so a save that named it as its parent would be refused as
 * well. The walk starts at the revision that the working copy builds on
 * (`anchorOfDraft`) and passes each unaccepted checkpoint of this device
 * whose save is parked. It stops at the first revision that is not parked: a
 * revision this device did not create, an accepted checkpoint, or an unsent
 * one. The later save carries the work of every parked save it passes,
 * because a save is the work since the state that the server has (record
 * 0085).
 *
 * A revision that the device holds no checkpoint of is a revision of the
 * server. No row of the device names a checkpoint that left it: a removal
 * moves every checkpoint, unsent save and draft that named it
 * (`moveOffRemoved`), the step to schema version 11 moved the saves that an
 * earlier release left, and a draft that still names one builds on the
 * accepted head. So the answer is never a revision that only this device
 * knew.
 *
 * The caller runs inside a transaction that covers the checkpoints and the
 * queue.
 */
export const parentOfNextSave = async (
  ctx: LocalStoreContext,
  accountId: string,
  workspaceId: string,
  parentId: string | null,
): Promise<string | null> => {
  const seen = new Set<string>();
  let current = parentId;
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    const stored: unknown = await ctx.tables.checkpoints.get([
      ctx.serverOrigin,
      accountId,
      workspaceId,
      current,
    ]);
    if (stored === undefined) return current;
    const checkpoint = validateCheckpoint(stored);
    if (checkpoint.accepted) return current;
    const queued: unknown = await ctx.tables.queue.get([
      ctx.serverOrigin,
      accountId,
      workspaceId,
      checkpoint.mutationId,
    ]);
    if (queued === undefined || validateQueueRow(queued).state !== 'conflict')
      return current;
    current = checkpoint.parents[0] ?? null;
  }
  return current;
};

/**
 * Moves every row of one file off checkpoints that leave the device.
 *
 * `removed` maps each removed revision to its parent. Each row that names a
 * removed revision takes its first kept ancestor instead, so no row of the
 * device names a checkpoint that the device no longer holds (record 0183):
 *
 * - A kept checkpoint. A parked save of an earlier release named the parked
 *   save before it as its parent, so a Discard of the older row left the
 *   later one on a revision that neither the device nor the server held.
 * - An unsent save whose body is not frozen. Its precondition follows from
 *   its new parent (record 0073). A frozen body keeps the request it froze.
 * - A draft, whose last checkpoint or base moves, when `drafts` is `follow`.
 *   Its text stays, and it is compared with the revision it now names.
 *
 * The caller runs inside a transaction that covers the checkpoints, the
 * queue and the drafts.
 */
export const moveOffRemoved = async (
  ctx: LocalStoreContext,
  accountId: string,
  workspaceId: string,
  fileId: string,
  removed: ReadonlyMap<string, string | null>,
  drafts: 'follow' | 'stay',
): Promise<void> => {
  const { serverOrigin, tables } = ctx;
  const kept = (revisionId: string | null): string | null => {
    const seen = new Set<string>();
    let current = revisionId;
    while (current !== null && removed.has(current) && !seen.has(current)) {
      seen.add(current);
      current = removed.get(current) ?? null;
    }
    return current;
  };
  const keptParents = (parents: readonly string[]): string[] =>
    parents.flatMap((parent) => {
      const moved = kept(parent);
      return moved === null ? [] : [moved];
    });
  const namesRemoved = (parents: readonly string[]): boolean =>
    parents.some((parent) => removed.has(parent));

  // The checkpoints move first, so the precondition of a save below reads
  // the chain as it now stands.
  const checkpoints: unknown[] = await tables.checkpoints
    .where('[serverOrigin+accountId+workspaceId+fileId]')
    .equals([serverOrigin, accountId, workspaceId, fileId])
    .toArray();
  for (const row of checkpoints) {
    const checkpoint = validateCheckpoint(row);
    if (!namesRemoved(checkpoint.parents)) continue;
    await tables.checkpoints.put({
      ...checkpoint,
      parents: keptParents(checkpoint.parents),
    });
  }

  const range = partitionRange(serverOrigin, accountId, workspaceId);
  const queued: unknown[] = await tables.queue
    .where('[serverOrigin+accountId+workspaceId+sequence]')
    .between(range.lower, range.upper, true, true)
    .toArray();
  for (const value of queued) {
    const row = validateQueueRow(value);
    if (row.state !== 'pending' || row.digest !== null) continue;
    if (
      !row.input.revisions.some(
        (revision) =>
          revision.fileId === fileId && namesRemoved(revision.parents),
      )
    )
      continue;
    const revisions = row.input.revisions.map((revision) =>
      revision.fileId === fileId
        ? { ...revision, parents: keptParents(revision.parents) }
        : revision,
    );
    const first = revisions.find((revision) => revision.fileId === fileId);
    await tables.queue.put({
      ...row,
      input: {
        ...row.input,
        revisions,
        expectedHeads: {
          ...row.input.expectedHeads,
          [fileId]: await expectedHeadOfParent(
            ctx,
            accountId,
            workspaceId,
            first?.parents[0] ?? null,
          ),
        },
      },
    });
  }

  if (drafts === 'stay') return;
  for (const draft of await draftsOfFile(ctx, accountId, workspaceId, fileId)) {
    const lastCheckpointId = kept(draft.lastCheckpointId);
    const baseRevisionId = kept(draft.baseRevisionId);
    if (
      lastCheckpointId === draft.lastCheckpointId &&
      baseRevisionId === draft.baseRevisionId
    )
      continue;
    await tables.drafts.put({ ...draft, lastCheckpointId, baseRevisionId });
  }
};

/** The stored form of a draft the caller supplied. */
export const draftRow = (
  ctx: LocalStoreContext,
  draft: Draft,
  lastCheckpointId: string | null,
): DraftRow => ({
  serverOrigin: ctx.serverOrigin,
  accountId: draft.accountId,
  workspaceId: draft.workspaceId,
  workingCopyId: draft.workingCopyId,
  fileId: draft.fileId,
  baseRevisionId: draft.baseRevisionId,
  text: draft.text,
  path: draft.path,
  deleted: draft.deleted,
  sequence: draft.sequence,
  documentVector: draft.documentVector ?? null,
  lastCheckpointId,
  savedAt: ctx.nowIso(),
});

/** Every stored draft of one file, newest first. */
export const draftsOfFile = async (
  ctx: LocalStoreContext,
  accountId: string,
  workspaceId: string,
  fileId: string,
): Promise<DraftRow[]> => {
  const rows: unknown[] = await ctx.tables.drafts
    .where('[serverOrigin+accountId+workspaceId+fileId]')
    .equals([ctx.serverOrigin, accountId, workspaceId, fileId])
    .toArray();
  return rows
    .map((row: unknown) => validateDraft(row))
    .sort((left, right) => {
      if (left.savedAt !== right.savedAt)
        return left.savedAt < right.savedAt ? 1 : -1;
      if (left.sequence !== right.sequence)
        return right.sequence - left.sequence;
      return left.workingCopyId < right.workingCopyId ? 1 : -1;
    });
};

/**
 * The next submission order number of one partition.
 *
 * The caller runs inside a transaction that covers the queue table, so two
 * writers of one partition cannot take the same number.
 */
export const nextQueueSequence = async (
  ctx: LocalStoreContext,
  accountId: string,
  workspaceId: string,
): Promise<number> => {
  const range = partitionRange(ctx.serverOrigin, accountId, workspaceId);
  const last: unknown = await ctx.tables.queue
    .where('[serverOrigin+accountId+workspaceId+sequence]')
    .between(range.lower, range.upper, true, true)
    .last();
  // A moved save of release 0.4 returns to the queue under its own order
  // when it is placed, so a new save takes an order after it (record 0088).
  const moved: unknown = await ctx.tables.legacySaves
    .where('[serverOrigin+accountId+workspaceId+sequence]')
    .between(range.lower, range.upper, true, true)
    .last();
  return (
    Math.max(
      last === undefined ? 0 : validateQueueRow(last).sequence,
      moved === undefined ? 0 : validateLegacySave(moved).sequence,
    ) + 1
  );
};

/** The next checkpoint order number of one partition. */
export const nextCheckpointSequence = async (
  ctx: LocalStoreContext,
  accountId: string,
  workspaceId: string,
): Promise<number> => {
  const range = partitionRange(ctx.serverOrigin, accountId, workspaceId);
  const last: unknown = await ctx.tables.checkpoints
    .where('[serverOrigin+accountId+workspaceId+sequence]')
    .between(range.lower, range.upper, true, true)
    .last();
  return last === undefined ? 1 : validateCheckpoint(last).sequence + 1;
};

/** The stored Markdown body of one digest, or `null` when it is absent. */
export const bodyOfDigest = async (
  ctx: LocalStoreContext,
  accountId: string,
  workspaceId: string,
  digest: string,
): Promise<string | null> => {
  const stored: unknown = await ctx.tables.contents.get([
    ctx.serverOrigin,
    accountId,
    workspaceId,
    digest,
  ]);
  if (stored === undefined) return null;
  return validateContent(stored).text;
};

/**
 * Removes every local trace of one file.
 *
 * A permanently deleted file leaves no row on the server, so a client that
 * still holds any record of it would keep the note in the tree or revive it on
 * the next re-send, snapshot, or read. This deletes the accepted row, the
 * drafts, the checkpoints, the queued mutations, and the recovery copies of the
 * file. It never deletes a content body, because content is addressed by digest
 * and one body can back several files. The Reviews of the file go as well,
 * because they name its checkpoints and its kept text. The caller opens the
 * transaction and must cover the accepted files, the drafts, the checkpoints,
 * the queue, the recovery, and the Review tables.
 */
export const forgetFileRows = async (
  ctx: LocalStoreContext,
  accountId: string,
  workspaceId: string,
  fileId: string,
): Promise<void> => {
  const { serverOrigin, tables } = ctx;
  await tables.acceptedFiles.delete([
    serverOrigin,
    accountId,
    workspaceId,
    fileId,
  ]);
  for (const draft of await draftsOfFile(ctx, accountId, workspaceId, fileId))
    await tables.drafts.delete([
      serverOrigin,
      accountId,
      workspaceId,
      draft.workingCopyId,
    ]);
  const checkpoints: unknown[] = await tables.checkpoints
    .where('[serverOrigin+accountId+workspaceId+fileId]')
    .equals([serverOrigin, accountId, workspaceId, fileId])
    .toArray();
  for (const row of checkpoints) {
    const checkpoint = validateCheckpoint(row);
    await tables.checkpoints.delete([
      serverOrigin,
      accountId,
      workspaceId,
      checkpoint.revisionId,
    ]);
  }
  const range = partitionRange(serverOrigin, accountId, workspaceId);
  const queued: unknown[] = await tables.queue
    .where('[serverOrigin+accountId+workspaceId+sequence]')
    .between(range.lower, range.upper, true, true)
    .toArray();
  for (const row of queued) {
    const entry = validateQueueRow(row);
    if (!entry.input.revisions.some((revision) => revision.fileId === fileId))
      continue;
    await tables.queue.delete([
      serverOrigin,
      accountId,
      workspaceId,
      entry.mutationId,
    ]);
  }
  const recovered: unknown[] = await tables.recovery
    .where('[serverOrigin+accountId+workspaceId+createdAt]')
    .between(range.lower, range.upper, true, true)
    .toArray();
  for (const row of recovered) {
    const record = validateRecovery(row);
    if (record.fileId !== fileId) continue;
    await tables.recovery.delete([
      serverOrigin,
      accountId,
      workspaceId,
      record.recoveryId,
    ]);
  }
  await forgetReviews(ctx, accountId, workspaceId, fileId);
};

/** Whether a stored row belongs to one account of this origin. */
export const matchesAccount = (
  ctx: LocalStoreContext,
  row: AccountRow,
  accountId: string,
): boolean =>
  row.serverOrigin === ctx.serverOrigin && row.accountId === accountId;

/** Whether a stored row belongs to one workspace partition. */
export const matchesPartition = (
  ctx: LocalStoreContext,
  row: AccountRow,
  accountId: string,
  workspaceId: string,
): boolean =>
  row.serverOrigin === ctx.serverOrigin &&
  row.accountId === accountId &&
  row.workspaceId === workspaceId;

/**
 * Removes the local work that only one mutation held.
 *
 * The checkpoints of the mutation go, and each file it touched goes back to
 * its accepted state: a local head that the mutation set returns to the
 * accepted head, and a deletion flag that the mutation set is cleared,
 * because the accepted head that the server kept is not a tombstone. Each
 * checkpoint and each unsent save that named a removed checkpoint moves to
 * its first kept ancestor, and so does each draft when `drafts` is `follow`
 * (record 0183, `moveOffRemoved`). The placement of release 0.4 passes
 * `stay`, because it reads each of its drafts at the checkpoint that the
 * draft names and places the draft itself right after (record 0088). The
 * caller removes the mutation itself, from the queue or from the moved
 * saves, in the same transaction, which covers the checkpoints, the queue,
 * the accepted files and the drafts. The answer names the files that
 * changed.
 */
export const forgetMutationWork = async (
  ctx: LocalStoreContext,
  accountId: string,
  workspaceId: string,
  mutationId: string,
  revisions: readonly {
    readonly fileId: string;
    readonly deleted: boolean;
  }[],
  drafts: 'follow' | 'stay',
): Promise<LocalChange[]> => {
  const { serverOrigin, tables, nowIso } = ctx;
  const changes: LocalChange[] = [];
  const rows: unknown[] = await tables.checkpoints
    .where('[serverOrigin+accountId+workspaceId+mutationId]')
    .equals([serverOrigin, accountId, workspaceId, mutationId])
    .toArray();
  /** Each removed revision of each file, with its parent. */
  const removed = new Map<string, Map<string, string | null>>();
  for (const row of rows) {
    const checkpoint = validateCheckpoint(row);
    await tables.checkpoints.delete([
      serverOrigin,
      accountId,
      workspaceId,
      checkpoint.revisionId,
    ]);
    const ofFile =
      removed.get(checkpoint.fileId) ?? new Map<string, string | null>();
    ofFile.set(checkpoint.revisionId, checkpoint.parents[0] ?? null);
    removed.set(checkpoint.fileId, ofFile);
  }
  for (const [fileId, removedOfFile] of removed)
    await moveOffRemoved(
      ctx,
      accountId,
      workspaceId,
      fileId,
      removedOfFile,
      drafts,
    );
  // The tip of the discarded mutation decides what it had set on the
  // file row: a tombstone tip set the deletion flag, and every tip
  // set the local head.
  const tips = new Map<string, boolean>();
  for (const revision of revisions) tips.set(revision.fileId, revision.deleted);
  for (const [fileId, wasDeletion] of tips) {
    const removedOfFile: ReadonlyMap<string, string | null> =
      removed.get(fileId) ?? new Map<string, string | null>();
    const stored: unknown = await tables.acceptedFiles.get([
      serverOrigin,
      accountId,
      workspaceId,
      fileId,
    ]);
    if (stored !== undefined) {
      const file = validateAcceptedFile(stored);
      // A later save of this device keeps the local head that it set. Only
      // a head that left with this mutation goes back to the accepted one.
      const headRemoved =
        file.localHeadRevisionId === null ||
        removedOfFile.has(file.localHeadRevisionId);
      await tables.acceptedFiles.put({
        ...file,
        deleted: wasDeletion ? false : file.deleted,
        localHeadRevisionId: headRemoved
          ? file.acceptedHeadRevisionId
          : file.localHeadRevisionId,
        updatedAt: nowIso(),
      });
    }
    // A refused deletion keeps the note live, because it was changed
    // on another device. The tombstone draft that recorded the
    // deletion is stale now, and a leftover would shadow the live
    // note, so it goes with the deletion it recorded.
    if (wasDeletion)
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
    changes.push({
      accountId,
      workspaceId,
      fileId,
      kind: 'file',
    });
  }
  return changes;
};
