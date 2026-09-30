/**
 * The unit of work of the workspace store.
 *
 * One call to `runTransaction` opens one database transaction. It sets the
 * actor identity for that transaction only, then locks the workspace row. The
 * lock gives every write of one workspace a defined order, so the commit
 * ordered cursor cannot skip a transaction that commits late.
 *
 * `withAcceptSavepoint` runs the atomic write inside a savepoint, so an
 * expected domain failure such as a path conflict or a full workspace leaves
 * the open transaction usable and writes nothing. An infrastructure failure
 * throws `OperationalError` instead.
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import {
  OperationalError,
  type Actor,
  type Result,
  type TransactOptions,
} from '@notesapp/core';
import { commitWithHints, deferHintsSetting } from '../sync-hints.ts';
import {
  assertUuid,
  operational,
  postgresFailure,
  unreachable,
  WorkspaceUnavailableError,
} from './errors.ts';

/**
 * Assembles the repositories of one context over one open transaction.
 *
 * The workspace store builds the whole `WorkspaceTransaction` with it. The
 * owner side of published links builds its own smaller set, so both units of
 * work keep the one identity, lock, and failure mapping of this file.
 */
export type TransactionBuilder<Built> = (
  client: pg.PoolClient,
  db: NodePgDatabase,
  actor: Actor,
  workspaceId: string,
) => Built;

/**
 * Runs `run` inside one workspace transaction over a pooled connection.
 *
 * The connection is taken from the pool, the isolation and read-only modes are
 * set, the actor identity is set for this transaction only, the workspace lock
 * is taken for a write, and the workspace row is confirmed visible before the
 * callback runs. The transaction commits when the callback returns and rolls
 * back when it throws.
 */
export async function runTransaction<Built, T>(
  pool: pg.Pool,
  actor: Actor,
  workspaceId: string,
  run: (tx: Built) => Promise<T>,
  options: TransactOptions,
  build: TransactionBuilder<Built>,
): Promise<T> {
  assertUuid(actor.accountId, 'the actor account');
  assertUuid(workspaceId, 'the workspace');
  // A refused connection must not escape as a driver error: its message
  // repeats the host, the port, and the role of the connection URL. It is
  // also not an unexpected fault: the pool is full or the database is not
  // there, and both say that the store cannot be reached right now.
  let client: pg.PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    throw unreachable(error);
  }
  try {
    const db = drizzle({ client });
    await client.query('begin');
    try {
      // A snapshot capture reads the files and the high-water cursor from
      // one stable view, so concurrent commits land after its cursor.
      if (options.isolation === 'repeatable-read') {
        await client.query('set transaction isolation level repeatable read');
      }
      if (options.readOnly === true) {
        await client.query('set transaction read only');
      }
      // The feed trigger marks the hints of this transaction, and the commit
      // below sends them after it, so saves of different workspaces do not
      // wait for each other at commit (record 0142).
      await client.query(
        "select set_config('notesapp.account_id', $1, true), set_config($2, 'on', true)",
        [actor.accountId, deferHintsSetting],
      );
      // The workspace lock orders every write of one workspace, so the
      // commit ordered cursor cannot skip a transaction that commits late.
      // It is an advisory lock, not `SELECT ... FOR UPDATE`, because a
      // viewer holds no UPDATE right on the workspace row. A hash
      // collision between two workspaces costs extra serialization only.
      if (options.readOnly !== true) {
        await client.query(
          'select pg_advisory_xact_lock(hashtext($1::text)::bigint)',
          [workspaceId],
        );
      }
      const seen = await client.query<{ id: string }>(
        'select id from workspaces where id = $1',
        [workspaceId],
      );
      if (seen.rowCount === 0) {
        throw new WorkspaceUnavailableError(workspaceId);
      }
      const value = await run(build(client, db, actor, workspaceId));
      await commitWithHints(client);
      return value;
    } catch (error) {
      try {
        await client.query('rollback');
      } catch {
        // The connection is already unusable; report the first failure.
      }
      // Only a database failure becomes an infrastructure failure. A value
      // that the callback threw for its own reasons travels unchanged, so
      // a use case above this port keeps its own error type.
      if (error instanceof OperationalError) throw error;
      if (postgresFailure(error) !== null) throw operational(error);
      throw error;
    }
  } finally {
    client.release();
  }
}

/**
 * Runs the atomic write inside the `notesapp_accept` savepoint.
 *
 * The write runs inside a savepoint of the open transaction, so an expected
 * domain failure rolls back only the write and leaves the transaction usable.
 * A returned failure and a failure that `onError` maps both roll back to the
 * savepoint; a success releases it. An unmapped failure becomes an
 * infrastructure failure.
 */
export async function withAcceptSavepoint<T>(
  client: pg.PoolClient,
  run: () => Promise<Result<T>>,
  onError: (error: unknown) => Result<T> | null,
): Promise<Result<T>> {
  await client.query('savepoint notesapp_accept');
  try {
    const outcome = await run();
    if (!outcome.ok) {
      await client.query('rollback to savepoint notesapp_accept');
      return outcome;
    }
    await client.query('release savepoint notesapp_accept');
    return outcome;
  } catch (error) {
    await client.query('rollback to savepoint notesapp_accept');
    const mapped = onError(error);
    if (mapped !== null) return mapped;
    throw operational(error);
  }
}
