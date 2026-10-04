/**
 * Export of one note and of the whole workspace, against a real server.
 *
 * Every call goes through a generated operation. The archive is read back
 * with a small reader that walks the central directory, so the checks prove
 * that a real ZIP reader finds the notes at their paths and the referenced
 * image with its exact bytes.
 *
 * Start the database service first:
 *
 * ```sh
 * sudo -n docker compose -f compose.test.yaml up -d --wait
 * ```
 */
import assert from 'node:assert/strict';
import {
  firstSave,
  saveForHead,
  deletionForHead,
  useDocumentHeaders,
} from './support/documents.ts';
import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { crc32 } from 'node:zlib';
import {
  configureClient,
  createFile,
  createWorkspace,
  deleteFile,
  exportNote,
  exportWorkspace,
  finalizeAttachment,
  exportWorkspaceAddress,
  getAccount,
  startWorkspaceImport,
  sendWorkspaceImportPart,
  completeWorkspaceImport,
  inspectWorkspaceExport,
  listWorkspaces,
  signInWithPassword,
  updateFile,
  uploadAttachment,
} from '@notesapp/api-client';
import {
  archiveJobsPerInstallation,
  bootstrapOwner,
  coordinatedArchiveJobs,
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
  openCoordination,
  openFileObjectStore,
  openIdentityStore,
  importKey,
  openWorkspaceStore,
  provisionAccounts,
} from '@notesapp/storage-server';
import {
  commitChangeset,
  importPartBytes,
  maxArchiveBytes,
  maxImportParts,
  maxArchiveEntries,
  maxFilesPerChangeset,
  maxPathBytes,
  maxSegmentBytes,
  workspaceText,
} from '@notesapp/core';
import sharp from 'sharp';
import {
  createDisposableDatabase,
  limitAccountTo,
  memberActor,
  seedWorkspace,
} from './support/database.ts';
import { importArchive } from './support/import.ts';
import { storedArchive } from './support/zip.ts';
import { startTestServer } from './support/server.ts';

/** The HTTP response of a generated call, or a clear test failure. */
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

/** The headers of a browser request. A write also names the origin. */
function browser(cookie: string): Record<string, string> {
  return { origin: 'http://127.0.0.1', cookie };
}

/** The archive bytes of an export answer, or a test failure. */
async function archiveBytes(
  data: Blob | File | undefined,
): Promise<Buffer<ArrayBuffer>> {
  assert.ok(data !== undefined, 'the export answered with no archive');
  return Buffer.from(await data.arrayBuffer());
}

/** Every entry of a ZIP archive, read through its central directory. */
function readArchive(bytes: Buffer): ReadonlyMap<string, Buffer> {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.notEqual(end, -1, 'the answer is not a zip archive');
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);
  const entries = new Map<string, Buffer>();
  for (let index = 0; index < count; index += 1) {
    assert.equal(bytes.readUInt32LE(at), 0x0201_4b50);
    const checksum = bytes.readUInt32LE(at + 16);
    const size = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const offset = bytes.readUInt32LE(at + 42);
    const path = bytes.toString('utf8', at + 46, at + 46 + nameLength);
    const start =
      offset +
      30 +
      bytes.readUInt16LE(offset + 26) +
      bytes.readUInt16LE(offset + 28);
    const content = bytes.subarray(start, start + size);
    assert.equal(crc32(content), checksum, `the checksum of ${path} is wrong`);
    entries.set(path, content);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-export-test-'));
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
const coordination = openCoordination(database.runtimeUrl, { poolSize: 2 });

/** Reads one property of an unknown value without asserting its shape. */
function readProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value))[key];
}

/** The idle bound of a streamed body on this test deployment. */
const bodyIdleTimeoutMs = 1500;

/** The environment of this test deployment. */
function environment(): Record<string, string> {
  return {
    NOTESAPP_ORIGIN: 'http://127.0.0.1',
    NOTESAPP_DATABASE_URL: database.runtimeUrl,
    NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
    NOTESAPP_STORAGE_ROOT: storageRoot,
    NOTESAPP_AUTH_SECRET: 'export-test-secret-value-0123456789abcdef',
    NOTESAPP_ADDITIONAL_ORIGINS: 'http://localhost',
    NOTESAPP_LOG_LEVEL: 'silent',
    NOTESAPP_MAX_BODY_BYTES: '8388608',
    NOTESAPP_MAX_HEADER_BYTES: '16384',
    NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
    // Short enough to keep the slow import test quick, and far longer than
    // the gap between two chunks of any other body in this file.
    NOTESAPP_UPLOAD_IDLE_TIMEOUT_MS: String(bodyIdleTimeoutMs),
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
const server = await startTestServer({
  environment: environment(),
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

const ownerEmail = 'export-owner@notes.invalid';
const ownerPassword = 'a-strong-export-password';
await bootstrapOwner({
  config,
  email: ownerEmail,
  name: 'ExportOwner',
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
assert.match(account.data?.accountId ?? '', /^[0-9a-f-]{36}$/);
const listed = await listWorkspaces({ headers: browser(cookie) });
const workspaceId = listed.data?.workspaces[0]?.workspaceId ?? '';
assert.match(workspaceId, /^[0-9a-f-]{36}$/);

/** The identifiers that every write of this test carries. */
function ids(): { revisionId: string; mutationId: string; deviceId: string } {
  return {
    revisionId: randomUUID(),
    mutationId: randomUUID(),
    deviceId: 'integration-device',
  };
}

/** Creates one note and returns its identifiers and its entity tag. */
async function newNote(
  path: string,
  text: string,
): Promise<{ fileId: string; tag: string; revisionId: string }> {
  const fileId = randomUUID();
  const created = await createFile({
    headers: browser(cookie),
    path: { workspaceId },
    body: { fileId, path, document: firstSave(text), ...ids() },
  });
  assert.equal(created.error, undefined, JSON.stringify(created.error));
  const tag = responseOf(created.response).headers.get('etag') ?? '';
  assert.notEqual(tag, '');
  return { fileId, tag, revisionId: created.data?.revision.revisionId ?? '' };
}

const pngBytes = await sharp({
  create: {
    width: 24,
    height: 24,
    channels: 4,
    background: { r: 12, g: 240, b: 90, alpha: 1 },
  },
})
  .png()
  .toBuffer();

await test('one note is exported as a Markdown file with its name', async () => {
  const text = '# Quarter plan\n\nThe body of the note.\n';
  const note = await newNote('plans/quarter plan.md', text);
  const answer = await exportNote({
    headers: browser(cookie),
    path: { workspaceId, fileId: note.fileId },
  });
  assert.equal(answer.error, undefined, JSON.stringify(answer.error));
  const response = responseOf(answer.response);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/markdown');
  assert.equal(
    response.headers.get('content-disposition'),
    `attachment; filename="quarter plan.md"; filename*=UTF-8''quarter%20plan.md`,
  );
  // The generated client parses a text media type into a string.
  assert.equal(answer.data, text);
});

await test('a hostile note name reaches the header encoded', async () => {
  // The export path and the attachment path share one encoder. A quote and a
  // semicolon cannot end the field or start a second one, and an apostrophe and
  // a bracket are encoded, because neither is a character that RFC 8187 carries
  // unencoded in an extended value.
  const name = `report "final";it${String.fromCharCode(39)}s (v2).md`;
  const note = await newNote(`plans/${name}`, '# Report\n');
  const answer = await exportNote({
    headers: browser(cookie),
    path: { workspaceId, fileId: note.fileId },
  });
  const response = responseOf(answer.response);
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get('content-disposition'),
    `attachment; filename="report _final_;it${String.fromCharCode(39)}s (v2).md"; filename*=UTF-8''report%20%22final%22%3Bit%27s%20%28v2%29.md`,
  );
});

await test('a deleted note cannot be exported', async () => {
  const note = await newNote('plans/gone.md', '# Gone\n');
  const removed = await deleteFile({
    headers: { ...browser(cookie), 'if-match': note.tag },
    path: { workspaceId, fileId: note.fileId },
    body: {
      ...ids(),
      document: await deletionForHead(workspaceId, note.tag.replace(/"/g, '')),
    },
  });
  assert.equal(removed.error, undefined, JSON.stringify(removed.error));
  const answer = await exportNote({
    headers: browser(cookie),
    path: { workspaceId, fileId: note.fileId },
  });
  assert.equal(responseOf(answer.response).status, 404);
});

await test('the archive holds every live note and the images they use', async () => {
  // One image, referenced by one note.
  const uploaded = await uploadAttachment({
    headers: browser(cookie),
    path: { workspaceId },
    body: { file: new File([pngBytes], 'shot.png', { type: 'image/png' }) },
  });
  assert.ok(uploaded.data);
  const attachmentRevisionId = randomUUID();
  const finalized = await finalizeAttachment({
    headers: browser(cookie),
    path: { workspaceId, objectId: uploaded.data.objectId },
    body: {
      fileId: randomUUID(),
      revisionId: attachmentRevisionId,
      path: 'attachments/shot.png',
      digest: uploaded.data.digest,
      mutationId: randomUUID(),
      deviceId: 'integration-device',
    },
  });
  assert.equal(responseOf(finalized.response).status, 200);

  const illustrated = '# With an image\n\n![shot](../attachments/shot.png)\n';
  await newNote('folder/illustrated.md', illustrated);
  const plain = '# Plain note\n\nNothing special.\n';
  await newNote('plain.md', plain);

  // One note that is deleted must not be in the archive.
  const doomed = await newNote('folder/doomed.md', '# Doomed\n');
  const removed = await deleteFile({
    headers: { ...browser(cookie), 'if-match': doomed.tag },
    path: { workspaceId, fileId: doomed.fileId },
    body: {
      ...ids(),
      document: await deletionForHead(
        workspaceId,
        doomed.tag.replace(/"/g, ''),
      ),
    },
  });
  assert.equal(removed.error, undefined, JSON.stringify(removed.error));

  const answer = await exportWorkspace({
    headers: browser(cookie),
    path: { workspaceId },
  });
  assert.equal(answer.error, undefined, JSON.stringify(answer.error));
  const response = responseOf(answer.response);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/zip');
  assert.match(
    response.headers.get('content-disposition') ?? '',
    /^attachment; filename="notes\.zip"/,
  );

  const archive = await archiveBytes(answer.data);
  const entries = readArchive(archive);
  const paths = [...entries.keys()];
  assert.ok(paths.includes('folder/illustrated.md'), paths.join(', '));
  assert.ok(paths.includes('plain.md'), paths.join(', '));
  assert.equal(
    entries.get('folder/illustrated.md')?.toString('utf8'),
    illustrated,
  );
  assert.equal(entries.get('plain.md')?.toString('utf8'), plain);
  // A deleted note holds no place in the file tree, so it is not exported.
  assert.equal(paths.includes('folder/doomed.md'), false);
  assert.equal(paths.includes('plans/gone.md'), false);
  // The referenced image travels with its exact bytes.
  const image = entries.get('attachments/shot.png');
  assert.ok(image !== undefined, paths.join(', '));
  assert.equal(Buffer.compare(image, pngBytes), 0);

  const createdWorkspace = await createWorkspace({
    headers: browser(cookie),
    body: { name: 'Imported workspace' },
  });
  const importedWorkspaceId = createdWorkspace.data?.workspaceId ?? '';
  assert.match(importedWorkspaceId, /^[0-9a-f-]{36}$/);
  const imported = await importArchive({
    headers: browser(cookie),
    path: { workspaceId: importedWorkspaceId },
    body: {
      file: new File([archive], 'notes.zip', { type: 'application/zip' }),
    },
  });
  assert.deepEqual(imported.data, {
    notes: paths.filter((path) => path.endsWith('.md')).length,
    attachments: 1,
    skipped: { files: 0, kinds: [] },
  });
  const roundTrip = await exportWorkspace({
    headers: browser(cookie),
    path: { workspaceId: importedWorkspaceId },
  });
  const roundTripEntries = readArchive(await archiveBytes(roundTrip.data));
  assert.deepEqual([...roundTripEntries.keys()], [...entries.keys()]);
  for (const [path, bytes] of entries)
    assert.equal(
      Buffer.compare(roundTripEntries.get(path) ?? Buffer.alloc(0), bytes),
      0,
    );
});

await test('the archive follows a rename and a later edit', async () => {
  const first = await newNote('moving.md', '# One\n');
  const changed = await updateFile({
    headers: { ...browser(cookie), 'if-match': first.tag },
    path: { workspaceId, fileId: first.fileId },
    body: {
      document: await saveForHead(workspaceId, first.revisionId, '# Two\n'),
      path: 'moved/renamed.md',
      ...ids(),
    },
  });
  assert.equal(changed.error, undefined, JSON.stringify(changed.error));
  const answer = await exportWorkspace({
    headers: browser(cookie),
    path: { workspaceId },
  });
  const entries = readArchive(await archiveBytes(answer.data));
  assert.equal(entries.get('moved/renamed.md')?.toString('utf8'), '# Two\n');
  assert.equal(entries.has('moving.md'), false);
});

await test('a stranger cannot export a workspace', async () => {
  const otherWorkspace = randomUUID();
  await seedWorkspace(database, otherWorkspace, [
    { accountId: randomUUID(), role: 'owner' },
  ]);
  const answer = await exportWorkspace({
    headers: browser(cookie),
    path: { workspaceId: otherWorkspace },
  });
  assert.equal(responseOf(answer.response).status, 404);
});

/** Starts an import of the owner, and answers its identifier. */
async function startedImport(targetId: string, size: number): Promise<string> {
  const started = await startWorkspaceImport({
    headers: browser(cookie),
    path: { workspaceId: targetId },
    body: { size },
  });
  assert.equal(started.error, undefined, JSON.stringify(started.error));
  return started.data?.importId ?? '';
}

await test('a part that stops arriving answers with the declared timeout', async () => {
  // The defect this covers: the import route read its body with no idle
  // bound. A sender that stopped in the middle therefore held its slot until
  // the total receive bound fired. Each part of an import keeps that bound
  // (record 0192).
  //
  // The generated operation cannot express a body that arrives in pieces, so
  // this drives the real instance through `app.inject`, which is the one
  // permitted way to send such a request.
  const importId = await startedImport(workspaceId, 1000);
  const body = new PassThrough();
  body.write('PK');

  const started = Date.now();
  const answer = await server.app.inject({
    method: 'PUT',
    url: `/api/workspaces/${workspaceId}/imports/${importId}/parts/1`,
    headers: {
      ...browser(cookie),
      'content-type': 'application/octet-stream',
      'content-length': '1000',
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
  assert.equal(
    readProperty(problem, 'detail'),
    'The import stopped. Send the zip file again.',
  );
  // The answer waits for the bound and not for the request bound of the whole
  // deployment, which is forty times longer.
  assert.ok(
    Date.now() - started >= bodyIdleTimeoutMs,
    'the answer came before the idle bound',
  );
  assert.ok(
    Date.now() - started < 30_000,
    'the answer waited for the request bound',
  );
  // The store keeps no byte of the part that stopped.
  assert.deepEqual(
    await attachments.objects.listParts(
      importKey(workspaceId, account.data?.accountId ?? '', importId),
    ),
    [],
  );
});

await test('a part states its length and stays inside the bound of a part', async () => {
  const importId = await startedImport(workspaceId, 10);
  const part = (partNumber: number, headers: Record<string, string>) =>
    server.app.inject({
      method: 'PUT',
      url: `/api/workspaces/${workspaceId}/imports/${importId}/parts/${String(partNumber)}`,
      headers: {
        ...browser(cookie),
        'content-type': 'application/octet-stream',
        ...headers,
      },
      payload: Buffer.from('0123456789'),
    });
  // A body that states a length past one part is refused before it is read.
  const large = await part(1, {
    'content-length': String(importPartBytes + 1),
  });
  assert.equal(large.statusCode, 413);
  // A number past the last part of the largest archive is refused.
  const far = await part(maxImportParts + 1, { 'content-length': '10' });
  assert.equal(far.statusCode, 400);
  // A part of an import that is not there answers not found.
  const missing = await sendWorkspaceImportPart({
    headers: browser(cookie),
    path: { workspaceId, importId: randomUUID(), partNumber: 1 },
    body: new Blob(['0123456789']),
  });
  assert.equal(responseOf(missing.response).status, 404);
  // The completion of parts that leave a gap makes no archive.
  const gap = await sendWorkspaceImportPart({
    headers: browser(cookie),
    path: { workspaceId, importId, partNumber: 2 },
    body: new Blob(['0123456789']),
  });
  assert.equal(gap.error, undefined, JSON.stringify(gap.error));
  const refused = await completeWorkspaceImport({
    headers: browser(cookie),
    path: { workspaceId, importId },
  });
  assert.equal(responseOf(refused.response).status, 422);
  assert.equal(readProperty(refused.error, 'code'), 'archive_invalid');
  // Another account cannot send to the import of the owner or complete it:
  // the key of the import names the account that started it.
  assert.equal(
    await attachments.objects.size(
      importKey(workspaceId, randomUUID(), importId),
    ),
    null,
  );
});

await test('a start states the size of the archive, which has a bound', async () => {
  const refused = await startWorkspaceImport({
    headers: browser(cookie),
    path: { workspaceId },
    body: { size: maxArchiveBytes + 1 },
  });
  assert.equal(responseOf(refused.response).status, 413);
  assert.equal(readProperty(refused.error, 'code'), 'payload_too_large');
});

await test('an export of more than 1000 notes imports back whole', async () => {
  // Issue 243. The import refused an archive of more than 1000 files, and
  // the export writes up to the bound of the format, so a workspace of more
  // notes could not come back through its own export.
  const count = maxFilesPerChangeset + 100;
  const source = await createWorkspace({
    headers: browser(cookie),
    body: { name: 'Large source' },
  });
  const sourceId = source.data?.workspaceId ?? '';
  assert.match(sourceId, /^[0-9a-f-]{36}$/);
  const owner = memberActor(account.data?.accountId ?? '', sourceId);
  for (let start = 0; start < count; start += maxFilesPerChangeset) {
    const expectedHeads: Record<string, null> = {};
    const revisions = Array.from(
      { length: Math.min(maxFilesPerChangeset, count - start) },
      (_, offset) => {
        const fileId = randomUUID();
        expectedHeads[fileId] = null;
        const index = start + offset;
        return {
          id: randomUUID(),
          fileId,
          parents: [],
          path: `folder-${String(index % 10)}/note-${String(index)}.md`,
          deleted: false,
          content: workspaceText(`# Note ${String(index)}\n`, 1),
          clientTime: '2026-10-02T00:00:00.000Z',
          message: null,
          restoredFrom: null,
        };
      },
    );
    const input = {
      workspaceId: sourceId,
      mutationId: randomUUID(),
      deviceId: 'integration-seed',
      expectedHeads,
      revisions,
    };
    const accepted = await commitChangeset(
      content,
      owner,
      input,
      `export-seed-${input.mutationId}`,
    );
    assert.equal(accepted.ok, true, JSON.stringify(accepted));
  }
  const exported = await exportWorkspace({
    headers: browser(cookie),
    path: { workspaceId: sourceId },
  });
  const archive = await archiveBytes(exported.data);
  const entries = readArchive(archive);
  assert.equal(entries.size, count);

  const target = await createWorkspace({
    headers: browser(cookie),
    body: { name: 'Large target' },
  });
  const targetId = target.data?.workspaceId ?? '';
  const imported = await importArchive({
    headers: browser(cookie),
    path: { workspaceId: targetId },
    body: {
      file: new File([archive], 'notes.zip', { type: 'application/zip' }),
    },
  });
  assert.equal(imported.error, undefined, JSON.stringify(imported.error));
  assert.deepEqual(imported.data, {
    notes: count,
    attachments: 0,
    skipped: { files: 0, kinds: [] },
  });
  const roundTrip = readArchive(
    await archiveBytes(
      (
        await exportWorkspace({
          headers: browser(cookie),
          path: { workspaceId: targetId },
        })
      ).data,
    ),
  );
  assert.deepEqual([...roundTrip.keys()].sort(), [...entries.keys()].sort());
  assert.equal(
    roundTrip.get(`folder-3/note-${String(count - 7)}.md`)?.toString('utf8'),
    `# Note ${String(count - 7)}\n`,
  );
});

await test('an export of more than 100 MiB imports back whole', async () => {
  // Issue 243. The import took 100 MiB at the most, while the export wrote
  // up to the bound of the format, so a workspace of many images could not
  // come back through its own export. Both read one bound now.
  const source = await createWorkspace({
    headers: browser(cookie),
    body: { name: 'Large images' },
  });
  const sourceId = source.data?.workspaceId ?? '';
  assert.match(sourceId, /^[0-9a-f-]{36}$/);
  const side = 2200;
  const images = 6;
  let imageBytes = 0;
  for (let index = 0; index < images; index += 1) {
    // Noise does not compress, so each image keeps about 18 MiB.
    const png = await sharp(randomBytes(side * side * 4), {
      raw: { width: side, height: side, channels: 4 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    imageBytes += png.length;
    const uploaded = await uploadAttachment({
      headers: browser(cookie),
      path: { workspaceId: sourceId },
      body: {
        file: new File([png], `noise-${String(index)}.png`, {
          type: 'image/png',
        }),
      },
    });
    assert.ok(uploaded.data, JSON.stringify(uploaded.error));
    const finalized = await finalizeAttachment({
      headers: browser(cookie),
      path: { workspaceId: sourceId, objectId: uploaded.data.objectId },
      body: {
        fileId: randomUUID(),
        revisionId: randomUUID(),
        path: `attachments/noise-${String(index)}.png`,
        digest: uploaded.data.digest,
        mutationId: randomUUID(),
        deviceId: 'integration-device',
      },
    });
    assert.equal(responseOf(finalized.response).status, 200);
  }
  assert.ok(imageBytes > 100 * 1024 * 1024, 'the images pass the old bound');
  const exported = await exportWorkspace({
    headers: browser(cookie),
    path: { workspaceId: sourceId },
  });
  const archive = await archiveBytes(exported.data);
  // The whole archive is written before the answer, so it states its length.
  assert.equal(
    Number(responseOf(exported.response).headers.get('content-length')),
    archive.length,
  );
  const entries = readArchive(archive);
  assert.equal(entries.size, images);

  const target = await createWorkspace({
    headers: browser(cookie),
    body: { name: 'Large images back' },
  });
  const targetId = target.data?.workspaceId ?? '';
  const imported = await importArchive({
    headers: browser(cookie),
    path: { workspaceId: targetId },
    body: {
      file: new File([archive], 'notes.zip', { type: 'application/zip' }),
    },
  });
  assert.equal(imported.error, undefined, JSON.stringify(imported.error));
  assert.deepEqual(imported.data, {
    notes: 0,
    attachments: images,
    skipped: { files: 0, kinds: [] },
  });
  const back = readArchive(
    await archiveBytes(
      (
        await exportWorkspace({
          headers: browser(cookie),
          path: { workspaceId: targetId },
        })
      ).data,
    ),
  );
  for (const [path, bytes] of entries)
    assert.equal(Buffer.compare(back.get(path) ?? Buffer.alloc(0), bytes), 0);
});

/** The ZIP64 end records of an archive that states `files` files. */
function zip64Archive(files: number): Buffer<ArrayBuffer> {
  const record = Buffer.alloc(56);
  record.writeUInt32LE(0x0606_4b50, 0);
  record.writeBigUInt64LE(44n, 4);
  record.writeBigUInt64LE(BigInt(files), 24);
  record.writeBigUInt64LE(BigInt(files), 32);
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x0706_4b50, 0);
  locator.writeUInt32LE(1, 16);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x0605_4b50, 0);
  end.writeUInt16LE(0xffff, 8);
  end.writeUInt16LE(0xffff, 10);
  end.writeUInt32LE(0xffff_ffff, 12);
  end.writeUInt32LE(0xffff_ffff, 16);
  return Buffer.concat([record, locator, end]);
}

/** A zip archive of stored entries of text or bytes, as a desktop writes it. */
function vaultArchive(
  files: readonly (readonly [string, string | Buffer])[],
): Buffer<ArrayBuffer> {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [path, value] of files) {
    const name = Buffer.from(path, 'utf8');
    const data = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x0403_4b50, 0);
    local.writeUInt16LE(20, 4);
    // Bit 11 states that the name is UTF-8.
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x0201_4b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x0605_4b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

await test('an Obsidian vault imports with its links and its pictures', async () => {
  // Record 0172, issue 241. The import refused a picture outside the
  // attachments folder and the settings folder of the vault, and every wiki
  // link stayed text.
  const vault = vaultArchive([
    ['Vault/.obsidian/app.json', '{}'],
    [
      'Vault/Home.md',
      'See [[Plan]] and [[Plan#Next steps|the steps]].\n\n![[Pasted image.png]]\n\n![a dog](img/dog.png)\n\nNo note [[Missing]] and `[[Plan]]` in code.\n',
    ],
    [
      'Vault/Projects/Plan.md',
      '# Plan\n\n## Next steps\n\nBack to [[Home]].\n',
    ],
    ['Vault/Pasted image.png', pngBytes],
    ['Vault/img/dog.png', pngBytes],
    ['.DS_Store', 'not a note'],
  ]);
  const target = await createWorkspace({
    headers: browser(cookie),
    body: { name: 'Imported vault' },
  });
  const targetId = target.data?.workspaceId ?? '';
  assert.match(targetId, /^[0-9a-f-]{36}$/);
  const imported = await importArchive({
    headers: browser(cookie),
    path: { workspaceId: targetId },
    body: {
      file: new File([vault], 'vault.zip', { type: 'application/zip' }),
    },
  });
  assert.equal(imported.error, undefined, JSON.stringify(imported.error));
  assert.deepEqual(imported.data, {
    notes: 2,
    attachments: 2,
    skipped: { files: 2, kinds: ['settings'] },
  });
  const back = readArchive(
    await archiveBytes(
      (
        await exportWorkspace({
          headers: browser(cookie),
          path: { workspaceId: targetId },
        })
      ).data,
    ),
  );
  assert.deepEqual([...back.keys()].sort(), [
    'Vault/Home.md',
    'Vault/Projects/Plan.md',
    'attachments/Vault/Pasted image.png',
    'attachments/Vault/img/dog.png',
  ]);
  assert.equal(
    back.get('Vault/Home.md')?.toString('utf8'),
    'See [Plan](Projects/Plan.md) and [the steps](Projects/Plan.md#next-steps).\n\n![Pasted image.png](../attachments/Vault/Pasted%20image.png)\n\n![a dog](../attachments/Vault/img/dog.png)\n\nNo note [[Missing]] and `[[Plan]]` in code.\n',
  );
  assert.equal(
    back.get('Vault/Projects/Plan.md')?.toString('utf8'),
    '# Plan\n\n## Next steps\n\nBack to [Home](../Home.md).\n',
  );
  assert.equal(
    Buffer.compare(
      back.get('attachments/Vault/Pasted image.png') ?? Buffer.alloc(0),
      pngBytes,
    ),
    0,
  );
});

await test('a backup with hidden notes comes back whole', async () => {
  // Review of record 0172: the import dropped every name that starts with a
  // dot, and an export writes such a note, so a backup lost it in silence.
  const source = await createWorkspace({
    headers: browser(cookie),
    body: { name: 'Hidden notes' },
  });
  const sourceId = source.data?.workspaceId ?? '';
  const owner = memberActor(account.data?.accountId ?? '', sourceId);
  const expectedHeads: Record<string, null> = {};
  const revisions = ['.ideas/plan.md', '.todo.md', 'shown.md'].map((path) => {
    const fileId = randomUUID();
    expectedHeads[fileId] = null;
    return {
      id: randomUUID(),
      fileId,
      parents: [],
      path,
      deleted: false,
      content: workspaceText(`# ${path}\n`, 1),
      clientTime: '2026-10-03T00:00:00.000Z',
      message: null,
      restoredFrom: null,
    };
  });
  const input = {
    workspaceId: sourceId,
    mutationId: randomUUID(),
    deviceId: 'integration-seed',
    expectedHeads,
    revisions,
  };
  assert.equal(
    (await commitChangeset(content, owner, input, `hidden-${input.mutationId}`))
      .ok,
    true,
  );
  const archive = await archiveBytes(
    (
      await exportWorkspace({
        headers: browser(cookie),
        path: { workspaceId: sourceId },
      })
    ).data,
  );
  const entries = readArchive(archive);
  assert.deepEqual([...entries.keys()].sort(), [
    '.ideas/plan.md',
    '.todo.md',
    'shown.md',
  ]);
  const target = await createWorkspace({
    headers: browser(cookie),
    body: { name: 'Hidden notes back' },
  });
  const targetId = target.data?.workspaceId ?? '';
  const imported = await importArchive({
    headers: browser(cookie),
    path: { workspaceId: targetId },
    body: {
      file: new File([archive], 'notes.zip', { type: 'application/zip' }),
    },
  });
  assert.equal(imported.error, undefined, JSON.stringify(imported.error));
  assert.deepEqual(imported.data, {
    notes: 3,
    attachments: 0,
    skipped: { files: 0, kinds: [] },
  });
  const back = readArchive(
    await archiveBytes(
      (
        await exportWorkspace({
          headers: browser(cookie),
          path: { workspaceId: targetId },
        })
      ).data,
    ),
  );
  for (const [path, bytes] of entries)
    assert.equal(
      Buffer.compare(back.get(path) ?? Buffer.alloc(0), bytes),
      0,
      path,
    );
});

await test('a vault with other files imports its notes and its pictures and names the rest', async () => {
  // Review of record 0172: a canvas or a PDF refused the whole vault, and a
  // picture beside `attachments/` of the same name refused it as one path
  // twice.
  const vault = vaultArchive([
    ['Vault/Board.canvas', '{}'],
    ['Vault/paper.pdf', '%PDF-1.4'],
    ['Vault/.obsidian/app.json', '{}'],
    ['Vault/Home.md', '![[x.png]] and ![b](attachments/x.png)\n'],
    ['x.png', pngBytes],
    ['attachments/x.png', pngBytes],
  ]);
  const target = await createWorkspace({
    headers: browser(cookie),
    body: { name: 'Vault of other files' },
  });
  const targetId = target.data?.workspaceId ?? '';
  const imported = await importArchive({
    headers: browser(cookie),
    path: { workspaceId: targetId },
    body: { file: new File([vault], 'vault.zip', { type: 'application/zip' }) },
  });
  assert.equal(imported.error, undefined, JSON.stringify(imported.error));
  assert.deepEqual(imported.data, {
    notes: 1,
    attachments: 2,
    skipped: { files: 3, kinds: ['canvas', 'pdf', 'settings'] },
  });
  const back = readArchive(
    await archiveBytes(
      (
        await exportWorkspace({
          headers: browser(cookie),
          path: { workspaceId: targetId },
        })
      ).data,
    ),
  );
  assert.deepEqual([...back.keys()].sort(), [
    'Vault/Home.md',
    'attachments/x 2.png',
    'attachments/x.png',
  ]);
});

await test('the room of an import counts the notes as their links convert', async (t) => {
  // Review of record 0172: the room and the batches counted the size of a
  // note in the archive, before its wiki links grew into standard links. The
  // check let the import start, the first batch went in, and the store
  // refused a later one, so half of the vault came in.
  // Each link is a paragraph of its own, so no block holds more marks than
  // the grammar reads (record 0182).
  const unit = '[[a b c d]]\n\n';
  const links = 30_000;
  const small: [string, string][] = Array.from(
    { length: maxFilesPerChangeset },
    (_, index) => [`Vault/note-${String(index)}.md`, '# A\n'],
  );
  const vault = vaultArchive([
    ['Vault/a b c d.md', '# A\n'],
    ...small,
    ['Vault/Home.md', unit.repeat(links)],
  ]);
  const archived = unit.length * links;
  const converted = '[a b c d](a%20b%20c%20d.md)\n\n'.length * links;
  assert.ok(converted > archived * 2);
  const notes = small.length + 2;
  const target = await createWorkspace({
    headers: browser(cookie),
    body: { name: 'Vault that grows' },
  });
  const targetId = target.data?.workspaceId ?? '';
  // The room holds the reserve of the owner, the overhead of each revision
  // and each changeset, the small notes, and the large note as the archive
  // holds it, but not as it converts.
  const room =
    (1n << 20n) +
    BigInt(notes) * 1024n +
    2n * 512n +
    BigInt(notes * 4) +
    BigInt(Math.floor((archived + converted) / 2));
  t.after(await limitAccountTo(database, account.data?.accountId ?? '', room));
  const refused = await importArchive({
    headers: browser(cookie),
    path: { workspaceId: targetId },
    body: { file: new File([vault], 'vault.zip', { type: 'application/zip' }) },
  });
  assert.equal(readProperty(refused.error, 'code'), 'quota_exceeded');
  const exported = readArchive(
    await archiveBytes(
      (
        await exportWorkspace({
          headers: browser(cookie),
          path: { workspaceId: targetId },
        })
      ).data,
    ),
  );
  assert.equal(exported.size, 0);
});

await test('an import refusal names its real cause', async () => {
  // Issue 243. Every refusal of the reader came back as invalid content,
  // whose title names a digest that does not match.
  const target = await createWorkspace({
    headers: browser(cookie),
    body: { name: 'Refused target' },
  });
  const targetId = target.data?.workspaceId ?? '';
  const send = (bytes: Buffer<ArrayBuffer>) =>
    importArchive({
      headers: browser(cookie),
      path: { workspaceId: targetId },
      body: {
        file: new File([bytes], 'notes.zip', { type: 'application/zip' }),
      },
    });
  const many = await send(zip64Archive(maxArchiveEntries + 1));
  assert.equal(responseOf(many.response).status, 413);
  assert.equal(readProperty(many.error, 'code'), 'archive_too_many_files');
  assert.equal(
    readProperty(many.error, 'title'),
    'The archive holds more files than one import can take.',
  );
  assert.match(
    String(readProperty(many.error, 'detail')),
    /65534 files at the most/,
  );
  const broken = await send(Buffer.from('this is not a zip archive at all'));
  assert.equal(responseOf(broken.response).status, 422);
  assert.equal(readProperty(broken.error, 'code'), 'archive_invalid');
  assert.equal(
    readProperty(broken.error, 'title'),
    'The file is not a zip archive that this server can read.',
  );
  for (const problem of [many.error, broken.error])
    assert.doesNotMatch(String(readProperty(problem, 'title')), /digest/);
});

/** The files that the stores of this server are writing now. */
async function filesBeingWritten(): Promise<number> {
  const folder = join(storageRoot, 'tmp');
  const names = await readdir(folder).catch(() => []);
  return names.filter((name) => name.startsWith('object-')).length;
}

/** Waits for a state of the server that no answer states. */
async function until(
  check: () => Promise<boolean>,
  what: string,
): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (await check()) return;
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`The server never reached the state: ${what}.`);
}

await test(
  'a part that ends before it is whole leaves no part and no file',
  { timeout: 30_000 },
  async () => {
    // Review of issue 243. A body that ended early never finished the reader,
    // so the import waited for ever and its file kept its bytes. A part of
    // an import holds the same rule (record 0192).
    const importId = await startedImport(workspaceId, 1024 * 1024);
    const body = new PassThrough();
    body.write(Buffer.alloc(64 * 1024, 0x50));
    const answered = server.app.inject({
      method: 'PUT',
      url: `/api/workspaces/${workspaceId}/imports/${importId}/parts/1`,
      headers: {
        ...browser(cookie),
        'content-type': 'application/octet-stream',
        'content-length': String(1024 * 1024),
      },
      payload: body,
    });
    await until(
      async () => (await filesBeingWritten()) > 0,
      'the part reaches the store',
    );
    // The sender is gone, so nobody reads an answer. The injected request
    // reports the closed connection as its failure.
    body.destroy(new Error('The connection of the sender closed.'));
    await assert.rejects(answered, /The connection of the sender closed/);
    await until(
      async () => (await filesBeingWritten()) === 0,
      'the store removes the file of the part',
    );
    assert.deepEqual(
      await attachments.objects.listParts(
        importKey(workspaceId, account.data?.accountId ?? '', importId),
      ),
      [],
    );
  },
);

await test('an account runs one archive job, and the installation a few', async () => {
  // Review of issue 243, record 0170. Nothing bounded how many imports and
  // exports ran at once, so their disk and their database work had no bound.
  const held = randomUUID();
  const ownerId = account.data?.accountId ?? '';
  // The job of the test before ends as its answer ends, so this waits for its
  // release, and a job that never ends fails here.
  await until(
    async () =>
      (
        await coordination.reserveArchiveJob(
          held,
          ownerId,
          60_000,
          { account: 1, installation: archiveJobsPerInstallation },
          0,
        )
      ).state === 'reserved',
    'every earlier archive job of the owner ends',
  );
  try {
    const refused = await exportWorkspace({
      headers: browser(cookie),
      path: { workspaceId },
    });
    assert.equal(responseOf(refused.response).status, 429);
    assert.equal(readProperty(refused.error, 'code'), 'archive_job_running');
    assert.equal(responseOf(refused.response).headers.get('retry-after'), '30');
  } finally {
    await coordination.releaseArchiveJob(held);
  }
  const others = Array.from({ length: archiveJobsPerInstallation }, () =>
    randomUUID(),
  );
  await provisionAccounts(database.migrationUrl, others);
  const jobs = others.map(() => randomUUID());
  for (const [index, job] of jobs.entries())
    await coordination.reserveArchiveJob(
      job,
      others[index] ?? '',
      60_000,
      { account: 1, installation: archiveJobsPerInstallation },
      0,
    );
  try {
    const busy = await exportWorkspace({
      headers: browser(cookie),
      path: { workspaceId },
    });
    assert.equal(responseOf(busy.response).status, 503);
    assert.equal(readProperty(busy.error, 'code'), 'archive_jobs_busy');
    assert.equal(responseOf(busy.response).headers.get('retry-after'), '30');
  } finally {
    for (const job of jobs) await coordination.releaseArchiveJob(job);
  }
  // A job that ended frees its place.
  const free = await exportWorkspace({
    headers: browser(cookie),
    path: { workspaceId },
  });
  assert.equal(responseOf(free.response).status, 200);
});

await test('an import counts the room that the other running imports may take', async () => {
  // Review of record 0170. An import checked the free space before it
  // reserved its job, so two imports that started together both saw the
  // whole free space and could fill the volume together.
  const target = await createWorkspace({
    headers: browser(cookie),
    body: { name: 'Room target' },
  });
  const targetId = target.data?.workspaceId ?? '';
  const send = () =>
    importArchive({
      headers: browser(cookie),
      path: { workspaceId: targetId },
      body: {
        file: new File(
          [storedArchive([['room/note.md', '# Room\n']])],
          'notes.zip',
          { type: 'application/zip' },
        ),
      },
    });
  const other = randomUUID();
  await provisionAccounts(database.migrationUrl, [other]);
  const held = randomUUID();
  let keptImport = '';
  const volume = await statfs(storageRoot);
  // The other job is an import of another process that may still write as
  // many bytes as the volume has free now.
  const reserved = await coordination.reserveArchiveJob(
    held,
    other,
    60_000,
    { account: 1, installation: archiveJobsPerInstallation },
    volume.bavail * volume.bsize,
  );
  assert.equal(reserved.state, 'reserved');
  try {
    // A later reservation reads the disk of the earlier one under its lock.
    const probe = randomUUID();
    const later = await coordination.reserveArchiveJob(
      probe,
      account.data?.accountId ?? '',
      60_000,
      { account: 1, installation: archiveJobsPerInstallation },
      0,
    );
    await coordination.releaseArchiveJob(probe);
    assert.deepEqual(later, {
      state: 'reserved',
      otherDiskBytes: volume.bavail * volume.bsize,
    });
    const refused = await send();
    assert.equal(responseOf(refused.response).status, 507);
    assert.equal(readProperty(refused.error, 'code'), 'storage_full');
    // A refusal before the join keeps the parts, so the same import
    // completes once there is room (record 0192).
    const kept = storedArchive([['room/kept.md', '# Kept\n']]);
    const importId = await startedImport(targetId, kept.length);
    const sent = await sendWorkspaceImportPart({
      headers: browser(cookie),
      path: { workspaceId: targetId, importId, partNumber: 1 },
      body: new Blob([kept]),
    });
    assert.equal(sent.error, undefined, JSON.stringify(sent.error));
    const full = await completeWorkspaceImport({
      headers: browser(cookie),
      path: { workspaceId: targetId, importId },
    });
    assert.equal(responseOf(full.response).status, 507);
    keptImport = importId;
  } finally {
    await coordination.releaseArchiveJob(held);
  }
  const completed = await completeWorkspaceImport({
    headers: browser(cookie),
    path: { workspaceId: targetId, importId: keptImport },
  });
  assert.equal(responseOf(completed.response).status, 200);
  assert.equal(completed.data?.notes, 1);
  // The refused import released its own job, and the room is free again.
  const imported = await send();
  assert.equal(responseOf(imported.response).status, 200);
  assert.equal(imported.data?.notes, 1);
});

await test('the check of an export plans it, runs no job and sends no body', async () => {
  // Review of issue 243, record 0178. A HEAD ran the whole export, and the
  // browser that reads the export address itself needs a check before it.
  // The job of the test before ends as its answer ends, so this waits for it.
  let full = await exportWorkspace({
    headers: browser(cookie),
    path: { workspaceId },
  });
  await until(async () => {
    if (responseOf(full.response).status === 200) return true;
    full = await exportWorkspace({
      headers: browser(cookie),
      path: { workspaceId },
    });
    return false;
  }, 'the export of the owner answers');
  const sent = responseOf(full.response);
  const length = (await archiveBytes(full.data)).length;
  // The served answer is a download with its exact length.
  assert.match(
    sent.headers.get('content-disposition') ?? '',
    /^attachment; filename="notes\.zip"/,
  );
  assert.equal(Number(sent.headers.get('content-length')), length);
  assert.equal(sent.headers.get('x-content-type-options'), 'nosniff');
  const held = randomUUID();
  const ownerId = account.data?.accountId ?? '';
  await until(
    async () =>
      (
        await coordination.reserveArchiveJob(
          held,
          ownerId,
          60_000,
          { account: 1, installation: archiveJobsPerInstallation },
          0,
        )
      ).state === 'reserved',
    'every earlier archive job of the owner ends',
  );
  try {
    // The account runs a job now, and the check still answers: it runs none.
    const checked = await inspectWorkspaceExport({
      headers: browser(cookie),
      path: { workspaceId },
    });
    const answer = responseOf(checked.response);
    assert.equal(answer.status, 200);
    assert.equal(Number(answer.headers.get('content-length')), length);
    assert.match(
      answer.headers.get('content-disposition') ?? '',
      /^attachment; filename="notes\.zip"/,
    );
    assert.equal(await answer.text(), '');
  } finally {
    await coordination.releaseArchiveJob(held);
  }
});

await test('an export that a page of another site asks for is refused', async () => {
  // Record 0178. The browser reads the export address itself with the
  // session cookie, so a navigation from another site must start no job.
  for (const ask of [exportWorkspace, inspectWorkspaceExport]) {
    const refused = await ask({
      headers: { ...browser(cookie), 'sec-fetch-site': 'cross-site' },
      path: { workspaceId },
    });
    assert.equal(responseOf(refused.response).status, 403);
  }
  const own = await inspectWorkspaceExport({
    headers: { ...browser(cookie), 'sec-fetch-site': 'same-origin' },
    path: { workspaceId },
  });
  assert.equal(responseOf(own.response).status, 200);
});

await test('the generated address of an export is the address that serves it', async () => {
  // Record 0178. The address that a browser reads comes from the contract,
  // so no feature code writes it.
  const address = exportWorkspaceAddress({ workspaceId });
  assert.equal(
    address,
    `${server.baseUrl}/api/workspaces/${workspaceId}/export`,
  );
  const answer = await server.app.inject({
    method: 'GET',
    url: new URL(address).pathname,
    headers: browser(cookie),
  });
  assert.equal(answer.statusCode, 200);
  assert.equal(answer.headers['content-type'], 'application/zip');
});

await test('a name in another Unicode form of a live note is that note', async () => {
  // Review of issue 243. The checks compared the paths of the archive as
  // they came, and the commit stored them in NFC.
  const target = await createWorkspace({
    headers: browser(cookie),
    body: { name: 'Forms' },
  });
  const targetId = target.data?.workspaceId ?? '';
  const nfc = 'Café.md';
  const created = await createFile({
    headers: browser(cookie),
    path: { workspaceId: targetId },
    body: {
      fileId: randomUUID(),
      path: nfc,
      document: firstSave('# Café\n'),
      ...ids(),
    },
  });
  assert.equal(created.error, undefined, JSON.stringify(created.error));
  const refused = await importArchive({
    headers: browser(cookie),
    path: { workspaceId: targetId },
    body: {
      file: new File(
        [
          storedArchive([
            ...Array.from(
              { length: maxFilesPerChangeset },
              (_, index): [string, string] => [
                `first/note-${String(index)}.md`,
                '# Early\n',
              ],
            ),
            [nfc.normalize('NFD'), '# Again\n'],
          ]),
        ],
        'forms.zip',
        { type: 'application/zip' },
      ),
    },
  });
  assert.equal(responseOf(refused.response).status, 409);
  assert.equal(readProperty(refused.error, 'code'), 'path_conflict');
  const exported = readArchive(
    await archiveBytes(
      (
        await exportWorkspace({
          headers: browser(cookie),
          path: { workspaceId: targetId },
        })
      ).data,
    ),
  );
  assert.deepEqual([...exported.keys()], [nfc]);
});

await test('an archive of macOS imports its long names in NFD', async () => {
  // Review of the bound of a name. The reader compared the stored bytes of
  // each name with the limit of a path, so a name within the limit in NFC
  // that macOS stored in NFD, and the AppleDouble file of macOS beside a note
  // near the limit, refused the whole archive.
  // Four segments of the most bytes that one segment holds in NFC.
  const nearLimit = (letter: string, bytes: number): string => {
    const count = maxSegmentBytes / bytes;
    const folder = letter.repeat(count);
    return `${[folder, folder, folder].join('/')}/${letter.repeat(count - 3 / bytes)}.md`;
  };
  const korean = nearLimit('한', 3);
  const ascii = nearLimit('a', 1);
  assert.ok(Buffer.byteLength(ascii) <= maxPathBytes);
  assert.ok(Buffer.byteLength(ascii) > maxPathBytes - 2);
  const appleDouble = (path: string): string => {
    const slash = path.lastIndexOf('/');
    return `__MACOSX/${path.slice(0, slash)}/._${path.slice(slash + 1)}`;
  };
  const nfd = korean.normalize('NFD');
  assert.ok(Buffer.byteLength(nfd) > 2 * maxPathBytes);
  const target = await createWorkspace({
    headers: browser(cookie),
    body: { name: 'Long names' },
  });
  const targetId = target.data?.workspaceId ?? '';
  const imported = await importArchive({
    headers: browser(cookie),
    path: { workspaceId: targetId },
    body: {
      file: new File(
        [
          storedArchive([
            [nfd, '# Korean\n'],
            [appleDouble(nfd), 'resource fork'],
            [ascii, '# Long\n'],
            [appleDouble(ascii), 'resource fork'],
          ]),
        ],
        'mac.zip',
        { type: 'application/zip' },
      ),
    },
  });
  assert.equal(imported.error, undefined, JSON.stringify(imported.error));
  assert.deepEqual(imported.data, {
    notes: 2,
    attachments: 0,
    skipped: { files: 2, kinds: ['settings'] },
  });
  const back = readArchive(
    await archiveBytes(
      (
        await exportWorkspace({
          headers: browser(cookie),
          path: { workspaceId: targetId },
        })
      ).data,
    ),
  );
  assert.deepEqual([...back.keys()].sort(), [ascii, korean].sort());
});

await test('a note that a late batch refuses stops the import before any commit', async () => {
  // Review of issue 243. A note that the grammar refuses in a late batch left
  // the earlier batches committed.
  const target = await createWorkspace({
    headers: browser(cookie),
    body: { name: 'Late refusal' },
  });
  const targetId = target.data?.workspaceId ?? '';
  const files: [string, string][] = Array.from(
    { length: maxFilesPerChangeset + 10 },
    (_, index) => [
      `many/note-${String(index)}.md`,
      `# Note ${String(index)}\n`,
    ],
  );
  files.push(['many/deep.md', `${'> '.repeat(200)}deep\n`]);
  const refused = await importArchive({
    headers: browser(cookie),
    path: { workspaceId: targetId },
    body: {
      file: new File([storedArchive(files)], 'late.zip', {
        type: 'application/zip',
      }),
    },
  });
  assert.equal(responseOf(refused.response).status, 422);
  assert.equal(readProperty(refused.error, 'code'), 'unrenderable_note');
  // The note nests too deeply, and the answer says so and names the note.
  // It read as a note that is too large, with no name.
  assert.equal(
    readProperty(refused.error, 'detail'),
    'The note "many/deep" in the zip file has too many levels of lists, quotes or HTML. Remove some levels, then import again.',
  );
  const exported = readArchive(
    await archiveBytes(
      (
        await exportWorkspace({
          headers: browser(cookie),
          path: { workspaceId: targetId },
        })
      ).data,
    ),
  );
  assert.equal(exported.size, 0);
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
