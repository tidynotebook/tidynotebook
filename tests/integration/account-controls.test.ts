/**
 * The controls of an account in the database (records 0189 and 0190).
 *
 * Each refusal here is proved with the use case bypassed: a statement of the
 * runtime role calls the function that the store calls, so the database holds
 * the rule however the layers above it fail.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  acceptWithDocuments,
  defaultAccountLimitBytes,
  registerAccount,
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
  markdown,
  memberActor,
  openSession,
  revision,
  seedWorkspace,
  testServerUrl,
  type TestDatabase,
  type TestSession,
} from './support/database.ts';

const database: TestDatabase = await createDisposableDatabase();
const identity: IdentityStoreHandle = openIdentityStore(database.runtimeUrl, {
  poolSize: 4,
});
const content: WorkspaceStoreHandle = openWorkspaceStore(
  database.runtimeUrl,
  createDocumentService(),
  { poolSize: 4 },
);

/** A runtime session of the operator: the setting on and no account. */
async function operatorSession(): Promise<TestSession> {
  const session = await openSession(database.runtimeUrl);
  await session.query("select set_config('notesapp.operator', 'on', false)");
  return session;
}

/** One account that owns one workspace, made by the provisioning path. */
async function owner(): Promise<{ accountId: string; workspaceId: string }> {
  const accountId = randomUUID();
  const workspaceId = randomUUID();
  await seedWorkspace(database, workspaceId, [{ accountId, role: 'owner' }]);
  return { accountId, workspaceId };
}

type ControlsRow = {
  standing: string;
  removal_at: Date | null;
  limit_bytes: string;
  text_limit_bytes: string | null;
  published_transfer_limit_bytes: string | null;
  download_limit_bytes: string | null;
  teams: boolean;
  collaboration: boolean;
  controls_revision: string;
  removal_notices: number;
};

/** The stored controls of one account, read with the migration role. */
async function storedControls(accountId: string): Promise<ControlsRow> {
  const session = await openSession(database.migrationUrl);
  try {
    const rows = await session.query<ControlsRow>(
      `select standing::text as standing, removal_at,
              limit_bytes::text as limit_bytes,
              text_limit_bytes::text as text_limit_bytes,
              published_transfer_limit_bytes::text
                as published_transfer_limit_bytes,
              download_limit_bytes::text as download_limit_bytes,
              teams, collaboration,
              controls_revision::text as controls_revision, removal_notices
         from accounts where id = $1`,
      [accountId],
    );
    const row = rows[0];
    assert.ok(row !== undefined, 'the account has no row');
    return row;
  } finally {
    await session.close();
  }
}

/** One write of every control, as the operator, with a revision. */
async function writeControls(
  accountId: string,
  revision: number,
  change: {
    readonly standing?: 'active' | 'locked';
    readonly removalAt?: string | null;
    readonly limitBytes?: bigint;
    readonly textLimitBytes?: bigint | null;
  },
): Promise<string> {
  const session = await operatorSession();
  try {
    const rows = await session.query<{ outcome: string }>(
      `select notesapp_set_account_controls($1, $2, $3::account_standing,
         $4::timestamptz, $5::bigint, $6::bigint, null, null, true, true)
         as outcome`,
      [
        accountId,
        revision,
        change.standing ?? 'active',
        change.removalAt ?? null,
        (change.limitBytes ?? defaultAccountLimitBytes).toString(),
        change.textLimitBytes === undefined || change.textLimitBytes === null
          ? null
          : change.textLimitBytes.toString(),
      ],
    );
    return rows[0]?.outcome ?? '';
  } finally {
    await session.close();
  }
}

await test('an installation that sets nothing keeps every account active with no new limit', async () => {
  const made = await owner();
  const controls = await storedControls(made.accountId);
  assert.equal(controls.standing, 'active');
  assert.equal(controls.removal_at, null);
  assert.equal(controls.text_limit_bytes, null);
  assert.equal(controls.published_transfer_limit_bytes, null);
  assert.equal(controls.download_limit_bytes, null);
  assert.equal(controls.teams, true);
  assert.equal(controls.collaboration, true);
  assert.equal(controls.controls_revision, '1');
});

await test('the database refuses every write of a locked account', async () => {
  const made = await owner();
  assert.equal(
    await writeControls(made.accountId, 1, { standing: 'locked' }),
    'written',
  );
  // The use case bypassed: the function that every commit calls refuses.
  const session = await openSession(database.runtimeUrl, made.accountId);
  try {
    const failure = await session.failure(
      'select notesapp_add_usage($1, 1::bigint, 0::bigint)',
      [made.workspaceId],
    );
    assert.equal(failure.code, 'NA004');
    // A deletion adds no content and is refused too.
    const empty = await session.failure(
      'select notesapp_add_usage($1, 0::bigint, 0::bigint)',
      [made.workspaceId],
    );
    assert.equal(empty.code, 'NA004');
  } finally {
    await session.close();
  }
  // The use case answers the same refusal, and writes nothing.
  const actor = memberActor(made.accountId, made.workspaceId);
  const fileId = randomUUID();
  const refused = await content.transact(actor, made.workspaceId, (tx) =>
    acceptWithDocuments(
      content.documents,
      tx,
      actor,
      changeset(made.workspaceId, [
        revision({ fileId, path: 'locked.md', content: markdown('# Locked') }),
      ]),
      `locked-${made.workspaceId}`,
    ),
  );
  assert.deepEqual(refused, {
    ok: false,
    error: { code: 'account_locked', fileIds: [fileId] },
  });
  // Active again, the same write goes through.
  assert.equal(
    await writeControls(made.accountId, 2, { standing: 'active' }),
    'written',
  );
  const accepted = await content.transact(actor, made.workspaceId, (tx) =>
    acceptWithDocuments(
      content.documents,
      tx,
      actor,
      changeset(made.workspaceId, [
        revision({ fileId, path: 'locked.md', content: markdown('# Locked') }),
      ]),
      `unlocked-${made.workspaceId}`,
    ),
  );
  assert.ok(accepted.ok);
});

await test('a control write with an old revision changes nothing', async () => {
  const made = await owner();
  assert.equal(
    await writeControls(made.accountId, 1, {
      standing: 'locked',
      removalAt: '2030-01-01T00:00:00Z',
    }),
    'written',
  );
  const before = await storedControls(made.accountId);
  assert.equal(before.controls_revision, '2');
  // A retried write that read revision 1 arrives after the change.
  assert.equal(
    await writeControls(made.accountId, 1, { standing: 'active' }),
    'changed',
  );
  assert.deepEqual(await storedControls(made.accountId), before);
  assert.equal(await writeControls(randomUUID(), 1, {}), 'missing');
});

await test('only a locked account holds a removal time, and a new time resets its notices', async () => {
  const made = await owner();
  const session = await operatorSession();
  try {
    const failure = await session.failure(
      `select notesapp_set_account_controls($1, 1, 'active', now(),
         $2::bigint, null, null, null, true, true)`,
      [made.accountId, defaultAccountLimitBytes.toString()],
    );
    assert.equal(failure.code, '23514');
  } finally {
    await session.close();
  }
  assert.equal(
    await writeControls(made.accountId, 1, {
      standing: 'locked',
      removalAt: '2030-01-01T00:00:00Z',
    }),
    'written',
  );
  const setup = await openSession(database.migrationUrl);
  try {
    await setup.query('update accounts set removal_notices = 2 where id = $1', [
      made.accountId,
    ]);
  } finally {
    await setup.close();
  }
  assert.equal(
    await writeControls(made.accountId, 2, {
      standing: 'locked',
      removalAt: '2030-02-01T00:00:00Z',
    }),
    'written',
  );
  assert.equal((await storedControls(made.accountId)).removal_notices, 0);
});

await test('only an administrator or the operator writes the controls', async () => {
  const made = await owner();
  const session = await openSession(database.runtimeUrl, made.accountId);
  try {
    const failure = await session.failure(
      `select notesapp_set_account_controls($1, 1, 'active', null,
         $2::bigint, null, null, null, true, true)`,
      [made.accountId, '1'],
    );
    assert.equal(failure.code, '42501');
    // The runtime role holds no update right on the row either.
    const direct = await session.failure(
      "update accounts set standing = 'active' where id = $1",
      [made.accountId],
    );
    assert.equal(direct.code, '42501');
  } finally {
    await session.close();
  }
});

await test('the database refuses text past the text limit and an image past the storage limit', async () => {
  const made = await owner();
  assert.equal(
    await writeControls(made.accountId, 1, {
      limitBytes: 100_000n,
      textLimitBytes: 10_000n,
    }),
    'written',
  );
  const session = await openSession(database.runtimeUrl, made.accountId);
  try {
    await session.query(
      'select notesapp_add_usage($1, 9000::bigint, 0::bigint)',
      [made.workspaceId],
    );
    const text = await session.failure(
      'select notesapp_add_usage($1, 1001::bigint, 0::bigint)',
      [made.workspaceId],
    );
    assert.equal(text.code, 'NA003');
    // An image counts toward the storage limit alone, so it still fits.
    await session.query(
      'select notesapp_add_usage($1, 0::bigint, 50000::bigint)',
      [made.workspaceId],
    );
    const image = await session.failure(
      'select notesapp_add_usage($1, 0::bigint, 41001::bigint)',
      [made.workspaceId],
    );
    assert.equal(image.code, 'NA003');
    const usage = await session.query<{
      bytes_used: string;
      text_bytes: string;
    }>(
      `select bytes_used::text as bytes_used, text_bytes::text as text_bytes
         from workspace_usage where workspace_id = $1`,
      [made.workspaceId],
    );
    assert.deepEqual(usage[0], { bytes_used: '59000', text_bytes: '9000' });
  } finally {
    await session.close();
  }
  // The use case refuses the text past the limit before the database does.
  const actor = memberActor(made.accountId, made.workspaceId);
  const refused = await content.transact(actor, made.workspaceId, (tx) =>
    acceptWithDocuments(
      content.documents,
      tx,
      actor,
      changeset(made.workspaceId, [
        revision({
          fileId: randomUUID(),
          path: 'long.md',
          content: markdown('x'.repeat(2000)),
        }),
      ]),
      `text-${made.workspaceId}`,
    ),
  );
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error.code, 'quota');
});

await test('a commit counts its Markdown and its history as text', async () => {
  const made = await owner();
  const actor = memberActor(made.accountId, made.workspaceId);
  const text = '# Counted\n';
  const accepted = await content.transact(actor, made.workspaceId, (tx) =>
    acceptWithDocuments(
      content.documents,
      tx,
      actor,
      changeset(made.workspaceId, [
        revision({
          fileId: randomUUID(),
          path: 'counted.md',
          content: markdown(text),
        }),
      ]),
      `counted-${made.workspaceId}`,
    ),
  );
  assert.ok(accepted.ok);
  const session = await openSession(database.migrationUrl);
  try {
    const usage = await session.query<{
      bytes_used: string;
      text_bytes: string;
    }>(
      `select bytes_used::text as bytes_used, text_bytes::text as text_bytes
         from workspace_usage where workspace_id = $1`,
      [made.workspaceId],
    );
    // The bytes of the note, one revision and one receipt are all text.
    const expected = String(Buffer.byteLength(text) + 1024 + 512);
    assert.deepEqual(usage[0], { bytes_used: expected, text_bytes: expected });
  } finally {
    await session.close();
  }
});

/** One identity user, as Better Auth would make it, with an address. */
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

await test('a new account takes the controls of the configuration', async () => {
  const first = await identityUser(`first-${randomUUID()}@notes.invalid`);
  const lockedSettings = {
    limitBytes: defaultAccountLimitBytes,
    standing: 'locked' as const,
    removeAfterSeconds: 30 * 24 * 60 * 60,
  };
  // An installation that holds accounts already makes no first account, so
  // this one comes through an invitation of the operator.
  const email = `new-${randomUUID()}@notes.invalid`;
  const token = randomUUID();
  const digest = createHash('sha256').update(token).digest('hex');
  await identity.operatorInvite({
    invitationId: randomUUID(),
    tokenDigest: digest,
    email,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    mailed: false,
  });
  const made = await registerAccount(identity, {
    authUserId: await identityUser(email),
    ground: { kind: 'invitation', tokenDigest: digest },
    accountId: randomUUID(),
    workspaceId: randomUUID(),
    workspaceName: 'Personal',
    newAccount: lockedSettings,
  });
  assert.ok(made.ok);
  const controls = await storedControls(made.value);
  assert.equal(controls.standing, 'locked');
  assert.ok(controls.removal_at !== null);
  const days =
    (controls.removal_at.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  assert.ok(
    days > 29.9 && days <= 30,
    `the removal is ${String(days)} days away`,
  );
  // A removal time with no locked standing is refused before any write.
  const refused = await registerAccount(identity, {
    authUserId: first,
    ground: { kind: 'open' },
    accountId: randomUUID(),
    workspaceId: randomUUID(),
    workspaceName: 'Personal',
    newAccount: { ...lockedSettings, standing: 'active' },
  });
  assert.deepEqual(refused, {
    ok: false,
    error: { code: 'forbidden', fileIds: [] },
  });
});

await test('an upgraded installation splits its usage and keeps every account active', async () => {
  // Stop at the release before the controls: a copy of the migrations
  // without the entry of migration 0030, then the rows that release wrote.
  const earlier = await mkdtemp(join(tmpdir(), 'notesapp-migrations-'));
  const serverUrl = testServerUrl();
  const name = `notesapp_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const migrationUrl = await createTestDatabase(serverUrl, name);
  try {
    await cp(migrationsFolder(), earlier, { recursive: true });
    const journalPath = join(earlier, 'meta', '_journal.json');
    const journal: unknown = JSON.parse(await readFile(journalPath, 'utf8'));
    const record: Record<string, unknown> =
      journal !== null && typeof journal === 'object'
        ? Object.fromEntries(Object.entries(journal))
        : {};
    const entries: unknown = record['entries'];
    assert.ok(Array.isArray(entries));
    const upTo = entries.findIndex(
      (entry: unknown) =>
        entry !== null &&
        typeof entry === 'object' &&
        Object.fromEntries(Object.entries(entry))['tag'] ===
          '0030_account_controls',
    );
    assert.ok(upTo > 0, 'the journal names migration 0030');
    await writeFile(
      journalPath,
      JSON.stringify({ ...record, entries: entries.slice(0, upTo) }),
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
    const objectId = randomUUID();
    const setup = await openSession(migrationUrl);
    try {
      await setup.query(
        'insert into accounts (id, limit_bytes) values ($1, 1000000)',
        [accountId],
      );
      await setup.query(
        `insert into workspaces (id, name, personal) values ($1, 'Personal', true)`,
        [workspaceId],
      );
      // 7000 bytes in all, of which an image holds 5000.
      await setup.query('insert into workspace_usage values ($1, 7000)', [
        workspaceId,
      ]);
      await setup.query(
        `insert into memberships (workspace_id, account_id, role)
         values ($1, $2, 'owner')`,
        [workspaceId, accountId],
      );
      await setup.query(
        `insert into attachment_objects
           (workspace_id, id, digest, size, media_type, state)
         values ($1, $2, $3, 5000, 'image/png', 'finalized')`,
        [workspaceId, objectId, 'a'.repeat(64)],
      );
      await setup.query(
        `insert into contents (workspace_id, digest, kind, size, object_id)
         values ($1, $2, 'attachment', 5000, $3)`,
        [workspaceId, 'a'.repeat(64), objectId],
      );
    } finally {
      await setup.close();
    }
    await runMigrations(run);
    const check = await openSession(migrationUrl);
    try {
      const usage = await check.query<{ text_bytes: string }>(
        'select text_bytes::text as text_bytes from workspace_usage where workspace_id = $1',
        [workspaceId],
      );
      assert.deepEqual(usage, [{ text_bytes: '2000' }]);
      const account = await check.query<{
        standing: string;
        controls_revision: string;
        text_limit_bytes: string | null;
      }>(
        `select standing::text as standing,
                controls_revision::text as controls_revision,
                text_limit_bytes::text as text_limit_bytes
           from accounts where id = $1`,
        [accountId],
      );
      assert.deepEqual(account, [
        { standing: 'active', controls_revision: '1', text_limit_bytes: null },
      ]);
    } finally {
      await check.close();
    }
  } finally {
    await dropTestDatabase(serverUrl, name);
    await rm(earlier, { recursive: true, force: true });
  }
});

await identity.close();
await content.close();
await database.destroy();
