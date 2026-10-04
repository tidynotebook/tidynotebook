/**
 * The composition root of the PostgreSQL workspace store.
 *
 * This module owns the connection pool and assembles the repositories over the
 * unit of work in `transaction.ts`. Each repository holds the SQL of one
 * context and implements its slice of the port; `createTransaction` spreads
 * them into the one `WorkspaceTransaction` that the unit of work hands to a
 * callback. The store keeps the same public surface as before the split.
 *
 * One call to `transact` opens one database transaction. It sets the actor
 * identity for that transaction only, then locks the workspace row, so the
 * commit ordered cursor cannot skip a transaction that commits late. `accept`
 * performs the atomic write inside a savepoint, so an expected domain failure
 * leaves the open transaction usable and writes nothing.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { openPool, poolSizes } from '../pool.ts';
import type {
  Actor,
  DocumentService,
  PublicationReader,
  PublicationStore,
  Result,
  TransactOptions,
  WorkspaceStore,
  WorkspaceTransaction,
} from '@notesapp/core';
import { runSyncCleanup } from '../snapshots.ts';
import { operational, unreachable } from './errors.ts';
import { runTransaction } from './transaction.ts';
import { membershipRepository } from './membership-repository.ts';
import { dailyNoteSettingsRepository } from './daily-note-settings-repository.ts';
import { templateSettingsRepository } from './template-settings-repository.ts';
import { notesRepository } from './notes-repository.ts';
import { historyRepository } from './history-repository.ts';
import { trashRepository } from './trash-repository.ts';
import { searchRepository } from './search-repository.ts';
import { syncRepository } from './sync-repository.ts';
import {
  probePublicationWrite,
  runPublicationRead,
} from './publication-transaction.ts';
import { publicationsRepository } from './publications-repository.ts';
import {
  publicationsOwnerRepository,
  runPublicationCleanup,
  type OwnedPublishedLink,
  type PublicationCleanupResult,
  type PublishedLinkDraft,
} from './publications-owner.ts';
import {
  reportPublication,
  type PublicationReport,
} from './publication-report.ts';
import {
  unlockPublication,
  type PublicationUnlockAttempt,
  type PublicationUnlockResult,
} from './publication-unlock.ts';

export {
  DatabaseFailure,
  isLockedRefusal,
  WorkspaceUnavailableError,
} from './errors.ts';
export type {
  OwnedPublishedLink,
  PublicationCleanupResult,
  PublishedLinkDraft,
} from './publications-owner.ts';
export type { PublicationReport } from './publication-report.ts';
export type {
  PublicationUnlockAttempt,
  PublicationUnlockResult,
} from './publication-unlock.ts';

/**
 * What one readiness read learns about the database behind the pool.
 *
 * The read answers instead of throwing, because an unreachable database is a
 * readiness answer and not a fault of the caller.
 */
export type DatabaseProbeResult = {
  /** True when a pooled connection answered a trivial statement. */
  readonly reachable: boolean;
  /**
   * The number of applied migrations, or `null` when the database gave no
   * answer. A reachable database with no answer has no migrated schema.
   */
  readonly schemaVersion: number | null;
};

/** Options of one storage pool. */
export type WorkspaceStoreOptions = {
  /** Maximum pooled connections. A test uses one to reuse one connection. */
  readonly poolSize?: number;
  /** Statement timeout of every pooled connection, in milliseconds. */
  readonly statementTimeoutMs?: number;
  /**
   * How long a caller waits for a free connection, in milliseconds.
   *
   * Defaults to {@link defaultConnectionTimeoutMs}.
   */
  readonly connectionTimeoutMs?: number;
};

/**
 * How long a caller waits for a connection of the pool.
 *
 * The pool used to wait without bound, both for a free slot and for the
 * connection itself. A request behind a full pool, or behind a host that
 * accepts nothing, therefore held its slot until the whole request bound
 * fired, which is ten seconds by default and longer for an upload. Every
 * request behind it waited as well, so one unreachable database turned into a
 * queue that the deployment could not drain.
 *
 * Five seconds is longer than any healthy wait. A connection to a database on
 * the same host opens in single milliseconds, and a pool that is busy hands
 * over a slot as soon as one transaction ends, which is bounded by the
 * statement timeout. A wait longer than this means the database is not there
 * or the pool is full, and both of those are answered and not waited out.
 */
export const defaultConnectionTimeoutMs = 5000;

/**
 * The links of one workspace, as their owner reads and changes them.
 *
 * The owner path holds a verified actor, so each call opens one workspace
 * transaction with the identity of that actor. The reader path of
 * `publications` below holds no actor and never reaches these calls.
 */
export type PublishedLinkStore = {
  /** Writes one more link of this workspace, or refuses as the rule decided. */
  create(
    actor: Actor,
    workspaceId: string,
    draft: PublishedLinkDraft,
  ): Promise<Result<OwnedPublishedLink>>;
  /** Every link of this workspace, newest first, and no digest of any. */
  list(
    actor: Actor,
    workspaceId: string,
  ): Promise<readonly OwnedPublishedLink[]>;
  /** Stops one link of this workspace at `at`. */
  revoke(
    actor: Actor,
    workspaceId: string,
    publicationId: string,
    at: Date,
  ): Promise<Result<OwnedPublishedLink>>;
};

/** A workspace store and the calls that a process needs to manage its pool. */
export type WorkspaceStoreHandle = WorkspaceStore & {
  /**
   * The read-only store of the reader path.
   *
   * It is the `PublicationStore` port of `packages/core`. Its transaction is
   * marked read only and holds no actor, which is refusal 4 of decision 0031.
   */
  publications: PublicationStore;
  /** The owner side of published links, which needs a verified actor. */
  publishedLinks: PublishedLinkStore;
  /**
   * Turns the password of one link into a reading ticket.
   *
   * It is the one write of the published boundary, so it opens a transaction
   * of its own rather than the read-only unit of work above. The password
   * digest stays inside this package: the caller passes a callback that
   * answers whether the password matches, and it receives no digest of any
   * kind. See `publication-unlock.ts`.
   */
  unlockPublication(
    attempt: PublicationUnlockAttempt,
  ): Promise<PublicationUnlockResult>;
  /**
   * Stores one report of a link that opens now, or nothing for any other
   * token. It is the second write of the published boundary (record 0119),
   * one statement that calls one function. See `publication-report.ts`.
   */
  reportPublication(report: PublicationReport): Promise<void>;
  /**
   * Removes every link that stopped before `cutoff` and every expired ticket.
   *
   * The hourly cleanup of `apps/server` calls it. A revoked link and an
   * expired link stop opening at once, because the resolve rule reads the
   * record on every request, so this run only takes the dead record away.
   */
  cleanupPublications(cutoff: Date): Promise<PublicationCleanupResult>;
  /**
   * The SQLSTATE that PostgreSQL answers for a write inside the read-only
   * publication transaction.
   *
   * A guarantee that no test can see is a comment, so this call makes refusal
   * 4 of decision 0031 observable, as `readPooledIdentity` below makes the
   * absence of an identity leak observable. The attempted write can leave no
   * row behind: see `publication-transaction.ts`.
   */
  probePublicationWrite(): Promise<string>;
  /**
   * Removes expired snapshots and change records older than the retention.
   *
   * Revisions, contents, receipts, and purge markers are left alone, so saved
   * history stays valid beyond the event window. Returns how many snapshot
   * rows and change rows were removed.
   */
  cleanupSync(now: Date): Promise<{
    expiredSnapshots: number;
    oldChanges: number;
  }>;
  /**
   * The identity setting of one pooled connection outside a transaction.
   *
   * The value must be `null`. The transaction identity is set with the local
   * flag of `set_config`, so it disappears at commit or rollback and cannot
   * reach the next user of the connection.
   *
   * The call takes whichever connection the pool hands out, so it proves the
   * absence of a leak only at pool size 1, where that is the connection the
   * earlier transaction used.
   */
  readPooledIdentity(): Promise<string | null>;
  /**
   * Reads the state of the database through one pooled connection.
   *
   * The readiness probe of the server calls it on every probe request, so it
   * borrows a connection from the pool that already serves the workspace
   * traffic and opens none of its own. It runs a trivial statement, so a pool
   * that hands over a connection cannot report a database that answers
   * nothing.
   */
  probeDatabase(): Promise<DatabaseProbeResult>;
  /** Closes every pooled connection. */
  close(): Promise<void>;
};

/** The answer of a read that no pooled connection could complete. */
const unreachableDatabase: DatabaseProbeResult = {
  reachable: false,
  schemaVersion: null,
};

/** Builds the port implementation over one open transaction. */
function createTransaction(
  client: pg.PoolClient,
  db: NodePgDatabase,
  actor: Actor,
  workspaceId: string,
  documents: DocumentService,
): WorkspaceTransaction {
  const context = { client, db, actor, workspaceId, documents };
  return {
    ...membershipRepository(context),
    ...dailyNoteSettingsRepository(context),
    ...templateSettingsRepository(context),
    ...notesRepository(context),
    ...historyRepository(context),
    ...trashRepository(context),
    ...searchRepository(context),
    ...syncRepository(context),
  };
}

/** Opens a workspace store over one PostgreSQL connection pool. */
export function openWorkspaceStore(
  databaseUrl: string,
  documents: DocumentService,
  options: WorkspaceStoreOptions = {},
): WorkspaceStoreHandle {
  const pool = openPool({
    connectionString: databaseUrl,
    max: options.poolSize ?? poolSizes.content,
    connectionTimeoutMillis:
      options.connectionTimeoutMs ?? defaultConnectionTimeoutMs,
    ...(options.statementTimeoutMs === undefined
      ? {}
      : { statement_timeout: options.statementTimeoutMs }),
  });

  /** Opens one connection of the pool for a call that is not a transaction. */
  const withClient = async <T>(
    run: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> => {
    let client: pg.PoolClient;
    try {
      client = await pool.connect();
    } catch (error) {
      throw unreachable(error);
    }
    try {
      return await run(client);
    } catch (error) {
      throw operational(error);
    } finally {
      client.release();
    }
  };

  return {
    documents,
    async transact<T>(
      actor: Actor,
      workspaceId: string,
      run: (tx: WorkspaceTransaction) => Promise<T>,
      options: TransactOptions = {},
    ): Promise<T> {
      return runTransaction(
        pool,
        actor,
        workspaceId,
        run,
        options,
        (client, db, transactionActor, scope) =>
          createTransaction(client, db, transactionActor, scope, documents),
      );
    },

    publications: {
      read<T>(run: (reader: PublicationReader) => Promise<T>): Promise<T> {
        return runPublicationRead(pool, run, publicationsRepository);
      },
    },

    publishedLinks: {
      create(actor, workspaceId, draft) {
        return runTransaction(
          pool,
          actor,
          workspaceId,
          (owner) => owner.create(draft),
          {},
          publicationsOwnerRepository,
        );
      },
      list(actor, workspaceId) {
        return runTransaction(
          pool,
          actor,
          workspaceId,
          (owner) => owner.list(),
          {},
          publicationsOwnerRepository,
        );
      },
      revoke(actor, workspaceId, publicationId, at) {
        return runTransaction(
          pool,
          actor,
          workspaceId,
          (owner) => owner.revoke(publicationId, at),
          {},
          publicationsOwnerRepository,
        );
      },
    },

    unlockPublication(
      attempt: PublicationUnlockAttempt,
    ): Promise<PublicationUnlockResult> {
      return unlockPublication(pool, attempt);
    },

    reportPublication(report: PublicationReport): Promise<void> {
      return reportPublication(pool, report);
    },

    async cleanupPublications(cutoff: Date): Promise<PublicationCleanupResult> {
      return withClient((client) => runPublicationCleanup(client, cutoff));
    },

    async probePublicationWrite(): Promise<string> {
      return probePublicationWrite(pool, {
        ticketDigest: createHash('sha256')
          .update(randomUUID(), 'utf8')
          .digest('hex'),
        workspaceId: randomUUID(),
        publicationId: randomUUID(),
      });
    },

    async cleanupSync(
      now: Date,
    ): Promise<{ expiredSnapshots: number; oldChanges: number }> {
      return withClient((client) => runSyncCleanup(client, now));
    },

    async readPooledIdentity(): Promise<string | null> {
      const client = await pool.connect();
      try {
        const result = await client.query<{ value: string | null }>(
          "select nullif(current_setting('notesapp.account_id', true), '') as value",
        );
        return result.rows[0]?.value ?? null;
      } finally {
        client.release();
      }
    },

    async probeDatabase(): Promise<DatabaseProbeResult> {
      let client: pg.PoolClient;
      try {
        client = await pool.connect();
      } catch {
        return unreachableDatabase;
      }
      try {
        await client.query('select 1');
      } catch {
        // A connection that cannot answer this must not go back to the pool,
        // so the probe destroys it and the next caller gets a new one.
        client.release(true);
        return unreachableDatabase;
      }
      try {
        const result = await client.query<{ version: number }>(
          'select public.notesapp_schema_version() as version',
        );
        return { reachable: true, schemaVersion: result.rows[0]?.version ?? 0 };
      } catch {
        // The database answers, so it is reachable. It reports no version,
        // which the migration check reads as an unmigrated schema.
        return { reachable: true, schemaVersion: null };
      } finally {
        client.release();
      }
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}
