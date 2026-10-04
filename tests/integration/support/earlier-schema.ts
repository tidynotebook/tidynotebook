/**
 * An installation that an earlier release migrated, for the upgrade tests.
 *
 * An upgrade test stops the migrations before one entry, writes what the
 * release before that entry wrote, then runs the whole set.
 */
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrationsFolder } from '@notesapp/storage-server';
import type { TestSession } from './database.ts';

/** A copy of the migration set that ends before one entry. */
export type EarlierMigrations = {
  /** The folder to pass as `migrationsFolder`. */
  readonly folder: string;
  /** Removes the copy. */
  remove(): Promise<void>;
};

/** The tags of the journal entries, in order. */
function readEntries(journal: unknown): string[] {
  if (journal === null || typeof journal !== 'object') return [];
  const entries: unknown = Object.fromEntries(Object.entries(journal))[
    'entries'
  ];
  if (!Array.isArray(entries)) return [];
  return entries.map((entry: unknown) => {
    if (entry === null || typeof entry !== 'object') return '';
    const tag: unknown = Object.fromEntries(Object.entries(entry))['tag'];
    return typeof tag === 'string' ? tag : '';
  });
}

/** The journal with its first `count` entries only. */
function withEntries(journal: unknown, count: number): unknown {
  if (journal === null || typeof journal !== 'object') return journal;
  const record: Record<string, unknown> = Object.fromEntries(
    Object.entries(journal),
  );
  const entries = record['entries'];
  return {
    ...record,
    entries: Array.isArray(entries) ? entries.slice(0, count) : [],
  };
}

/**
 * Copies the migration set and ends its journal before the entry `tag`.
 *
 * It fails loudly when the journal names no such entry, so a renamed
 * migration cannot turn an upgrade test into a fresh install.
 */
export async function migrationsBefore(
  tag: string,
): Promise<EarlierMigrations> {
  const folder = await mkdtemp(join(tmpdir(), 'notesapp-migrations-'));
  await cp(migrationsFolder(), folder, { recursive: true });
  const journalPath = join(folder, 'meta', '_journal.json');
  const journal: unknown = JSON.parse(await readFile(journalPath, 'utf8'));
  const upTo = readEntries(journal).indexOf(tag);
  if (upTo <= 0) {
    await rm(folder, { recursive: true, force: true });
    throw new Error(`notesapp: the migration journal names no ${tag}.`);
  }
  await writeFile(
    journalPath,
    JSON.stringify(withEntries(journal, upTo)),
    'utf8',
  );
  return {
    folder,
    remove: async () => {
      await rm(folder, { recursive: true, force: true });
    },
  };
}

/** The password account that Better Auth 1.7.0 to 1.7.2 wrote. */
export type IssuerAccount = {
  readonly email: string;
  /** The hash of the password, from the hasher of the auth instance. */
  readonly passwordHash: string;
  readonly emailVerified: boolean;
};

/**
 * Writes an identity user and its password account with the issuer that
 * Better Auth 1.7.0 to 1.7.2 wrote, `local:credential` (record 0135).
 *
 * The session must be the migration role, which owns the identity tables.
 * The answer is the identifier of the identity user.
 */
export async function writeIssuerAccount(
  session: TestSession,
  account: IssuerAccount,
): Promise<string> {
  const userId = randomUUID();
  await session.query(
    'insert into auth_user (id, name, email, email_verified) values ($1, $2, $2, $3)',
    [userId, account.email, account.emailVerified],
  );
  await session.query(
    `insert into auth_account (id, user_id, issuer, account_id, provider_id, password)
     values ($1, $2, 'local:credential', $2, 'credential', $3)`,
    [randomUUID(), userId, account.passwordHash],
  );
  return userId;
}

/**
 * Makes the first account the way a release before migration 0030 did.
 *
 * The registration function of those releases takes the byte limit and no
 * controls, so the store of this release cannot call it. The statement runs
 * with the runtime role, as the store did.
 */
export async function registerFirstAccountOfEarlierRelease(
  runtime: TestSession,
  authUserId: string,
  limitBytes: bigint,
): Promise<string | null> {
  const rows = await runtime.query<{ account: string | null }>(
    `select notesapp_register_account($1, 'first-run', null, $2, $3,
       'Personal', $4::bigint) as account`,
    [authUserId, randomUUID(), randomUUID(), limitBytes.toString()],
  );
  return rows[0]?.account ?? null;
}
