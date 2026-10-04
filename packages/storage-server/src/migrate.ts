/**
 * Applies the reviewed SQL migrations with the migration role.
 *
 * The migration role owns the schema. It is the only credential that may run
 * DDL. The runtime role that the application uses is created by the migration
 * itself and receives its password here, so no password is stored in a
 * committed SQL file.
 *
 * The command requires an explicit profile. See `profiles.ts` for the guards
 * and `docs/development/database.md` for the operator procedure.
 */
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { DocumentService } from '@notesapp/core';
import { createDocumentService } from './document-service.ts';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import {
  assertProfileDatabase,
  databaseName,
  parseProfile,
  type MigrationProfile,
} from './profiles.ts';
import { migratePortableMarkdown } from './portable-markdown-migration.ts';
import { migrateNoteDocuments } from './note-document-migration.ts';
import { migrateSearchIndex } from './search-index-migration.ts';

/** The name of the runtime role that the migration creates. */
export const runtimeRole = 'notesapp_app';

/**
 * The name of the identity role that the migration creates.
 *
 * It holds every right on the four Better Auth tables and no right anywhere
 * else. Only the connection that Better Auth owns uses it, so the application
 * cannot read a session token, a password hash, or a reset token.
 */
export const authRole = 'notesapp_auth';

/**
 * The schema version that a complete migration set reports.
 *
 * `notesapp_schema_version()` returns the number of entries in
 * `migrations/meta/_journal.json`. The readiness probe compares its answer
 * with this constant, so one value describes the required set.
 */
export const requiredSchemaVersion = 31;

/**
 * One PostgreSQL advisory lock serializes every migration run.
 *
 * This is a session lock because Drizzle can commit between migration files.
 * The fixed signed 64 bit key belongs only to the notesapp migration command.
 */
const migrationLockKey = '6178626538595505297';

/**
 * How many times a role password statement runs again after a catalog clash.
 *
 * The advisory lock above belongs to one database, but a role is a cluster
 * wide object. Two runs against two databases of one cluster therefore write
 * the same catalog row at the same time, and PostgreSQL refuses the second
 * one with `tuple concurrently updated`. The statement sets an absolute
 * value, so running it again is safe and it is the only remedy.
 */
const rolePasswordAttempts = 10;

/** The reviewed migration directory of this package. */
export function migrationsFolder(): string {
  return fileURLToPath(new URL('../migrations/', import.meta.url));
}

/** Whether PostgreSQL refused a statement because a catalog row was busy. */
function isBusyCatalogRow(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.includes('tuple concurrently updated')
  );
}

/**
 * Gives one role its password, and waits out a concurrent run.
 *
 * The statement runs outside a transaction, so a refusal leaves the session
 * usable and the next attempt starts from a clean state.
 */
async function setRolePassword(
  client: pg.Client,
  role: string,
  password: string,
): Promise<void> {
  // DDL cannot take a bind parameter, so PostgreSQL itself quotes the
  // literal and the result is executed as one statement.
  const built = await client.query<{ statement: string }>(
    'select format($1, $2::text) as statement',
    [`alter role ${role} with password %L`, password],
  );
  const statement = built.rows[0]?.statement;
  if (statement === undefined) {
    throw new Error(`notesapp: the ${role} password was not built.`);
  }
  for (let attempt = 1; ; attempt += 1) {
    try {
      await client.query(statement);
      return;
    } catch (error: unknown) {
      if (attempt >= rolePasswordAttempts || !isBusyCatalogRow(error))
        throw error;
      const wait = attempt * 25;
      await new Promise((accept) => setTimeout(accept, wait));
    }
  }
}

/** What one migration run needs. */
export type MigrationRun = {
  /** A connection URL of the migration role. */
  readonly databaseUrl: string;
  /** The password that the runtime role receives after the migrations apply. */
  readonly runtimePassword: string;
  /** The password that the identity role receives after they apply. */
  readonly authPassword: string;
  /**
   * The document service of this deployment. The migration of record 0084
   * writes the text of a note into its document, so it needs the same port
   * that the workspace uses.
   */
  readonly documents: DocumentService;
  /**
   * The migration directory, the reviewed one of this package by default. An
   * upgrade test names a copy that stops at an earlier release, so it can seed
   * the rows of that release before the rest applies.
   */
  readonly migrationsFolder?: string;
};

/**
 * Applies every pending migration and sets the runtime role password.
 *
 * Applying the same migrations again is a no operation, because Drizzle keeps
 * the applied set in its own bookkeeping table.
 */
export async function runMigrations(run: MigrationRun): Promise<void> {
  for (const [name, value] of [
    ['runtime', run.runtimePassword],
    ['identity', run.authPassword],
  ] as const) {
    if (value.length < 12) {
      throw new Error(
        `notesapp: the ${name} role password must have at least 12 characters.`,
      );
    }
  }
  if (run.runtimePassword === run.authPassword) {
    throw new Error(
      'notesapp: the runtime role and the identity role need different passwords.',
    );
  }
  const client = new pg.Client({ connectionString: run.databaseUrl });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1::bigint)', [
      migrationLockKey,
    ]);
    try {
      await migrate(drizzle(client), {
        migrationsFolder: run.migrationsFolder ?? migrationsFolder(),
      });
      for (const [role, password] of [
        [runtimeRole, run.runtimePassword],
        [authRole, run.authPassword],
      ] as const) {
        await setRolePassword(client, role, password);
      }
      await migratePortableMarkdown(run.databaseUrl, run.documents);
      await migrateNoteDocuments(run.databaseUrl, run.documents);
      await migrateSearchIndex(run.databaseUrl);
    } finally {
      await client.query('select pg_advisory_unlock($1::bigint)', [
        migrationLockKey,
      ]);
    }
  } finally {
    await client.end();
  }
}

/**
 * The connection values of the disposable Compose test service.
 *
 * They belong to `compose.test.yaml` and to no other service. The test profile
 * still refuses any database whose name does not start with `notesapp_test`,
 * so an overridden value cannot reach an operator database either.
 */
export const testDatabaseUrl =
  'postgres://notesapp_migrate:notesapp_migrate_test@127.0.0.1:55432/notesapp_test';
export const testRuntimePassword = 'notesapp_app_test_password';
export const testAuthPassword = 'notesapp_auth_test_password';

/** Reads a required environment value. */
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`notesapp: set ${name}.`);
  }
  return value;
}

/** Reads a secret from a protected operator file. */
async function readSecretFile(name: string): Promise<string> {
  const path = required(name);
  return (await readFile(path, 'utf8')).trim();
}

/** The connection URL and the runtime password of one profile. */
async function loadProfile(profile: MigrationProfile): Promise<MigrationRun> {
  if (profile === 'test') {
    return {
      databaseUrl: process.env['NOTESAPP_TEST_DATABASE_URL'] || testDatabaseUrl,
      runtimePassword:
        process.env['NOTESAPP_RUNTIME_PASSWORD'] || testRuntimePassword,
      authPassword:
        process.env['NOTESAPP_AUTH_DATABASE_PASSWORD'] || testAuthPassword,
      documents: createDocumentService(),
    };
  }
  return {
    databaseUrl: await readSecretFile('NOTESAPP_DATABASE_URL_FILE'),
    runtimePassword: await readSecretFile('NOTESAPP_RUNTIME_PASSWORD_FILE'),
    authPassword: await readSecretFile('NOTESAPP_AUTH_PASSWORD_FILE'),
    documents: createDocumentService(),
  };
}

/** The command entry point of `pnpm db:migrate --profile test|deploy`. */
export async function main(argv: readonly string[]): Promise<void> {
  const profile = parseProfile(argv);
  const run = await loadProfile(profile);
  assertProfileDatabase(profile, run.databaseUrl);
  await runMigrations(run);
  process.stdout.write(
    `notesapp: migrations applied to ${databaseName(run.databaseUrl)} (${profile} profile)\n`,
  );
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'notesapp: the migration failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
