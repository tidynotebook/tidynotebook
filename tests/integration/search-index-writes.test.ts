/** Search writes leave no unsorted GIN entries for a later search. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { commitChangeset, searchFiles } from '@notesapp/core';
import {
  createDocumentService,
  createTestDatabase,
  dropTestDatabase,
  authRole,
  openWorkspaceStore,
  runMigrations,
  runtimeRole,
  withCredentials,
} from '@notesapp/storage-server';
import {
  changeset,
  createDisposableDatabase,
  memberActor,
  openSession,
  revision,
  seedWorkspace,
  testIdentityPassword,
  testPassword,
  testServerUrl,
} from './support/database.ts';
import {
  migrationsBefore,
  seedEarlierWorkspace,
} from './support/earlier-schema.ts';

await test('fresh note writes reach the main search index', async () => {
  const database = await createDisposableDatabase();
  const store = openWorkspaceStore(
    database.runtimeUrl,
    createDocumentService(),
  );
  const accountId = randomUUID();
  const workspaceId = randomUUID();
  const actor = memberActor(accountId, workspaceId);
  const owner = await openSession(database.migrationUrl);
  try {
    await seedWorkspace(database, workspaceId, [{ accountId, role: 'owner' }]);
    const fileId = randomUUID();
    const input = changeset(workspaceId, [
      revision({
        fileId,
        path: 'Crème.md',
        text: '# Crème\nA canoe carries the crew.\n',
      }),
    ]);
    const accepted = await commitChangeset(
      store,
      actor,
      input,
      'direct-index-write',
    );
    assert.equal(accepted.ok, true, JSON.stringify(accepted));
    const pending = await owner.query<{ pages: string }>(
      "select gin_clean_pending_list('public.search_index_document_idx'::regclass) as pages",
    );
    assert.equal(pending[0]?.pages, '0', 'a save writes no pending GIN pages');
    const found = await searchFiles(store, actor, workspaceId, 'crem');
    assert.equal(found.ok, true, JSON.stringify(found));
    if (found.ok)
      assert.deepEqual(
        found.value.map((hit) => hit.fileId),
        [fileId],
      );
  } finally {
    await owner.close();
    await store.close();
    await database.destroy();
  }
});

await test('an upgrade drains earlier writes and keeps future writes indexed', async () => {
  const earlier = await migrationsBefore('0035_direct_search_index');
  const serverUrl = testServerUrl();
  const name = `notesapp_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const migrationUrl = await createTestDatabase(serverUrl, name);
  const run = {
    databaseUrl: migrationUrl,
    documents: createDocumentService(),
    runtimePassword: testPassword(),
    authPassword: testIdentityPassword(),
  };
  const database = {
    name,
    migrationUrl,
    runtimeUrl: withCredentials(migrationUrl, runtimeRole, testPassword()),
    authUrl: withCredentials(migrationUrl, authRole, testIdentityPassword()),
    destroy: async () => await dropTestDatabase(serverUrl, name),
  };
  let store: ReturnType<typeof openWorkspaceStore> | null = null;
  try {
    await runMigrations({ ...run, migrationsFolder: earlier.folder });
    store = openWorkspaceStore(database.runtimeUrl, createDocumentService());
    const accountId = randomUUID();
    const workspaceId = randomUUID();
    const actor = memberActor(accountId, workspaceId);
    await seedEarlierWorkspace(database, workspaceId, [
      { accountId, role: 'owner' },
    ]);
    const owner = await openSession(migrationUrl);
    try {
      const indexBefore = await owner.query<{ oid: number }>(
        "select 'public.search_index_document_idx'::regclass::oid as oid",
      );
      const write = async (path: string, text: string): Promise<string> => {
        assert.ok(store !== null);
        const fileId = randomUUID();
        const input = changeset(workspaceId, [
          revision({ fileId, path, text }),
        ]);
        const result = await commitChangeset(
          store,
          actor,
          input,
          input.mutationId,
        );
        assert.equal(result.ok, true, JSON.stringify(result));
        return fileId;
      };
      const pendingPages = async (): Promise<string> => {
        const result = await owner.query<{ pages: string }>(
          "select gin_clean_pending_list('public.search_index_document_idx'::regclass) as pages",
        );
        const row = result[0];
        assert.ok(
          row !== undefined,
          'the index answers its pending page count',
        );
        return row.pages;
      };
      const first = await write(
        'Canoe.md',
        '# Canoe\nA paddler carries the crew.\n',
      );
      assert.ok(
        BigInt(await pendingPages()) > 0n,
        'the old index queues a real save',
      );
      // The check above drains its sample. A second save leaves pending
      // entries for the actual migration, with no maintenance call between.
      const second = await write(
        'Café.md',
        '# Café\nThe crew shares coffee.\n',
      );
      await runMigrations(run);
      assert.equal(
        await pendingPages(),
        '0',
        'the migration drains earlier saves',
      );
      await runMigrations(run);
      const third = await write(
        'Running.md',
        '# Running\nA runner returns along the canal.\n',
      );
      assert.equal(
        await pendingPages(),
        '0',
        'an upgraded index queues no later save',
      );
      const indexAfter = await owner.query<{ oid: number }>(
        "select 'public.search_index_document_idx'::regclass::oid as oid",
      );
      assert.deepEqual(
        indexAfter,
        indexBefore,
        'the migration retains the existing index',
      );
      for (const [query, fileId] of [
        ['cano', first],
        ['cafe', second],
        ['run', third],
      ]) {
        assert.ok(typeof query === 'string' && typeof fileId === 'string');
        const found = await searchFiles(store, actor, workspaceId, query);
        assert.equal(found.ok, true, JSON.stringify(found));
        if (found.ok)
          assert.deepEqual(
            found.value.map((hit) => hit.fileId),
            [fileId],
          );
      }
    } finally {
      await owner.close();
    }
  } finally {
    if (store !== null) await store.close();
    await database.destroy();
    await earlier.remove();
  }
});
