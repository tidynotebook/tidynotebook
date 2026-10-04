/**
 * The template settings of a member, against a real server and database.
 *
 * Record 0149 puts the template folder on one member of one workspace, as
 * record 0099 puts the daily note settings. This file proves the served
 * operations with a real session, and then proves the database guarantees
 * that no operation shows: the row policy that keeps the settings of one
 * member from another, and the membership reference that takes a row away
 * with its member and its workspace.
 *
 * Start the service first:
 *
 * ```sh
 * sudo -n docker compose -f compose.test.yaml up -d --wait
 * ```
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  configureClient,
  getTemplateSettings,
  listWorkspaces,
  signInWithPassword,
  updateTemplateSettings,
} from '@notesapp/api-client';
import {
  defaultTemplateSettings,
  deleteWorkspace,
  readTemplateSettings,
  updateTemplateSettings as storeTemplateSettings,
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
  createDisposableDatabase,
  memberActor,
  openSession,
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
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-template-test-'));
const environment = (): Record<string, string> => ({
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'template-test-secret-value-00123456789ab',
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

const email = 'template-owner@notes.invalid';
const password = 'owner-password-123456';
await bootstrapOwner({ config, email, name: 'Template Owner', password });
const signedIn = await signInWithPassword({
  headers: { origin: 'http://127.0.0.1' },
  body: { email, password },
});
const cookie = cookieHeader(
  responseOf(signedIn.response).headers.getSetCookie(),
);
const headers = { origin: 'http://127.0.0.1', cookie };
const workspaces = await listWorkspaces({ headers });
const workspaceId = workspaces.data?.workspaces[0]?.workspaceId ?? '';
assert.match(workspaceId, /^[0-9a-f-]{36}$/);

/** The settings that the server answers for the owner now. */
async function settingsNow(): Promise<unknown> {
  const read = await getTemplateSettings({ headers, path: { workspaceId } });
  assert.equal(read.error, undefined, JSON.stringify(read.error));
  return read.data;
}

await test('a member who stored nothing reads the default folder', async () => {
  assert.deepEqual(await settingsNow(), { folder: 'Templates' });
  assert.deepEqual(await settingsNow(), defaultTemplateSettings);
});

await test('a member stores a folder of their own and reads it back', async () => {
  const stored = await updateTemplateSettings({
    headers,
    path: { workspaceId },
    body: { folder: 'Home/Templates' },
  });
  assert.equal(stored.error, undefined, JSON.stringify(stored.error));
  assert.deepEqual(stored.data, { folder: 'Home/Templates' });
  assert.deepEqual(await settingsNow(), { folder: 'Home/Templates' });
});

await test('a folder that names no folder is refused and nothing changes', async () => {
  const before = await settingsNow();
  for (const folder of ['/Templates', 'Templates/', 'A//B', ' Templates']) {
    const answer = await updateTemplateSettings({
      headers,
      path: { workspaceId },
      body: { folder },
    });
    assert.equal(responseOf(answer.response).status, 422, folder);
    assert.equal(readProperty(answer.error, 'code'), 'invalid_path');
  }
  // The contract refuses the empty folder before a use case reads it.
  const empty = await updateTemplateSettings({
    headers,
    path: { workspaceId },
    body: { folder: '' },
  });
  assert.equal(responseOf(empty.response).status, 400);
  assert.deepEqual(await settingsNow(), before);
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

await test('one member never reads or writes the settings of another', async () => {
  const stored = await storeTemplateSettings(content, aliceActor, shared, {
    folder: 'Alice/Templates',
  });
  assert.equal(stored.ok, true, JSON.stringify(stored));
  // Bob reads his own default, not the choice of Alice.
  assert.deepEqual(await readTemplateSettings(content, bobActor, shared), {
    ok: true,
    value: defaultTemplateSettings,
  });

  // The row policy holds without the use case in front of it.
  const session = await openSession(database.runtimeUrl, bob);
  try {
    assert.deepEqual(
      await session.query('select account_id from template_settings'),
      [],
    );
    const updated = await session.query(
      `update template_settings set folder = 'Bob'
        where account_id = $1 returning account_id`,
      [alice],
    );
    assert.deepEqual(updated, []);
    const refused = await session.failure(
      `insert into template_settings (workspace_id, account_id, folder)
       values ($1, $2, 'Bob')`,
      [shared, alice],
    );
    assert.equal(refused.code, '42501');
    // The runtime role removes no row at all.
    const removal = await session.failure(
      'delete from template_settings where account_id = $1',
      [bob],
    );
    assert.equal(removal.code, '42501');
    // The database holds the bound of the contract as well.
    const empty = await session.failure(
      `insert into template_settings (workspace_id, account_id, folder)
       values ($1, $2, '')`,
      [shared, bob],
    );
    assert.equal(empty.code, '23514');
  } finally {
    await session.close();
  }
  assert.deepEqual(await readTemplateSettings(content, aliceActor, shared), {
    ok: true,
    value: { folder: 'Alice/Templates' },
  });
});

/** The accounts that hold a settings row in one workspace. */
async function rowsOf(workspace: string): Promise<readonly string[]> {
  const session = await openSession(database.migrationUrl);
  try {
    const rows = await session.query<{ account_id: string }>(
      `select account_id from template_settings
        where workspace_id = $1 order by account_id`,
      [workspace],
    );
    return rows.map((row) => row.account_id);
  } finally {
    await session.close();
  }
}

await test('a member who leaves takes their settings, and the workspace takes the rest', async () => {
  const stored = await storeTemplateSettings(content, bobActor, shared, {
    folder: 'Templates',
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
