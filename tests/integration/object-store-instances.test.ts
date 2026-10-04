/**
 * Two server instances of one installation share the object store (record
 * 0192).
 *
 * Each pair of instances runs the whole composition of `createApp` over one
 * database, once with the file store on one shared directory and once with an
 * S3 store on a bucket of the test MinIO service. With the S3 store each
 * instance has a storage directory of its own, as two replicas have two
 * disks, so nothing passes between them on a local disk.
 *
 * An upload through one instance finalizes through the other, and an import
 * sends its parts to both.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createWorkspace,
  finalizeAttachment,
  getAttachmentRevision,
  getReadiness,
  listFiles,
  signInWithPassword,
  uploadAttachment,
} from '@notesapp/api-client';
import { importPartBytes } from '@notesapp/core';
import { bootstrapOwner, createApp, loadServerConfig } from '@notesapp/server';
import {
  attachmentKey,
  openFileObjectStore,
  type ObjectStore,
} from '@notesapp/storage-server';
import sharp from 'sharp';
import { createDisposableDatabase } from './support/database.ts';
import { importArchive } from './support/import.ts';
import { createTestBucket, type TestBucket } from './support/object-store.ts';
import { storedArchive } from './support/zip.ts';

function responseOf(response: Response | undefined): Response {
  if (response === undefined)
    throw new Error('The generated client returned no HTTP response.');
  return response;
}

/** Turns the Set-Cookie values of an answer into a Cookie request header. */
function cookieHeader(values: readonly string[]): string {
  return values
    .map((entry) => (entry.split(';')[0] ?? '').trim())
    .filter((entry) => entry !== '' && !entry.endsWith('='))
    .join('; ');
}

const database = await createDisposableDatabase();
const folders: string[] = [];

/** A folder that the end of the file removes. */
async function folder(name: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), `notesapp-${name}-`));
  folders.push(path);
  return path;
}

/** The environment of one instance. */
function environment(
  storageRoot: string,
  store: Readonly<Record<string, string>>,
): Record<string, string> {
  return {
    NOTESAPP_ORIGIN: 'http://127.0.0.1',
    NOTESAPP_DATABASE_URL: database.runtimeUrl,
    NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
    NOTESAPP_STORAGE_ROOT: storageRoot,
    NOTESAPP_AUTH_SECRET: 'object-store-instances-secret-0123456789',
    NOTESAPP_LOG_LEVEL: 'silent',
    NOTESAPP_MAX_BODY_BYTES: '1048576',
    NOTESAPP_MAX_HEADER_BYTES: '16384',
    NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
    ...store,
  };
}

/** One listening instance and the base address that reaches it. */
async function instance(env: Record<string, string>): Promise<{
  readonly app: Awaited<ReturnType<typeof createApp>>;
  readonly baseUrl: string;
}> {
  const app = await createApp(loadServerConfig(env));
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address: string | AddressInfo | null = app.server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The test server did not bind a TCP port.');
  return { app, baseUrl: `http://127.0.0.1:${String(address.port)}` };
}

// One account signs in once. Its session lives in the database, so it opens
// every instance of the installation.
const ownerEmail = 'instances-owner@notes.invalid';
const ownerPassword = 'a-strong-instances-password';
await bootstrapOwner({
  config: loadServerConfig(environment(await folder('owner'), {})),
  email: ownerEmail,
  name: 'InstancesOwner',
  password: ownerPassword,
});

const bucket: TestBucket = await createTestBucket();
const sharedRoot = await folder('shared-store');

/** The two pairs: one on a shared directory, one on an S3 bucket. */
const pairs = [
  {
    kind: 'filesystem',
    one: await instance(environment(sharedRoot, {})),
    two: await instance(environment(sharedRoot, {})),
    store: openFileObjectStore(sharedRoot),
  },
  {
    kind: 's3',
    one: await instance(
      environment(await folder('replica-one'), bucket.environment),
    ),
    two: await instance(
      environment(await folder('replica-two'), bucket.environment),
    ),
    store: bucket.store,
  },
] as const;

const signedIn = await signInWithPassword({
  baseUrl: pairs[0].one.baseUrl,
  headers: { origin: 'http://127.0.0.1' },
  body: { email: ownerEmail, password: ownerPassword },
});
const headers = {
  origin: 'http://127.0.0.1',
  cookie: cookieHeader(responseOf(signedIn.response).headers.getSetCookie()),
};

/** A new workspace of the owner, through the given instance. */
async function newWorkspace(baseUrl: string, name: string): Promise<string> {
  const created = await createWorkspace({ baseUrl, headers, body: { name } });
  assert.equal(created.error, undefined, JSON.stringify(created.error));
  return created.data?.workspaceId ?? '';
}

/** The SHA-256 digest of bytes, in lower case hexadecimal. */
function digestOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The bytes of one attachment revision, through the given instance. */
async function attachmentBytes(
  baseUrl: string,
  workspaceId: string,
  revisionId: string,
): Promise<Buffer> {
  const read = await getAttachmentRevision({
    baseUrl,
    headers,
    path: { workspaceId, revisionId },
  });
  assert.equal(responseOf(read.response).status, 200);
  assert.ok(read.data instanceof Blob);
  return Buffer.from(await read.data.arrayBuffer());
}

/** Checks that one object store holds an object. */
async function holds(store: ObjectStore, key: string): Promise<boolean> {
  return (await store.size(key)) !== null;
}

for (const pair of pairs) {
  await test(`${pair.kind}: readiness reads the object store`, async () => {
    for (const target of [pair.one, pair.two]) {
      const ready = await getReadiness({ baseUrl: target.baseUrl });
      const storage = ready.data?.checks.find(
        (check) => check.name === 'storage',
      );
      assert.equal(storage?.status, 'ok');
    }
  });

  await test(`${pair.kind}: an upload through one instance finalizes through the other`, async () => {
    const workspaceId = await newWorkspace(
      pair.one.baseUrl,
      `Upload ${pair.kind}`,
    );
    const bytes = await sharp({
      create: {
        width: 64,
        height: 48,
        channels: 3,
        background: { r: 20, g: 120, b: 220 },
      },
    })
      .png()
      .toBuffer();
    const uploaded = await uploadAttachment({
      baseUrl: pair.one.baseUrl,
      headers,
      path: { workspaceId },
      body: { file: new File([bytes], 'shared.png', { type: 'image/png' }) },
    });
    assert.equal(uploaded.error, undefined, JSON.stringify(uploaded.error));
    assert.ok(uploaded.data);
    const revisionId = randomUUID();
    const finalized = await finalizeAttachment({
      baseUrl: pair.two.baseUrl,
      headers,
      path: { workspaceId, objectId: uploaded.data.objectId },
      body: {
        fileId: randomUUID(),
        revisionId,
        path: 'attachments/shared.png',
        digest: uploaded.data.digest,
        mutationId: randomUUID(),
        deviceId: 'instances-test',
      },
    });
    assert.equal(responseOf(finalized.response).status, 200);
    assert.ok(
      await holds(pair.store, attachmentKey(workspaceId, digestOf(bytes))),
    );
    // Each instance reads the bytes of the other.
    for (const target of [pair.one, pair.two])
      assert.ok(
        (await attachmentBytes(target.baseUrl, workspaceId, revisionId)).equals(
          bytes,
        ),
      );
  });

  await test(`${pair.kind}: an import sends its parts to both instances`, async () => {
    const workspaceId = await newWorkspace(
      pair.two.baseUrl,
      `Import ${pair.kind}`,
    );
    const picture = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: { r: 200, g: 40, b: 40 },
      },
    })
      .png()
      .toBuffer();
    // A file that the import leaves out makes the archive longer than one
    // part, so the archive needs two parts.
    const archive = storedArchive([
      ['notes/first.md', '# First\n\n![Picture](../attachments/pic.png)\n'],
      ['attachments/pic.png', picture],
      ['large.bin', randomBytes(importPartBytes + 1024)],
    ]);
    assert.ok(archive.length > importPartBytes);
    const imported = await importArchive({
      headers,
      path: { workspaceId },
      body: { file: new Blob([archive]) },
      route: {
        start: pair.one.baseUrl,
        part: (partNumber) =>
          partNumber % 2 === 1 ? pair.two.baseUrl : pair.one.baseUrl,
        complete: pair.two.baseUrl,
      },
    });
    assert.equal(imported.error, undefined, JSON.stringify(imported.error));
    assert.deepEqual(imported.data, {
      notes: 1,
      attachments: 1,
      skipped: { files: 1, kinds: ['bin'] },
    });
    // The image of the archive is in the store, and the other instance
    // reads it.
    const files = await listFiles({
      baseUrl: pair.one.baseUrl,
      headers,
      path: { workspaceId },
    });
    const image = files.data?.files.find(
      (file) => file.path === 'attachments/pic.png',
    );
    assert.ok(image?.headRevisionId);
    assert.ok(
      (
        await attachmentBytes(
          pair.one.baseUrl,
          workspaceId,
          image.headRevisionId,
        )
      ).equals(picture),
    );
    // The import leaves nothing under staging once it ends.
    const staged: string[] = [];
    for await (const item of pair.store.list('staging/')) staged.push(item.key);
    assert.deepEqual(
      staged.filter((key) => key.includes(workspaceId)),
      [],
    );
  });
}

// Teardown
for (const pair of pairs) {
  await pair.one.app.close();
  await pair.two.app.close();
}
pairs[0].store.close();
await bucket.destroy();
for (const path of folders) await rm(path, { recursive: true, force: true });
await database.destroy();
