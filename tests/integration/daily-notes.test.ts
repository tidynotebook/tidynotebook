/**
 * The daily note settings of a member, against a real server and database.
 *
 * Record 0099 puts the settings on one member of one workspace. This file
 * proves the served operations with a real session, and then proves the
 * database guarantees that no operation shows: the row policy that keeps the
 * settings of one member from another, the membership reference that takes a
 * row away with its member and its workspace, and the template reference that
 * a purge clears without touching the rest of the row.
 *
 * Start the service first:
 *
 * ```sh
 * sudo -n docker compose -f compose.test.yaml up -d --wait
 * ```
 */
import assert from 'node:assert/strict';
import {
  deletionForHead,
  firstSave,
  useDocumentHeaders,
} from './support/documents.ts';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  configureClient,
  createFile,
  deleteFile,
  getDailyNoteSettings,
  listWorkspaces,
  purgeFiles,
  signInWithPassword,
  updateDailyNoteSettings,
} from '@notesapp/api-client';
import {
  acceptWithDocuments,
  defaultDailyNoteLayout,
  deleteWorkspace,
  readDailyNoteSettings,
  updateDailyNoteSettings as storeDailyNoteSettings,
} from '@notesapp/core';
import {
  bootstrapOwner,
  createAuth,
  createAuthPool,
  createAuthProtocol,
  createHandlers,
  createIdentityAdapter,
  loadServerConfig,
  type ServerConfig,
  sessionAllowedBy,
} from '@notesapp/server';
import {
  createDocumentService,
  openAttachmentStore,
  openFileObjectStore,
  openIdentityStore,
  openWorkspaceStore,
} from '@notesapp/storage-server';
import {
  changeset,
  createDisposableDatabase,
  memberActor,
  openSession,
  revision,
  seedWorkspace,
} from './support/database.ts';
import { startTestServer } from './support/server.ts';

function responseOf(response: Response | undefined): Response {
  if (response === undefined)
    throw new Error('The generated client returned no HTTP response.');
  return response;
}

function cookieHeader(values: readonly string[]): string {
  return values
    .map((value) => (value.split(';')[0] ?? '').trim())
    .filter((value) => value !== '' && !value.endsWith('='))
    .join('; ');
}

/** Reads one property of an unknown value without asserting its shape. */
function readProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value))[key];
}

const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-daily-test-'));
const environment = (): Record<string, string> => ({
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'daily-test-secret-value-000123456789abcd',
  NOTESAPP_LOG_LEVEL: 'error',
  NOTESAPP_MAX_BODY_BYTES: '8388608',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
});
const config: ServerConfig = loadServerConfig(environment());
const identity = openIdentityStore(database.runtimeUrl);
const content = openWorkspaceStore(
  database.runtimeUrl,
  createDocumentService(),
  { poolSize: 4 },
);
const attachments = openAttachmentStore(
  database.runtimeUrl,
  openFileObjectStore(storageRoot),
  {
    poolSize: 4,
  },
);
const authPool = createAuthPool(config);
const auth = createAuth(
  config,
  { mail: null, sessionAllowed: sessionAllowedBy(identity) },
  authPool,
);
const adapter = createIdentityAdapter({
  auth: auth.auth,
  identity,
  servedOrigins: config.servedOrigins,
});
const server = await startTestServer({
  environment: environment(),
  handlers: (value) =>
    createHandlers(value, undefined, { store: identity, content, attachments }),
  identity: adapter.resolver,
  protocols: [createAuthProtocol(config, auth.auth)],
});
configureClient(server.baseUrl, undefined);

const email = 'daily-owner@notes.invalid';
const password = 'owner-password-123456';
await bootstrapOwner({ config, email, name: 'Daily Owner', password });
const signedIn = await signInWithPassword({
  headers: { origin: 'http://127.0.0.1' },
  body: { email, password },
});
const cookie = cookieHeader(
  responseOf(signedIn.response).headers.getSetCookie(),
);
const headers = { origin: 'http://127.0.0.1', cookie };
useDocumentHeaders(headers);
const workspaces = await listWorkspaces({ headers });
const workspaceId = workspaces.data?.workspaces[0]?.workspaceId ?? '';
assert.match(workspaceId, /^[0-9a-f-]{36}$/);
const device = 'daily-test';
/** A layout of folders, as a member may keep it (record 0101). */
const layout = { folder: 'Journal', format: 'YYYY/MM/YYYY-MM-DD dddd' };

/** Creates one saved note and answers its identifier and its entity tag. */
async function makeNote(
  path: string,
  text: string,
): Promise<{ readonly fileId: string; readonly tag: string }> {
  const fileId = randomUUID();
  const created = await createFile({
    headers,
    path: { workspaceId },
    body: {
      fileId,
      path,
      document: firstSave(text),
      revisionId: randomUUID(),
      mutationId: randomUUID(),
      deviceId: device,
    },
  });
  assert.equal(created.error, undefined, JSON.stringify(created.error));
  return {
    fileId,
    tag: responseOf(created.response).headers.get('etag') ?? '',
  };
}

/** Moves one note to Trash by its entity tag. */
async function removeNote(fileId: string, tag: string): Promise<void> {
  const deleted = await deleteFile({
    headers: { ...headers, 'if-match': tag },
    path: { workspaceId, fileId },
    body: {
      revisionId: randomUUID(),
      mutationId: randomUUID(),
      deviceId: device,
      message: null,
      document: await deletionForHead(workspaceId, tag.replace(/"/g, '')),
    },
  });
  assert.equal(deleted.error, undefined, JSON.stringify(deleted.error));
}

/** The settings that the server answers for the owner now. */
async function settingsNow(): Promise<unknown> {
  const read = await getDailyNoteSettings({ headers, path: { workspaceId } });
  assert.equal(read.error, undefined, JSON.stringify(read.error));
  return read.data;
}

await test('a member who stored nothing reads no template and no start', async () => {
  assert.deepEqual(await settingsNow(), {
    templateFileId: null,
    openOnStart: false,
    ...defaultDailyNoteLayout,
  });
});

await test('a member stores a live note as the template and reads it back', async () => {
  const template = await makeNote('Templates/Day.md', '# Plan\n\n- [ ] \n');
  const stored = await updateDailyNoteSettings({
    headers,
    path: { workspaceId },
    body: { templateFileId: template.fileId, openOnStart: true, ...layout },
  });
  assert.equal(stored.error, undefined, JSON.stringify(stored.error));
  assert.deepEqual(stored.data, {
    templateFileId: template.fileId,
    openOnStart: true,
    ...layout,
  });
  assert.deepEqual(await settingsNow(), stored.data);

  // No template is a choice as well, and it keeps the start choice.
  const cleared = await updateDailyNoteSettings({
    headers,
    path: { workspaceId },
    body: { templateFileId: null, openOnStart: true, ...layout },
  });
  assert.deepEqual(cleared.data, {
    templateFileId: null,
    openOnStart: true,
    ...layout,
  });
});

await test('a template that is not a live note is refused and nothing changes', async () => {
  const before = await settingsNow();
  const trashed = await makeNote('Templates/Old.md', '# Old\n');
  await removeNote(trashed.fileId, trashed.tag);
  for (const templateFileId of [randomUUID(), trashed.fileId]) {
    const refused = await updateDailyNoteSettings({
      headers,
      path: { workspaceId },
      body: { templateFileId, openOnStart: false, ...layout },
    });
    assert.equal(responseOf(refused.response).status, 404);
    assert.equal(readProperty(refused.error, 'code'), 'not_found');
  }
  assert.deepEqual(await settingsNow(), before);
});

await test('a layout that cannot name every date is refused and nothing changes', async () => {
  const before = await settingsNow();
  for (const refused of [
    { folder: 'Journal', format: 'YYYY-MM' },
    { folder: '/Journal', format: 'YYYY-MM-DD' },
    { folder: 'Journal', format: 'YYYY//MM-DD' },
  ]) {
    const answer = await updateDailyNoteSettings({
      headers,
      path: { workspaceId },
      body: { templateFileId: null, openOnStart: true, ...refused },
    });
    assert.equal(responseOf(answer.response).status, 422);
    assert.equal(readProperty(answer.error, 'code'), 'invalid_path');
  }
  assert.deepEqual(await settingsNow(), before);
});

await test('a template in Trash stays named, and a purge clears it alone', async () => {
  const template = await makeNote('Templates/Week.md', '# Week\n');
  await updateDailyNoteSettings({
    headers,
    path: { workspaceId },
    body: { templateFileId: template.fileId, openOnStart: true, ...layout },
  });
  await removeNote(template.fileId, template.tag);
  // The reference stays, so a restore brings the template back.
  assert.deepEqual(await settingsNow(), {
    templateFileId: template.fileId,
    openOnStart: true,
    ...layout,
  });

  const purged = await purgeFiles({
    headers,
    path: { workspaceId },
    body: { mutationId: randomUUID(), fileIds: [template.fileId] },
  });
  assert.equal(purged.error, undefined, JSON.stringify(purged.error));
  assert.deepEqual(await settingsNow(), {
    templateFileId: null,
    openOnStart: true,
    ...layout,
  });
});

// The rest of this file reads the database guarantees on a workspace of two
// members, which the first run of the product cannot make through a screen.
const alice = randomUUID();
const bob = randomUUID();
const shared = randomUUID();
const spare = randomUUID();
await seedWorkspace(database, shared, [
  { accountId: alice, role: 'owner' },
  { accountId: bob, role: 'owner' },
]);
// Alice keeps a second workspace, so she may delete the shared one.
await seedWorkspace(database, spare, [{ accountId: alice, role: 'owner' }]);
const aliceActor = memberActor(alice, shared);
const bobActor = memberActor(bob, shared);
const aliceTemplate = randomUUID();
{
  const input = changeset(shared, [
    revision({ fileId: aliceTemplate, path: 'Templates/Alice.md' }),
  ]);
  const saved = await content.transact(aliceActor, shared, (tx) =>
    acceptWithDocuments(
      content.documents,
      tx,
      aliceActor,
      input,
      input.mutationId,
    ),
  );
  assert.equal(saved.ok, true, JSON.stringify(saved));
}

await test('one member never reads or writes the settings of another', async () => {
  const stored = await storeDailyNoteSettings(content, aliceActor, shared, {
    templateFileId: aliceTemplate,
    openOnStart: true,
    ...layout,
  });
  assert.equal(stored.ok, true, JSON.stringify(stored));
  // Bob reads his own defaults, not the choice of Alice.
  assert.deepEqual(await readDailyNoteSettings(content, bobActor, shared), {
    ok: true,
    value: {
      templateFileId: null,
      openOnStart: false,
      ...defaultDailyNoteLayout,
    },
  });

  // The row policy holds without the use case in front of it.
  const session = await openSession(database.runtimeUrl, bob);
  try {
    assert.deepEqual(
      await session.query('select account_id from daily_note_settings'),
      [],
    );
    const updated = await session.query(
      `update daily_note_settings set open_on_start = false
        where account_id = $1 returning account_id`,
      [alice],
    );
    assert.deepEqual(updated, []);
    const refused = await session.failure(
      `insert into daily_note_settings (workspace_id, account_id, open_on_start)
       values ($1, $2, false)`,
      [shared, alice],
    );
    assert.equal(refused.code, '42501');
    // The runtime role removes no row at all.
    const removal = await session.failure(
      'delete from daily_note_settings where account_id = $1',
      [bob],
    );
    assert.equal(removal.code, '42501');
  } finally {
    await session.close();
  }
  assert.deepEqual(await readDailyNoteSettings(content, aliceActor, shared), {
    ok: true,
    value: { templateFileId: aliceTemplate, openOnStart: true, ...layout },
  });
});

/** The accounts that hold a settings row in one workspace. */
async function rowsOf(workspace: string): Promise<readonly string[]> {
  const session = await openSession(database.migrationUrl);
  try {
    const rows = await session.query<{ account_id: string }>(
      `select account_id from daily_note_settings
        where workspace_id = $1 order by account_id`,
      [workspace],
    );
    return rows.map((row) => row.account_id);
  } finally {
    await session.close();
  }
}

await test('a member who leaves takes their settings, and the workspace takes the rest', async () => {
  const stored = await storeDailyNoteSettings(content, bobActor, shared, {
    templateFileId: null,
    openOnStart: true,
    ...defaultDailyNoteLayout,
  });
  assert.equal(stored.ok, true, JSON.stringify(stored));
  assert.deepEqual(await rowsOf(shared), [alice, bob].sort());

  const owner = await openSession(database.migrationUrl);
  try {
    await owner.query(
      'delete from memberships where workspace_id = $1 and account_id = $2',
      [shared, bob],
    );
  } finally {
    await owner.close();
  }
  assert.deepEqual(await rowsOf(shared), [alice]);

  const removed = await deleteWorkspace(identity, aliceActor, shared);
  assert.equal(removed.ok, true, JSON.stringify(removed));
  assert.deepEqual(await rowsOf(shared), []);
});

await server.close();
await auth.close();
await authPool.end();
await attachments.close();
await content.close();
await identity.close();
await rm(storageRoot, { recursive: true, force: true });
await database.destroy();
