/**
 * What every server process of one installation shares besides the data
 * (record 0121): the attempt counters of the limited routes, and the right to
 * run one maintenance job.
 *
 * PostgreSQL already holds every other shared fact of the product, so it
 * holds these too. The counters live in `attempt_counters` and change through
 * `notesapp_count_attempt`, one statement that two processes cannot split. A
 * job runs under a session advisory lock that one process takes and the other
 * cannot, so one run happens once.
 */
import { OperationalError } from '@notesapp/core';
import pg from 'pg';
import { openPool } from './pool.ts';
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
  /** Closes every pooled connection. */
  close(): Promise<void>;
};

/** The longest key that the counter table stores. */
export const maxAttemptKeyLength = 512;

/** The lock key of one job, apart from every workspace and account lock. */
function jobLockName(job: string): string {
  return `notesapp:job:${job}`;
}

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
    max: options.poolSize ?? 4,
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

    async close() {
      await pool.end();
    },
  };
}
