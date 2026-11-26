/**
 * Account and workspace provisioning with the migration role.
 *
 * A new account and a new workspace exist before any member can read them, so
 * the runtime role's member policies cannot create them. Provisioning
 * therefore uses the schema owner connection. The bootstrap command builds on
 * these calls.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import type { InstallationRole, Role } from '@notesapp/core';
import { defaultAccountLimitBytes } from '@notesapp/core';
import {
  accounts,
  workspaceCursors,
  workspaceUsage,
  workspaces,
} from './schema.ts';

/** One workspace and its members. */
export type WorkspaceSeed = {
  readonly workspaceId: string;
  readonly name: string;
  readonly members: readonly {
    readonly accountId: string;
    readonly role: Role;
  }[];
};

/** What a provisioned account starts with. */
export type AccountSeed = {
  /**
   * The byte limit of the account (record 0112). When it is given, an account
   * that exists already takes it too, so a test can shrink the limit of an
   * account it made earlier.
   */
  readonly limitBytes?: bigint;
  /** The installation role, a member when it is not given. */
  readonly role?: InstallationRole;
};

/** Creates the account identity rows that do not exist yet. */
export async function provisionAccounts(
  migrationUrl: string,
  accountIds: readonly string[],
  seed: AccountSeed = {},
): Promise<void> {
  if (accountIds.length === 0) return;
  const client = new pg.Client({ connectionString: migrationUrl });
  await client.connect();
  try {
    const insert = drizzle({ client })
      .insert(accounts)
      .values(
        accountIds.map((id) => ({
          id,
          limitBytes: seed.limitBytes ?? defaultAccountLimitBytes,
          installationRole: seed.role ?? 'member',
        })),
      );
    await (seed.limitBytes === undefined
      ? insert.onConflictDoNothing()
      : insert.onConflictDoUpdate({
          target: accounts.id,
          set: { limitBytes: sql`excluded.limit_bytes` },
        }));
  } finally {
    await client.end();
  }
}

/**
 * Creates one workspace, its members, its usage record, and its cursor.
 *
 * Every account named in `members` must exist already.
 */
export async function provisionWorkspace(
  migrationUrl: string,
  seed: WorkspaceSeed,
): Promise<void> {
  const client = new pg.Client({ connectionString: migrationUrl });
  await client.connect();
  try {
    const db = drizzle({ client });
    await client.query('begin');
    try {
      await db
        .insert(workspaces)
        .values({ id: seed.workspaceId, name: seed.name })
        .onConflictDoNothing();
      await db
        .insert(workspaceUsage)
        .values({ workspaceId: seed.workspaceId, bytesUsed: 0n })
        .onConflictDoNothing();
      await db
        .insert(workspaceCursors)
        .values({ workspaceId: seed.workspaceId, lastCursor: 0n })
        .onConflictDoNothing();
      if (seed.members.length > 0) {
        // Upgrade tests also provision workspaces before the color column exists.
        await client.query(
          `insert into memberships (workspace_id, account_id, role)
           select $1::uuid, member.account_id, member.role
           from unnest($2::uuid[], $3::membership_role[]) as member(account_id, role)
           on conflict do nothing`,
          [
            seed.workspaceId,
            seed.members.map((member) => member.accountId),
            seed.members.map((member) => member.role),
          ],
        );
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  } finally {
    await client.end();
  }
}
