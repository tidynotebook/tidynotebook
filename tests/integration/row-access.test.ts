import { acceptWithDocuments } from '@notesapp/core';
/**
 * Row level security under the runtime role.
 *
 * The runtime role is the credential that the application server uses. It has
 * no DDL right, it cannot bypass row security, and it cannot run a migration.
 * Every check below therefore uses that role, not the schema owner.
 *
 * The application rules already scope every read and write, so these policies
 * are defence in depth: these checks prove that the database refuses the same
 * things on its own, for every account of the installation.
 *
 * Start the service first:
 *
 * ```sh
 * sudo -n docker compose -f compose.test.yaml up -d --wait
 * ```
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  createDocumentService,
  openWorkspaceStore,
  runMigrations,
  type WorkspaceStoreHandle,
} from '@notesapp/storage-server';
import {
  changeset,
  createDisposableDatabase,
  memberActor,
  openSession,
  revision,
  seedWorkspace,
  type TestDatabase,
  type TestSession,
} from './support/database.ts';

/** Every workspace scoped table that the policies protect. */
const scopedTables = [
  'memberships',
  'workspace_usage',
  'workspace_cursors',
  'files',
  'live_paths',
  'contents',
  'revisions',
  'revision_parents',
  'changesets',
  'mutation_receipts',
  'purge_markers',
  'sync_changes',
  'snapshots',
  'snapshot_items',
  'search_index',
  'attachment_objects',
  'publications',
  'reading_tickets',
] as const;

/** One seeded workspace and the identifiers that the checks use. */
type Seeded = {
  readonly workspaceId: string;
  readonly accountId: string;
  readonly fileId: string;
  readonly firstRevisionId: string;
  readonly headRevisionId: string;
};

const database: TestDatabase = await createDisposableDatabase();
const store: WorkspaceStoreHandle = openWorkspaceStore(
  database.runtimeUrl,
  createDocumentService(),
  {
    poolSize: 4,
  },
);

/** Fills every scoped table of one workspace. */
async function seedEverything(): Promise<Seeded> {
  const workspaceId = randomUUID();
  const accountId = randomUUID();
  await seedWorkspace(database, workspaceId, [{ accountId, role: 'owner' }]);
  const actor = memberActor(accountId, workspaceId);
  const first = revision({ fileId: randomUUID(), path: 'notes/first.md' });
  const second = revision({
    fileId: first.fileId,
    parents: [first.id],
    path: 'notes/first.md',
    text: '# second body\n',
  });
  const write = async (
    entries: Parameters<typeof changeset>[1],
    digest: string,
  ): Promise<void> => {
    const result = await store.transact(actor, workspaceId, (tx) =>
      acceptWithDocuments(
        store.documents,
        tx,
        actor,
        changeset(workspaceId, entries),
        digest,
      ),
    );
    if (!result.ok) assert.fail(`the seed was rejected: ${result.error.code}`);
  };
  await write([first], `seed-${workspaceId}-1`);
  await write([second], `seed-${workspaceId}-2`);

  const session = await openSession(database.migrationUrl);
  try {
    await session.query(
      `insert into attachment_objects (workspace_id, id, digest, size, media_type, state)
       values ($1, $2, 'sha256-object', 12, 'image/png', 'finalized')`,
      [workspaceId, randomUUID()],
    );
    await session.query(
      'insert into purge_markers (workspace_id, file_id) values ($1, $2)',
      [workspaceId, randomUUID()],
    );
    await session.query(
      `insert into snapshots (token_hash, workspace_id, account_id, cursor, item_count, page_size, expires_at)
       values ($1, $2, $3, 2, 1, 100, now() + interval '15 minutes')`,
      [`snapshot-${workspaceId}`, workspaceId, accountId],
    );
    await session.query(
      `insert into snapshot_items (token_hash, ordinal, workspace_id, file_id, revision_id)
       values ($1, 0, $2, $3, $4)`,
      [`snapshot-${workspaceId}`, workspaceId, first.fileId, second.id],
    );
    const publicationId = randomUUID();
    await session.query(
      `insert into publications
          (workspace_id, id, owner_account_id, token_digest, scope_kind, scope_path)
       values ($1, $2, $3, encode(sha256($4::text::bytea), 'hex'), 'folder', 'notes')`,
      [workspaceId, publicationId, accountId, randomUUID()],
    );
    await session.query(
      `insert into reading_tickets
          (ticket_digest, workspace_id, publication_id, expires_at)
       values (encode(sha256($1::text::bytea), 'hex'), $2, $3, now() + interval '12 hours')`,
      [randomUUID(), workspaceId, publicationId],
    );
  } finally {
    await session.close();
  }

  return {
    workspaceId,
    accountId,
    fileId: first.fileId,
    firstRevisionId: first.id,
    headRevisionId: second.id,
  };
}

/** Counts the rows of one table that a session can read. */
async function visible(session: TestSession, table: string): Promise<number> {
  const rows = await session.query<{ total: number }>(
    `select count(*)::int as total from ${table}`,
  );
  return rows[0]?.total ?? -1;
}

/** Counts the readable rows of one table inside one workspace. */
async function visibleIn(
  session: TestSession,
  table: string,
  workspaceId: string,
): Promise<number> {
  const rows = await session.query<{ total: number }>(
    `select count(*)::int as total from ${table} where workspace_id = $1`,
    [workspaceId],
  );
  return rows[0]?.total ?? -1;
}

const owned: Seeded = await seedEverything();
const other: Seeded = await seedEverything();
const strangerId = randomUUID();
const setup = await openSession(database.migrationUrl);
try {
  await setup.query(
    'insert into accounts (id, limit_bytes) values ($1, 1000000)',
    [strangerId],
  );
} finally {
  await setup.close();
}

await test('member visibility: reads the rows of its own workspaces only', async () => {
  const session = await openSession(database.runtimeUrl, owned.accountId);
  try {
    for (const table of scopedTables) {
      const mine = await visibleIn(session, table, owned.workspaceId);
      const theirs = await visibleIn(session, table, other.workspaceId);
      const total = await visible(session, table);
      assert.ok(mine > 0, `${table} must show rows of the own workspace`);
      assert.equal(theirs, 0, `${table} must hide the other workspace`);
      assert.equal(total, mine, `${table} must show nothing else`);
    }
    assert.equal(await visible(session, 'workspaces'), 1);
    assert.equal(await visible(session, 'accounts'), 1);
  } finally {
    await session.close();
  }
});

await test('member visibility: cannot write into another workspace', async () => {
  const session = await openSession(database.runtimeUrl, owned.accountId);
  try {
    const failure = await session.failure(
      `insert into files (workspace_id, id, path, kind)
       values ($1, $2, 'notes/forced.md', 'note')`,
      [other.workspaceId, randomUUID()],
    );
    assert.equal(failure.code, '42501');
    assert.match(failure.message, /row-level security/i);
  } finally {
    await session.close();
  }
});

await test('non members and anonymous readers: shows nothing to an account without a membership', async () => {
  const session = await openSession(database.runtimeUrl, strangerId);
  try {
    for (const table of scopedTables) {
      assert.equal(await visible(session, table), 0, table);
    }
    assert.equal(await visible(session, 'workspaces'), 0);
    const failure = await session.failure(
      `insert into files (workspace_id, id, path, kind)
       values ($1, $2, 'notes/stranger.md', 'note')`,
      [owned.workspaceId, randomUUID()],
    );
    assert.equal(failure.code, '42501');
  } finally {
    await session.close();
  }
});

await test('non members and anonymous readers: shows nothing without an identity setting', async () => {
  const session = await openSession(database.runtimeUrl);
  try {
    for (const table of scopedTables) {
      assert.equal(await visible(session, table), 0, table);
    }
    assert.equal(await visible(session, 'workspaces'), 0);
    assert.equal(await visible(session, 'accounts'), 0);
  } finally {
    await session.close();
  }
});

await test('a published link belongs to the account that made it', async () => {
  // The policy of a link needs the membership and the owner account, so a
  // second account of the same workspace still reads none of its links. The
  // product serves one account today, so the row is written by hand here.
  const foreign = randomUUID();
  const owner = await openSession(database.migrationUrl);
  try {
    await owner.query(
      `insert into publications
          (workspace_id, id, owner_account_id, token_digest, scope_kind, scope_path)
       values ($1, $2, $3, encode(sha256($4::text::bytea), 'hex'), 'folder', 'notes')`,
      [owned.workspaceId, foreign, other.accountId, randomUUID()],
    );
  } finally {
    await owner.close();
  }
  const session = await openSession(database.runtimeUrl, owned.accountId);
  try {
    const rows = await session.query<{ id: string }>(
      'select id from publications where id = $1',
      [foreign],
    );
    assert.deepEqual(rows, []);
    // A member of the workspace cannot write a link for another account
    // either, because the policy checks the new row as well.
    const refused = await session.failure(
      `insert into publications
          (workspace_id, id, owner_account_id, token_digest, scope_kind, scope_path)
       values ($1, $2, $3, encode(sha256($4::text::bytea), 'hex'), 'folder', 'notes')`,
      [owned.workspaceId, randomUUID(), other.accountId, randomUUID()],
    );
    assert.equal(refused.code, '42501');
  } finally {
    await session.close();
  }
  const cleanup = await openSession(database.migrationUrl);
  try {
    await cleanup.query('delete from publications where id = $1', [foreign]);
  } finally {
    await cleanup.close();
  }
});

await test('runtime role limits: cannot turn row security off', async () => {
  const session = await openSession(database.runtimeUrl, owned.accountId);
  try {
    await session.query('set row_security = off');
    // PostgreSQL rejects the read, because the role has no BYPASSRLS
    // attribute. A version that accepted the read would still have to apply
    // the policy, so the second branch checks the same guarantee.
    let readable: number | null = null;
    let code = '';
    try {
      readable = await visible(session, 'files');
    } catch (error) {
      code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : '';
    }
    if (readable === null) {
      assert.equal(code, '42501');
    } else {
      assert.equal(readable, 1);
    }
    await session.query('set row_security = on');
    assert.equal(await visible(session, 'files'), 1);
  } finally {
    await session.close();
  }
});

await test('runtime role limits: cannot run DDL', async () => {
  const session = await openSession(database.runtimeUrl, owned.accountId);
  try {
    const created = await session.failure(
      'create table row_access_probe (id integer)',
    );
    assert.equal(created.code, '42501');
    const altered = await session.failure(
      'alter table files add column probe integer',
    );
    assert.equal(altered.code, '42501');
    const dropped = await session.failure('drop table live_paths');
    assert.equal(dropped.code, '42501');
  } finally {
    await session.close();
  }
});

await test('runtime role limits: cannot read or run the migration bookkeeping', async () => {
  const session = await openSession(database.runtimeUrl, owned.accountId);
  try {
    const denied = await session.failure(
      'select count(*) from drizzle.__drizzle_migrations',
    );
    assert.equal(denied.code, '42501');
  } finally {
    await session.close();
  }
  await assert.rejects(() =>
    runMigrations({
      documents: createDocumentService(),
      databaseUrl: database.runtimeUrl,
      runtimePassword: 'notesapp_app_test_password',
      authPassword: 'notesapp_auth_test_password',
    }),
  );
});

await test('membership policy: is not recursive', async () => {
  const session = await openSession(database.runtimeUrl, owned.accountId);
  try {
    const plan = await session.query<{ 'QUERY PLAN': string }>(
      'explain select workspace_id, account_id from memberships',
    );
    assert.ok(plan.length > 0);
    const joined = await session.query<{ total: number }>(
      `select count(*)::int as total
       from memberships m1
       join memberships m2 on m1.workspace_id = m2.workspace_id`,
    );
    assert.equal(joined[0]?.total, 1);
    const nested = await session.query<{ total: number }>(
      `select count(*)::int as total from memberships m
       where exists (
         select 1 from memberships inner_m
         where inner_m.workspace_id = m.workspace_id
       )`,
    );
    assert.equal(nested[0]?.total, 1);
  } finally {
    await session.close();
  }
});

// One workspace with its single owner, for the checks below.
const scoped = {
  workspaceId: randomUUID(),
  ownerId: randomUUID(),
};
await seedWorkspace(database, scoped.workspaceId, [
  { accountId: scoped.ownerId, role: 'owner' },
]);

await test('the owner cannot raise its own limit', async () => {
  const session = await openSession(database.runtimeUrl, scoped.ownerId);
  try {
    const failure = await session.failure(
      'update accounts set limit_bytes = 1 where id = $1',
      [scoped.ownerId],
    );
    assert.equal(failure.code, '42501');
  } finally {
    await session.close();
  }
});

await test('the owner cannot reset the commit cursor', async () => {
  const session = await openSession(database.runtimeUrl, scoped.ownerId);
  try {
    const failure = await session.failure(
      'update workspace_cursors set last_cursor = 0 where workspace_id = $1',
      [scoped.workspaceId],
    );
    assert.equal(failure.code, '42501');
  } finally {
    await session.close();
  }
});

await test('privileged functions: a stranger cannot move a cursor or add usage', async () => {
  const session = await openSession(database.runtimeUrl, strangerId);
  try {
    const cursor = await session.failure('select notesapp_next_cursor($1)', [
      scoped.workspaceId,
    ]);
    assert.equal(cursor.code, '42501');
    const usage = await session.failure(
      'select notesapp_add_usage($1, 1000::bigint, 0::bigint)',
      [scoped.workspaceId],
    );
    assert.equal(usage.code, '42501');
  } finally {
    await session.close();
  }
});

await test('privileged functions: the owner cannot reduce the stored usage', async () => {
  const session = await openSession(database.runtimeUrl, scoped.ownerId);
  try {
    // A member that could subtract would zero the stored bytes and then write
    // past the quota without limit, so every negative delta is refused, not
    // only one that would make the value negative.
    const added = await session.query<{ notesapp_add_usage: string }>(
      'select notesapp_add_usage($1, 4096::bigint, 0::bigint)',
      [scoped.workspaceId],
    );
    assert.equal(added[0]?.notesapp_add_usage, '4096');

    // Neither the text part nor the attachment part can be negative.
    for (const delta of ['-1', '-4096', '-1000000']) {
      const text = await session.failure(
        `select notesapp_add_usage($1, (${delta})::bigint, 0::bigint)`,
        [scoped.workspaceId],
      );
      assert.equal(text.code, '23514');
      const attachment = await session.failure(
        `select notesapp_add_usage($1, 0::bigint, (${delta})::bigint)`,
        [scoped.workspaceId],
      );
      assert.equal(attachment.code, '23514');
    }

    const current = await session.query<{ bytes_used: string }>(
      'select bytes_used from workspace_usage where workspace_id = $1',
      [scoped.workspaceId],
    );
    assert.equal(current[0]?.bytes_used, '4096');
  } finally {
    await session.close();
  }
});

// The identity tables that Task 5 added, and the two roles that separate them.
const identityTables = [
  'auth_user',
  'auth_session',
  'auth_account',
  'auth_verification',
] as const;

const invited = {
  workspaceId: randomUUID(),
  ownerId: randomUUID(),
  strangerId: randomUUID(),
};
await seedWorkspace(database, invited.workspaceId, [
  { accountId: invited.ownerId, role: 'owner' },
]);
await seedWorkspace(database, randomUUID(), [
  { accountId: invited.strangerId, role: 'owner' },
]);

await test('identity roles: the runtime role cannot touch an identity table', async () => {
  const session = await openSession(database.runtimeUrl, invited.ownerId);
  try {
    for (const table of identityTables) {
      const read = await session.failure(`select * from ${table} limit 1`);
      assert.equal(read.code, '42501', table);
      const write = await session.failure(
        `update ${table} set id = id where false`,
      );
      assert.equal(write.code, '42501', table);
    }
    // A connection without an identity setting fares no better, so an
    // identity free query is not a way around the rights.
    const anonymous = await openSession(database.runtimeUrl);
    try {
      const read = await anonymous.failure('select * from auth_account');
      assert.equal(read.code, '42501');
    } finally {
      await anonymous.close();
    }
  } finally {
    await session.close();
  }
});

await test('identity roles: the identity role cannot touch a workspace table', async () => {
  const session = await openSession(database.authUrl);
  try {
    for (const table of [
      'workspaces',
      'memberships',
      'accounts',
      'account_identities',
      'account_preferences',
      'revisions',
      'contents',
    ]) {
      const denied = await session.failure(`select * from ${table} limit 1`);
      assert.equal(denied.code, '42501', table);
    }
    // It reads its own tables, which is the only thing it is for.
    const rows = await session.query('select * from auth_user limit 1');
    assert.equal(Array.isArray(rows), true);
  } finally {
    await session.close();
  }
});

await test('account settings belong to one account', async () => {
  const setup = await openSession(database.migrationUrl);
  try {
    await setup.query(
      `insert into account_preferences (account_id, theme) values ($1, 'dark')`,
      [invited.ownerId],
    );
  } finally {
    await setup.close();
  }
  const foreign = await openSession(database.runtimeUrl, invited.strangerId);
  try {
    const settings = await foreign.query(
      'select * from account_preferences where account_id = $1',
      [invited.ownerId],
    );
    assert.equal(settings.length, 0);
    // Nor can one account write a setting for another one.
    const denied = await foreign.failure(
      `insert into account_preferences (account_id, theme) values ($1, 'light')`,
      [invited.ownerId],
    );
    assert.equal(denied.code, '42501');
  } finally {
    await foreign.close();
  }
  const own = await openSession(database.runtimeUrl, invited.ownerId);
  try {
    const settings = await own.query<{ theme_family: string }>(
      'select * from account_preferences where account_id = $1',
      [invited.ownerId],
    );
    assert.equal(settings.length, 1);
    // The row was inserted without a theme family, so it carries the column
    // default. The default family states no taste (record 0056).
    assert.equal(settings[0]?.theme_family, 'default');
  } finally {
    await own.close();
  }
});

await test('the account audit trail belongs to one account', async () => {
  const setup = await openSession(database.migrationUrl);
  try {
    await setup.query(
      `insert into account_audit_events (id, account_id, action, target_kind)
       values ($1, $2, 'account.recover', 'account')`,
      [randomUUID(), invited.ownerId],
    );
  } finally {
    await setup.close();
  }
  const own = await openSession(database.runtimeUrl, invited.ownerId);
  try {
    const rows = await own.query('select * from account_audit_events');
    assert.equal(rows.length, 1);
  } finally {
    await own.close();
  }
  const foreign = await openSession(database.runtimeUrl, invited.strangerId);
  try {
    const rows = await foreign.query('select * from account_audit_events');
    assert.equal(rows.length, 0);
    const denied = await foreign.failure(
      `insert into account_audit_events (id, account_id, action, target_kind)
       values ($1, $2, 'forged', 'account')`,
      [randomUUID(), invited.ownerId],
    );
    assert.equal(denied.code, '42501');
  } finally {
    await foreign.close();
  }
});

/**
 * Seeds an account that looks exactly like one the invitation path created:
 * an identity, an application account, and one personal workspace.
 */
async function seedFreshAccount(): Promise<{
  authUserId: string;
  accountId: string;
  workspaceId: string;
}> {
  const authUserId = `auth-${randomUUID()}`;
  const accountId = randomUUID();
  const workspaceId = randomUUID();
  const setup = await openSession(database.migrationUrl);
  try {
    await setup.query(
      `insert into auth_user (id, name, email) values ($1, 'Fresh', $2)`,
      [authUserId, `${authUserId}@notes.invalid`],
    );
    await setup.query(
      'insert into accounts (id, limit_bytes) values ($1, 1000000)',
      [accountId],
    );
    await setup.query(
      'insert into account_identities (auth_user_id, account_id) values ($1, $2)',
      [authUserId, accountId],
    );
    await setup.query(
      `insert into workspaces (id, name, personal) values ($1, 'Personal', true)`,
      [workspaceId],
    );
    await setup.query('insert into workspace_usage values ($1, 0)', [
      workspaceId,
    ]);
    await setup.query('insert into workspace_cursors values ($1, 0)', [
      workspaceId,
    ]);
    await setup.query(
      `insert into memberships (workspace_id, account_id, role)
       values ($1, $2, 'owner')`,
      [workspaceId, accountId],
    );
  } finally {
    await setup.close();
  }
  return { authUserId, accountId, workspaceId };
}

/** Whether the application account still exists. */
async function accountExists(accountId: string): Promise<boolean> {
  const setup = await openSession(database.migrationUrl);
  try {
    const rows = await setup.query('select id from accounts where id = $1', [
      accountId,
    ]);
    return rows.length === 1;
  } finally {
    await setup.close();
  }
}

/** Runs the discard function with one account identity. */
async function discardAs(
  identityAccountId: string | undefined,
  authUserId: string,
): Promise<boolean> {
  const session = await openSession(database.runtimeUrl, identityAccountId);
  try {
    const rows = await session.query<{ discarded: boolean }>(
      'select notesapp_discard_account($1) as discarded',
      [authUserId],
    );
    return rows[0]?.discarded ?? false;
  } finally {
    await session.close();
  }
}

await test('an account is discarded only by itself', async () => {
  const fresh = await seedFreshAccount();
  // Another account, and an identity free transaction, are both refused.
  assert.equal(await discardAs(invited.strangerId, fresh.authUserId), false);
  assert.equal(await accountExists(fresh.accountId), true);
  assert.equal(await discardAs(undefined, fresh.authUserId), false);
  assert.equal(await accountExists(fresh.accountId), true);
  // The account itself removes what its own sign-up created.
  assert.equal(await discardAs(fresh.accountId, fresh.authUserId), true);
  assert.equal(await accountExists(fresh.accountId), false);
  const setup = await openSession(database.migrationUrl);
  try {
    const spaces = await setup.query(
      'select id from workspaces where id = $1',
      [fresh.workspaceId],
    );
    assert.equal(spaces.length, 0);
    const users = await setup.query('select id from auth_user where id = $1', [
      fresh.authUserId,
    ]);
    // The Better Auth user is removed by the identity role, not by this
    // function, so it is still there.
    assert.equal(users.length, 1);
  } finally {
    await setup.close();
  }
});

await test('an account that has been used is not discarded', async () => {
  const withSnapshot = await seedFreshAccount();
  const setup = await openSession(database.migrationUrl);
  try {
    await setup.query(
      `insert into snapshots
         (token_hash, workspace_id, account_id, cursor, item_count, page_size, expires_at)
       values ($1, $2, $3, 0, 0, 100, now() + interval '15 minutes')`,
      [
        `snapshot-${withSnapshot.accountId}`,
        withSnapshot.workspaceId,
        withSnapshot.accountId,
      ],
    );
  } finally {
    await setup.close();
  }
  // A retained snapshot names the account, so the answer is false rather than
  // a constraint violation.
  assert.equal(
    await discardAs(withSnapshot.accountId, withSnapshot.authUserId),
    false,
  );
  assert.equal(await accountExists(withSnapshot.accountId), true);

  const withContent = await seedFreshAccount();
  const second = await openSession(database.migrationUrl);
  try {
    // Content can outlive the file that referenced it, so the check looks at
    // `contents` and not only at `files`.
    await second.query(
      `insert into contents (workspace_id, digest, kind, size, markdown)
       values ($1, 'orphan-digest', 'markdown', 5, 'hello')`,
      [withContent.workspaceId],
    );
  } finally {
    await second.close();
  }
  assert.equal(
    await discardAs(withContent.accountId, withContent.authUserId),
    false,
  );
  assert.equal(await accountExists(withContent.accountId), true);
});

await test('an account row is visible to itself and to nobody else', async () => {
  const own = await openSession(database.runtimeUrl, invited.ownerId);
  try {
    const seen = await own.query<{ id: string }>(
      'select id from accounts where id = $1',
      [invited.ownerId],
    );
    assert.equal(seen.length, 1);
    const hidden = await own.query('select id from accounts where id = $1', [
      invited.strangerId,
    ]);
    assert.equal(hidden.length, 0);
  } finally {
    await own.close();
  }
});

await test('the account map is unreachable from the application role', async () => {
  const own = await openSession(database.runtimeUrl, invited.ownerId);
  try {
    // The application learns an account through `notesapp_account_of`, which
    // returns one narrow answer, so the table itself needs no right at all.
    const denied = await own.failure('select * from account_identities');
    assert.equal(denied.code, '42501');
  } finally {
    await own.close();
  }
});

await test('the owner guard keeps a workspace with an owner', async () => {
  // Even the schema owner cannot remove or demote the last owner. The check is
  // a trigger, so it applies to every role that holds the right at all.
  const guarded = randomUUID();
  const soleOwner = randomUUID();
  await seedWorkspace(database, guarded, [
    { accountId: soleOwner, role: 'owner' },
  ]);
  const setup = await openSession(database.migrationUrl);
  try {
    const present = await setup.query(
      'select role::text as role from memberships where workspace_id = $1',
      [guarded],
    );
    assert.equal(present.length, 1);
    const removed = await setup.failure(
      'delete from memberships where workspace_id = $1 and account_id = $2',
      [guarded, soleOwner],
    );
    assert.equal(removed.code, '23514');
    // `owner` is the only value of the role enum, so a demotion is not
    // expressible at all. The database refuses the value itself.
    const demoted = await setup.failure(
      `update memberships set role = 'viewer'
        where workspace_id = $1 and account_id = $2`,
      [guarded, soleOwner],
    );
    assert.equal(demoted.code, '22P02');
  } finally {
    await setup.close();
  }
});

await test('identity functions: a stranger learns nothing', async () => {
  const stranger = await openSession(database.runtimeUrl, invited.strangerId);
  try {
    // Creating a workspace for somebody else is not possible: the function
    // always makes the calling account the owner.
    const created = randomUUID();
    await stranger.query('select notesapp_create_workspace($1, $2)', [
      created,
      'stranger workspace',
    ]);
    const roles = await stranger.query<{ account_id: string; role: string }>(
      'select account_id, role::text as role from memberships where workspace_id = $1',
      [created],
    );
    assert.equal(roles.length, 1);
    assert.equal(roles[0]?.account_id, invited.strangerId);
    assert.equal(roles[0]?.role, 'owner');
    const deletion = await stranger.failure(
      'select notesapp_delete_workspace($1)',
      [invited.workspaceId],
    );
    assert.equal(deletion.code, '42501');
  } finally {
    await stranger.close();
  }
});

await store.close();
await database.destroy();
