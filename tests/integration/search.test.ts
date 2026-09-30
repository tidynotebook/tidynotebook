/** Search relevance, permission, and local draft search checks. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import pg from 'pg';
import {
  commitChangeset,
  searchFiles,
  verifyActor,
  tombstoneContent,
  type RevisionInput,
} from '@notesapp/core';
import { openLocalStore } from '@notesapp/storage-browser';
import {
  createDocumentService,
  openWorkspaceStore,
} from '@notesapp/storage-server';
import { searchLocal } from '@notesapp/sync';
import {
  changeset,
  memberActor,
  revision,
  seedWorkspace,
  createDisposableDatabase,
} from './support/database.ts';

const database = await createDisposableDatabase();
const store = openWorkspaceStore(database.runtimeUrl, createDocumentService());
const accountId = randomUUID();
const workspaceId = randomUUID();
await seedWorkspace(database, workspaceId, [{ accountId, role: 'owner' }]);
const actor = memberActor(accountId, workspaceId);

/** Accepts one or more revisions and returns their last revision. */
async function accept(
  entries: readonly RevisionInput[],
  expectedHeads?: Readonly<Record<string, string | null>>,
): Promise<RevisionInput> {
  const input = changeset(workspaceId, entries, {
    ...(expectedHeads === undefined ? {} : { expectedHeads }),
  });
  const accepted = await commitChangeset(
    store,
    actor,
    input,
    `search-${input.mutationId}`,
  );
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  const last = entries.at(-1);
  assert.ok(last !== undefined);
  return last;
}

await test('search includes accepted titles and content but not deleted notes', async () => {
  const fileId = randomUUID();
  const first = await accept([
    revision({
      fileId,
      path: 'plans/offline.md',
      text: '# Recovery\nThe durable queue keeps offline work safe.\n',
    }),
  ]);
  const found = await searchFiles(store, actor, workspaceId, 'durable offline');
  assert.equal(found.ok, true);
  if (found.ok) {
    assert.deepEqual(
      found.value.map((hit) => hit.fileId),
      [fileId],
    );
    assert.equal(found.value[0]?.revisionId, first.id);
  }

  await accept(
    [
      revision({
        fileId,
        parents: [first.id],
        path: first.path,
        deleted: true,
        content: tombstoneContent(first.content, {
          work: { kind: 'none' },
          epoch: 1,
          observed: null,
        }),
      }),
    ],
    { [fileId]: first.id },
  );
  const afterDelete = await searchFiles(store, actor, workspaceId, 'durable');
  assert.equal(afterDelete.ok, true);
  if (afterDelete.ok) assert.deepEqual(afterDelete.value, []);
});

await test('the index stems, so one word form finds another', async () => {
  const fileId = randomUUID();
  await accept([
    revision({
      fileId,
      path: 'training/Sprints.md',
      text: '# Sprints\nThe team is running along the canal.\n',
    }),
  ]);
  const found = await searchFiles(store, actor, workspaceId, 'run canal');
  assert.equal(found.ok, true);
  if (found.ok)
    assert.deepEqual(
      found.value.map((hit) => hit.fileId),
      [fileId],
    );
});

await test('the last word matches as a prefix, so search as you type works', async () => {
  const fileId = randomUUID();
  await accept([
    revision({
      fileId,
      path: 'index/Notes.md',
      text: '# Notes\nOne list of everything.\n',
    }),
  ]);
  const found = await searchFiles(store, actor, workspaceId, 'not');
  assert.equal(found.ok, true);
  if (found.ok)
    assert.ok(
      found.value.some((hit) => hit.fileId === fileId),
      'a note named Notes answers the prefix "not"',
    );
});

await test('a name match ranks above a note that matches in its text alone', async () => {
  const namedId = randomUUID();
  const bodyId = randomUUID();
  await accept([
    revision({
      fileId: bodyId,
      path: 'boats/Canoes.md',
      text: `# Canoes\n${'A kayak is not a canoe. '.repeat(20)}`,
    }),
    revision({
      fileId: namedId,
      path: 'boats/Kayak.md',
      text: '# Kayak\nOne boat for one person.\n',
    }),
  ]);
  const found = await searchFiles(store, actor, workspaceId, 'kayak');
  assert.equal(found.ok, true);
  if (found.ok)
    assert.deepEqual(
      found.value.map((hit) => hit.fileId),
      [namedId, bodyId],
    );
});

await test('the excerpt is the matching part of the note, with the word marked', async () => {
  const fileId = randomUUID();
  await accept([
    revision({
      fileId,
      path: 'gear/Jackets.md',
      text: `# Jackets\n${'Padding and lining. '.repeat(40)}Every jacket carries its own flotation.\n`,
    }),
  ]);
  const found = await searchFiles(store, actor, workspaceId, 'flotation');
  assert.equal(found.ok, true);
  if (!found.ok) return;
  const hit = found.value.find((entry) => entry.fileId === fileId);
  assert.ok(hit !== undefined);
  assert.deepEqual(
    hit.excerpt.filter((part) => part.marked).map((part) => part.text),
    ['flotation'],
  );
  const whole = hit.excerpt.map((part) => part.text).join('');
  assert.match(whole, /carries its own flotation/);
  assert.ok(
    !whole.includes('# Jackets'),
    'the excerpt shows the match and not the head of the note',
  );
});

await test('a search of more notes than the limit answers the best ranked page', async () => {
  // Issue 207. The page is ranked and cut before its excerpts, so the cut
  // keeps the name match and the notes that hold the word most often.
  const namedId = randomUUID();
  const oftenId = randomUUID();
  const entries = [
    revision({
      fileId: namedId,
      path: 'rivers/Rapids.md',
      text: '# Rapids\nOne note.\n',
    }),
    revision({
      fileId: oftenId,
      path: 'rivers/Often.md',
      text: `# Often\n${'rapids '.repeat(30)}\n`,
    }),
    ...Array.from({ length: 6 }, (_, index) =>
      revision({
        fileId: randomUUID(),
        path: `rivers/Once ${String(index)}.md`,
        text: `# Once ${String(index)}\n${'Calm water. '.repeat(20)} rapids.\n`,
      }),
    ),
  ];
  await accept(entries);
  const found = await searchFiles(store, actor, workspaceId, 'rapids', 2);
  assert.equal(found.ok, true);
  if (!found.ok) return;
  assert.deepEqual(
    found.value.map((hit) => hit.fileId),
    [namedId, oftenId],
  );
  for (const hit of found.value)
    assert.ok(hit.excerpt.some((part) => part.marked));
});

await test('the search reads the stored vector of a note', async () => {
  // Issue 207. A vector built from the text of each match at query time
  // cost most of the search, so the index stores it and the function reads
  // it. The definition names no text search parse of a row.
  const client = new pg.Client({ connectionString: database.migrationUrl });
  await client.connect();
  try {
    const definition = await client.query<{ source: string }>(
      "select pg_get_functiondef('public.notesapp_search(uuid, text, integer)'::regprocedure) as source",
    );
    const source = definition.rows[0]?.source ?? '';
    assert.match(source, /indexed\.document @@ needle/);
    assert.doesNotMatch(source, /to_tsvector/);
    const column = await client.query<{ generated: string }>(
      `select is_generated as generated from information_schema.columns
        where table_schema = 'public' and table_name = 'search_index'
          and column_name = 'document'`,
    );
    assert.equal(column.rows[0]?.generated, 'ALWAYS');
  } finally {
    await client.end();
  }
});

await test('search requires the current role and a read grant', async () => {
  const created = verifyActor(accountId, [{ workspaceId, actions: ['write'] }]);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const denied = await searchFiles(
    store,
    created.value,
    workspaceId,
    'Duplicate',
  );
  assert.deepEqual(denied, {
    ok: false,
    error: { code: 'forbidden', fileIds: [] },
  });
});

await test('the indexed search function checks transaction membership directly', async () => {
  await accept([
    revision({
      fileId: randomUUID(),
      path: 'a/Duplicate.md',
      text: '# Duplicate\nOne duplicate note for the membership check.\n',
    }),
  ]);
  const client = new pg.Client({ connectionString: database.runtimeUrl });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('notesapp.account_id', $1, true)", [
      accountId,
    ]);
    const member = await client.query<{ file_id: string }>(
      'select file_id from public.notesapp_search($1, $2, $3)',
      [workspaceId, 'Duplicate', 10],
    );
    assert.ok(member.rows.length > 0);
    await client.query('rollback');

    await client.query('begin');
    await client.query("select set_config('notesapp.account_id', $1, true)", [
      randomUUID(),
    ]);
    const stranger = await client.query<{ file_id: string }>(
      'select file_id from public.notesapp_search($1, $2, $3)',
      [workspaceId, 'Duplicate', 10],
    );
    assert.deepEqual(stranger.rows, []);
    await client.query('rollback');
  } finally {
    await client.end();
  }
});

await test('local draft search stays inside its account and workspace', async () => {
  const local = await openLocalStore('https://local-search.test', {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    databaseName: `notesapp-search-${randomUUID()}`,
    deviceId: 'search-device',
  });
  const otherAccount = randomUUID();
  await local.saveDraft({
    accountId,
    workspaceId,
    workingCopyId: randomUUID(),
    fileId: randomUUID(),
    baseRevisionId: null,
    text: 'pending draft needle',
    path: 'draft.md',
    deleted: false,
    sequence: 1,
  });
  await local.saveDraft({
    accountId: otherAccount,
    workspaceId,
    workingCopyId: randomUUID(),
    fileId: randomUUID(),
    baseRevisionId: null,
    text: 'private needle',
    path: 'private.md',
    deleted: false,
    sequence: 1,
  });
  const documents = await local.listSearchFiles(accountId, workspaceId);
  assert.deepEqual(
    searchLocal('needle', documents).map((hit) => hit.path),
    ['draft.md'],
  );
  await local.close();
});

await store.close();
await database.destroy();
