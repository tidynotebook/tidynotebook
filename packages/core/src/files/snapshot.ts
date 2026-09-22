/**
 * Domain services for consistent snapshots and incremental sync reads.
 *
 * A snapshot captures the accepted file metadata and the workspace high-water
 * cursor in one repeatable-read transaction. Its items are materialized rows
 * that name immutable revision identifiers, so a later commit cannot change
 * what a page shows. Pages are served from those rows in short separate
 * transactions; no database transaction stays open across network pages, and
 * every page rechecks the current membership.
 *
 * Incremental reads use commit ordered cursors. A cursor is a decimal string
 * of a bigint. Change records are kept for 90 days; an older cursor needs a
 * fresh snapshot and answers `snapshot_required`. Saved revision identifiers
 * stay valid beyond that window, and content transfer reuses `readRevision`
 * by immutable identifier, never by a later current head.
 */
import { authorize, type Actor } from '../identity/actor.ts';
import { fail, ok, type Result } from './model.ts';
import type {
  SnapshotPage,
  SnapshotStart,
  SyncPage,
  WorkspaceStore,
} from './ports.ts';

/**
 * The sync protocol version that this build speaks.
 *
 * The client sends it and the server serves it, so one build agrees with
 * itself by construction. Two deployments agree only when the client reads
 * the served list first; record 0086 states that check.
 */
export const syncProtocolVersion = 1;

/**
 * Sync protocol versions that this server accepts.
 *
 * `getSyncProtocol` answers this list, and `startSnapshot` refuses a version
 * outside it, so the capability answer and the refusal cannot disagree.
 */
export const supportedSyncVersions = [syncProtocolVersion] as const;

/** How long a materialized snapshot stays readable, in milliseconds. */
export const snapshotTtlMs = 15 * 60 * 1000;

/** Snapshot page size of a start call that asks for none. */
export const snapshotDefaultPageSize = 100;

/** Largest snapshot page that one page call returns. */
export const snapshotMaxPageSize = 500;

/** Change count of a sync read that asks for none. */
export const syncDefaultLimit = 100;

/** Largest change count that one sync read returns. */
export const syncMaxLimit = 500;

/**
 * Open snapshots kept per workspace before the oldest is evicted.
 *
 * This is the admission limit: a start call never fails for want of room, it
 * retires the oldest open snapshot of the workspace first.
 */
export const maxOpenSnapshots = 20;

/** Days that incremental change records are kept. */
export const syncRetentionDays = 90;

/**
 * Reads a commit ordered cursor.
 *
 * Returns the value as a bigint, or `null` when the text is not a decimal
 * cursor. Callers treat `null` as invalid input, never as cursor zero.
 */
export function parseSyncCursor(value: string): bigint | null {
  if (!/^[0-9]{1,32}$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/** Writes a commit ordered cursor as its decimal text. */
export function formatSyncCursor(value: bigint): string {
  return value.toString();
}

/** Keeps a requested snapshot page size inside the served range. */
export function snapshotPageSize(limit: number | null | undefined): number {
  if (limit === null || limit === undefined || !Number.isFinite(limit))
    return snapshotDefaultPageSize;
  return Math.min(Math.max(1, Math.trunc(limit)), snapshotMaxPageSize);
}

/** Keeps a requested sync change count inside the served range. */
export function syncLimit(limit: number | null | undefined): number {
  if (limit === null || limit === undefined || !Number.isFinite(limit))
    return syncDefaultLimit;
  return Math.min(Math.max(1, Math.trunc(limit)), syncMaxLimit);
}

/** Keeps a requested snapshot position at zero or above. */
export function snapshotPosition(position: number | null | undefined): number {
  if (position === null || position === undefined || !Number.isFinite(position))
    return 0;
  return Math.max(0, Math.trunc(position));
}

/** Whether the requested sync protocol version is accepted. */
export function isSupportedSyncVersion(version: number): boolean {
  return supportedSyncVersions.some((supported) => supported === version);
}

/** What a caller asks for when it starts a snapshot. */
export type StartSnapshotOptions = {
  readonly syncVersion: number;
  readonly pageSize?: number | null;
};

/**
 * Captures accepted metadata and the high-water cursor in one transaction.
 *
 * The version is rejected before any state is read or written. The capture
 * itself runs under repeatable read, so concurrent commits land after the
 * captured cursor and appear only in later incremental reads.
 */
export async function startSnapshot(
  store: WorkspaceStore,
  actor: Actor,
  workspaceId: string,
  options: StartSnapshotOptions,
): Promise<Result<SnapshotStart>> {
  if (!isSupportedSyncVersion(options.syncVersion))
    return fail('unsupported_version');
  return store.transact<Result<SnapshotStart>>(
    actor,
    workspaceId,
    async (tx) => {
      const role = await tx.role(actor.accountId);
      if (role === null) return fail('forbidden');
      const permitted = authorize(actor, workspaceId, role, 'read');
      if (!permitted.ok) return fail('forbidden');
      return ok(
        await tx.startSnapshot({
          pageSize: snapshotPageSize(options.pageSize),
        }),
      );
    },
    { isolation: 'repeatable-read' },
  );
}

/** What a caller asks for when it reads one snapshot page. */
export type SnapshotPageOptions = {
  readonly token: string;
  readonly position?: number | null;
  readonly limit?: number | null;
};

/**
 * Reads one page of a materialized snapshot.
 *
 * The membership is rechecked inside the page transaction. A missing token, an
 * expired snapshot, and a snapshot that a purge has invalidated all answer
 * `snapshot_required`: the client starts over and keeps its local work.
 */
export async function getSnapshotPage(
  store: WorkspaceStore,
  actor: Actor,
  workspaceId: string,
  options: SnapshotPageOptions,
): Promise<Result<SnapshotPage>> {
  return store.transact<Result<SnapshotPage>>(
    actor,
    workspaceId,
    async (tx) => {
      const role = await tx.role(actor.accountId);
      if (role === null) return fail('forbidden');
      const permitted = authorize(actor, workspaceId, role, 'read');
      if (!permitted.ok) return fail('forbidden');
      const page = await tx.snapshotPage(
        options.token,
        snapshotPosition(options.position),
        snapshotPageSize(options.limit),
      );
      if (page === null) return fail('snapshot_required');
      return ok(page);
    },
  );
}

/** What a caller asks for when it reads incremental changes. */
export type SyncChangesOptions = {
  readonly cursor: string;
  readonly limit?: number | null;
};

/**
 * Reads the ordered changes after a cursor the client already applied.
 *
 * A cursor that predates the retained window answers `snapshot_required`,
 * because the records between the cursor and the retained window are gone and
 * the client cannot prove that nothing was missed. An empty answer carries the
 * current high-water cursor, so the client polls with it.
 */
export async function getChanges(
  store: WorkspaceStore,
  actor: Actor,
  workspaceId: string,
  options: SyncChangesOptions,
): Promise<Result<SyncPage>> {
  const after = parseSyncCursor(options.cursor);
  if (after === null) return fail('invalid_content', []);
  return store.transact<Result<SyncPage>>(actor, workspaceId, async (tx) => {
    const role = await tx.role(actor.accountId);
    if (role === null) return fail('forbidden');
    const permitted = authorize(actor, workspaceId, role, 'read');
    if (!permitted.ok) return fail('forbidden');
    const feed = await tx.syncChanges(
      formatSyncCursor(after),
      syncLimit(options.limit),
    );
    const high = BigInt(feed.highWater);
    const oldest =
      feed.oldestRetained === null ? null : BigInt(feed.oldestRetained);
    // The client missed records that cleanup already removed.
    if (oldest !== null && after < oldest) return fail('snapshot_required');
    if (feed.changes.length === 0) {
      // No record after the cursor, yet the cursor is behind the high-water
      // mark: the records in between are gone, so this is a restart, not an
      // empty poll.
      if (after < high) return fail('snapshot_required');
      return ok({
        changes: [],
        nextCursor: after > high ? formatSyncCursor(after) : feed.highWater,
      });
    }
    const last = feed.changes[feed.changes.length - 1];
    if (last === undefined) return fail('snapshot_required');
    return ok({ changes: feed.changes, nextCursor: last.cursor });
  });
}
