/**
 * A disposable PostgreSQL database for storage integration tests.
 *
 * The helper creates one database inside the Compose test server, applies the
 * reviewed migrations with the migration role, and returns both connection
 * URLs. It refuses to run unless the server URL selects a `notesapp_test`
 * database, and it drops only the database that it created.
 *
 * Start the service first:
 *
 * ```sh
 * sudo -n docker compose -f compose.test.yaml up -d --wait
 * ```
 */
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import type {
  Actor,
  ChangesetInput,
  ContentRef,
  Grant,
  Result,
  RevisionInput,
  Role,
} from '@notesapp/core';
import { workspaceText, verifyActor } from '@notesapp/core';
import {
  createDocumentService,
  authRole,
  createTestDatabase,
  databaseName,
  dropTestDatabase,
  isTestDatabaseName,
  provisionAccounts,
  provisionWorkspace,
  runMigrations,
  runtimeRole,
  testAuthPassword,
  testDatabaseUrl,
  testRuntimePassword,
  withCredentials,
} from '@notesapp/storage-server';

/** One disposable database and the call that destroys it. */
export type TestDatabase = {
  /** The database name, always inside the `notesapp_test` namespace. */
  readonly name: string;
  /** A connection URL of the migration role, which owns the schema. */
  readonly migrationUrl: string;
  /** A connection URL of the runtime role, which the application uses. */
  readonly runtimeUrl: string;
  /**
   * A connection URL of the identity role, which only the Better Auth pool
   * uses. It holds every right on the four Better Auth tables and no right
   * anywhere else.
   */
  readonly authUrl: string;
  /** Drops this database and nothing else. */
  destroy(): Promise<void>;
};

/** The Compose test server URL, and the guard that keeps it disposable. */
export function testServerUrl(): string {
  const url = testDatabaseUrl;
  const name = databaseName(url);
  if (!isTestDatabaseName(name)) {
    throw new Error(
      `notesapp: the integration tests need a notesapp_test server database; found ${name}.`,
    );
  }
  return url;
}

/** The runtime role password of the test service. */
export function testPassword(): string {
  return testRuntimePassword;
}

/** The identity role password of the test service. */
export function testIdentityPassword(): string {
  return testAuthPassword;
}

/** Creates and migrates one disposable database. */
export async function createDisposableDatabase(): Promise<TestDatabase> {
  const serverUrl = testServerUrl();
  const name = `notesapp_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const migrationUrl = await createTestDatabase(serverUrl, name);
  try {
    await runMigrations({
      documents: createDocumentService(),
      databaseUrl: migrationUrl,
      runtimePassword: testPassword(),
      authPassword: testIdentityPassword(),
    });
  } catch (error) {
    await dropTestDatabase(serverUrl, name);
    throw error;
  }
  return {
    name,
    migrationUrl,
    runtimeUrl: withCredentials(migrationUrl, runtimeRole, testPassword()),
    authUrl: withCredentials(migrationUrl, authRole, testIdentityPassword()),
    destroy: async () => {
      await dropTestDatabase(serverUrl, name);
    },
  };
}

/**
 * Builds a verified actor for a test.
 *
 * `verifyActor` may return an `Actor` or a `Result<Actor>`, so this helper
 * accepts both shapes and fails loudly when the core rejects the input.
 */
export function testActor(accountId: string, grants: readonly Grant[]): Actor {
  const created: Actor | Result<Actor> = verifyActor(accountId, grants);
  if ('ok' in created) {
    if (!created.ok) {
      throw new Error(
        `notesapp: the test actor was rejected (${created.error.code}).`,
      );
    }
    return created.value;
  }
  return created;
}

/** Every workspace action, for a test actor that must not be scope limited. */
export const allActions = ['read', 'write', 'history', 'purge'] as const;

/** A verified actor with every action in one workspace. */
export function memberActor(accountId: string, workspaceId: string): Actor {
  return testActor(accountId, [{ workspaceId, actions: [...allActions] }]);
}

/**
 * Creates accounts and one workspace with the given members.
 *
 * `limitBytes` is the byte limit of every member account (record 0112). It
 * also replaces the limit of a member account that exists already, and the
 * limit counts every workspace that the account owns.
 */
export async function seedWorkspace(
  database: TestDatabase,
  workspaceId: string,
  members: readonly { readonly accountId: string; readonly role: Role }[],
  limitBytes?: bigint,
): Promise<void> {
  await provisionAccounts(
    database.migrationUrl,
    members.map((member) => member.accountId),
    limitBytes === undefined ? {} : { limitBytes },
  );
  await provisionWorkspace(database.migrationUrl, {
    workspaceId,
    name: `workspace ${workspaceId.slice(0, 8)}`,
    members,
  });
}

/**
 * Limits one account to its current use plus `freeBytes`, and answers the
 * call that puts its earlier limit back.
 *
 * The limit belongs to the account and counts every workspace it owns
 * (record 0112), so a test of a full workspace gives the owner a little room
 * above what it already uses, and a later test of the same file still writes.
 */
export async function limitAccountTo(
  database: TestDatabase,
  accountId: string,
  freeBytes: bigint,
): Promise<() => Promise<void>> {
  const session = await openSession(database.migrationUrl);
  try {
    const rows = await session.query<{ used: string; limit_bytes: string }>(
      `select coalesce((select sum(u.bytes_used) from workspace_usage u
                          join memberships m on m.workspace_id = u.workspace_id
                         where m.account_id = a.id and m.role = 'owner'), 0)::text
                as used,
              a.limit_bytes::text as limit_bytes
         from accounts a where a.id = $1`,
      [accountId],
    );
    const row = rows[0];
    if (row === undefined) throw new Error('notesapp: no such test account.');
    await session.query('update accounts set limit_bytes = $2 where id = $1', [
      accountId,
      (BigInt(row.used) + freeBytes).toString(),
    ]);
    const earlier = row.limit_bytes;
    return async () => {
      const restore = await openSession(database.migrationUrl);
      try {
        await restore.query(
          'update accounts set limit_bytes = $2 where id = $1',
          [accountId, earlier],
        );
      } finally {
        await restore.close();
      }
    };
  } finally {
    await session.close();
  }
}

/**
 * Writes `text` as the stored Markdown of one accepted revision.
 *
 * A limit of the grammar can be newer than a note, so a store can hold a note
 * that a commit of today refuses. No application call writes one, so the test
 * writes it as the schema owner, through the purge setting of the immutability
 * trigger, and inside one transaction.
 */
export async function storeTextOfAnEarlierRelease(
  database: TestDatabase,
  workspaceId: string,
  revisionId: string,
  text: string,
): Promise<void> {
  const session = await openSession(database.migrationUrl);
  try {
    await session.query('begin');
    await session.query("select set_config('notesapp.purge', 'on', true)");
    const rows = await session.query(
      `update contents c set markdown = $3
         from revisions r
        where r.workspace_id = $1 and r.id = $2
          and c.workspace_id = r.workspace_id and c.digest = r.content_digest
        returning c.digest`,
      [workspaceId, revisionId, text],
    );
    if (rows.length !== 1)
      throw new Error('notesapp: no stored content for that revision.');
    await session.query('commit');
  } finally {
    await session.close();
  }
}

/** The SHA-256 digest of UTF-8 Markdown, as the design defines it. */
export function markdownDigest(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * The content of one note that a test writes.
 *
 * A test seeds through the workspace, so it writes text the way the workspace
 * itself does: the text goes into the document of the note and keeps every
 * identity (record 0081).
 */
export function markdown(text: string): ContentRef {
  return workspaceText(text, 1);
}

/** What a test revision changes. */
export type RevisionSeed = {
  readonly id?: string;
  readonly fileId: string;
  readonly parents?: readonly string[];
  readonly path: string;
  readonly deleted?: boolean;
  readonly text?: string;
  readonly content?: ContentRef;
  readonly message?: string | null;
  readonly restoredFrom?: string | null;
};

/** Builds one revision input with test defaults. */
export function revision(seed: RevisionSeed): RevisionInput {
  return {
    id: seed.id ?? randomUUID(),
    fileId: seed.fileId,
    parents: seed.parents ?? [],
    path: seed.path,
    deleted: seed.deleted ?? false,
    content: seed.content ?? markdown(seed.text ?? `# ${seed.path}\n`),
    clientTime: new Date('2026-09-06T10:00:00.000Z').toISOString(),
    message: seed.message ?? null,
    restoredFrom: seed.restoredFrom ?? null,
  };
}

/** Builds one changeset input with test defaults. */
export function changeset(
  workspaceId: string,
  entries: readonly RevisionInput[],
  overrides: {
    readonly mutationId?: string;
    readonly deviceId?: string;
    readonly expectedHeads?: Readonly<Record<string, string | null>>;
  } = {},
): ChangesetInput {
  return {
    workspaceId,
    mutationId: overrides.mutationId ?? randomUUID(),
    deviceId: overrides.deviceId ?? 'test-device',
    expectedHeads:
      overrides.expectedHeads ??
      Object.fromEntries(entries.map((entry) => [entry.fileId, null])),
    revisions: entries,
  };
}

/** The SQLSTATE and message of a rejected statement. */
export type SqlFailure = {
  readonly code: string;
  readonly message: string;
};

/**
 * One raw SQL session.
 *
 * Row access policies, table rights, and immutability triggers are database
 * guarantees that no application call exposes, so the integration tests check
 * them through direct statements.
 */
export type TestSession = {
  query<Row extends object>(text: string, params?: unknown[]): Promise<Row[]>;
  /** Runs a statement that must fail, and returns why it failed. */
  failure(text: string, params?: unknown[]): Promise<SqlFailure>;
  close(): Promise<void>;
};

/** Reads the SQLSTATE and the message of a thrown driver failure. */
function sqlFailure(value: unknown): SqlFailure {
  if (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof value.code === 'string'
  ) {
    const message =
      'message' in value && typeof value.message === 'string'
        ? value.message
        : '';
    return { code: value.code, message };
  }
  throw value;
}

/**
 * Opens one SQL session.
 *
 * When `accountId` is given, the session identity is set for the whole
 * session, which is what a policy check needs. The application itself sets the
 * identity per transaction instead.
 */
export async function openSession(
  url: string,
  accountId?: string,
): Promise<TestSession> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  if (accountId !== undefined) {
    await client.query("select set_config('notesapp.account_id', $1, false)", [
      accountId,
    ]);
  }
  return {
    async query<Row extends object>(
      text: string,
      params?: unknown[],
    ): Promise<Row[]> {
      const result = await client.query<Row>(text, params);
      return result.rows;
    },
    async failure(text: string, params?: unknown[]): Promise<SqlFailure> {
      try {
        await client.query(text, params);
      } catch (error) {
        // A failed statement poisons the session only inside a transaction,
        // and these checks run outside one.
        return sqlFailure(error);
      }
      throw new Error(`notesapp: the statement was accepted: ${text}`);
    },
    async close(): Promise<void> {
      await client.end();
    },
  };
}
