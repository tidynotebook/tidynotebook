/**
 * Foreground sync checks against a real server, a real database, and real
 * sessions with a real IndexedDB-backed local store per device.
 *
 * Every application call goes through a generated operation function, and
 * every local record goes through `openLocalStore` over an isolated
 * `fake-indexeddb` backend. The engine under test is `createSyncEngine`
 * with its default operations, so these tests prove the wire behavior:
 * offline chains, lost answers, lease takeover, purge preservation, cursor
 * expiry, and server-side stale-save rebasing.
 */
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
import { IDBFactory, IDBKeyRange as FakeKeyRange } from 'fake-indexeddb';
import {
  commitChangeset,
  configureClient,
  createFile,
  getAccount,
  getFile,
  getRevision,
  listHistory,
  listWorkspaces,
  purgeFiles,
  restoreFile,
  signInWithPassword,
  updateFile,
} from '@notesapp/api-client';
import { contentDigest } from '@notesapp/core';
import {
  documentStateVector,
  encodeDocumentDelta,
  readDocumentText,
  replaceDocumentText,
} from '@notesapp/note-document';
import {
  bootstrapOwner,
  createAuth,
  createAuthPool,
  createAuthProtocol,
  createHandlers,
  createIdentityAdapter,
  createSyncCleanup,
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
import { createDatabase, openLocalStore } from '@notesapp/storage-browser';
import {
  createNote,
  createSyncEngine,
  parkRefusedSave,
  type Draft,
  type LocalStore,
  type SyncEngine,
  type SyncNotice,
} from '@notesapp/sync';
import { createDisposableDatabase, openSession } from './support/database.ts';
import { startTestServer } from './support/server.ts';
import { markdownLimits } from '@notesapp/markdown';
import { freeNotePath } from '../../apps/web/src/lib/new-note-draft.ts';
import { parkedSaves } from '../../apps/web/src/lib/parked-saves.ts';
import {
  discardParked,
  keepParkedAsNote,
  retryParked,
} from '../../apps/web/src/features/attention/parked-actions.ts';
import { markRelease04, storeRelease04Save } from './support/release-0-4.ts';

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

const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-sync-test-'));

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

/** The environment of this test deployment. */
function environment(): Record<string, string> {
  return {
    NOTESAPP_ORIGIN: 'http://127.0.0.1',
    NOTESAPP_DATABASE_URL: database.runtimeUrl,
    NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
    NOTESAPP_STORAGE_ROOT: storageRoot,
    NOTESAPP_AUTH_SECRET: 'sync-test-secret-value-0123456789abcdef',
    NOTESAPP_ADDITIONAL_ORIGINS: 'http://localhost',
    NOTESAPP_LOG_LEVEL: 'error',
    NOTESAPP_MAX_BODY_BYTES: '8388608',
    NOTESAPP_MAX_HEADER_BYTES: '16384',
    NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
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
    }),
  identity: adapter.resolver,
  protocols: [createAuthProtocol(config, auth.auth)],
});
configureClient(server.baseUrl, undefined);

const ownerEmail = 'sync-owner@notes.invalid';
const ownerPassword = 'owner-password-123456';
await bootstrapOwner({
  config,
  email: ownerEmail,
  name: 'Sync Owner',
  password: ownerPassword,
});

const ownerSignedIn = await signInWithPassword({
  headers: { origin: 'http://127.0.0.1' },
  body: { email: ownerEmail, password: ownerPassword },
});
const ownerCookie = cookieHeader(
  responseOf(ownerSignedIn.response).headers.getSetCookie(),
);
assert.ok(ownerCookie.length > 0, 'the test needs an owner session cookie');

useDocumentHeaders(browser(ownerCookie));
const account = await getAccount({ headers: browser(ownerCookie) });
const ownerAccountId = account.data?.accountId ?? '';
assert.match(ownerAccountId, /^[0-9a-f-]{36}$/);

const listed = await listWorkspaces({ headers: browser(ownerCookie) });
const workspaceId = listed.data?.workspaces[0]?.workspaceId ?? '';
assert.match(workspaceId, /^[0-9a-f-]{36}$/);

/** The client identifiers that every write carries. */
function mutationIds(): {
  revisionId: string;
  mutationId: string;
  deviceId: string;
  clientTime: string;
} {
  return {
    revisionId: randomUUID(),
    mutationId: randomUUID(),
    deviceId: 'integration-device',
    clientTime: new Date().toISOString(),
  };
}

/** Creates one note file and returns its identifiers and entity tag. */
async function newFile(
  path: string,
  text = `# ${path}\n`,
  cookie = ownerCookie,
): Promise<{ fileId: string; revisionId: string; tag: string }> {
  const fileId = randomUUID();
  const ids = mutationIds();
  const created = await createFile({
    headers: browser(cookie),
    path: { workspaceId },
    body: {
      fileId,
      path,
      document: firstSave(text),
      revisionId: ids.revisionId,
      mutationId: ids.mutationId,
      deviceId: ids.deviceId,
    },
  });
  assert.equal(created.error, undefined, JSON.stringify(created.error));
  const response = responseOf(created.response);
  assert.equal(response.status, 201);
  return {
    fileId,
    revisionId: created.data?.revision.revisionId ?? '',
    tag: response.headers.get('etag') ?? '',
  };
}

/** One isolated local store, as one device would open it. */
async function openStore(
  prefix: string,
  deviceId: string,
): Promise<LocalStore> {
  return openLocalStore('https://notes.test', {
    indexedDB: new IDBFactory(),
    IDBKeyRange: FakeKeyRange,
    databaseName: `notesapp-sync-${prefix}`,
    deviceId,
  });
}

/** One editor working copy of one note. */
function draftOf(
  accountId: string,
  workingCopyId: string,
  fileId: string,
  baseRevisionId: string | null,
  text: string,
  path: string,
  sequence: number,
): Draft {
  return {
    accountId,
    workspaceId,
    workingCopyId,
    fileId,
    baseRevisionId,
    text,
    path,
    deleted: false,
    sequence,
  };
}

/** Saves one draft and checkpoints it, returning whether it queued. */
async function checkpointText(store: LocalStore, draft: Draft): Promise<void> {
  await store.saveDraft(draft);
  const queued = await store.checkpoint(draft, null, 'text');
  assert.ok(queued !== null, 'the checkpoint must queue a mutation');
}

/** One running engine with recorded announcements. */
type RunHandle = {
  readonly engine: SyncEngine;
  readonly controller: AbortController;
  readonly running: Promise<void>;
  readonly notices: SyncNotice[];
  readonly store: LocalStore;
};

function startEngine(
  store: LocalStore,
  cookie: string,
  ownerId: string,
  accountId = ownerAccountId,
): RunHandle {
  const notices: SyncNotice[] = [];
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId,
    headers: () => browser(cookie),
    pollIntervalMs: 50,
    announce: (notice: SyncNotice) => {
      notices.push(notice);
    },
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  return { engine, controller, running, notices, store };
}

/** Stops a running engine. */
async function stopEngine(handle: RunHandle): Promise<void> {
  handle.controller.abort();
  handle.engine.stop();
  await handle.running;
}

/**
 * Pulls the current server state into a store with nothing queued.
 *
 * A device syncs before its first offline edit, so later checkpoints carry
 * the accepted heads they really saw. Tests mirror that order.
 */
async function syncPull(
  store: LocalStore,
  cookie: string,
  ownerId: string,
  accountId = ownerAccountId,
): Promise<void> {
  const pulled = startEngine(store, cookie, ownerId, accountId);
  try {
    await waitFor(
      async () => (await store.readCursor(accountId, workspaceId)) !== null,
      `the initial pull of ${ownerId}`,
    );
  } finally {
    await stopEngine(pulled);
  }
}

/** Waits until a condition holds, failing loudly on timeout. */
async function waitFor(
  condition: () => boolean | Promise<boolean>,
  detail: string,
): Promise<void> {
  const started = Date.now();
  while (!(await condition())) {
    if (Date.now() - started > 20000)
      throw new Error(`the sync test stalled while waiting: ${detail}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** The queued mutations of one account and workspace. */
async function queuedOf(store: LocalStore, account = ownerAccountId) {
  return store.pending(account, workspaceId);
}

await test('a note that a device makes reaches the server with no edit', async () => {
  const store = await openStore('create', 'device-create');
  try {
    await syncPull(store, ownerCookie, 'engine-create-pull');
    const fileId = randomUUID();
    // Each surface that makes a note, New note, Duplicate and a daily note,
    // calls `createNote` and nothing after it (record 0104).
    await createNote(
      store,
      draftOf(
        ownerAccountId,
        randomUUID(),
        fileId,
        null,
        '# 2026-09-25\n',
        'Daily notes/2026-09-25.md',
        1,
      ),
    );
    const run = startEngine(store, ownerCookie, 'engine-create');
    try {
      await waitFor(
        async () => (await queuedOf(store)).length === 0,
        'the engine sends the new note',
      );
    } finally {
      await stopEngine(run);
    }
    const live = await getFile({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId },
    });
    assert.equal(live.error, undefined, JSON.stringify(live.error));
    assert.equal(live.data?.path, 'Daily notes/2026-09-25.md');
    assert.equal(live.data?.head?.text, '# 2026-09-25\n');
  } finally {
    await store.close();
  }
});

await test('a later offline save joins the work it never saw', async () => {
  const file = await newFile('notes/shared.md', '# Base\n');
  const storeA = await openStore('ab-a', 'device-a');
  const storeB = await openStore('ab-b', 'device-b');
  try {
    // Both devices download the base before going offline, so their
    // checkpoints carry the accepted head they really saw.
    await syncPull(storeA, ownerCookie, 'engine-a-pull');
    await syncPull(storeB, ownerCookie, 'engine-b-pull');
    await checkpointText(
      storeA,
      draftOf(
        ownerAccountId,
        'working-a',
        file.fileId,
        file.revisionId,
        '# Base\nFrom A\n',
        'notes/shared.md',
        1,
      ),
    );
    await checkpointText(
      storeB,
      draftOf(
        ownerAccountId,
        'working-b',
        file.fileId,
        file.revisionId,
        '# Base\nFrom B\n',
        'notes/shared.md',
        1,
      ),
    );

    const runA = startEngine(storeA, ownerCookie, 'engine-a');
    try {
      await waitFor(
        async () => (await queuedOf(storeA)).length === 0,
        'engine A drains its queue',
      );
    } finally {
      await stopEngine(runA);
    }
    const live = await getFile({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId: file.fileId },
    });
    assert.equal(live.error, undefined, JSON.stringify(live.error));
    assert.equal(live.data?.head?.text, '# Base\nFrom A\n');

    const runB = startEngine(storeB, ownerCookie, 'engine-b');
    try {
      await waitFor(
        async () => (await queuedOf(storeB)).length === 0,
        'engine B drains its stale save',
      );
    } finally {
      await stopEngine(runB);
    }
    const localB = await storeB.listCheckpoints(
      ownerAccountId,
      workspaceId,
      file.fileId,
    );
    const tipB = localB[localB.length - 1]?.revisionId ?? '';
    assert.ok(tipB.length > 0, 'device B must keep its checkpoint');
    assert.equal(
      localB[localB.length - 1]?.digest,
      await contentDigest('# Base\nFrom B\n'),
      "device B's text must stay in local history",
    );
    // Both devices wrote over the same base, so the later save joins the work
    // it never saw rather than replacing it. The note carries both edits, the
    // revision says that it merged, and the device keeps its own checkpoint
    // for Review (records 0081, 0083, 0087).
    const kept = await getFile({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId: file.fileId },
    });
    const joined = kept.data?.head?.text ?? '';
    assert.ok(joined.includes('From A'), joined);
    assert.ok(joined.includes('From B'), joined);
    assert.equal(kept.data?.head?.merged, true);
    const history = await listHistory({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId: file.fileId },
    });
    assert.equal(history.data?.revisions.length, 3);
    // History marks the merged revision on every device, newest first, and
    // leaves the two saves that saw everything unmarked (record 0087).
    assert.deepEqual(
      history.data?.revisions.map((revision) => revision.merged),
      [true, false, false],
    );
    // Device B offers Review against the exact text that it sent, and device
    // A, whose save saw everything, offers none.
    const reviewsB = await storeB.listReviews(
      ownerAccountId,
      workspaceId,
      file.fileId,
    );
    assert.equal(reviewsB.length, 1);
    assert.deepEqual(reviewsB[0]?.cause, { kind: 'merge', revisionId: tipB });
    assert.equal(reviewsB[0]?.text, '# Base\nFrom B\n');
    assert.deepEqual(
      await storeA.listReviews(ownerAccountId, workspaceId, file.fileId),
      [],
    );
  } finally {
    await storeA.close();
    await storeB.close();
  }
});

await test('an accepted mutation replays exactly after later heads', async () => {
  const fileId = randomUUID();
  const firstRevision = randomUUID();
  const mutationId = randomUUID();
  const firstText = '# Replay one\n';
  const clientTime = new Date().toISOString();
  const body = {
    mutationId,
    deviceId: 'integration-device',
    expectedHeads: { [fileId]: null },
    revisions: [
      {
        revisionId: firstRevision,
        fileId,
        parents: [],
        path: 'notes/replay.md',
        deleted: false,
        content: {
          kind: 'markdown' as const,
          document: firstSave(firstText),
        },
        clientTime,
      },
    ],
  };
  const first = await commitChangeset({
    headers: browser(ownerCookie),
    path: { workspaceId },
    body,
  });
  assert.equal(first.error, undefined, JSON.stringify(first.error));
  assert.deepEqual(first.data?.revisionIds, [firstRevision]);

  const secondRevision = randomUUID();
  const second = await updateFile({
    headers: { ...browser(ownerCookie), 'if-match': `"${firstRevision}"` },
    path: { workspaceId, fileId },
    body: {
      document: await saveForHead(workspaceId, firstRevision, '# Replay two\n'),
      revisionId: secondRevision,
      mutationId: randomUUID(),
      deviceId: 'integration-device',
    },
  });
  assert.equal(second.error, undefined, JSON.stringify(second.error));

  // The dropped accepted response: the same identity with the same body must
  // answer with the first outcome instead of writing a second revision.
  const replay = await commitChangeset({
    headers: browser(ownerCookie),
    path: { workspaceId },
    body,
  });
  assert.equal(replay.error, undefined, JSON.stringify(replay.error));
  assert.deepEqual(replay.data?.revisionIds, [firstRevision]);

  const history = await listHistory({
    headers: browser(ownerCookie),
    path: { workspaceId, fileId },
  });
  assert.equal(history.error, undefined, JSON.stringify(history.error));
  assert.equal(history.data?.revisions.length, 2);
});

await test('later local edits during acknowledgment join one atomic commit', async () => {
  const store = await openStore('batch', 'device-batch');
  try {
    const fileId = randomUUID();
    await checkpointText(
      store,
      draftOf(
        ownerAccountId,
        'working-batch',
        fileId,
        null,
        '# Batch one\n',
        'notes/batch.md',
        1,
      ),
    );
    await checkpointText(
      store,
      draftOf(
        ownerAccountId,
        'working-batch',
        fileId,
        null,
        '# Batch two\n',
        'notes/batch.md',
        2,
      ),
    );
    assert.equal((await queuedOf(store)).length, 2);

    const run = startEngine(store, ownerCookie, 'engine-batch');
    try {
      await waitFor(
        async () => (await queuedOf(store)).length === 0,
        'the batched edits drain together',
      );
    } finally {
      await stopEngine(run);
    }

    const history = await listHistory({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId },
    });
    assert.equal(history.error, undefined, JSON.stringify(history.error));
    assert.equal(history.data?.revisions.length, 2);
    const texts: string[] = [];
    for (const item of history.data?.revisions ?? []) {
      const fetched = await getRevision({
        headers: browser(ownerCookie),
        path: { workspaceId, revisionId: item.revisionId },
      });
      assert.equal(fetched.error, undefined, JSON.stringify(fetched.error));
      texts.push(fetched.data?.text ?? '');
    }
    // History reads newest first.
    assert.deepEqual(texts, ['# Batch two\n', '# Batch one\n']);

    const kept = await store.readDraft(
      ownerAccountId,
      workspaceId,
      'working-batch',
    );
    assert.equal(kept?.text, '# Batch two\n');
  } finally {
    await store.close();
  }
});

await test('a late offline write after a purge is forgotten', async () => {
  const file = await newFile('notes/doomed.md', '# Doomed\n');
  const store = await openStore('purge', 'device-purge');
  try {
    // The device holds the note, then writes it offline while the note is
    // purged on the server.
    await syncPull(store, ownerCookie, 'engine-purge-pull');
    const purged = await purgeFiles({
      headers: browser(ownerCookie),
      path: { workspaceId },
      body: { mutationId: randomUUID(), fileIds: [file.fileId] },
    });
    assert.equal(purged.error, undefined, JSON.stringify(purged.error));
    await checkpointText(
      store,
      draftOf(
        ownerAccountId,
        'working-doom',
        file.fileId,
        file.revisionId,
        '# Doomed edit\n',
        'notes/doomed.md',
        1,
      ),
    );
    const run = startEngine(store, ownerCookie, 'engine-purge');
    try {
      await waitFor(
        async () => (await queuedOf(store)).length === 0,
        'the purged write is forgotten',
      );
    } finally {
      await stopEngine(run);
    }
    // A purged file is gone for good, so its late local work is dropped rather
    // than parked in front of the person. No conflict, no recovery, no notice.
    assert.ok(
      !run.notices.some((notice) => notice.kind === 'preserved'),
      'a purged write is not preserved',
    );
    const kept = await store.listCheckpoints(
      ownerAccountId,
      workspaceId,
      file.fileId,
    );
    assert.equal(kept.length, 0);
    assert.deepEqual(await store.recover(ownerAccountId, workspaceId), []);
    const files = await store.listLocalFiles(ownerAccountId, workspaceId);
    assert.ok(
      !files.some((summary) => summary.fileId === file.fileId),
      'the purged note is gone from the local file list',
    );

    const gone = await getFile({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId: file.fileId },
    });
    assert.notEqual(gone.error, undefined);
    assert.equal(responseOf(gone.response).status, 410);
    assert.equal(problemCode(gone.error), 'purged');
  } finally {
    await store.close();
  }
});

await test('an expired cursor restarts from a snapshot without losing the queue', async () => {
  const store = await openStore('cursor', 'device-cursor');
  try {
    const fileId = randomUUID();
    await checkpointText(
      store,
      draftOf(
        ownerAccountId,
        'working-cursor',
        fileId,
        null,
        '# Cursor\n',
        'notes/cursor.md',
        1,
      ),
    );
    await store.applyRemoteChanges(ownerAccountId, workspaceId, [], '0');

    const session = await openSession(database.migrationUrl);
    try {
      await session.query(
        "update sync_changes set committed_at = now() - interval '100 days'",
      );
    } finally {
      await session.close();
    }
    const cleanup = createSyncCleanup(content);
    const outcome = await cleanup(new Date());
    assert.ok(outcome.oldChanges > 0, 'old change records must be reclaimed');

    const run = startEngine(store, ownerCookie, 'engine-cursor');
    try {
      await waitFor(
        async () =>
          (await queuedOf(store)).length === 0 &&
          ((await store.readCursor(ownerAccountId, workspaceId)) ?? '0') !==
            '0',
        'the engine converges after the cursor expiry',
      );
    } finally {
      await stopEngine(run);
    }
    assert.ok(
      run.notices.some((notice) => notice.kind === 'snapshot-restart'),
      'the expired cursor must restart the download',
    );

    const live = await getFile({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId },
    });
    assert.equal(live.error, undefined, JSON.stringify(live.error));
    assert.equal(live.data?.head?.text, '# Cursor\n');
  } finally {
    await store.close();
  }
});

await test('an expired lease is taken over and a held lease keeps a follower waiting', async () => {
  const store = await openStore('lease', 'device-lease');
  try {
    const fileId = randomUUID();
    await checkpointText(
      store,
      draftOf(
        ownerAccountId,
        'working-lease',
        fileId,
        null,
        '# Lease\n',
        'notes/lease.md',
        1,
      ),
    );
    assert.equal(
      await store.acquireLease('stale-owner', Date.now() - 1000),
      true,
      'the test needs a stale lease to take over',
    );

    const run = startEngine(store, ownerCookie, 'engine-lease');
    try {
      await waitFor(
        async () =>
          (await queuedOf(store)).length === 0 &&
          (await store.readCursor(ownerAccountId, workspaceId)) !== null,
        'the takeover drains the queue and syncs a cursor',
      );
    } finally {
      await stopEngine(run);
    }
    assert.ok(
      !run.notices.some((notice) => notice.kind === 'lease-held'),
      'an expired lease must be taken over, not refused',
    );
    const live = await getFile({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId },
    });
    assert.equal(live.data?.head?.text, '# Lease\n');

    assert.equal(
      await store.acquireLease('manual-holder', Date.now() + 60_000),
      true,
    );
    const second = startEngine(store, ownerCookie, 'engine-second');
    await waitFor(
      () => second.notices.some((notice) => notice.kind === 'lease-held'),
      'the follower observes the held lease',
    );
    assert.equal((await store.readLeaseState())?.ownerId, 'manual-holder');
    await stopEngine(second);
    await store.releaseLease('manual-holder');
    assert.equal(
      (await store.readCursor(ownerAccountId, workspaceId)) !== null,
      true,
      'the earlier run must have synced a cursor',
    );
  } finally {
    await store.close();
  }
});

await test('an edit that arrives after a delete brings the note back', async () => {
  const file = await newFile('notes/keep.md', '# Base\n');
  const storeA = await openStore('recover-a', 'device-a');
  const storeB = await openStore('recover-b', 'device-b');
  try {
    await syncPull(storeA, ownerCookie, 'engine-recover-a-pull');
    await syncPull(storeB, ownerCookie, 'engine-recover-b-pull');

    // Device A edits the note offline; device B deletes it offline.
    await checkpointText(
      storeA,
      draftOf(
        ownerAccountId,
        'working-a',
        file.fileId,
        file.revisionId,
        '# My edit\n',
        'notes/keep.md',
        1,
      ),
    );
    const removal: Draft = {
      ...draftOf(
        ownerAccountId,
        'working-b',
        file.fileId,
        file.revisionId,
        '',
        'notes/keep.md',
        1,
      ),
      deleted: true,
    };
    await storeB.saveDraft(removal);
    assert.ok((await storeB.checkpoint(removal, null, 'text')) !== null);

    // Device B deletes first, so the note is a tombstone. Device A's edit can
    // no longer apply to it.
    const runB = startEngine(storeB, ownerCookie, 'engine-recover-b');
    try {
      await waitFor(
        async () => (await queuedOf(storeB)).length === 0,
        'device B drains its delete',
      );
    } finally {
      await stopEngine(runB);
    }
    const runA = startEngine(storeA, ownerCookie, 'engine-recover-a');
    try {
      await waitFor(
        async () => (await queuedOf(storeA)).length === 0,
        'device A drains its edit and the recovered note',
      );
    } finally {
      await stopEngine(runA);
    }

    // The edit is the later write and the tombstone kept the document behind
    // it, so the note returns with that text. No second note is created and
    // nothing waits in a recovery inbox (record 0083).
    const original = await getFile({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId: file.fileId },
    });
    assert.equal(original.error, undefined, JSON.stringify(original.error));
    assert.equal(original.data?.head?.deleted, false);
    assert.ok(
      (original.data?.head?.text ?? '').includes('# My edit'),
      original.data?.head?.text ?? '',
    );
    assert.deepEqual(await storeA.recover(ownerAccountId, workspaceId), []);
    const files = await storeA.listLocalFiles(ownerAccountId, workspaceId);
    assert.equal(
      files.find((summary) => summary.path === 'notes/keep (recovered).md'),
      undefined,
      'the note came back, so no recovered copy is needed',
    );
  } finally {
    await storeA.close();
    await storeB.close();
  }
});

await test('a device that only opened a note keeps the newer text', async () => {
  const file = await newFile('notes/opened-only.md', '# Base\n');
  const storeA = await openStore('opened-a', 'device-opened-a');
  try {
    await syncPull(storeA, ownerCookie, 'engine-opened-a-pull');
    // The editor opens the note and flushes its buffer, which every editor
    // does on a blur and on the way out. The person types nothing.
    await storeA.saveDraft(
      draftOf(
        ownerAccountId,
        'working-opened-a',
        file.fileId,
        file.revisionId,
        '# Base\n',
        'notes/opened-only.md',
        1,
      ),
    );

    // Another device writes the note.
    const elsewhere = await updateFile({
      headers: { ...browser(ownerCookie), 'if-match': `"${file.revisionId}"` },
      path: { workspaceId, fileId: file.fileId },
      body: {
        document: await saveForHead(
          workspaceId,
          file.revisionId,
          '# Written elsewhere\n',
        ),
        revisionId: randomUUID(),
        mutationId: randomUUID(),
        deviceId: 'device-elsewhere',
      },
    });
    assert.equal(elsewhere.error, undefined, JSON.stringify(elsewhere.error));

    // This device reads that version.
    const pulling = startEngine(storeA, ownerCookie, 'engine-opened-a-feed');
    try {
      await waitFor(async () => {
        const seen = await storeA.readFileSaveSnapshot(
          ownerAccountId,
          workspaceId,
          file.fileId,
        );
        return seen.acceptedHeadRevisionId !== file.revisionId;
      }, 'the opened device reads the version of the other device');
    } finally {
      await stopEngine(pulling);
    }

    // The note now opens with the newer text, and the working copy that held
    // the replaced text is gone, so nothing shadows it.
    const cached = await storeA.readCachedNote(
      ownerAccountId,
      workspaceId,
      file.fileId,
    );
    assert.equal(cached?.text, '# Written elsewhere\n');
    assert.equal(cached?.stale, false);
    assert.equal(
      await storeA.readDraft(ownerAccountId, workspaceId, 'working-opened-a'),
      null,
    );

    // The flush that the editor writes when the tab is hidden creates no
    // version, because the buffer says what the accepted head already says.
    assert.equal(
      await storeA.checkpoint(
        draftOf(
          ownerAccountId,
          'working-opened-a',
          file.fileId,
          cached?.baseRevisionId ?? null,
          '# Written elsewhere\n',
          'notes/opened-only.md',
          2,
        ),
        null,
        'text',
      ),
      null,
    );
    const live = await getFile({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId: file.fileId },
    });
    assert.equal(live.data?.head?.text, '# Written elsewhere\n');
  } finally {
    await storeA.close();
  }
});

/**
 * Writes one text into the document of a device, as an open editor does.
 *
 * The editor binding writes each change into the document of the note at
 * once (record 0085), so the work is in the store before any save reads it.
 */
async function editorWrites(
  store: LocalStore,
  fileId: string,
  text: string,
): Promise<void> {
  const held = await store.readNoteDocument(
    ownerAccountId,
    workspaceId,
    fileId,
  );
  assert.ok(held !== null, 'the device must hold the document of the note');
  const written = replaceDocumentText(held.bytes, text);
  assert.ok(written.ok, 'the document must take the text');
  await store.mergeNoteWork(
    ownerAccountId,
    workspaceId,
    fileId,
    1,
    encodeDocumentDelta(
      written.value.document,
      documentStateVector(held.bytes),
    ),
  );
}

/** Runs the engine of one device until its queue is empty. */
async function drain(store: LocalStore, ownerId: string): Promise<void> {
  const run = startEngine(store, ownerCookie, ownerId);
  try {
    await waitFor(
      async () => (await queuedOf(store)).length === 0,
      `${ownerId} drains its saves`,
    );
  } finally {
    await stopEngine(run);
  }
}

await test('a device whose open text lags its document never adds a task box', async () => {
  // Two devices hold one note open, and the person toggles its task box on
  // one of them. The save of the other device used to write its lagging text
  // into the document, which reverted the toggle as its own work. Joined
  // with the next toggle, the box read "[  ]", "[xx]" or split in two.
  const path = 'notes/tasks.md';
  const file = await newFile(path, '- [ ] task\n');
  const storeA = await openStore('tasks-a', 'device-tasks-a');
  const storeB = await openStore('tasks-b', 'device-tasks-b');
  try {
    await syncPull(storeA, ownerCookie, 'engine-tasks-a-pull');
    await syncPull(storeB, ownerCookie, 'engine-tasks-b-pull');

    // Device A checks the box and saves.
    await editorWrites(storeA, file.fileId, '- [x] task\n');
    const checked = draftOf(
      ownerAccountId,
      'working-tasks-a',
      file.fileId,
      file.revisionId,
      '- [x] task\n',
      path,
      1,
    );
    await storeA.saveDraft(checked);
    assert.ok(
      (await storeA.checkpoint(checked, null, {
        kind: 'document',
        epoch: 1,
      })) !== null,
      'device A queues its toggle',
    );
    await drain(storeA, 'engine-tasks-a-send');

    // Device B takes that work into its store. Its editor has not joined it
    // yet, so the buffer still shows the box unchecked, and the tab is
    // hidden: the editor flushes that buffer as a version.
    const pulled = startEngine(storeB, ownerCookie, 'engine-tasks-b-feed');
    try {
      await waitFor(async () => {
        const held = await storeB.readNoteDocument(
          ownerAccountId,
          workspaceId,
          file.fileId,
        );
        return held !== null && readDocumentText(held.bytes) === '- [x] task\n';
      }, 'device B takes the toggle of device A');
    } finally {
      await stopEngine(pulled);
    }
    const lagging = draftOf(
      ownerAccountId,
      'working-tasks-b',
      file.fileId,
      file.revisionId,
      '- [ ] task\n',
      path,
      0,
    );
    await storeB.saveDraft(lagging);
    await storeB.checkpoint(lagging, null, { kind: 'document', epoch: 1 });

    // Device A unchecks the box before it sees any save of device B.
    await editorWrites(storeA, file.fileId, '- [ ] task\n');
    const unchecked = { ...checked, text: '- [ ] task\n', sequence: 2 };
    await storeA.saveDraft(unchecked);
    assert.ok(
      (await storeA.checkpoint(unchecked, null, {
        kind: 'document',
        epoch: 1,
      })) !== null,
      'device A queues its second toggle',
    );

    await drain(storeB, 'engine-tasks-b-send');
    await drain(storeA, 'engine-tasks-a-second');

    // One box, in the state of the last toggle.
    const live = await getFile({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId: file.fileId },
    });
    assert.equal(live.data?.head?.text, '- [ ] task\n');
  } finally {
    await storeB.close();
    await storeA.close();
  }
});

await test('two toggles of one box that cross keep one state, the last one', async () => {
  // Record 0134: each device toggled the box before it saw the toggle of the
  // other. The document kept both states, and the box read "[xx]" or "[x ]".
  const path = 'notes/crossed-tasks.md';
  const file = await newFile(path, '- [ ] task\n');
  const storeA = await openStore('crossed-a', 'device-crossed-a');
  const storeB = await openStore('crossed-b', 'device-crossed-b');
  /** One toggle on one device, saved at once as the editor does. */
  const toggle = async (
    store: LocalStore,
    workingCopyId: string,
    text: string,
    sequence: number,
  ): Promise<void> => {
    await editorWrites(store, file.fileId, text);
    const draft = draftOf(
      ownerAccountId,
      workingCopyId,
      file.fileId,
      file.revisionId,
      text,
      path,
      sequence,
    );
    await store.saveDraft(draft);
    assert.ok(
      (await store.checkpoint(draft, null, { kind: 'document', epoch: 1 })) !==
        null,
      `${workingCopyId} queues its toggle`,
    );
  };
  const serverText = async (): Promise<string | null | undefined> =>
    (
      await getFile({
        headers: browser(ownerCookie),
        path: { workspaceId, fileId: file.fileId },
      })
    ).data?.head?.text;
  try {
    await syncPull(storeA, ownerCookie, 'engine-crossed-a-pull');
    await syncPull(storeB, ownerCookie, 'engine-crossed-b-pull');

    // Both devices check the box, and neither has seen the other.
    await toggle(storeA, 'working-crossed-a', '- [x] task\n', 1);
    await toggle(storeB, 'working-crossed-b', '- [x] task\n', 1);
    await drain(storeA, 'engine-crossed-a-send');
    await drain(storeB, 'engine-crossed-b-send');
    assert.equal(await serverText(), '- [x] task\n');

    // Device A clears the box before it sees the save of device B. Its save
    // reaches the server last, so it sets the box.
    await toggle(storeA, 'working-crossed-a', '- [ ] task\n', 2);
    await drain(storeA, 'engine-crossed-a-second');
    assert.equal(await serverText(), '- [ ] task\n');

    // Device B reads the same one box.
    const pulled = startEngine(storeB, ownerCookie, 'engine-crossed-b-feed');
    try {
      await waitFor(async () => {
        const held = await storeB.readNoteDocument(
          ownerAccountId,
          workspaceId,
          file.fileId,
        );
        return held !== null && readDocumentText(held.bytes) === '- [ ] task\n';
      }, 'device B reads the box that the server kept');
    } finally {
      await stopEngine(pulled);
    }
  } finally {
    await storeB.close();
    await storeA.close();
  }
});

await test('a save over work it never saw joins it and offers Review', async () => {
  const file = await newFile('notes/rebased.md', '# Base\n');
  const storeA = await openStore('rebase-a', 'device-rebase-a');
  try {
    await syncPull(storeA, ownerCookie, 'engine-rebase-a-pull');
    // This device types over the base and keeps the save on the device.
    await checkpointText(
      storeA,
      draftOf(
        ownerAccountId,
        'working-rebase-a',
        file.fileId,
        file.revisionId,
        '# Base\nMine\n',
        'notes/rebased.md',
        1,
      ),
    );
    const elsewhere = await updateFile({
      headers: { ...browser(ownerCookie), 'if-match': `"${file.revisionId}"` },
      path: { workspaceId, fileId: file.fileId },
      body: {
        document: await saveForHead(
          workspaceId,
          file.revisionId,
          '# Base\nTheirs\n',
        ),
        revisionId: randomUUID(),
        mutationId: randomUUID(),
        deviceId: 'device-elsewhere',
      },
    });
    assert.equal(elsewhere.error, undefined, JSON.stringify(elsewhere.error));

    const runA = startEngine(storeA, ownerCookie, 'engine-rebase-a');
    try {
      await waitFor(
        async () => (await queuedOf(storeA)).length === 0,
        'the rebased device drains its save',
      );
    } finally {
      await stopEngine(runA);
    }

    // Both edits reach the note: the device that saved last joined the work
    // it had not seen, so no text is lost (records 0081, 0087).
    const live = await getFile({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId: file.fileId },
    });
    const merged = live.data?.head?.text ?? '';
    assert.ok(merged.includes('Mine'), merged);
    assert.ok(merged.includes('Theirs'), merged);
    assert.equal(live.data?.head?.merged, true);
    // The checkpoint of this device keeps the text it saved, so Review can
    // show the person what they wrote (record 0087).
    const local = await storeA.listCheckpoints(
      ownerAccountId,
      workspaceId,
      file.fileId,
    );
    assert.equal(
      local[local.length - 1]?.digest,
      await contentDigest('# Base\nMine\n'),
    );
    const history = await listHistory({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId: file.fileId },
    });
    assert.deepEqual(
      history.data?.revisions.map((revision) => revision.revisionId).length,
      3,
    );
    assert.ok(
      runA.notices.some((notice) => notice.kind === 'superseded'),
      'the device tells the person that its save joined other work',
    );
  } finally {
    await storeA.close();
  }
});

await test('an open note keeps the work that arrives while it is edited', async () => {
  // The screen binds the open note to its document (records 0081, 0082), so
  // the text a person edits and the text of the note are one value. Work of
  // another device joins the open editor, and the save that follows carries
  // only the work of this device.
  const file = await newFile('notes/open.md', '# Base\n');
  const store = await openStore('open-a', 'device-open-a');
  try {
    await syncPull(store, ownerCookie, 'engine-open-a-pull');

    // The person types. The editor writes that work into the document of
    // this device at once, and no version is created yet.
    const held = await store.readNoteDocument(
      ownerAccountId,
      workspaceId,
      file.fileId,
    );
    assert.ok(held !== null, 'the pull must leave a document of the note');
    const typed = replaceDocumentText(held.bytes, '# Base\nMine\n');
    if (!typed.ok)
      throw new Error(`the document refused the text: ${typed.refusal}`);
    await store.mergeNoteWork(
      ownerAccountId,
      workspaceId,
      file.fileId,
      1,
      encodeDocumentDelta(
        typed.value.document,
        documentStateVector(held.bytes),
      ),
    );

    // Another device writes the note while the editor stays open.
    const elsewhere = await updateFile({
      headers: { ...browser(ownerCookie), 'if-match': `"${file.revisionId}"` },
      path: { workspaceId, fileId: file.fileId },
      body: {
        document: await saveForHead(
          workspaceId,
          file.revisionId,
          '# Base\nTheirs\n',
        ),
        revisionId: randomUUID(),
        mutationId: randomUUID(),
        deviceId: 'device-elsewhere',
      },
    });
    assert.equal(elsewhere.error, undefined, JSON.stringify(elsewhere.error));

    const feed = startEngine(store, ownerCookie, 'engine-open-a-feed');
    try {
      await waitFor(async () => {
        const seen = await store.readFileSaveSnapshot(
          ownerAccountId,
          workspaceId,
          file.fileId,
        );
        return seen.acceptedHeadRevisionId !== file.revisionId;
      }, 'the open device reads the work of the other device');
    } finally {
      await stopEngine(feed);
    }

    // The open document now holds both texts, which is what the person reads.
    const joined = await store.readNoteDocument(
      ownerAccountId,
      workspaceId,
      file.fileId,
    );
    const onScreen = readDocumentText(joined?.bytes ?? new Uint8Array());
    assert.ok(onScreen.includes('Mine'), onScreen);
    assert.ok(onScreen.includes('Theirs'), onScreen);

    // The save that follows sends the work of this device and nothing else,
    // so the note on the server keeps both texts.
    await checkpointText(
      store,
      draftOf(
        ownerAccountId,
        'working-open-a',
        file.fileId,
        file.revisionId,
        onScreen,
        'notes/open.md',
        1,
      ),
    );
    const run = startEngine(store, ownerCookie, 'engine-open-a');
    try {
      await waitFor(
        async () => (await queuedOf(store)).length === 0,
        'the open device drains its save',
      );
    } finally {
      await stopEngine(run);
    }
    const live = await getFile({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId: file.fileId },
    });
    const text = live.data?.head?.text ?? '';
    assert.ok(text.includes('Mine'), text);
    assert.ok(text.includes('Theirs'), text);
  } finally {
    await store.close();
  }
});

await test('a restore reaches the device that asked for it', async () => {
  const file = await newFile('notes/restored.md', '# Keep\n');
  const storeA = await openStore('restore-a', 'device-restore-a');
  try {
    await syncPull(storeA, ownerCookie, 'engine-restore-a-pull');
    await storeA.trashFiles(ownerAccountId, workspaceId, [file.fileId]);
    const runA = startEngine(storeA, ownerCookie, 'engine-restore-a');
    try {
      await waitFor(
        async () => (await queuedOf(storeA)).length === 0,
        'the restoring device sends its deletion',
      );
      const restored = await restoreFile({
        headers: browser(ownerCookie),
        path: { workspaceId, fileId: file.fileId },
        body: {
          mutationId: randomUUID(),
          deviceId: storeA.deviceId,
          clientTime: new Date().toISOString(),
          revisionId: randomUUID(),
        },
      });
      assert.equal(restored.error, undefined, JSON.stringify(restored.error));
      await waitFor(async () => {
        const cached = await storeA.readCachedNote(
          ownerAccountId,
          workspaceId,
          file.fileId,
        );
        return cached?.deleted === false && cached.text === '# Keep\n';
      }, 'the restore reaches the device that asked for it');
    } finally {
      await stopEngine(runA);
    }
  } finally {
    await storeA.close();
  }
});

await test('a note that another device makes reads its text here', async () => {
  // Device B synced before the note existed, so the note reaches it through
  // the ordered feed and not through a snapshot. The first record of a new
  // note is the work that started it, and B holds no document to apply it to.
  const storeA = await openStore('made-a', 'device-made-a');
  const storeB = await openStore('made-b', 'device-made-b');
  try {
    await syncPull(storeA, ownerCookie, 'engine-made-a-pull');
    await syncPull(storeB, ownerCookie, 'engine-made-b-pull');
    const fileId = randomUUID();
    await checkpointText(
      storeA,
      draftOf(
        ownerAccountId,
        'working-made-a',
        fileId,
        null,
        '# Made on A\n\nFirst line.\n',
        'notes/made-on-a.md',
        1,
      ),
    );
    const runA = startEngine(storeA, ownerCookie, 'engine-made-a');
    try {
      await waitFor(
        async () => (await queuedOf(storeA)).length === 0,
        'device A sends the new note',
      );
    } finally {
      await stopEngine(runA);
    }

    const runB = startEngine(storeB, ownerCookie, 'engine-made-b');
    try {
      await waitFor(
        async () =>
          (await storeB.readCachedNote(ownerAccountId, workspaceId, fileId)) !==
          null,
        'device B reads the new note',
      );
    } finally {
      await stopEngine(runB);
    }
    const cached = await storeB.readCachedNote(
      ownerAccountId,
      workspaceId,
      fileId,
    );
    assert.equal(cached?.text, '# Made on A\n\nFirst line.\n');
    const document = await storeB.readNoteDocument(
      ownerAccountId,
      workspaceId,
      fileId,
    );
    assert.ok(document !== null, 'device B holds the document of the note');
    assert.equal(
      readDocumentText(document.bytes),
      '# Made on A\n\nFirst line.\n',
    );
  } finally {
    await storeA.close();
    await storeB.close();
  }
});

/** A device store that a test can also open raw, as release 0.4 left it. */
type DeviceBackend = {
  readonly open: () => Promise<LocalStore>;
  readonly raw: () => ReturnType<typeof createDatabase>;
};

function deviceBackend(prefix: string): DeviceBackend {
  const factory = new IDBFactory();
  const databaseName = `notesapp-sync-${prefix}`;
  return {
    open: () =>
      openLocalStore('https://notes.test', {
        indexedDB: factory,
        IDBKeyRange: FakeKeyRange,
        databaseName,
        deviceId: `device-${prefix}`,
      }),
    raw: () =>
      createDatabase(databaseName, {
        indexedDB: factory,
        IDBKeyRange: FakeKeyRange,
      }),
  };
}

/**
 * Leaves one queued save of release 0.4 in a device store (record 0088).
 *
 * The device pulled the note first, so its mirror names the head that the
 * save was written over, as it did in 0.4.
 */
async function queueRelease04Save(
  backend: DeviceBackend,
  save: {
    readonly fileId: string;
    readonly head: string | null;
    readonly path: string;
    readonly text: string;
    readonly state?: 'pending' | 'sending';
    readonly digest?: string | null;
  },
): Promise<void> {
  const raw = backend.raw();
  await raw.db.open();
  try {
    await storeRelease04Save(raw, {
      serverOrigin: 'https://notes.test',
      accountId: ownerAccountId,
      workspaceId,
      fileId: save.fileId,
      mutationId: randomUUID(),
      revisionId: randomUUID(),
      parentId: save.head,
      expectedHead: save.head,
      path: save.path,
      text: save.text,
      sequence: 1,
      state: save.state ?? 'pending',
      digest: save.digest ?? null,
    });
    await markRelease04(raw);
  } finally {
    raw.db.close();
  }
}

/** Runs the engine of an upgraded device until its earlier work is done. */
async function settleUpgrade(
  store: LocalStore,
  ownerId: string,
): Promise<void> {
  const run = startEngine(store, ownerCookie, ownerId);
  try {
    await waitFor(
      async () =>
        (await store.legacySaves(ownerAccountId, workspaceId)).length === 0 &&
        (await queuedOf(store)).length === 0,
      `the upgraded device ${ownerId} places and sends its earlier work`,
    );
  } finally {
    await stopEngine(run);
  }
}

await test('an upgraded device joins its earlier save with the work of another', async () => {
  const path = 'notes/upgrade-joined.md';
  const file = await newFile(path, 'alpha\nbeta\ngamma\ndelta\n');
  const device = deviceBackend('upgrade-joined');
  const before = await device.open();
  await syncPull(before, ownerCookie, 'engine-upgrade-joined-pull');
  await before.close();
  // Release 0.4 queued this save and never sent it.
  await queueRelease04Save(device, {
    fileId: file.fileId,
    head: file.revisionId,
    path,
    text: 'alpha, written offline\nbeta\ngamma\ndelta\n',
  });
  // Another device changed another line while this one waited for 0.5.
  const elsewhere = await updateFile({
    headers: { ...browser(ownerCookie), 'if-match': `"${file.revisionId}"` },
    path: { workspaceId, fileId: file.fileId },
    body: {
      document: await saveForHead(
        workspaceId,
        file.revisionId,
        'alpha\nbeta\ngamma\ndelta, written elsewhere\n',
      ),
      revisionId: randomUUID(),
      mutationId: randomUUID(),
      deviceId: 'device-elsewhere',
    },
  });
  assert.equal(elsewhere.error, undefined, JSON.stringify(elsewhere.error));

  // Release 0.5.0 refused this store. The upgrade opens it and places the save.
  const store = await device.open();
  try {
    await settleUpgrade(store, 'engine-upgrade-joined');
    const live = await getFile({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId: file.fileId },
    });
    assert.equal(
      live.data?.head?.text,
      'alpha, written offline\nbeta\ngamma\ndelta, written elsewhere\n',
    );
    assert.deepEqual(await store.recover(ownerAccountId, workspaceId), []);
  } finally {
    await store.close();
  }
});

await test('an upgraded device keeps an earlier save that overlaps another', async () => {
  const path = 'notes/upgrade-kept.md';
  const file = await newFile(path, 'alpha\nbeta\ngamma\n');
  const device = deviceBackend('upgrade-kept');
  const before = await device.open();
  await syncPull(before, ownerCookie, 'engine-upgrade-kept-pull');
  await before.close();
  await queueRelease04Save(device, {
    fileId: file.fileId,
    head: file.revisionId,
    path,
    text: 'alpha\nbeta, written offline\ngamma\n',
  });
  const elsewhere = await updateFile({
    headers: { ...browser(ownerCookie), 'if-match': `"${file.revisionId}"` },
    path: { workspaceId, fileId: file.fileId },
    body: {
      document: await saveForHead(
        workspaceId,
        file.revisionId,
        'alpha\nbeta, written elsewhere\ngamma\n',
      ),
      revisionId: randomUUID(),
      mutationId: randomUUID(),
      deviceId: 'device-elsewhere',
    },
  });
  assert.equal(elsewhere.error, undefined, JSON.stringify(elsewhere.error));

  const store = await device.open();
  try {
    await settleUpgrade(store, 'engine-upgrade-kept');
    // The texts cannot say which change wins, so the note keeps the text of
    // the server and Needs attention keeps the earlier text, once.
    const live = await getFile({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId: file.fileId },
    });
    assert.equal(
      live.data?.head?.text,
      'alpha\nbeta, written elsewhere\ngamma\n',
    );
    const kept = await store.recover(ownerAccountId, workspaceId);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.text, 'alpha\nbeta, written offline\ngamma\n');
    assert.equal(kept[0]?.code, 'unplaced_work');
  } finally {
    await store.close();
  }
});

await test('an upgraded device asks for the receipt of a save that 0.4 sent', async () => {
  const path = 'notes/upgrade-receipt.md';
  const file = await newFile(path, 'one\n');
  const device = deviceBackend('upgrade-receipt');
  const before = await device.open();
  await syncPull(before, ownerCookie, 'engine-upgrade-receipt-pull');
  await before.close();
  // Release 0.4 froze a digest and may have sent the save. The server holds
  // no receipt for it, so the save is unsent work and goes out once.
  await queueRelease04Save(device, {
    fileId: file.fileId,
    head: file.revisionId,
    path,
    text: 'one\ntwo\n',
    state: 'sending',
    digest: 'a'.repeat(64),
  });
  const store = await device.open();
  try {
    await settleUpgrade(store, 'engine-upgrade-receipt');
    const live = await getFile({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId: file.fileId },
    });
    assert.equal(live.data?.head?.text, 'one\ntwo\n');
  } finally {
    await store.close();
  }
});

await test('an upgraded device sends a note that only it held', async () => {
  const path = 'notes/upgrade-new.md';
  const fileId = randomUUID();
  const device = deviceBackend('upgrade-new');
  const before = await device.open();
  await syncPull(before, ownerCookie, 'engine-upgrade-new-pull');
  await before.close();
  await queueRelease04Save(device, {
    fileId,
    head: null,
    path,
    text: '# Made offline in 0.4\n',
  });
  const store = await device.open();
  try {
    await settleUpgrade(store, 'engine-upgrade-new');
    const live = await getFile({
      headers: browser(ownerCookie),
      path: { workspaceId, fileId },
    });
    assert.equal(live.data?.head?.text, '# Made offline in 0.4\n');
    assert.equal(live.data?.path, path);
  } finally {
    await store.close();
  }
});

/** The marks of one paragraph past the limit of one block (record 0182). */
const pastMarks = markdownLimits.maxBlockMarks + 2;

/** A paragraph past the mark limit of one block. */
const markedParagraph = 'x*y '.repeat(pastMarks);

/** The same marks divided into two paragraphs, each within the limit. */
const dividedParagraphs = `${'x*y '.repeat(pastMarks / 2)}\n\n${'x*y '.repeat(pastMarks / 2)}`;

/** The queued saves that wait to be sent, with no parked one. */
async function unsentOf(store: LocalStore) {
  return (await queuedOf(store)).filter((entry) => entry.state !== 'conflict');
}

/** The live note of the server, or a test failure. */
async function serverNote(fileId: string) {
  const live = await getFile({
    headers: browser(ownerCookie),
    path: { workspaceId, fileId },
  });
  assert.equal(live.error, undefined, JSON.stringify(live.error));
  return live.data;
}

await test('a refused new note keeps its name, and its fix and the next note save', async () => {
  // The defects: the next new note took the name that the server still held
  // for the refused note (record 0184), and every edit of the refused note
  // built on the refused save and was refused too (record 0183).
  const store = await openStore('refused-new', 'device-refused-new');
  // A device syncs before it writes, so its document of a note is the one
  // that its saves build on.
  await syncPull(store, ownerCookie, 'engine-refused-new-pull');
  const run = startEngine(store, ownerCookie, 'engine-refused-new');
  try {
    const fileId = randomUUID();
    const workingCopyId = randomUUID();
    const held = async (): Promise<readonly string[]> =>
      (await store.listHeldPaths(ownerAccountId, workspaceId)).map(
        (entry) => entry.path,
      );
    const firstPath = freeNotePath(await held(), 'refused');
    assert.equal(firstPath, 'refused/New note.md');
    await createNote(
      store,
      draftOf(ownerAccountId, workingCopyId, fileId, null, '', firstPath, 1),
    );
    await waitFor(
      async () => (await queuedOf(store)).length === 0,
      'the new note reaches the server',
    );
    // The editor names the head that it opened, as the note loader does.
    const head = (await store.listLocalFiles(ownerAccountId, workspaceId)).find(
      (file) => file.fileId === fileId,
    )?.acceptedHeadRevisionId;
    assert.ok(typeof head === 'string');
    // The heading names the note, and its paragraph is past the limit.
    await checkpointText(
      store,
      draftOf(
        ownerAccountId,
        workingCopyId,
        fileId,
        head,
        `# Plan\n\n${markedParagraph}\n`,
        'refused/Plan.md',
        2,
      ),
    );
    await waitFor(
      async () =>
        (await store.recover(ownerAccountId, workspaceId)).length === 1 &&
        (await unsentOf(store)).length === 0,
      'the server refuses the note and the device parks the save',
    );
    const [kept] = await store.recover(ownerAccountId, workspaceId);
    assert.equal(kept?.noteRefusal, 'note_too_many_marks');
    assert.equal((await serverNote(fileId))?.path, firstPath);

    // The next new note takes a name that the server does not hold.
    const nextPath = freeNotePath(await held(), 'refused');
    assert.equal(nextPath, 'refused/New note 2.md');
    const nextId = randomUUID();
    await createNote(
      store,
      draftOf(ownerAccountId, randomUUID(), nextId, null, '', nextPath, 1),
    );
    await waitFor(
      async () => (await unsentOf(store)).length === 0,
      'the next new note reaches the server',
    );
    assert.equal((await serverNote(nextId))?.path, nextPath);
    assert.equal((await store.recover(ownerAccountId, workspaceId)).length, 1);

    // The person divides the paragraph, as the sentence asks.
    await checkpointText(
      store,
      draftOf(
        ownerAccountId,
        workingCopyId,
        fileId,
        head,
        `# Plan\n\n${dividedParagraphs}\n`,
        'refused/Plan.md',
        3,
      ),
    );
    await waitFor(
      async () =>
        (await queuedOf(store)).length === 0 &&
        (await store.recover(ownerAccountId, workspaceId)).length === 0,
      'the fixed note reaches the server and leaves Needs attention',
    );
    const fixed = await serverNote(fileId);
    assert.equal(fixed?.path, 'refused/Plan.md');
    assert.equal(fixed?.head?.text, `# Plan\n\n${dividedParagraphs}\n`);
  } finally {
    await stopEngine(run);
    await store.close();
  }
});

await test('an existing note that grows past a limit saves again once it fits', async () => {
  const file = await newFile('refused/Existing.md', '# Existing\n');
  const store = await openStore('refused-existing', 'device-refused-existing');
  try {
    await syncPull(store, ownerCookie, 'engine-refused-existing-pull');
    const run = startEngine(store, ownerCookie, 'engine-refused-existing');
    try {
      await checkpointText(
        store,
        draftOf(
          ownerAccountId,
          'working-existing',
          file.fileId,
          file.revisionId,
          `# Existing\n\n${markedParagraph}\n`,
          'refused/Existing.md',
          1,
        ),
      );
      await waitFor(
        async () =>
          (await store.recover(ownerAccountId, workspaceId)).length === 1 &&
          (await unsentOf(store)).length === 0,
        'the server refuses the larger note and the device parks the save',
      );
      assert.equal((await serverNote(file.fileId))?.head?.text, '# Existing\n');
      await checkpointText(
        store,
        draftOf(
          ownerAccountId,
          'working-existing',
          file.fileId,
          file.revisionId,
          `# Existing\n\n${dividedParagraphs}\n`,
          'refused/Existing.md',
          2,
        ),
      );
      await waitFor(
        async () =>
          (await queuedOf(store)).length === 0 &&
          (await store.recover(ownerAccountId, workspaceId)).length === 0,
        'the fixed note reaches the server and leaves Needs attention',
      );
    } finally {
      await stopEngine(run);
    }
    assert.equal(
      (await serverNote(file.fileId))?.head?.text,
      `# Existing\n\n${dividedParagraphs}\n`,
    );
  } finally {
    await store.close();
  }
});

for (const [action, slug, run] of [
  ['Discard', 'discard', discardParked],
  ['Retry', 'retry', retryParked],
  ['Save as new note', 'new-note', keepParkedAsNote],
] as const)
  await test(`${action} of the oldest row of an earlier parked chain leaves a note that saves`, async () => {
    // The defect: the action removed the checkpoint of the oldest save and
    // left the next parked save naming it, so the next save of the note
    // named a revision that only this device ever knew (record 0183). The
    // server took it as a save over another head and said so.
    const path = `chain/${slug}.md`;
    const file = await newFile(path, 'a\n');
    const store = await openStore(`chain-${slug}`, `device-chain-${slug}`);
    try {
      await syncPull(store, ownerCookie, `engine-chain-${slug}-pull`);
      const copy = `working-chain-${slug}`;
      const texts = ['a\nb\n', 'a\nb\nc\n', 'a\nb\nc\nd\n'];
      for (const [index, text] of texts.entries())
        await checkpointText(
          store,
          draftOf(
            ownerAccountId,
            copy,
            file.fileId,
            file.revisionId,
            text,
            path,
            index + 1,
          ),
        );
      // An earlier release named each parked save as the parent of the next
      // one, so the server refused each later save. Each was sent, and each
      // row stays, so the saves park newest first: this release lets a later
      // refused save stand for an earlier one.
      const saves = await queuedOf(store);
      assert.equal(saves.length, 3);
      for (const save of saves)
        await store.markSending(
          ownerAccountId,
          save.input.mutationId,
          `digest-${save.input.mutationId}`,
        );
      for (const [index, save] of [...saves.entries()].reverse())
        await parkRefusedSave(
          store,
          ownerAccountId,
          save,
          index === 0 ? 'unrenderable_note' : 'invalid_graph',
        );
      const rows = parkedSaves(
        await store.recover(ownerAccountId, workspaceId),
      );
      assert.equal(rows.length, 3);
      const oldest = rows.find(
        (row) => row.mutationId === saves[0]?.input.mutationId,
      );
      assert.ok(oldest !== undefined);

      const engine = startEngine(store, ownerCookie, `engine-chain-${slug}`);
      try {
        await run({ store, accountId: ownerAccountId, workspaceId }, oldest);
        // The document of the note keeps every word of the parked saves. A
        // Retry that wrote the oldest kept text over it removed the words of
        // the later ones, and its save ended their rows. An open editor
        // shows the document.
        const document = await store.readNoteDocument(
          ownerAccountId,
          workspaceId,
          file.fileId,
        );
        const shown = document === null ? '' : readDocumentText(document.bytes);
        assert.equal(shown, 'a\nb\nc\nd\n');
        // The person goes on with the note as the screen shows it.
        await checkpointText(
          store,
          draftOf(
            ownerAccountId,
            copy,
            file.fileId,
            file.revisionId,
            `${shown}e\n`,
            path,
            4,
          ),
        );
        await waitFor(
          async () =>
            (await queuedOf(store)).length === 0 &&
            (await store.recover(ownerAccountId, workspaceId)).length === 0,
          'the next save reaches the server and Needs attention is empty',
        );
      } finally {
        await stopEngine(engine);
      }
      const live = await serverNote(file.fileId);
      assert.equal(live?.head?.text, 'a\nb\nc\nd\ne\n');
      assert.equal(live?.path, path);
      // Only a Retry puts a save of its own on the note before the next one,
      // so only then does the next save pass a head of the server.
      if (action !== 'Retry')
        assert.deepEqual(
          engine.notices.filter((notice) => notice.kind === 'superseded'),
          [],
        );
      if (action === 'Save as new note') {
        const kept = (
          await store.listAcceptedFiles(ownerAccountId, workspaceId)
        ).find((entry) => entry.path === `chain/${slug} (recovered).md`);
        assert.ok(kept !== undefined, 'the kept text is a note of its own');
        assert.equal((await serverNote(kept.fileId))?.head?.text, 'a\nb\n');
      }
    } finally {
      await store.close();
    }
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
