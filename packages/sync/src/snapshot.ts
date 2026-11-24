/**
 * Snapshot staging and ordered change download.
 *
 * The design keeps the download in three separated steps:
 *
 * - Stage the plan: start a snapshot, page every captured item, and record
 *   the token with its immutable revision IDs and cursor. Nothing local
 *   changes yet.
 * - Fetch immutable revisions by ID, never by a later current head, and
 *   store each body in the staging area.
 * - Activate only when every staged revision and its required content is
 *   present. Activation advances accepted heads and the cursor but never
 *   touches drafts, checkpoints, the queue, or a dirty working copy.
 *
 * After the snapshot cursor is known, ordered changes are pulled and applied
 * in cursor order. An expired cursor, an expired token, or a revision that
 * vanished mid-download restarts from a fresh snapshot and keeps local work.
 */
import { snapshotRevisionBatchSize } from '@notesapp/core';
import { routeNotFoundCode } from './protocol.ts';
import { bytesOfBase64 } from './bytes.ts';
import {
  LocalStorageError,
  type LocalFileKind,
  type LocalStore,
  type RemoteChange,
  type RemoteFileChange,
} from './local-port.ts';
import {
  SnapshotRestartNeeded,
  SyncFailedError,
  sendWithRetry,
  type ServiceOutcome,
  type SyncContext,
} from './queue.ts';

/** One pinned file of a snapshot page, in domain shape. */
export type SnapshotItemData = {
  readonly fileId: string;
  readonly revisionId: string;
  readonly path: string;
  readonly fileKind: LocalFileKind;
  readonly deleted: boolean;
};

/** One immutable revision body, in domain shape. */
export type RevisionData = {
  readonly fileId: string;
  readonly revisionId: string;
  readonly path: string;
  readonly fileKind: LocalFileKind;
  readonly deleted: boolean;
  readonly digest: string;
  readonly text: string | null;
  /** The whole document of the note, as base64, or `null` (record 0081). */
  readonly document: string | null;
  /** The generation of that document, or `null`. */
  readonly epoch: number | null;
  /** When the server accepted the revision, or `null` when unknown. */
  readonly serverTime: string | null;
};

/**
 * One ordered change record.
 *
 * `file` names the revision that a write accepted. `purgedFileId` names a file
 * that a permanent deletion removed; such a record has no revision to read,
 * because the revisions are gone. A record with neither is a membership
 * record, which only advances the cursor.
 */
export type ChangeRecord = {
  /**
   * The accepted change of one file, with the work that a note carries. The
   * feed states everything a reader needs, so no reader fetches a revision to
   * learn what changed (record 0081).
   */
  readonly file: RemoteFileChange | null;
  /** The file that a permanent deletion removed, or `null`. */
  readonly purgedFileId: string | null;
};

/** What download needs from the network. */
export type SnapshotNetwork = {
  start(signal: AbortSignal): Promise<
    ServiceOutcome<{
      readonly token: string;
      readonly cursor: string;
      readonly itemCount: number;
    }>
  >;
  page(
    token: string,
    position: number,
    signal: AbortSignal,
  ): Promise<
    ServiceOutcome<{
      readonly token: string;
      readonly cursor: string;
      readonly items: readonly SnapshotItemData[];
      readonly nextPosition: number | null;
    }>
  >;
  revision(
    revisionId: string,
    signal: AbortSignal,
  ): Promise<ServiceOutcome<RevisionData>>;
  revisionBatch?:
    | ((
        revisionIds: readonly string[],
        signal: AbortSignal,
      ) => Promise<ServiceOutcome<readonly RevisionData[]>>)
    | undefined;
  changes(
    cursor: string,
    signal: AbortSignal,
  ): Promise<
    ServiceOutcome<{
      readonly changes: readonly ChangeRecord[];
      readonly nextCursor: string;
    }>
  >;
};

/** How one pull run ended. `deferred` means transport failed; retry later. */
export type PullOutcome = 'done' | 'deferred' | 'paused' | 'access-lost';

/**
 * A fresh snapshot and the cursor it captured. `yield` states that a save
 * waits: the reads stopped, and the next staging keeps what they stored.
 */
type FreshSnapshot =
  | { readonly status: 'ready'; readonly cursor: string }
  | { readonly status: 'deferred' | 'paused' | 'access-lost' | 'yield' };

/**
 * Brings one workspace down to the current server state.
 *
 * Starts with a full snapshot when this device never synced, otherwise pulls
 * the ordered changes after the stored cursor. Returns `paused` when the
 * session expired and `access-lost` when reads are denied.
 */
export async function pullNew(
  local: LocalStore,
  accountId: string,
  workspaceId: string,
  net: SnapshotNetwork,
  ctx: SyncContext,
): Promise<PullOutcome> {
  return (await pullPage(local, accountId, workspaceId, net, ctx)).outcome;
}

/**
 * How many revisions a snapshot reads at a time (record 0176).
 *
 * Half of the six connections that a browser opens to one host, as the
 * precache of record 0044 takes, so a screen keeps a share of them.
 */
export const snapshotFetchConcurrency = 3;

/** The pages that one turn reads at most before it yields (record 0130). */
export const pagesPerTurn = 10;

/**
 * Reads feed pages until a page is empty, or until one turn is spent.
 *
 * One wake names no cursor, so it asks for every change after the stored one.
 * A page that held changes can have a successor, so the loop reads again, and
 * an empty page proves the end of the feed. `more` is true when the turn ended
 * before that proof, and the caller schedules another turn after it yields.
 * `saveWaits` ends the turn early after a page, so a save never waits for a
 * long backlog. Each page moves the cursor in its own transaction, as before.
 */
export async function pullPages(
  local: LocalStore,
  accountId: string,
  workspaceId: string,
  net: SnapshotNetwork,
  ctx: SyncContext,
  maxPages: number = pagesPerTurn,
  saveWaits: () => Promise<boolean> = () => Promise.resolve(false),
): Promise<{ readonly outcome: PullOutcome; readonly more: boolean }> {
  for (let page = 0; page < maxPages; page += 1) {
    const read = await pullPage(
      local,
      accountId,
      workspaceId,
      net,
      ctx,
      saveWaits,
    );
    if (read.outcome !== 'done' || !read.more)
      return { outcome: read.outcome, more: false };
    // A save that waits goes first: the turn ends between two pages, and
    // the next pass pushes before it reads on (record 0176).
    if (await saveWaits()) return { outcome: 'done', more: true };
  }
  return { outcome: 'done', more: true };
}

/** One page of the feed, and whether it held changes. */
async function pullPage(
  local: LocalStore,
  accountId: string,
  workspaceId: string,
  net: SnapshotNetwork,
  ctx: SyncContext,
  saveWaits: () => Promise<boolean> = () => Promise.resolve(false),
): Promise<{ readonly outcome: PullOutcome; readonly more: boolean }> {
  let cursor = await local.readCursor(accountId, workspaceId);
  for (let round = 0; round < 2; round += 1) {
    try {
      if (cursor === null) {
        const fresh = await fullSnapshot(
          local,
          accountId,
          workspaceId,
          net,
          ctx,
          saveWaits,
        );
        // A save that waits goes first, and a later pass stages a new plan
        // that keeps every revision this one read (record 0176).
        if (fresh.status === 'yield') return { outcome: 'done', more: true };
        if (fresh.status !== 'ready')
          return { outcome: fresh.status, more: false };
        cursor = fresh.cursor;
      }
      return await fetchAndApply(
        local,
        accountId,
        workspaceId,
        net,
        ctx,
        cursor,
      );
    } catch (error: unknown) {
      if (error instanceof SnapshotRestartNeeded && round === 0) {
        ctx.announce({ kind: 'snapshot-restart', reason: error.reason });
        cursor = null;
        continue;
      }
      throw error;
    }
  }
  throw new SyncFailedError('snapshot_failed', 0);
}

/**
 * Downloads a complete snapshot and activates it.
 *
 * Every page is read before anything is staged, so a failure leaves no
 * partial plan behind. Every revision body is stored before activation, so
 * activation either finds a complete snapshot or refuses it.
 */
async function fullSnapshot(
  local: LocalStore,
  accountId: string,
  workspaceId: string,
  net: SnapshotNetwork,
  ctx: SyncContext,
  saveWaits: () => Promise<boolean>,
): Promise<FreshSnapshot> {
  const started = await sendWithRetry(ctx, (signal) => net.start(signal));
  if (started === null) return { status: 'deferred' };
  if (!started.ok) {
    if (started.problem.status === 401) return { status: 'paused' };
    if (started.problem.status === 403 || started.problem.status === 404)
      return { status: 'access-lost' };
    throw new SyncFailedError(started.problem.code, started.problem.status);
  }
  const token = started.value.token;
  const revisionIds: string[] = [];
  let position = 0;
  for (;;) {
    const page = await sendWithRetry(ctx, (signal) =>
      net.page(token, position, signal),
    );
    if (page === null) return { status: 'deferred' };
    if (!page.ok) {
      if (page.problem.status === 401) return { status: 'paused' };
      if (page.problem.status === 403 || page.problem.status === 404)
        return { status: 'access-lost' };
      if (page.problem.status === 410)
        throw new SnapshotRestartNeeded('page-expired');
      throw new SyncFailedError(page.problem.code, page.problem.status);
    }
    for (const item of page.value.items) revisionIds.push(item.revisionId);
    if (page.value.nextPosition === null) break;
    position = page.value.nextPosition;
  }
  const missing = await local.stageSnapshot(
    accountId,
    workspaceId,
    token,
    revisionIds,
    started.value.cursor,
    ctx.owner ?? '',
  );
  // Reserve a group per reader. If the byte bound returns only part of
  // it, the same reader keeps the rest in order. A save can go first after
  // any response. A later pass reuses the staged bodies.
  let next = 0;
  let stop: FreshSnapshot | null = null;
  let failure: unknown = null;
  let batch = net.revisionBatch;
  const reader = async (): Promise<void> => {
    let remaining: readonly string[] = [];
    while (stop === null && failure === null) {
      if (remaining.length === 0) {
        remaining = missing.slice(
          next,
          next + (batch ? snapshotRevisionBatchSize : 1),
        );
        next += remaining.length;
      }
      const revisionId = remaining[0];
      if (revisionId === undefined) return;
      if (await saveWaits()) {
        stop ??= { status: 'yield' };
        return;
      }
      try {
        const readBatch = batch;
        const fetched = await sendWithRetry(ctx, async (signal) => {
          if (readBatch !== undefined) return readBatch(remaining, signal);
          const single = await net.revision(revisionId, signal);
          return single.ok ? { ok: true, value: [single.value] } : single;
        });
        if (fetched === null) {
          stop ??= { status: 'deferred' };
          return;
        }
        if (!fetched.ok) {
          // A request can reach an older replica during a rolling update.
          // The old server's route refusal is distinct from a missing revision.
          if (
            readBatch !== undefined &&
            fetched.problem.status === 404 &&
            fetched.problem.code === routeNotFoundCode
          ) {
            batch = undefined;
            continue;
          }
          if (fetched.problem.status === 401) {
            stop ??= { status: 'paused' };
            return;
          }
          if (fetched.problem.status === 403) {
            stop ??= { status: 'access-lost' };
            return;
          }
          if (fetched.problem.status === 404 || fetched.problem.status === 410)
            throw new SnapshotRestartNeeded('revision-purged');
          throw new SyncFailedError(
            fetched.problem.code,
            fetched.problem.status,
          );
        }
        if (
          fetched.value.length === 0 ||
          fetched.value.some(
            (revision, index) => revision.revisionId !== remaining[index],
          )
        )
          throw new SyncFailedError('snapshot_failed', 0);
        await local.storeSnapshotRevisions(
          accountId,
          workspaceId,
          fetched.value.map((revision) => ({
            token,
            revisionId: revision.revisionId,
            fileId: revision.fileId,
            path: revision.path,
            kind: revision.fileKind,
            deleted: revision.deleted,
            digest: revision.digest,
            text: revision.text,
            document:
              revision.document === null
                ? null
                : bytesOfBase64(revision.document),
            epoch: revision.epoch,
            serverTime: revision.serverTime,
          })),
        );
        remaining = remaining.slice(fetched.value.length);
      } catch (error: unknown) {
        failure ??= error;
        return;
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(snapshotFetchConcurrency, missing.length) },
      reader,
    ),
  );
  if (failure !== null) throw failure;
  if (stop !== null) return stop;
  try {
    await local.activateSnapshot(token);
  } catch (error: unknown) {
    if (error instanceof LocalStorageError && error.kind === 'aborted')
      throw new SnapshotRestartNeeded('incomplete');
    throw error;
  }
  ctx.announce({ kind: 'snapshot-activated', count: revisionIds.length });
  return { status: 'ready', cursor: started.value.cursor };
}

/**
 * Pulls one page of ordered changes and applies it.
 *
 * File changes resolve their immutable revision before anything is stored;
 * a revision that vanished since the change was recorded restarts from a
 * fresh snapshot. Records without a file only move the cursor.
 */
async function fetchAndApply(
  local: LocalStore,
  accountId: string,
  workspaceId: string,
  net: SnapshotNetwork,
  ctx: SyncContext,
  cursor: string,
): Promise<{ readonly outcome: PullOutcome; readonly more: boolean }> {
  const fed = await sendWithRetry(ctx, (signal) => net.changes(cursor, signal));
  if (fed === null) return { outcome: 'deferred', more: false };
  if (!fed.ok) {
    if (fed.problem.status === 401) return { outcome: 'paused', more: false };
    if (fed.problem.status === 403 || fed.problem.status === 404)
      return { outcome: 'access-lost', more: false };
    if (fed.problem.status === 410)
      throw new SnapshotRestartNeeded('cursor-expired');
    throw new SyncFailedError(fed.problem.code, fed.problem.status);
  }
  const files: RemoteChange[] = [];
  // One page can contain a note deletion and its later permanent deletion.
  // The purge removes the deletion revision before this device can fetch it.
  // Skip every earlier revision for that file and apply the final purge.
  const purgedFileIds = new Set(
    fed.value.changes.flatMap((change) =>
      change.purgedFileId === null ? [] : [change.purgedFileId],
    ),
  );
  for (const change of fed.value.changes) {
    const pointer = change.file;
    if (pointer === null) {
      // A purge carries no revision to read: the revisions are gone. The
      // record therefore travels on its own, so the local cache learns to
      // forget the file instead of only moving the cursor past it.
      files.push({ file: null, purgedFileId: change.purgedFileId });
      continue;
    }
    if (purgedFileIds.has(pointer.fileId)) continue;
    files.push({ file: pointer, purgedFileId: null });
  }
  try {
    await local.applyRemoteChanges(
      accountId,
      workspaceId,
      files,
      fed.value.nextCursor,
    );
  } catch (error: unknown) {
    // Accepted work that does not fit the document this device holds cannot
    // be repaired from the feed, which states only the work. The transaction
    // wrote nothing, and a snapshot carries the whole document of every note.
    if (error instanceof LocalStorageError && error.kind === 'stale')
      throw new SnapshotRestartNeeded('document-gap');
    throw error;
  }
  const fileCount = files.filter(
    (change) => change.file !== null || change.purgedFileId !== null,
  ).length;
  if (fileCount > 0)
    ctx.announce({ kind: 'changes-applied', count: fileCount });
  // A page that held a record, a membership record too, can have a successor.
  return { outcome: 'done', more: fed.value.changes.length > 0 };
}
