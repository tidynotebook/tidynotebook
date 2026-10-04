/** Explicit save history and restore checks against a real server. */
import assert from 'node:assert/strict';
import {
  firstSave,
  saveForHead,
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
  getFile,
  listHistory,
  listWorkspaces,
  restoreRevision,
  updateFile,
  signInWithPassword,
} from '@notesapp/api-client';
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
import { createDisposableDatabase } from './support/database.ts';
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

const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-history-test-'));
const environment = (): Record<string, string> => ({
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'history-test-secret-value-0123456789abcd',
  NOTESAPP_ADDITIONAL_ORIGINS: 'http://localhost',
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

const email = 'history-owner@notes.invalid';
const password = 'owner-password-123456';
await bootstrapOwner({ config, email, name: 'History Owner', password });
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

await test('each explicit save creates a restorable version', async () => {
  const fileId = randomUUID();
  const firstRevisionId = randomUUID();
  const created = await createFile({
    headers,
    path: { workspaceId },
    body: {
      fileId,
      path: 'versions.md',
      document: firstSave('# First\n'),
      revisionId: firstRevisionId,
      mutationId: randomUUID(),
      deviceId: 'history-test',
    },
  });
  assert.equal(created.error, undefined, JSON.stringify(created.error));
  const tag = responseOf(created.response).headers.get('etag') ?? '';

  const secondText = '# Second\n';
  const secondRevisionId = randomUUID();
  const saved = await updateFile({
    headers: { ...headers, 'if-match': tag },
    path: { workspaceId, fileId },
    body: {
      mutationId: randomUUID(),
      deviceId: 'history-test',
      revisionId: secondRevisionId,
      document: await saveForHead(workspaceId, firstRevisionId, secondText),
    },
  });
  assert.equal(saved.error, undefined, JSON.stringify(saved.error));

  const history = await listHistory({
    headers,
    path: { workspaceId, fileId },
  });
  assert.deepEqual(
    history.data?.revisions.map((revision) => revision.revisionId),
    [secondRevisionId, firstRevisionId],
  );

  const restored = await restoreRevision({
    headers,
    path: { workspaceId, fileId },
    body: {
      mutationId: randomUUID(),
      deviceId: 'history-test',
      clientTime: new Date().toISOString(),
      targetRevisionId: firstRevisionId,
      expectedHead: secondRevisionId,
      revisionId: randomUUID(),
      message: 'Restore first save',
    },
  });
  assert.equal(restored.error, undefined, JSON.stringify(restored.error));

  const current = await getFile({ headers, path: { workspaceId, fileId } });
  assert.equal(current.data?.head?.text, '# First\n');
  assert.equal(current.data?.head?.restoredFrom, firstRevisionId);
});

await server.close();
await auth.close();
await authPool.end();
await attachments.close();
await content.close();
await identity.close();
await rm(storageRoot, { recursive: true, force: true });
await database.destroy();
