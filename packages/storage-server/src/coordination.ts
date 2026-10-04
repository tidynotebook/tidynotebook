/**
 * What every server process of one installation shares besides the data
 * (record 0121): the attempt counters of the limited routes, the right to
 * run one maintenance job, the reservations of the open notice streams
 * (record 0129), and the archive jobs that run (record 0170).
 *
 * PostgreSQL already holds every other shared fact of the product, so it
 * holds these too. The counters live in `attempt_counters` and change through
 * `notesapp_count_attempt`, one statement that two processes cannot split. A
 * job runs under a session advisory lock that one process takes and the other
 * cannot, so one run happens once.
 */
import { OperationalError } from '@notesapp/core';
import pg from 'pg';
import { openPool, poolSizes } from './pool.ts';
import { defaultConnectionTimeoutMs } from './workspace-store/index.ts';

/** The count of one key and the milliseconds left in its window. */
export type AttemptCount = {
  readonly current: number;
  readonly ttl: number;
};

/** The shared state of the server processes of one installation. */
export type CoordinationHandle = {
  /** Counts one attempt against `key` and answers the state after it. */
  countAttempt(key: string, windowMs: number): Promise<AttemptCount>;
  /** Answers the state of `key` without counting an attempt against it. */
  readAttempt(key: string, windowMs: number): Promise<AttemptCount>;
  /** Deletes the counters whose window started before `before`. */
  pruneAttempts(before: Date): Promise<number>;
  /**
   * Runs `run` when no other process runs the job of this name, and answers
   * whether it ran. A process that finds the job running skips this run.
   */
  runExclusive(job: string, run: () => Promise<void>): Promise<boolean>;
  /**
   * Runs `run` while no other process runs work of the same `key`, and
   * waits for such work to end first. It answers what `run` answers, and
   * refuses with an unavailable error when the wait passes
   * `serialWaitTimeoutMs`.
   */
  runSerialized<T>(key: string, run: () => Promise<T>): Promise<T>;
  /**
   * Reserves one notice stream of an account, and answers false when the
   * account already holds `limit` live streams in any process.
   */
  reserveStream(
    id: string,
    accountId: string,
    ttlMs: number,
    limit: number,
  ): Promise<boolean>;
  /** Moves the expiry of a reservation, and answers false when it is gone. */
  renewStream(id: string, ttlMs: number): Promise<boolean>;
  /** Ends a reservation. Ending one that is gone does nothing. */
  releaseStream(id: string): Promise<void>;
  /** Deletes the reservations that expired, and answers how many. */
  pruneStreams(): Promise<number>;
  /**
   * Reserves one archive job of an account, and answers `reserved`, or the
   * limit that refused it: `account` or `installation` (record 0170).
   *
   * @param diskBytes the most bytes that the job may write to the storage
   *   volume. A reserved job answers the sum of this value over every other
   *   live job, read under the lock of the reservation (migration 0029).
   */
  reserveArchiveJob(
    id: string,
    accountId: string,
    ttlMs: number,
    limits: { readonly account: number; readonly installation: number },
    diskBytes: number,
  ): Promise<ArchiveJobReservation>;
  /** Moves the expiry of a job, and answers false when it expired. */
  renewArchiveJob(id: string, ttlMs: number): Promise<boolean>;
  /** Ends a job. Ending one that is gone does nothing. */
  releaseArchiveJob(id: string): Promise<void>;
  /** Closes every pooled connection. */
  close(): Promise<void>;
};

/**
 * The answer of one reservation of an archive job.
 *
 * A reserved job carries `otherDiskBytes`, the disk that every other live job
 * may still write, so an import counts it before it takes a body.
 */
export type ArchiveJobReservation =
  | { readonly state: 'reserved'; readonly otherDiskBytes: number }
  | { readonly state: 'account' | 'installation' };

/** Reads one row of `notesapp_reserve_archive_job`. */
export function archiveReservation(row: {
  readonly state?: unknown;
  readonly other_disk_bytes?: unknown;
}): ArchiveJobReservation {
  const { state } = row;
  if (state === 'account' || state === 'installation') return { state };
  // PostgreSQL sends a bigint as a decimal string.
  const bytes =
    typeof row.other_disk_bytes === 'string' &&
    /^\d+$/.test(row.other_disk_bytes)
      ? Number(row.other_disk_bytes)
      : Number.NaN;
  if (state === 'reserved' && Number.isSafeInteger(bytes))
    return { state, otherDiskBytes: bytes };
  throw new OperationalError(
    'unexpected',
    'notesapp: the archive job reservation answered an unknown state.',
  );
}

/** The longest key that the counter table stores. */
export const maxAttemptKeyLength = 512;

/** The lock key of one job, apart from every workspace and account lock. */
function jobLockName(job: string): string {
  return `notesapp:job:${job}`;
}

/** The lock key of one serialized work, apart from every other lock. */
function serialLockName(key: string): string {
  return `notesapp:serial:${key}`;
}

/** How long a serialized work waits for the work before it. */
export const serialWaitTimeoutMs = 30_000;

/** Reads one count row of a counter function. */
function countOf(
  rows: readonly { current: number; ttl_ms: number }[],
): AttemptCount {
  const row = rows[0];
  return row === undefined
    ? { current: 0, ttl: 0 }
    : { current: row.current, ttl: row.ttl_ms };
}

/** Opens the shared state of one installation over the runtime role. */
export function openCoordination(
  databaseUrl: string,
  options: { readonly poolSize?: number } = {},
): CoordinationHandle {
  const pool = openPool({
    connectionString: databaseUrl,
    max: options.poolSize ?? poolSizes.coordination,
    connectionTimeoutMillis: defaultConnectionTimeoutMs,
  });

  /** Refuses a key that the table would refuse, before it reaches SQL. */
  const checkKey = (key: string): void => {
    if (key.length === 0 || key.length > maxAttemptKeyLength)
      throw new OperationalError(
        'unexpected',
        'notesapp: an attempt key has no usable length.',
      );
  };

  return {
    async countAttempt(key, windowMs) {
      checkKey(key);
      const result = await pool.query<{ current: number; ttl_ms: number }>(
        'select current, ttl_ms from notesapp_count_attempt($1, $2)',
        [key, Math.max(1, Math.round(windowMs))],
      );
      return countOf(result.rows);
    },

    async readAttempt(key, windowMs) {
      checkKey(key);
      const result = await pool.query<{ current: number; ttl_ms: number }>(
        'select current, ttl_ms from notesapp_read_attempt($1, $2)',
        [key, Math.max(1, Math.round(windowMs))],
      );
      return countOf(result.rows);
    },

    async pruneAttempts(before) {
      const result = await pool.query<{ removed: number }>(
        'select notesapp_prune_attempts($1) as removed',
        [before.toISOString()],
      );
      return result.rows[0]?.removed ?? 0;
    },

    async runExclusive(job, run) {
      let client: pg.PoolClient;
      try {
        client = await pool.connect();
      } catch {
        throw new OperationalError(
          'unavailable',
          'notesapp: the coordination store is not reachable.',
        );
      }
      try {
        // A session lock, because a job runs many transactions of its own on
        // other pools. It lasts until the unlock below or the end of this
        // connection, so a process that dies mid-run frees the job.
        const taken = await client.query<{ taken: boolean }>(
          'select pg_try_advisory_lock(hashtext($1)::bigint) as taken',
          [jobLockName(job)],
        );
        if (taken.rows[0]?.taken !== true) return false;
        try {
          await run();
          return true;
        } finally {
          await client.query(
            'select pg_advisory_unlock(hashtext($1)::bigint)',
            [jobLockName(job)],
          );
        }
      } finally {
        client.release();
      }
    },

    async runSerialized(key, run) {
      checkKey(key);
      let client: pg.PoolClient;
      try {
        client = await pool.connect();
      } catch {
        throw new OperationalError(
          'unavailable',
          'notesapp: the coordination store is not reachable.',
        );
      }
      let failed = false;
      try {
        // A session lock, as a job takes, so the work may run calls of its
        // own outside this connection. The wait is bounded, and a process
        // that dies frees the lock with its connection.
        try {
          await client.query(`select set_config('lock_timeout', $1, false)`, [
            `${String(serialWaitTimeoutMs)}ms`,
          ]);
          await client.query('select pg_advisory_lock(hashtext($1)::bigint)', [
            serialLockName(key),
          ]);
        } catch {
          failed = true;
          throw new OperationalError(
            'unavailable',
            'notesapp: other work of the same kind did not end in time.',
          );
        }
        try {
          return await run();
        } finally {
          await client.query(
            'select pg_advisory_unlock(hashtext($1)::bigint)',
            [serialLockName(key)],
          );
        }
      } finally {
        if (!failed)
          await client
            .query(`select set_config('lock_timeout', '0', false)`)
            .catch(() => undefined);
        client.release(failed);
      }
    },

    async reserveStream(id, accountId, ttlMs, limit) {
      const result = await pool.query<{ reserved: boolean }>(
        'select notesapp_reserve_stream($1, $2, $3, $4) as reserved',
        [id, accountId, Math.max(1, Math.round(ttlMs)), limit],
      );
      return result.rows[0]?.reserved === true;
    },

    async renewStream(id, ttlMs) {
      const result = await pool.query<{ renewed: boolean }>(
        'select notesapp_renew_stream($1, $2) as renewed',
        [id, Math.max(1, Math.round(ttlMs))],
      );
      return result.rows[0]?.renewed === true;
    },

    async releaseStream(id) {
      await pool.query('select notesapp_release_stream($1)', [id]);
    },

    async pruneStreams() {
      const result = await pool.query<{ removed: number }>(
        'select notesapp_prune_streams() as removed',
      );
      return result.rows[0]?.removed ?? 0;
    },

    async reserveArchiveJob(id, accountId, ttlMs, limits, diskBytes) {
      if (!Number.isSafeInteger(diskBytes) || diskBytes < 0)
        throw new OperationalError(
          'unexpected',
          'notesapp: the disk of an archive job is not a byte count.',
        );
      const result = await pool.query<{
        state: unknown;
        other_disk_bytes: unknown;
      }>(
        'select state, other_disk_bytes from notesapp_reserve_archive_job($1, $2, $3, $4, $5, $6)',
        [
          id,
          accountId,
          Math.max(1, Math.round(ttlMs)),
          limits.account,
          limits.installation,
          diskBytes,
        ],
      );
      return archiveReservation(result.rows[0] ?? {});
    },

    async renewArchiveJob(id, ttlMs) {
      const result = await pool.query<{ renewed: boolean }>(
        'select notesapp_renew_archive_job($1, $2) as renewed',
        [id, Math.max(1, Math.round(ttlMs))],
      );
      return result.rows[0]?.renewed === true;
    },

    async releaseArchiveJob(id) {
      await pool.query('select notesapp_release_archive_job($1)', [id]);
    },

    async close() {
      await pool.end();
    },
  };
}
