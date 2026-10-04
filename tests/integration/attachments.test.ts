/**
 * Attachment transfer, inspection, and cleanup checks against a real server,
 * a real database, and real storage volumes.
 *
 * Every application call goes through a generated operation function.
 * Rules that only the database or background jobs can create are exercised
 * directly with the store.
 */
import assert from 'node:assert/strict';
import { deletionForHead, useDocumentHeaders } from './support/documents.ts';
import { createHash, randomUUID } from 'node:crypto';
import { PassThrough, Readable } from 'node:stream';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  configureClient,
  deleteFile,
  finalizeAttachment,
  getAccount,
  getAttachmentRevision,
  listWorkspaces,
  purgeFiles,
  signInWithPassword,
  uploadAttachment,
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
  attachmentKey,
  createDocumentService,
  openAttachmentStore,
  openFileObjectStore,
  openIdentityStore,
  openWorkspaceStore,
  stagingKey,
} from '@notesapp/storage-server';
import { isOperationalError } from '@notesapp/core';
import sharp from 'sharp';
import {
  createDisposableDatabase,
  memberActor,
  openSession,
  seedWorkspace,
  limitAccountTo,
} from './support/database.ts';
import { LogRecorder, startTestServer } from './support/server.ts';

/** Reads one property of an unknown value without asserting its shape. */
function readProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value))[key];
}

/** The HTTP response of a generated call, or a clear test failure. */
function responseOf(response: Response | undefined): Response {
  if (response === undefined)
    throw new Error('The generated client returned no HTTP response.');
  return response;
}

/** The stable application error code of a failed generated call. */
function problemCode(error: unknown): string {
  const code = readProperty(error, 'code');
  return typeof code === 'string' ? code : '';
}

/** Turns the Set-Cookie values of an answer into a Cookie request header. */
function cookieHeader(values: readonly string[]): string {
  return values
    .map((entry) => (entry.split(';')[0] ?? '').trim())
    .filter((entry) => entry !== '' && !entry.endsWith('='))
    .join('; ');
}

/** The headers of a browser request. A write also names the origin. */
function browser(cookie: string): Record<string, string> {
  return { origin: 'http://127.0.0.1', cookie };
}

/** SHA-256 digest of a binary buffer as a lowercase hex string. */
function sha256Hex(buffer: Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** The client identifiers that every write carries. */
function mutationIds(): { mutationId: string; deviceId: string } {
  return {
    mutationId: randomUUID(),
    deviceId: 'integration-device',
  };
}

const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-attachments-test-'));

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

/** The idle bound of an upload body on this test deployment. */
const uploadIdleTimeoutMs = 1500;

/** The environment of this test deployment. */
function environment(): Record<string, string> {
  return {
    NOTESAPP_ORIGIN: 'http://127.0.0.1',
    NOTESAPP_DATABASE_URL: database.runtimeUrl,
    NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
    NOTESAPP_STORAGE_ROOT: storageRoot,
    NOTESAPP_AUTH_SECRET: 'attachment-test-secret-value-0123456789abcd',
    NOTESAPP_ADDITIONAL_ORIGINS: 'http://localhost',
    NOTESAPP_LOG_LEVEL: 'silent',
    NOTESAPP_MAX_BODY_BYTES: '8388608',
    NOTESAPP_MAX_HEADER_BYTES: '16384',
    NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
    // Short enough to keep the slow upload test quick, and far longer than
    // the gap between two chunks of any other upload in this file.
    NOTESAPP_UPLOAD_IDLE_TIMEOUT_MS: String(uploadIdleTimeoutMs),
  };
}

const config: ServerConfig = loadServerConfig(environment());
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

/** Whether the object store holds an object at the key (record 0192). */
async function stored(key: string): Promise<boolean> {
  return (await attachments.objects.size(key)) !== null;
}
const logs = new LogRecorder();
const server = await startTestServer({
  environment: {
    ...environment(),
    NOTESAPP_LOG_LEVEL: 'info',
  },
  handlers: (value) =>
    createHandlers(value, undefined, {
      store: identity,
      content,
      attachments,
    }),
  identity: adapter.resolver,
  logStream: logs,
  protocols: [createAuthProtocol(config, auth.auth)],
});
configureClient(server.baseUrl, undefined);

const ownerEmail = 'attachment-owner@notes.invalid';
const ownerPassword = 'a-strong-attachment-password';
await bootstrapOwner({
  config,
  email: ownerEmail,
  name: 'AttachmentOwner',
  password: ownerPassword,
});

const signedIn = await signInWithPassword({
  headers: { origin: 'http://127.0.0.1' },
  body: { email: ownerEmail, password: ownerPassword },
});
const cookie = cookieHeader(
  responseOf(signedIn.response).headers.getSetCookie(),
);
assert.ok(cookie.length > 0, 'the test needs a session cookie');

useDocumentHeaders(browser(cookie));
const account = await getAccount({ headers: browser(cookie) });
const ownerAccountId = account.data?.accountId ?? '';
assert.match(ownerAccountId, /^[0-9a-f-]{36}$/);

const listed = await listWorkspaces({ headers: browser(cookie) });
const workspaceId = listed.data?.workspaces[0]?.workspaceId ?? '';
assert.match(workspaceId, /^[0-9a-f-]{36}$/);

// Sample test images
const samplePngBytes = await sharp({
  create: {
    width: 100,
    height: 100,
    channels: 4,
    background: { r: 255, g: 0, b: 0, alpha: 1 },
  },
})
  .png()
  .toBuffer();

const sampleJpegBytes = await sharp({
  create: {
    width: 100,
    height: 100,
    channels: 3,
    background: { r: 0, g: 255, b: 0 },
  },
})
  .jpeg()
  .toBuffer();

const sampleWebpBytes = await sharp({
  create: {
    width: 100,
    height: 100,
    channels: 4,
    background: { r: 0, g: 0, b: 255, alpha: 1 },
  },
})
  .webp()
  .toBuffer();

const sampleGifBytes = await sharp({
  create: {
    width: 100,
    height: 100,
    channels: 3,
    background: { r: 255, g: 255, b: 0 },
  },
})
  .gif()
  .toBuffer();

/** A PNG whose colour no other test uses, so its digest belongs to one test. */
async function uniquePng(
  red: number,
  green: number,
  blue: number,
): Promise<Buffer<ArrayBuffer>> {
  return sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: { r: red, g: green, b: blue, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

/** The objects that the database offers to a reclaim run at this clock. */
async function candidateIds(now: Date): Promise<readonly string[]> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const session = await openSession(database.migrationUrl);
  try {
    const rows = await session.query<{ id: string }>(
      'select id::text as id from notesapp_reclaim_attachments($1)',
      [cutoff],
    );
    return rows.map((row) => row.id);
  } finally {
    await session.close();
  }
}

/** The stored state of one attachment object, or `missing`. */
async function objectState(objectId: string): Promise<string> {
  const session = await openSession(database.migrationUrl);
  try {
    const rows = await session.query<{ state: string }>(
      `select state::text as state from attachment_objects
        where workspace_id = $1 and id = $2`,
      [workspaceId, objectId],
    );
    return rows[0]?.state ?? 'missing';
  } finally {
    await session.close();
  }
}

/** Moves one attachment object out of the 24 hour reclaim window. */
async function ageObject(objectId: string): Promise<void> {
  const session = await openSession(database.migrationUrl);
  try {
    await session.query(
      `update attachment_objects
          set created_at = now() - interval '48 hours',
              finalized_at = now() - interval '48 hours'
        where workspace_id = $1 and id = $2`,
      [workspaceId, objectId],
    );
  } finally {
    await session.close();
  }
}

/** True while another session holds the advisory lock of the workspace. */
async function workspaceLockHeld(): Promise<boolean> {
  const session = await openSession(database.migrationUrl);
  try {
    const rows = await session.query<{ free: boolean }>(
      'select pg_try_advisory_xact_lock(hashtext($1::text)::bigint) as free',
      [workspaceId],
    );
    return rows[0]?.free === false;
  } finally {
    await session.close();
  }
}

/**
 * Waits until one session waits for an advisory lock.
 *
 * The database of this test is disposable and only this test takes advisory
 * locks, so an ungranted advisory lock is the competing call.
 */
async function waitForLockWaiter(): Promise<boolean> {
  const session = await openSession(database.migrationUrl);
  const deadline = Date.now() + 20000;
  try {
    while (Date.now() < deadline) {
      const rows = await session.query<{ waiting: string }>(
        `select count(*)::text as waiting from pg_locks
          where locktype = 'advisory' and not granted`,
      );
      if (Number(rows[0]?.waiting ?? '0') > 0) return true;
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
    return false;
  } finally {
    await session.close();
  }
}

/** Uploads bytes and finalizes them into a new note. Answers the revision. */
async function uploadAndFinalize(
  bytes: Buffer<ArrayBuffer>,
  notePath: string,
): Promise<string> {
  const uploaded = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: {
      file: new File([bytes], 'rescued.png', { type: 'image/png' }),
    },
  });
  if (!uploaded.data) {
    throw new Error('notesapp: the competing upload was refused.');
  }
  const revisionId = randomUUID();
  const finalized = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: uploaded.data.objectId },
    body: {
      fileId: randomUUID(),
      revisionId,
      path: notePath,
      digest: uploaded.data.digest,
      ...mutationIds(),
    },
  });
  if (responseOf(finalized.response).status !== 200) {
    throw new Error('notesapp: the competing finalize was refused.');
  }
  return revisionId;
}

await test('upload and finalize PNG image with binary streaming download', async () => {
  const file = new File([samplePngBytes], 'diagram.png', {
    type: 'image/png',
  });
  const uploadResult = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file },
  });
  assert.equal(responseOf(uploadResult.response).status, 201);
  assert.ok(uploadResult.data);
  const { objectId, digest, size, mediaType, width, height } =
    uploadResult.data;
  assert.match(objectId, /^[0-9a-f-]{36}$/);
  assert.equal(digest, sha256Hex(samplePngBytes));
  assert.equal(size, samplePngBytes.length);
  assert.equal(mediaType, 'image/png');
  assert.equal(width, 100);
  assert.equal(height, 100);

  // Finalize as a new file revision
  const fileId = randomUUID();
  const revisionId = randomUUID();
  const mutationId = randomUUID();
  const finalizeResult = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId },
    body: {
      fileId,
      revisionId,
      path: 'assets/diagram.png',
      digest,
      mutationId,
      deviceId: 'integration-device',
      message: 'Add architecture diagram',
    },
  });
  assert.equal(responseOf(finalizeResult.response).status, 200);
  assert.ok(finalizeResult.data);
  assert.equal(finalizeResult.data.revision.revisionId, revisionId);
  assert.equal(
    finalizeResult.data.accepted.revisions[0]?.revisionId,
    revisionId,
  );

  // Read binary content via generated client
  const readResult = await getAttachmentRevision({
    headers: browser(cookie),
    path: { workspaceId, revisionId },
  });
  const res = responseOf(readResult.response);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(
    res.headers.get('content-length'),
    String(samplePngBytes.length),
  );
  assert.equal(res.headers.get('etag'), `"${revisionId}"`);

  assert.ok(readResult.data instanceof Blob);
  const downloadedBytes = Buffer.from(await readResult.data.arrayBuffer());
  assert.equal(sha256Hex(downloadedBytes), digest);
  assert.deepEqual(downloadedBytes, samplePngBytes);
});

await test('upload and finalize JPEG, WebP, and GIF images', async () => {
  const formats = [
    { bytes: sampleJpegBytes, mime: 'image/jpeg', name: 'photo.jpg' },
    { bytes: sampleWebpBytes, mime: 'image/webp', name: 'graphic.webp' },
    { bytes: sampleGifBytes, mime: 'image/gif', name: 'animation.gif' },
  ] as const;

  for (const item of formats) {
    const file = new File([item.bytes], item.name, { type: item.mime });
    const uploaded = await uploadAttachment({
      headers: browser(cookie),
      path: { workspaceId },
      body: { file },
    });
    assert.equal(responseOf(uploaded.response).status, 201);
    assert.ok(uploaded.data);
    assert.equal(uploaded.data.mediaType, item.mime);

    const fileId = randomUUID();
    const revisionId = randomUUID();
    const finalized = await finalizeAttachment({
      headers: browser(cookie),
      path: { workspaceId, objectId: uploaded.data.objectId },
      body: {
        fileId,
        revisionId,
        path: `assets/${item.name}`,
        digest: uploaded.data.digest,
        mutationId: randomUUID(),
        deviceId: 'integration-device',
      },
    });
    assert.equal(responseOf(finalized.response).status, 200);

    const read = await getAttachmentRevision({
      headers: browser(cookie),
      path: { workspaceId, revisionId },
    });
    const res = responseOf(read.response);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), item.mime);
    assert.ok(read.data instanceof Blob);
    const readBytes = Buffer.from(await read.data.arrayBuffer());
    assert.deepEqual(readBytes, item.bytes);
  }
});

await test('reject oversize pixel dimensions above 40 megapixels', async () => {
  // 7000 x 7000 = 49 megapixels, which exceeds the 40 megapixel limit
  const oversizePng = await sharp({
    create: {
      width: 7000,
      height: 7000,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const file = new File([oversizePng], 'huge.png', { type: 'image/png' });
  const uploadResult = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file },
  });
  assert.equal(responseOf(uploadResult.response).status, 413);
  assert.equal(problemCode(uploadResult.error), 'payload_too_large');
});

await test('reject oversize payload exceeding 20 MiB limit', async () => {
  // Allocate 21 MiB buffer
  const largeBuffer = Buffer.alloc(21 * 1024 * 1024);
  const file = new File([largeBuffer], 'large.png', { type: 'image/png' });
  const uploadResult = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file },
  });
  assert.equal(responseOf(uploadResult.response).status, 413);
  assert.equal(problemCode(uploadResult.error), 'payload_too_large');
});

await test('reject forged MIME type when content does not match', async () => {
  // Send JPEG bytes with declared image/png MIME type
  const file = new File([sampleJpegBytes], 'forged.png', {
    type: 'image/png',
  });
  const uploadResult = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file },
  });
  assert.equal(responseOf(uploadResult.response).status, 422);
  assert.equal(problemCode(uploadResult.error), 'invalid_content');
});

await test('reject malformed image bytes', async () => {
  const truncatedBytes = Buffer.from('89504e470d0a1a0a0000000d494844', 'hex');
  const file = new File([truncatedBytes], 'corrupt.png', {
    type: 'image/png',
  });
  const uploadResult = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file },
  });
  assert.equal(responseOf(uploadResult.response).status, 422);
  assert.equal(problemCode(uploadResult.error), 'invalid_content');
});

await test('reject SVG upload with unsupported media type', async () => {
  const svgText =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="5"/></svg>';
  const file = new File([svgText], 'vector.svg', {
    type: 'image/svg+xml',
  });
  const uploadResult = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file },
  });
  assert.equal(responseOf(uploadResult.response).status, 415);
  assert.equal(problemCode(uploadResult.error), 'unsupported_media_type');
});

await test('enforce precondition rules on finalizeAttachment', async () => {
  const file = new File([samplePngBytes], 'icon.png', { type: 'image/png' });
  const firstUpload = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file },
  });
  assert.ok(firstUpload.data);

  const fileId = randomUUID();
  const revisionId1 = randomUUID();

  // Creating a new file with an unexpected If-Match header is refused
  const unexpectedPrecondition = await finalizeAttachment({
    headers: {
      ...browser(cookie),
      'if-match': '"00000000-0000-0000-0000-000000000000"',
    },
    path: { workspaceId, objectId: firstUpload.data.objectId },
    body: {
      fileId,
      revisionId: revisionId1,
      path: 'assets/icon.png',
      digest: firstUpload.data.digest,
      mutationId: randomUUID(),
      deviceId: 'integration-device',
    },
  });
  assert.equal(responseOf(unexpectedPrecondition.response).status, 412);
  assert.equal(problemCode(unexpectedPrecondition.error), 'stale_head');

  // Creating without If-Match succeeds
  const initial = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: firstUpload.data.objectId },
    body: {
      fileId,
      revisionId: revisionId1,
      path: 'assets/icon.png',
      digest: firstUpload.data.digest,
      mutationId: randomUUID(),
      deviceId: 'integration-device',
    },
  });
  assert.equal(responseOf(initial.response).status, 200);

  // Upload second image to update the existing file
  const secondUpload = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: {
      file: new File([sampleWebpBytes], 'icon.webp', { type: 'image/webp' }),
    },
  });
  assert.ok(secondUpload.data);

  const revisionId2 = randomUUID();

  // Updating existing file without If-Match answers 428
  const missingPrecondition = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: secondUpload.data.objectId },
    body: {
      fileId,
      revisionId: revisionId2,
      path: 'assets/icon.png',
      digest: secondUpload.data.digest,
      mutationId: randomUUID(),
      deviceId: 'integration-device',
    },
  });
  assert.equal(responseOf(missingPrecondition.response).status, 428);
  assert.equal(problemCode(missingPrecondition.error), 'precondition_required');

  // Updating existing file with stale If-Match answers 412
  const stalePrecondition = await finalizeAttachment({
    headers: {
      ...browser(cookie),
      'if-match': '"00000000-0000-0000-0000-000000000000"',
    },
    path: { workspaceId, objectId: secondUpload.data.objectId },
    body: {
      fileId,
      revisionId: revisionId2,
      path: 'assets/icon.png',
      digest: secondUpload.data.digest,
      mutationId: randomUUID(),
      deviceId: 'integration-device',
    },
  });
  assert.equal(responseOf(stalePrecondition.response).status, 412);
  assert.equal(problemCode(stalePrecondition.error), 'stale_head');

  // Updating existing file with correct If-Match tag succeeds
  const updated = await finalizeAttachment({
    headers: {
      ...browser(cookie),
      'if-match': `"${revisionId1}"`,
    },
    path: { workspaceId, objectId: secondUpload.data.objectId },
    body: {
      fileId,
      revisionId: revisionId2,
      path: 'assets/icon.png',
      digest: secondUpload.data.digest,
      mutationId: randomUUID(),
      deviceId: 'integration-device',
    },
  });
  assert.equal(responseOf(updated.response).status, 200);

  // Both old revision and new revision remain accessible
  const readOld = await getAttachmentRevision({
    headers: browser(cookie),
    path: { workspaceId, revisionId: revisionId1 },
  });
  assert.equal(responseOf(readOld.response).status, 200);
  assert.equal(
    responseOf(readOld.response).headers.get('content-type'),
    'image/png',
  );

  const readNew = await getAttachmentRevision({
    headers: browser(cookie),
    path: { workspaceId, revisionId: revisionId2 },
  });
  assert.equal(responseOf(readNew.response).status, 200);
  assert.equal(
    responseOf(readNew.response).headers.get('content-type'),
    'image/webp',
  );
});

await test('idempotent replay and duplicate finalization validation', async () => {
  const file = new File([sampleJpegBytes], 'idempotent.jpg', {
    type: 'image/jpeg',
  });
  const uploaded = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file },
  });
  assert.ok(uploaded.data);

  const fileId = randomUUID();
  const revisionId = randomUUID();
  const mutationId = randomUUID();
  const payload = {
    fileId,
    revisionId,
    path: 'assets/idempotent.jpg',
    digest: uploaded.data.digest,
    mutationId,
    deviceId: 'integration-device',
  };

  const firstCall = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: uploaded.data.objectId },
    body: payload,
  });
  assert.equal(responseOf(firstCall.response).status, 200);

  // Replay with same mutationId and same payload succeeds (idempotent result)
  const replayCall = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: uploaded.data.objectId },
    body: payload,
  });
  assert.equal(responseOf(replayCall.response).status, 200);
  assert.equal(replayCall.data?.revision.revisionId, revisionId);

  // Same mutationId with different payload is rejected with mutation_reused
  const reusedCall = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: uploaded.data.objectId },
    body: {
      ...payload,
      path: 'assets/different-path.jpg',
    },
  });
  assert.equal(responseOf(reusedCall.response).status, 409);
  assert.equal(problemCode(reusedCall.error), 'mutation_reused');

  // Finalizing with wrong expected digest is rejected with invalid_content
  const wrongDigestCall = await finalizeAttachment({
    headers: {
      ...browser(cookie),
      'if-match': `"${revisionId}"`,
    },
    path: { workspaceId, objectId: uploaded.data.objectId },
    body: {
      ...payload,
      revisionId: randomUUID(),
      mutationId: randomUUID(),
      digest:
        '0000000000000000000000000000000000000000000000000000000000000000',
    },
  });
  assert.equal(responseOf(wrongDigestCall.response).status, 422);
  assert.equal(problemCode(wrongDigestCall.error), 'invalid_content');
});

await test('deduplicate content inside one workspace', async () => {
  const file1 = new File([samplePngBytes], 'copy1.png', { type: 'image/png' });
  const file2 = new File([samplePngBytes], 'copy2.png', { type: 'image/png' });

  const upload1 = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file: file1 },
  });
  assert.ok(upload1.data);

  const upload2 = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file: file2 },
  });
  assert.ok(upload2.data);

  assert.notEqual(upload1.data.objectId, upload2.data.objectId);
  assert.equal(upload1.data.digest, upload2.data.digest);

  const rev1 = randomUUID();
  const rev2 = randomUUID();

  const fin1 = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: upload1.data.objectId },
    body: {
      fileId: randomUUID(),
      revisionId: rev1,
      path: 'assets/copy1.png',
      digest: upload1.data.digest,
      ...mutationIds(),
    },
  });
  assert.equal(responseOf(fin1.response).status, 200);

  const fin2 = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: upload2.data.objectId },
    body: {
      fileId: randomUUID(),
      revisionId: rev2,
      path: 'assets/copy2.png',
      digest: upload2.data.digest,
      ...mutationIds(),
    },
  });
  assert.equal(responseOf(fin2.response).status, 200);

  // Both revisions resolve the same binary payload
  const read1 = await getAttachmentRevision({
    headers: browser(cookie),
    path: { workspaceId, revisionId: rev1 },
  });
  const read2 = await getAttachmentRevision({
    headers: browser(cookie),
    path: { workspaceId, revisionId: rev2 },
  });
  assert.equal(responseOf(read1.response).status, 200);
  assert.equal(responseOf(read2.response).status, 200);
});

await test('enforce storage quota on attachment finalization', async (t) => {
  // Control reserve is 1 MiB (1048576 bytes). Setting the limit to reserve + 3000 bytes
  // allows one revision (which incurs 1536 bytes metadata overhead + 470 bytes content),
  // but rejects a second attachment write that exceeds the remaining headroom.
  const quotaWorkspaceId = randomUUID();
  await seedWorkspace(database, quotaWorkspaceId, [
    { accountId: ownerAccountId, role: 'owner' },
  ]);
  // The limit belongs to the owner account and counts every workspace it owns
  // (record 0112), so the owner gets this room above what it uses already,
  // and gets its limit back when the test ends.
  t.after(await limitAccountTo(database, ownerAccountId, (1n << 20n) + 3000n));

  // samplePngBytes is ~470 bytes, which fits inside 1024 bytes
  const smallUpload = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId: quotaWorkspaceId },
    body: {
      file: new File([samplePngBytes], 'small.png', { type: 'image/png' }),
    },
  });
  assert.ok(smallUpload.data);

  const smallFinalize = await finalizeAttachment({
    headers: browser(cookie),
    path: {
      workspaceId: quotaWorkspaceId,
      objectId: smallUpload.data.objectId,
    },
    body: {
      fileId: randomUUID(),
      revisionId: randomUUID(),
      path: 'assets/small.png',
      digest: smallUpload.data.digest,
      ...mutationIds(),
    },
  });
  assert.equal(responseOf(smallFinalize.response).status, 200);

  // Second attachment exceeds the remaining quota
  const secondUpload = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId: quotaWorkspaceId },
    body: {
      file: new File([samplePngBytes], 'overflow.png', { type: 'image/png' }),
    },
  });
  assert.ok(secondUpload.data);

  const overflowFinalize = await finalizeAttachment({
    headers: browser(cookie),
    path: {
      workspaceId: quotaWorkspaceId,
      objectId: secondUpload.data.objectId,
    },
    body: {
      fileId: randomUUID(),
      revisionId: randomUUID(),
      path: 'assets/overflow.png',
      digest: secondUpload.data.digest,
      ...mutationIds(),
    },
  });
  assert.equal(responseOf(overflowFinalize.response).status, 413);
  assert.equal(problemCode(overflowFinalize.error), 'quota_exceeded');
});

await test('deny cross-workspace attachment access', async () => {
  // Seed a second workspace where owner has no membership
  const foreignWorkspaceId = randomUUID();
  const otherAccountId = randomUUID();
  await seedWorkspace(database, foreignWorkspaceId, [
    { accountId: otherAccountId, role: 'owner' },
  ]);

  // Upload to foreign workspace is forbidden
  const forbiddenUpload = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId: foreignWorkspaceId },
    body: {
      file: new File([samplePngBytes], 'test.png', { type: 'image/png' }),
    },
  });
  assert.equal(responseOf(forbiddenUpload.response).status, 403);

  // Upload to valid workspace
  const validUpload = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: {
      file: new File([samplePngBytes], 'test.png', { type: 'image/png' }),
    },
  });
  assert.ok(validUpload.data);

  // Attempting to finalize valid workspace object inside foreign workspace is forbidden
  const crossFinalize = await finalizeAttachment({
    headers: browser(cookie),
    path: {
      workspaceId: foreignWorkspaceId,
      objectId: validUpload.data.objectId,
    },
    body: {
      fileId: randomUUID(),
      revisionId: randomUUID(),
      path: 'assets/cross.png',
      digest: validUpload.data.digest,
      ...mutationIds(),
    },
  });
  assert.equal(responseOf(crossFinalize.response).status, 403);
});

await test('reclaim unreferenced temporary and finalized objects older than 24 hours', async () => {
  // 1. Upload a temporary object without finalizing
  const tempUpload = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: {
      file: new File([samplePngBytes], 'orphan.png', { type: 'image/png' }),
    },
  });
  assert.ok(tempUpload.data);
  const tempObjectId = tempUpload.data.objectId;
  const stagedKey = stagingKey(tempObjectId);
  assert.ok(await stored(stagedKey), 'the staged upload is in the store');

  // 2. Upload and finalize an object into a revision
  const keptUpload = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: {
      file: new File([sampleJpegBytes], 'kept.jpg', { type: 'image/jpeg' }),
    },
  });
  assert.ok(keptUpload.data);
  const keptRevisionId = randomUUID();
  const keptFinalize = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: keptUpload.data.objectId },
    body: {
      fileId: randomUUID(),
      revisionId: keptRevisionId,
      path: 'assets/kept.jpg',
      digest: keptUpload.data.digest,
      ...mutationIds(),
    },
  });
  assert.equal(responseOf(keptFinalize.response).status, 200);
  const keptKey = attachmentKey(workspaceId, keptUpload.data.digest);
  assert.ok(
    await stored(keptKey),
    'finalized file exists in immutable storage',
  );

  // Reclaim at current time reclaims nothing because objects are fresh (< 24 hours)
  const reclaimedNow = await attachments.reclaimAttachments(new Date());
  assert.equal(reclaimedNow, 0);
  assert.ok(await stored(stagedKey), 'fresh temporary file is retained');
  assert.ok(await stored(keptKey), 'fresh finalized file is retained');

  // Reclaim with clock advanced 25 hours. The run takes exactly the objects
  // that the database rule lists, and a second run takes none of them again.
  const future = new Date(Date.now() + 25 * 60 * 60 * 1000);
  const listed = await candidateIds(future);
  assert.ok(
    listed.includes(tempObjectId),
    'the abandoned temporary object is a candidate',
  );
  // The kept object shares its digest with an object of an earlier check, so
  // the reclaim may claim the row. The digest guard keeps the bytes.
  const reclaimedLater = await attachments.reclaimAttachments(future);
  assert.equal(reclaimedLater, listed.length);
  assert.equal(await attachments.reclaimAttachments(future), 0);

  // Temporary file was unlinked
  assert.equal(
    await stored(stagedKey),
    false,
    'abandoned temporary file is removed',
  );

  // Finalized object referenced by the revision remains intact
  assert.ok(await stored(keptKey), 'referenced finalized file is retained');

  // Reading the kept revision still works
  const readKept = await getAttachmentRevision({
    headers: browser(cookie),
    path: { workspaceId, revisionId: keptRevisionId },
  });
  assert.equal(responseOf(readKept.response).status, 200);

  // Attempting to finalize the reclaimed temporary object now fails
  const finalizeReclaimed = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: tempObjectId },
    body: {
      fileId: randomUUID(),
      revisionId: randomUUID(),
      path: 'assets/orphan.png',
      digest: tempUpload.data.digest,
      ...mutationIds(),
    },
  });
  assert.equal(responseOf(finalizeReclaimed.response).status, 404);
});

await test('cleanup race safety on concurrent invocations', async () => {
  // Two fresh objects that both runs see in their candidate list.
  const first = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: {
      file: new File([samplePngBytes], 'race-a.png', { type: 'image/png' }),
    },
  });
  const second = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: {
      file: new File([samplePngBytes], 'race-b.png', { type: 'image/png' }),
    },
  });
  assert.ok(first.data);
  assert.ok(second.data);

  const future = new Date(Date.now() + 30 * 60 * 60 * 1000);
  const listed = await candidateIds(future);
  assert.ok(listed.includes(first.data.objectId));
  assert.ok(listed.includes(second.data.objectId));

  // Two runs at once claim every candidate once between them, never twice.
  const results = await Promise.all([
    attachments.reclaimAttachments(future),
    attachments.reclaimAttachments(future),
  ]);
  assert.equal(results[0] + results[1], listed.length);
  assert.equal(await attachments.reclaimAttachments(future), 0);
  assert.equal(await stored(stagingKey(first.data.objectId)), false);
  assert.equal(await stored(stagingKey(second.data.objectId)), false);
});

await test('a purge leaves an upload that is still in flight alone', async () => {
  // A note with an attachment. The purge below removes this note.
  const noteBytes = await uniquePng(10, 20, 30);
  const attached = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file: new File([noteBytes], 'purged.png', { type: 'image/png' }) },
  });
  assert.ok(attached.data);
  const purgedFileId = randomUUID();
  const attachedRevision = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: attached.data.objectId },
    body: {
      fileId: purgedFileId,
      revisionId: randomUUID(),
      path: 'assets/purged.png',
      digest: attached.data.digest,
      ...mutationIds(),
    },
  });
  assert.equal(responseOf(attachedRevision.response).status, 200);

  // An upload of the same person that has not been finalized yet.
  const flightBytes = await uniquePng(40, 50, 60);
  const inFlight = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: {
      file: new File([flightBytes], 'in-flight.png', { type: 'image/png' }),
    },
  });
  assert.ok(inFlight.data);
  const inFlightKey = stagingKey(inFlight.data.objectId);
  assert.ok(await stored(inFlightKey), 'the upload wrote its bytes');

  const purged = await purgeFiles({
    headers: browser(cookie),
    path: { workspaceId },
    body: { mutationId: randomUUID(), fileIds: [purgedFileId] },
  });
  assert.equal(purged.error, undefined, JSON.stringify(purged.error));

  // The purge of an unrelated note leaves the upload untouched.
  assert.equal(await objectState(inFlight.data.objectId), 'temporary');
  assert.ok(
    await stored(inFlightKey),
    'the bytes of the upload stay in the store',
  );

  // The upload still finalizes into its own note.
  const late = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: inFlight.data.objectId },
    body: {
      fileId: randomUUID(),
      revisionId: randomUUID(),
      path: 'assets/in-flight.png',
      digest: inFlight.data.digest,
      ...mutationIds(),
    },
  });
  assert.equal(responseOf(late.response).status, 200);
});

/** Uploads one image, finalizes it into a new note, and answers the parts. */
async function noteWithAttachment(
  bytes: Buffer<ArrayBuffer>,
  notePath: string,
): Promise<{
  readonly fileId: string;
  readonly objectId: string;
  readonly bytesKey: string;
}> {
  const uploaded = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: {
      file: new File([bytes], 'note.png', { type: 'image/png' }),
    },
  });
  assert.ok(uploaded.data);
  const fileId = randomUUID();
  const revisionId = randomUUID();
  const finalized = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: uploaded.data.objectId },
    body: {
      fileId,
      revisionId,
      path: notePath,
      digest: uploaded.data.digest,
      ...mutationIds(),
    },
  });
  assert.equal(responseOf(finalized.response).status, 200);
  const removed = await deleteFile({
    headers: { ...browser(cookie), 'if-match': `"${revisionId}"` },
    path: { workspaceId, fileId },
    body: {
      mutationId: randomUUID(),
      deviceId: 'attachment-test',
      revisionId: randomUUID(),
      document: await deletionForHead(workspaceId, revisionId),
    },
  });
  assert.equal(removed.error, undefined, JSON.stringify(removed.error));
  return {
    fileId,
    objectId: uploaded.data.objectId,
    bytesKey: attachmentKey(workspaceId, uploaded.data.digest),
  };
}

/** Deletes one note permanently. */
async function purgeNote(fileId: string): Promise<void> {
  const purged = await purgeFiles({
    headers: browser(cookie),
    path: { workspaceId },
    body: { mutationId: randomUUID(), fileIds: [fileId] },
  });
  assert.equal(purged.error, undefined, JSON.stringify(purged.error));
}

await test('a purge and the reclaim delete the attachment bytes', async () => {
  const first = await noteWithAttachment(
    await uniquePng(70, 80, 90),
    'assets/gone-one.png',
  );
  const second = await noteWithAttachment(
    await uniquePng(75, 85, 95),
    'assets/gone-two.png',
  );
  assert.ok(
    await stored(first.bytesKey),
    'the finalized bytes are in the store',
  );
  assert.ok(
    await stored(second.bytesKey),
    'the finalized bytes are in the store',
  );

  // Delete the first note permanently. The purge leaves the row finalized,
  // because the object was finalized inside the reclaim window.
  await purgeNote(first.fileId);
  assert.equal(await objectState(first.objectId), 'finalized');

  // Age the first object and delete the second note permanently. That purge
  // now sees a finalized object that nothing references any more, and marks
  // it unavailable.
  await ageObject(first.objectId);
  await purgeNote(second.fileId);
  assert.equal(await objectState(first.objectId), 'unavailable');
  assert.equal(await objectState(second.objectId), 'finalized');

  // The reclaim takes the unavailable object and deletes its bytes. The
  // second object was finalized inside the window, so it waits.
  assert.deepEqual(await candidateIds(new Date()), [first.objectId]);
  assert.equal(await attachments.reclaimAttachments(new Date()), 1);
  assert.equal(
    await stored(first.bytesKey),
    false,
    'the permanent deletion took the bytes off the disk',
  );
  assert.ok(await stored(second.bytesKey), 'the fresh object keeps its bytes');

  // Once the second object leaves the window the reclaim takes it as well.
  await ageObject(second.objectId);
  assert.deepEqual(await candidateIds(new Date()), [second.objectId]);
  assert.equal(await attachments.reclaimAttachments(new Date()), 1);
  assert.equal(await stored(second.bytesKey), false);
  assert.equal(await objectState(second.objectId), 'unavailable');
  assert.equal(await attachments.reclaimAttachments(new Date()), 0);
});

await test('a reclaim cannot take the bytes of a concurrent finalize', async () => {
  // One object holds the only copy of these bytes, and a purge unreferences
  // it. The reclaim below is entitled to delete the file.
  const bytes = await uniquePng(100, 110, 120);
  const doomed = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file: new File([bytes], 'shared.png', { type: 'image/png' }) },
  });
  assert.ok(doomed.data);
  const doomedFileId = randomUUID();
  const doomedFinalize = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: doomed.data.objectId },
    body: {
      fileId: doomedFileId,
      revisionId: randomUUID(),
      path: 'assets/shared.png',
      digest: doomed.data.digest,
      ...mutationIds(),
    },
  });
  assert.equal(responseOf(doomedFinalize.response).status, 200);
  const sharedKey = attachmentKey(workspaceId, doomed.data.digest);
  assert.ok(await stored(sharedKey));

  const purged = await purgeFiles({
    headers: browser(cookie),
    path: { workspaceId },
    body: { mutationId: randomUUID(), fileIds: [doomedFileId] },
  });
  assert.equal(purged.error, undefined, JSON.stringify(purged.error));
  await ageObject(doomed.data.objectId);

  // A second upload of the same bytes starts while the reclaim holds the
  // workspace lock, between the mark of the doomed object and the deletion of
  // its file. The competing call parks on the lock, so the reclaim cannot
  // delete bytes that the new object then depends on.
  const race: {
    lockHeld: boolean | null;
    parked: boolean;
    pending: Promise<string> | null;
  } = { lockHeld: null, parked: false, pending: null };

  const racing = openAttachmentStore(
    database.runtimeUrl,
    openFileObjectStore(storageRoot),
    {
      poolSize: 2,
      onReclaimMarked: async (objectId) => {
        if (objectId !== doomed.data?.objectId) return;
        race.lockHeld = await workspaceLockHeld();
        race.pending = uploadAndFinalize(bytes, 'assets/rescued.png');
        race.parked = await waitForLockWaiter();
      },
    },
  );
  let reclaimed = 0;
  try {
    reclaimed = await racing.reclaimAttachments(new Date());
  } finally {
    await racing.close();
  }
  assert.equal(reclaimed, 1);
  assert.equal(
    race.lockHeld,
    true,
    'the reclaim holds the workspace lock while it decides about the bytes',
  );
  assert.equal(
    race.parked,
    true,
    'the competing call waited for the lock of the reclaim',
  );

  // The competing call kept its bytes and reads back byte for byte.
  const rescuedRevision = await race.pending;
  assert.ok(rescuedRevision);
  assert.ok(await stored(sharedKey), 'the finalized object kept its bytes');
  const read = await getAttachmentRevision({
    headers: browser(cookie),
    path: { workspaceId, revisionId: rescuedRevision },
  });
  assert.equal(responseOf(read.response).status, 200);
  assert.ok(read.data instanceof Blob);
  assert.equal(
    sha256Hex(Buffer.from(await read.data.arrayBuffer())),
    doomed.data.digest,
  );
  assert.equal(await objectState(doomed.data.objectId), 'unavailable');
});

await test('a workspace deletion sends its attachment bytes to the reclaim', async () => {
  const otherWorkspaceId = randomUUID();
  const otherAccountId = randomUUID();
  await seedWorkspace(database, otherWorkspaceId, [
    { accountId: otherAccountId, role: 'owner' },
  ]);
  // An account keeps its last workspace (record 0051), so this account holds a
  // second one and the deletion below is a legal call.
  await seedWorkspace(database, randomUUID(), [
    { accountId: otherAccountId, role: 'owner' },
  ]);
  const actor = memberActor(otherAccountId, otherWorkspaceId);
  const bytes = await uniquePng(130, 140, 150);
  const digest = sha256Hex(bytes);
  const objectId = randomUUID();
  await attachments.saveTemporaryAttachment(actor, otherWorkspaceId, {
    id: objectId,
    digest,
    size: BigInt(bytes.length),
    mediaType: 'image/png',
    width: 100,
    height: 100,
  });
  await attachments.stageAttachmentBytes(
    objectId,
    Readable.from([bytes]),
    bytes.length,
  );
  const finalized = await attachments.finalizeAttachmentObject(
    actor,
    otherWorkspaceId,
    objectId,
    digest,
  );
  assert.equal(finalized.ok, true);
  const bytesKey = attachmentKey(otherWorkspaceId, digest);
  assert.ok(await stored(bytesKey), 'the finalized bytes are in the store');

  // The owner deletes the workspace. The rows go, the bytes are queued.
  const session = await openSession(database.runtimeUrl, otherAccountId);
  try {
    await session.query('select notesapp_delete_workspace($1)', [
      otherWorkspaceId,
    ]);
  } finally {
    await session.close();
  }

  // The reclaim is the one code that deletes attachment bytes.
  assert.equal(await attachments.reclaimAttachments(new Date()), 1);
  assert.equal(
    await stored(bytesKey),
    false,
    'the workspace deletion took the bytes off the disk',
  );
  assert.equal(await attachments.reclaimAttachments(new Date()), 0);
});

await test('an upload with no content type is refused with 415', async () => {
  // The form reader needs the media type and its boundary. A request that
  // states neither carries no body, so the contract check lets it through,
  // and the handler has to answer. 415 is the declared answer for it.
  //
  // Regression: the handler used to claim the header instead of reading it,
  // and the form reader then threw inside the request, so the person met a
  // server problem rather than the answer the contract states. No generated
  // operation can leave the header out, so this goes through `app.inject`.
  const answer = await server.app.inject({
    method: 'POST',
    url: `/api/workspaces/${workspaceId}/attachments`,
    headers: browser(cookie),
  });
  assert.equal(answer.statusCode, 415);
  assert.equal(problemCode(JSON.parse(answer.body)), 'unsupported_media_type');
});

await test('a stored media type the domain refuses stops the read', async () => {
  // `media_type` is a text column, so nothing in the database keeps a row
  // inside the union. An older release, a repair by hand, or a media type
  // that a later release removes can all leave one outside it. The read then
  // refuses instead of answering with a type the domain never declared, and
  // the person gets the one server message rather than an engine notice.
  const bytes = await uniquePng(11, 22, 33);
  const uploaded = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file: new File([bytes], 'refused.png', { type: 'image/png' }) },
  });
  assert.ok(uploaded.data);
  const objectId = uploaded.data.objectId;
  const fileId = randomUUID();
  const revisionId = randomUUID();
  const finalized = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId },
    body: {
      fileId,
      revisionId,
      path: 'assets/refused.png',
      digest: uploaded.data.digest,
      ...mutationIds(),
    },
  });
  assert.equal(responseOf(finalized.response).status, 200);

  // The read works while the row names a media type of the union.
  const before = await getAttachmentRevision({
    headers: browser(cookie),
    path: { workspaceId, revisionId },
  });
  assert.equal(
    responseOf(before.response).headers.get('content-type'),
    'image/png',
  );

  const session = await openSession(database.migrationUrl);
  try {
    await session.query(
      `update attachment_objects set media_type = $3
        where workspace_id = $1 and id = $2`,
      [workspaceId, objectId, 'image/svg+xml'],
    );
  } finally {
    await session.close();
  }

  // The revision read goes through the raw SQL path of the store.
  const after = await getAttachmentRevision({
    headers: browser(cookie),
    path: { workspaceId, revisionId },
  });
  assert.equal(responseOf(after.response).status, 500);
  assert.equal(problemCode(after.error), 'internal_error');

  // The metadata read goes through the Drizzle path of the same store.
  await assert.rejects(
    attachments.getAttachmentObject(
      memberActor(ownerAccountId, workspaceId),
      workspaceId,
      objectId,
    ),
    (error: unknown) => {
      assert.ok(isOperationalError(error));
      assert.equal(error.kind, 'unexpected');
      return true;
    },
  );
});

await test('a download names its file and states what to do with it', async () => {
  // The stored name holds a quote, a semicolon, and characters outside ASCII.
  // A path cannot hold a control character, because `normalizePath` refuses
  // one, so the header encoder is the second of two layers here.
  const storedName = 'résumé "quote";drop.png';
  const bytes = await uniquePng(160, 170, 180);
  const uploaded = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file: new File([bytes], 'upload.png', { type: 'image/png' }) },
  });
  assert.equal(responseOf(uploaded.response).status, 201);
  assert.ok(uploaded.data);

  const revisionId = randomUUID();
  const finalized = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: uploaded.data.objectId },
    body: {
      fileId: randomUUID(),
      revisionId,
      path: `assets/${storedName}`,
      digest: uploaded.data.digest,
      ...mutationIds(),
    },
  });
  assert.equal(responseOf(finalized.response).status, 200);

  const read = await getAttachmentRevision({
    headers: browser(cookie),
    path: { workspaceId, revisionId },
  });
  const answer = responseOf(read.response);
  assert.equal(answer.status, 200);
  // An image of an accepted type is shown, so the note surface and a later
  // reader page can point a browser straight at this address.
  assert.equal(
    answer.headers.get('content-disposition'),
    `inline; filename="r_sum_ _quote_;drop.png"; filename*=UTF-8''r%C3%A9sum%C3%A9%20%22quote%22%3Bdrop.png`,
  );
  // One header, not two. A second field would join with a comma here, and a
  // split answer would carry a header that nothing declared.
  assert.equal(
    [...answer.headers.keys()].filter((name) => name === 'content-disposition')
      .length,
    1,
  );
  assert.equal(answer.headers.get('x-content-type-options'), 'nosniff');
});

await test('a path with a control character never reaches a header', async () => {
  const bytes = await uniquePng(161, 171, 181);
  const uploaded = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file: new File([bytes], 'upload.png', { type: 'image/png' }) },
  });
  assert.ok(uploaded.data);
  const finalized = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: uploaded.data.objectId },
    body: {
      fileId: randomUUID(),
      revisionId: randomUUID(),
      path: `assets/split${String.fromCharCode(13)}${String.fromCharCode(10)}evil.png`,
      digest: uploaded.data.digest,
      ...mutationIds(),
    },
  });
  assert.equal(responseOf(finalized.response).status, 422);
  assert.equal(problemCode(finalized.error), 'invalid_path');
});

/** One multipart boundary of the hand built upload bodies below. */
const boundary = 'notesappIntegrationBoundary';

/** The head of a multipart body that declares one image file part. */
function filePartHead(name: string): string {
  return [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${name}"`,
    'Content-Type: image/png',
    '',
    '',
  ].join('\r\n');
}

await test('an upload that stops arriving answers with the declared timeout', async () => {
  // The generated operation cannot express a body that arrives in pieces, so
  // this drives the real instance through `app.inject`, which is the one
  // permitted way to send such a request. The body opens a file part, sends a
  // few bytes, and then says nothing at all.
  const body = new PassThrough();
  body.write(filePartHead('slow.png'));
  body.write(samplePngBytes.subarray(0, 8));

  const started = Date.now();
  const answer = await server.app.inject({
    method: 'POST',
    url: `/api/workspaces/${workspaceId}/attachments`,
    headers: {
      ...browser(cookie),
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: body,
  });
  body.destroy();

  assert.equal(answer.statusCode, 408);
  assert.equal(
    answer.headers['content-type'],
    'application/problem+json; charset=utf-8',
  );
  const problem: unknown = JSON.parse(answer.body);
  assert.equal(readProperty(problem, 'code'), 'request_timeout');
  assert.equal(readProperty(problem, 'status'), 408);
  assert.equal(
    readProperty(problem, 'detail'),
    'The upload stopped. Send the image again.',
  );
  // The answer waits for the bound rather than for a fixed delay, and it
  // arrives once the bound passes rather than at the request bound of the
  // whole deployment, which is forty times longer.
  assert.ok(
    Date.now() - started >= uploadIdleTimeoutMs,
    'the answer came before the idle bound',
  );
});

await test('an upload with no file part is refused rather than held', async () => {
  // Every part of this body arrives at once, so nothing here is slow. Before
  // the fix the request waited for a file stream that was never opened and
  // held its slot until the caller gave up.
  const payload = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="note"',
    '',
    'no file here',
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const answer = await server.app.inject({
    method: 'POST',
    url: `/api/workspaces/${workspaceId}/attachments`,
    headers: {
      ...browser(cookie),
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload,
  });
  assert.equal(answer.statusCode, 400);
  const problem: unknown = JSON.parse(answer.body);
  assert.equal(readProperty(problem, 'code'), 'invalid_request');
});

await test('an upload stages its bytes, and a finalize with no staged bytes commits nothing', async () => {
  // Record 0192. The upload writes its checked bytes to a staging key of the
  // store before it answers, so a finalize on another server finds them. A
  // finalize whose bytes are in neither place used to mark the object
  // finalized all the same, and the note named an image with no bytes.
  const bytes = await uniquePng(190, 200, 210);
  const uploaded = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file: new File([bytes], 'staged.png', { type: 'image/png' }) },
  });
  assert.ok(uploaded.data);
  const staged = stagingKey(uploaded.data.objectId);
  assert.equal(await attachments.objects.size(staged), bytes.length);
  // The file of the request is gone once the upload answers.
  const scratch = await readdir(join(storageRoot, 'tmp')).catch(() => []);
  assert.deepEqual(
    scratch.filter((name) => name.startsWith('upload-')),
    [],
  );
  await attachments.objects.remove(staged);
  const refused = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: uploaded.data.objectId },
    body: {
      fileId: randomUUID(),
      revisionId: randomUUID(),
      path: 'assets/lost.png',
      digest: uploaded.data.digest,
      ...mutationIds(),
    },
  });
  assert.equal(responseOf(refused.response).status, 404);
  assert.equal(await objectState(uploaded.data.objectId), 'temporary');
  assert.equal(
    await stored(attachmentKey(workspaceId, uploaded.data.digest)),
    false,
  );
});

// Teardown
await server.close();
await auth.close();
await authPool.end();
await attachments.close();
await content.close();
await identity.close();
await rm(storageRoot, { recursive: true, force: true });
await database.destroy();
