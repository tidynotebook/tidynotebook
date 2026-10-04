/**
 * The bounds of an import in parts on the disk of the server (record 0192).
 *
 * The import parts used to skip the check of the free space that the single
 * body of an import had, an account could hold any number of open imports,
 * and a client that failed left its parts for a day. The file store of this
 * file states a room that the test sets, so each refusal is reached without
 * filling a disk.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  abortWorkspaceImport,
  completeWorkspaceImport,
  configureClient,
  getAccount,
  listWorkspaces,
  sendWorkspaceImportPart,
  signInWithPassword,
  startWorkspaceImport,
} from '@notesapp/api-client';
import {
  archiveDiskReserveBytes,
  bootstrapOwner,
  coordinatedArchiveJobs,
  createAuth,
  createAuthPool,
  createAuthProtocol,
  createHandlers,
  createIdentityAdapter,
  loadServerConfig,
  sessionAllowedBy,
} from '@notesapp/server';
import {
  createDocumentService,
  importKey,
  openAttachmentStore,
  openCoordination,
  openFileObjectStore,
  openIdentityStore,
  openWorkspaceStore,
  type ObjectStore,
} from '@notesapp/storage-server';
import { createDisposableDatabase } from './support/database.ts';
import { startTestServer } from './support/server.ts';
import { storedArchive } from './support/zip.ts';

function responseOf(response: Response | undefined): Response {
  if (response === undefined)
    throw new Error('The generated client returned no HTTP response.');
  return response;
}

function readProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value))[key];
}

function cookieHeader(values: readonly string[]): string {
  return values
    .map((entry) => (entry.split(';')[0] ?? '').trim())
    .filter((entry) => entry !== '' && !entry.endsWith('='))
    .join('; ');
}

const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-import-parts-'));

/** The room that the store states, which each test sets. */
let statedRoom = Number.MAX_SAFE_INTEGER;
const files = openFileObjectStore(storageRoot);
const objects: ObjectStore = {
  ...files,
  room: () => Promise.resolve(statedRoom),
};

const identity = openIdentityStore(database.runtimeUrl);
const content = openWorkspaceStore(
  database.runtimeUrl,
  createDocumentService(),
  { poolSize: 4 },
);
const attachments = openAttachmentStore(database.runtimeUrl, objects, {
  poolSize: 4,
});
const coordination = openCoordination(database.runtimeUrl, { poolSize: 2 });
const environment: Record<string, string> = {
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'import-parts-test-secret-0123456789abcdef',
  NOTESAPP_LOG_LEVEL: 'silent',
  NOTESAPP_MAX_BODY_BYTES: '1048576',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
};
const config = loadServerConfig(environment);
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
  environment,
  handlers: (value) =>
    createHandlers(value, undefined, {
      store: identity,
      content,
      attachments,
      archiveJobs: coordinatedArchiveJobs(coordination),
    }),
  identity: adapter.resolver,
  protocols: [createAuthProtocol(config, auth.auth)],
});
configureClient(server.baseUrl, undefined);

await bootstrapOwner({
  config,
  email: 'parts-owner@notes.invalid',
  name: 'PartsOwner',
  password: 'a-strong-parts-password',
});
const signedIn = await signInWithPassword({
  headers: { origin: 'http://127.0.0.1' },
  body: {
    email: 'parts-owner@notes.invalid',
    password: 'a-strong-parts-password',
  },
});
const headers = {
  origin: 'http://127.0.0.1',
  cookie: cookieHeader(responseOf(signedIn.response).headers.getSetCookie()),
};
const accountId =
  (await getAccount({ headers })).data?.accountId ?? randomUUID();
const workspaceId =
  (await listWorkspaces({ headers })).data?.workspaces[0]?.workspaceId ?? '';

/** Starts an import of `size` bytes, and answers the generated answer. */
function start(size: number) {
  return startWorkspaceImport({
    headers,
    path: { workspaceId },
    body: { size },
  });
}

/** Sends one part of an import. */
function part(
  importId: string,
  partNumber: number,
  bytes: Uint8Array<ArrayBuffer>,
) {
  return sendWorkspaceImportPart({
    headers,
    path: { workspaceId, importId, partNumber },
    body: new Blob([bytes]),
  });
}

/** The parts that the store holds for an import of the owner. */
function partsOf(importId: string) {
  return objects.listParts(importKey(workspaceId, accountId, importId));
}

await test('a start and a part that the disk cannot hold answer storage_full', async () => {
  // Review of record 0192. The single body of an import was refused before
  // it was read when the free space could not hold it, and the parts were
  // not, so an import could fill the disk part by part.
  statedRoom = archiveDiskReserveBytes + 100;
  const tooLarge = await start(101);
  assert.equal(responseOf(tooLarge.response).status, 507);
  assert.equal(readProperty(tooLarge.error, 'code'), 'storage_full');
  const started = await start(100);
  assert.equal(started.error, undefined, JSON.stringify(started.error));
  const importId = started.data?.importId ?? '';
  // The disk fills while the parts arrive.
  statedRoom = archiveDiskReserveBytes + 10;
  const refused = await part(importId, 1, new Uint8Array(11));
  assert.equal(responseOf(refused.response).status, 507);
  assert.equal(readProperty(refused.error, 'code'), 'storage_full');
  assert.deepEqual(await partsOf(importId), []);
  const fits = await part(importId, 1, new Uint8Array(10));
  assert.equal(fits.error, undefined, JSON.stringify(fits.error));
  statedRoom = Number.MAX_SAFE_INTEGER;
});

await test('an account holds one open import', async () => {
  // Review of record 0192. Each failed try of a client left up to 4 GiB of
  // parts for a day, and nothing bounded how many an account held.
  const first = (await start(10)).data?.importId ?? '';
  assert.equal((await part(first, 1, new Uint8Array(10))).error, undefined);
  const second = (await start(10)).data?.importId ?? '';
  assert.notEqual(second, first);
  // The second start removed the first import and its parts.
  assert.equal(await partsOf(first), null);
  const late = await part(first, 2, new Uint8Array(10));
  assert.equal(responseOf(late.response).status, 404);
  assert.deepEqual(await partsOf(second), []);
});

await test('a client that fails removes its import', async () => {
  // Review of record 0192. The client had no way to give back the room of
  // an import that failed, so the parts waited for the daily cleanup.
  const importId = (await start(10)).data?.importId ?? '';
  assert.equal((await part(importId, 1, new Uint8Array(10))).error, undefined);
  const removed = await abortWorkspaceImport({
    headers,
    path: { workspaceId, importId },
  });
  assert.deepEqual(removed.data, { removed: true });
  assert.equal(await partsOf(importId), null);
  // A second removal changes nothing and answers the same.
  const again = await abortWorkspaceImport({
    headers,
    path: { workspaceId, importId },
  });
  assert.deepEqual(again.data, { removed: true });
  const completed = await completeWorkspaceImport({
    headers,
    path: { workspaceId, importId },
  });
  assert.equal(responseOf(completed.response).status, 404);
});

await test('an import in parts still imports when the disk has room', async () => {
  const archive = storedArchive([['room/parts.md', '# Parts\n']]);
  const importId = (await start(archive.length)).data?.importId ?? '';
  assert.equal((await part(importId, 1, archive)).error, undefined);
  const completed = await completeWorkspaceImport({
    headers,
    path: { workspaceId, importId },
  });
  assert.equal(completed.error, undefined, JSON.stringify(completed.error));
  assert.equal(completed.data?.notes, 1);
});

// Teardown
await server.close();
await auth.close();
await authPool.end();
await attachments.close();
await coordination.close();
await content.close();
await identity.close();
await rm(storageRoot, { recursive: true, force: true });
await database.destroy();
