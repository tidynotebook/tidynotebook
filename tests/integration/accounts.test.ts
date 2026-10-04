/**
 * Several accounts on one installation, against the real database (records
 * 0108 to 0112).
 *
 * Most checks call the database functions directly under the runtime role,
 * with no use case in front of them, because the database must refuse the
 * same calls that `packages/core` refuses. The others go through the store
 * with the use cases, to prove the result that the server serves.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  acceptWithDocuments,
  createWorkspace,
  defaultAccountLimitBytes,
  listAccounts,
  registerAccount,
  removeAccount,
  updateAccount,
  verifyActor,
  type Actor,
} from '@notesapp/core';
import {
  createDocumentService,
  createTestDatabase,
  dropTestDatabase,
  migrationsFolder,
  openIdentityStore,
  openWorkspaceStore,
  runMigrations,
  testAuthPassword,
  testRuntimePassword,
  type IdentityStoreHandle,
  type WorkspaceStoreHandle,
} from '@notesapp/storage-server';
import {
  changeset,
  createDisposableDatabase,
  memberActor,
  openSession,
  revision,
  testServerUrl,
  type TestDatabase,
} from './support/database.ts';

const database: TestDatabase = await createDisposableDatabase();
const identity: IdentityStoreHandle = openIdentityStore(database.runtimeUrl, {
  poolSize: 6,
});
const content: WorkspaceStoreHandle = openWorkspaceStore(
  database.runtimeUrl,
  createDocumentService(),
  { poolSize: 6 },
);

/** A verified actor with no workspace grant, as an installation caller. */
function caller(accountId: string): Actor {
  const made = verifyActor(accountId, []);
  if (!made.ok) throw new Error('the test actor was rejected');
  return made.value;
}

/** Makes one identity user, as Better Auth would, with the migration role. */
async function identityUser(email: string): Promise<string> {
  const authUserId = `auth-${randomUUID()}`;
  const setup = await openSession(database.migrationUrl);
  try {
    await setup.query(
      `insert into auth_user (id, name, email, email_verified)
       values ($1, 'Person', $2, true)`,
      [authUserId, email],
    );
  } finally {
    await setup.close();
  }
  return authUserId;
}

/** A session row of one identity user. */
async function addSession(authUserId: string): Promise<void> {
  const setup = await openSession(database.migrationUrl);
  try {
    await setup.query(
      `insert into auth_session (id, user_id, token, expires_at)
       values ($1, $2, $3, now() + interval '1 day')`,
      [randomUUID(), authUserId, randomUUID()],
    );
  } finally {
    await setup.close();
  }
}

/** Counts rows with the migration role, which sees every row. */
async function count(sql: string, params: unknown[]): Promise<number> {
  const setup = await openSession(database.migrationUrl);
  try {
    const rows = await setup.query<{ held: string }>(
      `select count(*)::text as held from (${sql}) as counted`,
      params,
    );
    return Number(rows[0]?.held ?? '0');
  } finally {
    await setup.close();
  }
}

/** The one registration function, called with no use case in front of it. */
async function registerDirect(
  authUserId: string,
  ground: string,
  tokenDigest: string | null,
): Promise<string | null> {
  const session = await openSession(database.runtimeUrl);
  try {
    const rows = await session.query<{ account: string | null }>(
      `select notesapp_register_account($1, $2, $3, $4, $5, 'Personal', $6::bigint,
         'active', null) as account`,
      [
        authUserId,
        ground,
        tokenDigest,
        randomUUID(),
        randomUUID(),
        defaultAccountLimitBytes.toString(),
      ],
    );
    return rows[0]?.account ?? null;
  } finally {
    await session.close();
  }
}

/** The SHA-256 digest of a token, in lower case hexadecimal. */
function digestOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Stores one invitation through the operator path, and answers its digest. */
async function invitation(
  email: string,
  expiresAt = new Date(Date.now() + 60 * 60 * 1000),
): Promise<{ digest: string; invitationId: string }> {
  const digest = digestOf(randomUUID());
  const invitationId = randomUUID();
  const stored = await identity.operatorInvite({
    invitationId,
    tokenDigest: digest,
    email,
    expiresAt: expiresAt.toISOString(),
    mailed: false,
  });
  assert.ok(stored !== null, 'the invitation was not stored');
  return { digest, invitationId };
}

/** Makes one member account through an invitation. */
async function member(): Promise<{
  accountId: string;
  authUserId: string;
  email: string;
}> {
  const email = `member-${randomUUID()}@notes.invalid`;
  const { digest } = await invitation(email);
  const authUserId = await identityUser(email);
  const made = await registerAccount(identity, {
    authUserId,
    ground: { kind: 'invitation', tokenDigest: digest },
    accountId: randomUUID(),
    workspaceId: randomUUID(),
    workspaceName: 'Personal',
    newAccount: {
      limitBytes: defaultAccountLimitBytes,
      standing: 'active',
      removeAfterSeconds: null,
    },
  });
  assert.ok(made.ok, 'the member was not registered');
  return { accountId: made.value, authUserId, email };
}

/** The personal workspace of one account. */
async function personalWorkspace(accountId: string): Promise<string> {
  const setup = await openSession(database.migrationUrl);
  try {
    const rows = await setup.query<{ workspace_id: string }>(
      `select m.workspace_id from memberships m
         join workspaces w on w.id = m.workspace_id
        where m.account_id = $1 and w.personal`,
      [accountId],
    );
    const found = rows[0]?.workspace_id;
    assert.ok(found !== undefined, 'the account has no personal workspace');
    return found;
  } finally {
    await setup.close();
  }
}

// The first account of the installation. Every later check builds on it.
let firstAccountId = '';

await test('the first run makes the first administrator, once', async () => {
  // Two first runs at the same time: the installation lock orders them, and
  // the second one reads the account that the first one made.
  const one = await identityUser('first@notes.invalid');
  const two = await identityUser('second-first@notes.invalid');
  const answers = await Promise.all([
    registerDirect(one, 'first-run', null),
    registerDirect(two, 'first-run', null),
  ]);
  const made = answers.filter((entry) => entry !== null);
  assert.equal(made.length, 1);
  firstAccountId = made[0] ?? '';
  const standing = await count(
    `select 1 from accounts where id = $1 and installation_role = 'administrator'
       and state = 'enabled' and address_proof = 'setup'`,
    [firstAccountId],
  );
  assert.equal(standing, 1);
  // A later first run makes nothing, whatever the caller does.
  const late = await identityUser('late@notes.invalid');
  assert.equal(await registerDirect(late, 'first-run', null), null);
  assert.equal(
    await count('select 1 from account_identities where auth_user_id = $1', [
      late,
    ]),
    0,
  );
});

const admin = caller(firstAccountId);

await test('the database refuses an account that no ground allows', async () => {
  const email = `refused-${randomUUID()}@notes.invalid`;
  const authUserId = await identityUser(email);
  // No invitation at all, an unknown digest, and an unknown ground.
  assert.equal(await registerDirect(authUserId, 'invitation', null), null);
  assert.equal(
    await registerDirect(authUserId, 'invitation', digestOf('unknown')),
    null,
  );
  assert.equal(await registerDirect(authUserId, 'anything', null), null);
  // The open ground needs the open policy, which no installation starts with.
  assert.equal(await registerDirect(authUserId, 'open', null), null);
  // An invitation for another address opens nothing for this one.
  const other = await invitation(`other-${randomUUID()}@notes.invalid`);
  assert.equal(
    await registerDirect(authUserId, 'invitation', other.digest),
    null,
  );
  // An expired invitation opens nothing.
  const expired = await invitation(email, new Date(Date.now() - 1000));
  assert.equal(
    await registerDirect(authUserId, 'invitation', expired.digest),
    null,
  );
  // A revoked invitation opens nothing.
  const revoked = await invitation(email);
  const session = await openSession(database.runtimeUrl, firstAccountId);
  try {
    const rows = await session.query<{ revoked: boolean }>(
      'select notesapp_revoke_invitation($1) as revoked',
      [revoked.invitationId],
    );
    assert.equal(rows[0]?.revoked, true);
  } finally {
    await session.close();
  }
  assert.equal(
    await registerDirect(authUserId, 'invitation', revoked.digest),
    null,
  );
  assert.equal(
    await count('select 1 from account_identities where auth_user_id = $1', [
      authUserId,
    ]),
    0,
  );
});

await test('two acceptances of one invitation make one account', async () => {
  const email = `race-${randomUUID()}@notes.invalid`;
  const { digest } = await invitation(email);
  const authUserId = await identityUser(email);
  const answers = await Promise.all([
    registerDirect(authUserId, 'invitation', digest),
    registerDirect(authUserId, 'invitation', digest),
  ]);
  // The second call waits on the locked invitation row. It then finds the
  // identity linked and answers the same account, or finds the invitation
  // used and makes nothing.
  const made = new Set(answers.filter((entry) => entry !== null));
  assert.equal(made.size, 1);
  assert.equal(
    await count('select 1 from account_identities where auth_user_id = $1', [
      authUserId,
    ]),
    1,
  );
  // A used invitation opens nothing for anybody.
  assert.equal(await identity.invitationAddress(digest), null);
});

await test('an invitation binds its address and records who proved it', async () => {
  const joined = await member();
  const rows = await count(
    `select 1 from accounts where id = $1 and installation_role = 'member'
       and address_proof = 'administrator'`,
    [joined.accountId],
  );
  assert.equal(rows, 1);
  // An address that already signs in takes no invitation.
  assert.equal(
    await identity.operatorInvite({
      invitationId: randomUUID(),
      tokenDigest: digestOf(randomUUID()),
      email: joined.email,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      mailed: false,
    }),
    null,
  );
});

await test('a member cannot invite, list or administer', async () => {
  const joined = await member();
  const session = await openSession(database.runtimeUrl, joined.accountId);
  try {
    for (const [sql, params] of [
      [
        `select notesapp_invite($1, $2, 'x@notes.invalid', now() + interval '1 day', false)`,
        [randomUUID(), digestOf(randomUUID())],
      ],
      ['select * from notesapp_list_accounts()', []],
      ['select * from notesapp_list_invitations()', []],
      [
        `select notesapp_set_installation_role($1, 'administrator')`,
        [joined.accountId],
      ],
      [`select notesapp_set_account_state($1, 'disabled')`, [firstAccountId]],
      ['select notesapp_set_account_limit($1, 1)', [firstAccountId]],
      ['select notesapp_remove_account($1)', [firstAccountId]],
      [`select notesapp_set_registration_policy('open')`, []],
      ['select notesapp_operator_promote($1)', [joined.email]],
    ] as const) {
      const failure = await session.failure(sql, [...params]);
      assert.equal(failure.code, '42501', sql);
    }
    // A member cannot raise its own limit or role by writing the row.
    const write = await session.failure(
      `update accounts set limit_bytes = 1, installation_role = 'administrator'
        where id = $1`,
      [joined.accountId],
    );
    assert.equal(write.code, '42501');
  } finally {
    await session.close();
  }
});

await test('an administrator reads no row of a workspace of another account', async () => {
  const joined = await member();
  const workspaceId = await personalWorkspace(joined.accountId);
  const actor = memberActor(joined.accountId, workspaceId);
  const note = revision({ fileId: randomUUID(), path: 'notes/private.md' });
  const written = await content.transact(actor, workspaceId, (tx) =>
    acceptWithDocuments(
      content.documents,
      tx,
      actor,
      changeset(workspaceId, [note]),
      `private-${workspaceId}`,
    ),
  );
  assert.ok(written.ok);
  const session = await openSession(database.runtimeUrl, firstAccountId);
  try {
    for (const table of [
      'files',
      'revisions',
      'contents',
      'workspaces',
      'memberships',
      'search_index',
      'sync_changes',
    ]) {
      const column = table === 'workspaces' ? 'id' : 'workspace_id';
      const rows = await session.query(
        `select 1 from ${table} where ${column} = $1`,
        [workspaceId],
      );
      assert.equal(rows.length, 0, table);
    }
  } finally {
    await session.close();
  }
  // The list of an administrator names the account and holds no note.
  const listed = await listAccounts(identity, admin);
  assert.ok(listed.ok);
  const seen = listed.value.find(
    (entry) => entry.accountId === joined.accountId,
  );
  assert.equal(seen?.email, joined.email);
  assert.ok((seen?.usedBytes ?? 0n) > 0n);
});

await test('the database keeps one enabled administrator', async () => {
  const session = await openSession(database.runtimeUrl, firstAccountId);
  try {
    for (const sql of [
      `select notesapp_set_installation_role($1, 'member')`,
      `select notesapp_set_account_state($1, 'disabled')`,
      'select notesapp_remove_account($1)',
    ]) {
      const failure = await session.failure(sql, [firstAccountId]);
      assert.equal(failure.code, 'NA002', sql);
    }
  } finally {
    await session.close();
  }
  assert.equal(
    await count(
      `select 1 from accounts where id = $1 and installation_role = 'administrator'
         and state = 'enabled' and removed_at is null`,
      [firstAccountId],
    ),
    1,
  );
});

await test('two administrators who demote each other do not both succeed', async () => {
  const other = await member();
  const promoted = await updateAccount(identity, admin, other.accountId, {
    role: 'administrator',
  });
  assert.ok(promoted.ok);
  const [one, two] = await Promise.allSettled([
    updateAccount(identity, admin, other.accountId, { role: 'member' }),
    updateAccount(identity, caller(other.accountId), firstAccountId, {
      role: 'member',
    }),
  ]);
  const outcomes = [one, two].map((entry) =>
    entry.status === 'fulfilled' ? entry.value : null,
  );
  // One of them demotes the other. The second one reads the count that the
  // first one left, and either finds itself no longer an administrator or
  // finds the last administrator: it never succeeds as well.
  const succeeded = outcomes.filter((entry) => entry?.ok === true);
  assert.equal(succeeded.length, 1);
  assert.equal(
    await count(
      `select 1 from accounts where installation_role = 'administrator'
         and state = 'enabled' and removed_at is null`,
      [],
    ),
    1,
  );
  // Put the first account back in charge for the checks below.
  if (outcomes[1]?.ok === true) {
    const session = await openSession(database.migrationUrl);
    try {
      await session.query(
        `update accounts set installation_role = 'administrator' where id = $1`,
        [firstAccountId],
      );
    } finally {
      await session.close();
    }
  }
});

await test('a disabled account gets no actor and loses every session', async () => {
  const joined = await member();
  await addSession(joined.authUserId);
  await addSession(joined.authUserId);
  assert.equal(
    await identity.sessionAccount(joined.authUserId),
    joined.accountId,
  );
  const disabled = await updateAccount(identity, admin, joined.accountId, {
    state: 'disabled',
  });
  assert.ok(disabled.ok);
  assert.equal(await identity.sessionAccount(joined.authUserId), null);
  assert.equal(
    await count('select 1 from auth_session where user_id = $1', [
      joined.authUserId,
    ]),
    0,
  );
  // The notes stay, and enabling the account again serves it again.
  assert.equal(await personalWorkspace(joined.accountId).then(() => 1), 1);
  const enabled = await updateAccount(identity, admin, joined.accountId, {
    state: 'enabled',
  });
  assert.ok(enabled.ok);
  assert.equal(
    await identity.sessionAccount(joined.authUserId),
    joined.accountId,
  );
});

await test('removal leaves a tombstone with no identity, session or workspace', async () => {
  const joined = await member();
  await addSession(joined.authUserId);
  const workspaceId = await personalWorkspace(joined.accountId);
  const removed = await removeAccount(identity, admin, joined.accountId);
  assert.deepEqual(removed, { ok: true, value: undefined });
  assert.equal(await identity.sessionAccount(joined.authUserId), null);
  assert.equal(await identity.accountOf(joined.authUserId), null);
  for (const [sql, params] of [
    ['select 1 from auth_user where id = $1', [joined.authUserId]],
    ['select 1 from auth_session where user_id = $1', [joined.authUserId]],
    [
      'select 1 from account_identities where account_id = $1',
      [joined.accountId],
    ],
    ['select 1 from memberships where account_id = $1', [joined.accountId]],
    ['select 1 from workspaces where id = $1', [workspaceId]],
    [
      'select 1 from account_preferences where account_id = $1',
      [joined.accountId],
    ],
    [
      'select 1 from account_audit_events where account_id = $1',
      [joined.accountId],
    ],
  ] as const) {
    assert.equal(await count(sql, [...params]), 0, sql);
  }
  assert.equal(
    await count(
      `select 1 from accounts where id = $1 and removed_at is not null
         and state = 'disabled' and address_proof is null`,
      [joined.accountId],
    ),
    1,
  );
  // A tombstone is not an account any more: it is not listed and cannot be
  // removed or changed again.
  const listed = await listAccounts(identity, admin);
  assert.ok(listed.ok);
  assert.ok(
    !listed.value.some((entry) => entry.accountId === joined.accountId),
  );
  assert.deepEqual(await removeAccount(identity, admin, joined.accountId), {
    ok: false,
    error: { code: 'not_found', fileIds: [] },
  });
});

await test('the account limit counts every workspace the owner holds', async () => {
  const joined = await member();
  const personal = await personalWorkspace(joined.accountId);
  const second = randomUUID();
  const made = await createWorkspace(
    identity,
    memberActor(joined.accountId, personal),
    {
      workspaceId: second,
      name: 'Second',
    },
  );
  assert.ok(made.ok);
  // Room for the reserve and a little more, spread over two workspaces.
  const limited = await updateAccount(identity, admin, joined.accountId, {
    limitBytes: (1n << 20n) + 3000n,
  });
  assert.ok(limited.ok);
  const write = (workspaceId: string, text: string, key: string) => {
    const actor = verifyActor(joined.accountId, [
      { workspaceId: personal, actions: ['read', 'write', 'history', 'purge'] },
      { workspaceId: second, actions: ['read', 'write', 'history', 'purge'] },
    ]);
    if (!actor.ok) throw new Error('the test actor was rejected');
    return content.transact(actor.value, workspaceId, (tx) =>
      acceptWithDocuments(
        content.documents,
        tx,
        actor.value,
        changeset(workspaceId, [
          revision({ fileId: randomUUID(), path: `notes/${key}.md`, text }),
        ]),
        key,
      ),
    );
  };
  const first = await write(personal, '# one\n', `limit-a-${personal}`);
  assert.ok(first.ok);
  // The second workspace is empty, but the owner already used most of its
  // limit in the first one, so the write is refused.
  const refused = await write(
    second,
    '# two\n'.repeat(200),
    `limit-b-${second}`,
  );
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error.code, 'quota');
  // The database refuses the same bytes when the use case is bypassed.
  const session = await openSession(database.runtimeUrl, joined.accountId);
  try {
    const failure = await session.failure(
      'select notesapp_add_usage($1, $2::bigint, 0::bigint)',
      [second, ((1n << 20n) + 3000n).toString()],
    );
    assert.equal(failure.code, 'NA003');
  } finally {
    await session.close();
  }
});

await test('a write and a removal of one account at the same time both finish', async () => {
  const joined = await member();
  const workspaceId = await personalWorkspace(joined.accountId);
  const actor = memberActor(joined.accountId, workspaceId);
  const writes = Array.from({ length: 4 }, (_, index) =>
    content
      .transact(actor, workspaceId, (tx) =>
        acceptWithDocuments(
          content.documents,
          tx,
          actor,
          changeset(workspaceId, [
            revision({ fileId: randomUUID(), path: `notes/race-${index}.md` }),
          ]),
          `race-${workspaceId}-${index}`,
        ),
      )
      .then(
        () => 'finished',
        () => 'finished',
      ),
  );
  const removal = removeAccount(identity, admin, joined.accountId);
  const settled = await Promise.all([...writes, removal]);
  assert.equal(settled.length, 5);
  assert.deepEqual(await removal, { ok: true, value: undefined });
  assert.equal(
    await count('select 1 from workspaces where id = $1', [workspaceId]),
    0,
  );
});

await test('the operator promotes an account when no administrator signs in', async () => {
  const joined = await member();
  const promoted = await identity.operatorPromote(joined.email.toUpperCase());
  assert.equal(promoted, joined.accountId);
  assert.equal(
    await count(
      `select 1 from accounts where id = $1 and installation_role = 'administrator'`,
      [joined.accountId],
    ),
    1,
  );
  assert.equal(await identity.operatorPromote('nobody@notes.invalid'), null);
});

await test('an upgraded installation keeps its account as an administrator', async () => {
  // Stop at the release before accounts: a copy of the migrations without the
  // entry of migration 0012, then the rows that release wrote.
  const earlier = await mkdtemp(join(tmpdir(), 'notesapp-migrations-'));
  const serverUrl = testServerUrl();
  const name = `notesapp_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const migrationUrl = await createTestDatabase(serverUrl, name);
  try {
    await cp(migrationsFolder(), earlier, { recursive: true });
    const journalPath = join(earlier, 'meta', '_journal.json');
    const journal: unknown = JSON.parse(await readFile(journalPath, 'utf8'));
    const entries = readEntries(journal);
    const upTo = entries.findIndex(
      (entry) => entry === '0012_several_accounts',
    );
    assert.ok(upTo > 0, 'the journal names migration 0012');
    await writeFile(
      journalPath,
      JSON.stringify(withEntries(journal, upTo)),
      'utf8',
    );
    const run = {
      documents: createDocumentService(),
      databaseUrl: migrationUrl,
      runtimePassword: testRuntimePassword,
      authPassword: testAuthPassword,
    };
    await runMigrations({ ...run, migrationsFolder: earlier });
    const accountId = randomUUID();
    const workspaceId = randomUUID();
    const setup = await openSession(migrationUrl);
    try {
      await setup.query('insert into accounts (id) values ($1)', [accountId]);
      await setup.query(
        `insert into workspaces (id, name, personal) values ($1, 'Personal', true)`,
        [workspaceId],
      );
      await setup.query(
        'insert into workspace_usage values ($1, 10, 123456789)',
        [workspaceId],
      );
      await setup.query(
        `insert into memberships (workspace_id, account_id, role)
         values ($1, $2, 'owner')`,
        [workspaceId, accountId],
      );
    } finally {
      await setup.close();
    }
    await runMigrations(run);
    const check = await openSession(migrationUrl);
    try {
      const rows = await check.query<{
        installation_role: string;
        state: string;
        address_proof: string;
        limit_bytes: string;
      }>(
        `select installation_role::text, state::text, address_proof::text,
                limit_bytes::text from accounts where id = $1`,
        [accountId],
      );
      assert.deepEqual(rows, [
        {
          installation_role: 'administrator',
          state: 'enabled',
          address_proof: 'setup',
          limit_bytes: '123456789',
        },
      ]);
      const settings = await check.query<{ policy: string }>(
        'select registration_policy::text as policy from installation_settings',
      );
      assert.deepEqual(settings, [{ policy: 'invitation' }]);
    } finally {
      await check.close();
    }
  } finally {
    await dropTestDatabase(serverUrl, name);
    await rm(earlier, { recursive: true, force: true });
  }
});

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

await identity.close();
await content.close();
await database.destroy();
