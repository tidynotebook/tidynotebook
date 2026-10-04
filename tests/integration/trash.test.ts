/** Trash listing, restore, and permanent deletion against a real server. */
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
  getFile,
  listDeletedFiles,
  listFiles,
  listWorkspaces,
  purgeFiles,
  restoreFile,
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
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-trash-test-'));
const environment = (): Record<string, string> => ({
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'trash-test-secret-value-00123456789abcd',
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

const email = 'trash-owner@notes.invalid';
const password = 'owner-password-123456';
await bootstrapOwner({ config, email, name: 'Trash Owner', password });
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
const device = 'trash-test';

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

/** Deletes one note by its entity tag. */
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

/** One deleted file as the trash listing reports it. */
type TrashEntry = {
  readonly fileId: string;
  readonly path: string;
  readonly kind: 'note' | 'attachment';
  readonly headRevisionId: string;
  readonly deletedAt: string;
};

/** Every deleted file of the workspace, over every page. */
async function trash(): Promise<readonly TrashEntry[]> {
  const found: TrashEntry[] = [];
  let cursor: string | null = null;
  for (;;) {
    const query: { readonly cursor?: string; readonly limit: number } =
      cursor === null ? { limit: 100 } : { cursor, limit: 100 };
    const page = await listDeletedFiles({
      headers,
      path: { workspaceId },
      query: { ...query },
    });
    assert.equal(page.error, undefined, JSON.stringify(page.error));
    found.push(...(page.data?.files ?? []));
    const next: string | null = page.data?.nextCursor ?? null;
    if (next === null) break;
    cursor = next;
  }
  return found;
}

await test('a deleted note is listed in the trash and not in the live list', async () => {
  const note = await makeNote(`trash/${randomUUID()}.md`, '# Kept\n');
  const before = await trash();
  assert.equal(
    before.some((file) => file.fileId === note.fileId),
    false,
  );
  await removeNote(note.fileId, note.tag);

  const listed = await trash();
  const entry = listed.find((file) => file.fileId === note.fileId);
  assert.ok(entry !== undefined, 'the deleted note is listed in the trash');
  assert.equal(entry.kind, 'note');
  assert.ok(Number.isFinite(Date.parse(entry.deletedAt)));
  assert.equal(entry.headRevisionId.length, 36);

  const live = await listFiles({
    headers,
    path: { workspaceId },
    query: { limit: 500 },
  });
  assert.equal(
    live.data?.files.some((file) => file.fileId === note.fileId),
    false,
  );
});

await test('a restore brings back the content of the last save', async () => {
  const path = `trash/${randomUUID()}.md`;
  const note = await makeNote(path, '# Last content\n');
  await removeNote(note.fileId, note.tag);

  const restored = await restoreFile({
    headers,
    path: { workspaceId, fileId: note.fileId },
    body: {
      mutationId: randomUUID(),
      deviceId: device,
      clientTime: new Date().toISOString(),
      revisionId: randomUUID(),
    },
  });
  assert.equal(restored.error, undefined, JSON.stringify(restored.error));
  assert.equal(restored.data?.revision.deleted, false);
  assert.equal(restored.data?.revision.path, path);

  const current = await getFile({
    headers,
    path: { workspaceId, fileId: note.fileId },
  });
  assert.equal(current.data?.head?.text, '# Last content\n');
  assert.equal(current.data?.head?.deleted, false);
  assert.equal(current.data?.path, path);
  assert.equal(
    (await trash()).some((file) => file.fileId === note.fileId),
    false,
  );
});

await test('a restore into a taken path keeps the folder and renames the note', async () => {
  const name = randomUUID();
  const path = `folder/${name}.md`;
  const note = await makeNote(path, '# Original\n');
  await removeNote(note.fileId, note.tag);
  // A new note claims the path while the first one waits in the trash.
  const replacement = await makeNote(path, '# Replacement\n');

  const restored = await restoreFile({
    headers,
    path: { workspaceId, fileId: note.fileId },
    body: {
      mutationId: randomUUID(),
      deviceId: device,
      clientTime: new Date().toISOString(),
      revisionId: randomUUID(),
    },
  });
  assert.equal(restored.error, undefined, JSON.stringify(restored.error));
  assert.equal(
    restored.data?.revision.path,
    `folder/${name} (restored).md`,
    'the restored note keeps its folder and takes a free name',
  );

  const replaced = await getFile({
    headers,
    path: { workspaceId, fileId: replacement.fileId },
  });
  assert.equal(replaced.data?.head?.text, '# Replacement\n');
  assert.equal(replaced.data?.path, path);
  const brought = await getFile({
    headers,
    path: { workspaceId, fileId: note.fileId },
  });
  assert.equal(brought.data?.head?.text, '# Original\n');
});

await test('a permanent deletion of one note removes it from the trash', async () => {
  const note = await makeNote(`trash/${randomUUID()}.md`, '# Gone\n');
  await removeNote(note.fileId, note.tag);
  assert.equal(
    (await trash()).some((file) => file.fileId === note.fileId),
    true,
  );

  const purged = await purgeFiles({
    headers,
    path: { workspaceId },
    body: { mutationId: randomUUID(), fileIds: [note.fileId] },
  });
  assert.equal(purged.error, undefined, JSON.stringify(purged.error));
  assert.deepEqual(purged.data?.purgedFileIds, [note.fileId]);

  assert.equal(
    (await trash()).some((file) => file.fileId === note.fileId),
    false,
  );
  const gone = await restoreFile({
    headers,
    path: { workspaceId, fileId: note.fileId },
    body: {
      mutationId: randomUUID(),
      deviceId: device,
      clientTime: new Date().toISOString(),
      revisionId: randomUUID(),
    },
  });
  assert.equal(responseOf(gone.response).status, 410);
});

await test('one purge removes all selected notes from the trash', async () => {
  const first = await makeNote(`trash/${randomUUID()}.md`, '# First\n');
  const second = await makeNote(`trash/${randomUUID()}.md`, '# Second\n');
  await removeNote(first.fileId, first.tag);
  await removeNote(second.fileId, second.tag);

  const purged = await purgeFiles({
    headers,
    path: { workspaceId },
    body: {
      mutationId: randomUUID(),
      fileIds: [first.fileId, second.fileId],
    },
  });
  assert.equal(purged.error, undefined, JSON.stringify(purged.error));
  assert.deepEqual(
    new Set(purged.data?.purgedFileIds),
    new Set([first.fileId, second.fileId]),
  );

  const remaining = await trash();
  assert.equal(
    remaining.some(
      (file) => file.fileId === first.fileId || file.fileId === second.fileId,
    ),
    false,
  );
});

await test('a live note cannot be restored', async () => {
  const note = await makeNote(`trash/${randomUUID()}.md`, '# Live\n');
  const refused = await restoreFile({
    headers,
    path: { workspaceId, fileId: note.fileId },
    body: {
      mutationId: randomUUID(),
      deviceId: device,
      clientTime: new Date().toISOString(),
      revisionId: randomUUID(),
    },
  });
  assert.equal(responseOf(refused.response).status, 404);
});

await server.close();
await auth.close();
await authPool.end();
await attachments.close();
await content.close();
await identity.close();
await rm(storageRoot, { recursive: true, force: true });
await database.destroy();
