/** The upgrade marks only the approved empty accounts as pending. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  commitChangeset,
  createFileChangeset,
  workspaceText,
} from '@notesapp/core';
import {
  createDocumentService,
  createTestDatabase,
  dropTestDatabase,
  openWorkspaceStore,
  runMigrations,
  runtimeRole,
  authRole,
  testRuntimePassword,
  testAuthPassword,
  withCredentials,
} from '@notesapp/storage-server';
import {
  memberActor,
  openSession,
  testServerUrl,
  type TestDatabase,
} from './support/database.ts';
import {
  migrationsBefore,
  seedEarlierWorkspace,
} from './support/earlier-schema.ts';

await test('the welcome note migration uses the UTC cutoff, account bytes, and retained note records', async () => {
  const earlier = await migrationsBefore('0040_kind_eternals');
  const serverUrl = testServerUrl();
  const name = `notesapp_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const migrationUrl = await createTestDatabase(serverUrl, name);
  const options = {
    databaseUrl: migrationUrl,
    documents: createDocumentService(),
    runtimePassword: testRuntimePassword,
    authPassword: testAuthPassword,
  };
  const database: TestDatabase = {
    name,
    migrationUrl,
    runtimeUrl: withCredentials(migrationUrl, runtimeRole, testRuntimePassword),
    authUrl: withCredentials(migrationUrl, authRole, testAuthPassword),
    destroy: () => dropTestDatabase(serverUrl, name),
  };
  let session: Awaited<ReturnType<typeof openSession>> | undefined;
  let content: ReturnType<typeof openWorkspaceStore> | undefined;
  try {
    await runMigrations({ ...options, migrationsFolder: earlier.folder });
    session = await openSession(migrationUrl);
    const sql = session;
    content = openWorkspaceStore(database.runtimeUrl, options.documents);
    const eligible: string[] = [];
    const excluded: string[] = [];
    async function account(createdAt = '2026-10-22T00:00:00Z') {
      const accountId = randomUUID();
      const workspaceId = randomUUID();
      await seedEarlierWorkspace(database, workspaceId, [
        { accountId, role: 'owner' },
      ]);
      await sql.query('update accounts set created_at = $2 where id = $1', [
        accountId,
        createdAt,
      ]);
      await sql.query('update workspaces set personal = true where id = $1', [
        workspaceId,
      ]);
      return { accountId, workspaceId };
    }

    const old = await account('2026-10-21T23:59:59.999999Z');
    excluded.push(old.workspaceId);
    const boundary = await account();
    eligible.push(boundary.workspaceId);
    const later = await account('2026-10-22T17:34:37.998Z');
    await sql.query("update accounts set standing = 'locked' where id = $1", [
      later.accountId,
    ]);
    eligible.push(later.workspaceId);
    const recent = await account('2026-10-23T00:00:00Z');
    eligible.push(recent.workspaceId);

    const used = await account();
    await sql.query(
      'update workspace_usage set bytes_used = 1 where workspace_id = $1',
      [used.workspaceId],
    );
    excluded.push(used.workspaceId);
    const otherWorkspace = await account();
    const spareId = randomUUID();
    await seedEarlierWorkspace(database, spareId, [
      { accountId: otherWorkspace.accountId, role: 'owner' },
    ]);
    await sql.query(
      'update workspace_usage set bytes_used = 1 where workspace_id = $1',
      [spareId],
    );
    excluded.push(otherWorkspace.workspaceId);

    for (const deleted of [false, true]) {
      const existing = await account();
      // The path record must exclude even an account whose usage is zero.
      await sql.query(
        `insert into files(workspace_id, id, path, kind, deleted)
        values ($1, $2, 'Welcome to tidy notebook.md', 'note', $3)`,
        [existing.workspaceId, randomUUID(), deleted],
      );
      excluded.push(existing.workspaceId);
    }

    const renamed = await account();
    const fileId = randomUUID();
    const input = createFileChangeset({
      workspaceId: renamed.workspaceId,
      fileId,
      revisionId: randomUUID(),
      path: 'Welcome to tidy notebook.md',
      content: workspaceText('Test welcome note.', 1),
      message: null,
      ids: {
        mutationId: randomUUID(),
        deviceId: randomUUID(),
        clientTime: new Date().toISOString(),
      },
    });
    assert.equal(
      (
        await commitChangeset(
          content,
          memberActor(renamed.accountId, renamed.workspaceId),
          input,
          'migration-test',
        )
      ).ok,
      true,
    );
    await sql.query(
      "update files set path = 'Renamed.md' where workspace_id = $1",
      [renamed.workspaceId],
    );
    // Isolate the historical path exclusion from the independent usage test.
    await sql.query(
      'update workspace_usage set bytes_used = 0, text_bytes = 0 where workspace_id = $1',
      [renamed.workspaceId],
    );
    excluded.push(renamed.workspaceId);

    const purged = await account();
    await sql.query(
      'insert into purge_markers(workspace_id, file_id) values ($1, $2)',
      [purged.workspaceId, randomUUID()],
    );
    excluded.push(purged.workspaceId);
    const disabled = await account();
    await sql.query("update accounts set state = 'disabled' where id = $1", [
      disabled.accountId,
    ]);
    excluded.push(disabled.workspaceId);
    const removed = await account();
    await sql.query('update accounts set removed_at = now() where id = $1', [
      removed.accountId,
    ]);
    excluded.push(removed.workspaceId);

    await runMigrations(options);
    const pending = await sql.query<{
      workspace_id: string;
      completed_at: Date | null;
    }>(
      'select workspace_id, completed_at from workspace_welcome_notes order by workspace_id',
    );
    assert.deepEqual(
      pending.map((row) => row.workspace_id),
      eligible.toSorted(),
    );
    assert.ok(pending.every((row) => row.completed_at === null));
    assert.ok(
      excluded.every((id) => !pending.some((row) => row.workspace_id === id)),
    );

    await sql.query(
      'update workspace_welcome_notes set completed_at = now() where workspace_id = $1',
      [boundary.workspaceId],
    );
    await runMigrations(options);
    const [kept] = await sql.query<{ completed_at: Date | null }>(
      'select completed_at from workspace_welcome_notes where workspace_id = $1',
      [boundary.workspaceId],
    );
    assert.ok(kept?.completed_at);
    const newPersonal = randomUUID();
    await sql.query(
      "insert into workspaces(id, name, personal) values ($1, 'Personal', true)",
      [newPersonal],
    );
    const [newState] = await sql.query<{ completed_at: Date | null }>(
      'select completed_at from workspace_welcome_notes where workspace_id = $1',
      [newPersonal],
    );
    assert.equal(
      newState?.completed_at,
      null,
      'new personal workspaces start pending',
    );
    const ordinary = randomUUID();
    await sql.query("insert into workspaces(id, name) values ($1, 'Other')", [
      ordinary,
    ]);
    assert.equal(
      (
        await sql.query(
          'select 1 from workspace_welcome_notes where workspace_id = $1',
          [ordinary],
        )
      ).length,
      0,
    );
  } finally {
    await content?.close();
    await session?.close();
    await database.destroy();
    await earlier.remove();
  }
});
