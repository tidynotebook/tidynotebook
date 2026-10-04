/**
 * The notice coordinator of a device against a real server and a real
 * local store (records 0124, 0130).
 *
 * The device runs the parts that the web tab runs: the lease keeper, the
 * coordinator over the PartySocket transport, and an engine on the lease gate.
 * The poll interval of the engine is one hour, so after its first pass only a
 * notice or a local queue change starts a pass. What this file proves arrives
 * through the stream, and each wait ends on a condition of the local store or
 * of the server.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { IDBFactory, IDBKeyRange as FakeKeyRange } from 'fake-indexeddb';
import {
  commitChangeset,
  configureClient,
  connectSyncNotices,
  createOwner,
  encodeSyncNoticesMessage,
  getAccount,
  getFile,
  getSyncProtocol,
  listWorkspaces,
  signInWithPassword,
  syncNoticesProtocol,
} from '@notesapp/api-client';
import { createApp, loadServerConfig } from '@notesapp/server';
import {
  listenerTimerSchedule,
  openSyncListener,
  syncListenerName,
  type ListenerSchedule,
} from '@notesapp/storage-server';
import { openLocalStore } from '@notesapp/storage-browser';
import {
  createLeaseKeeper,
  createNote,
  createNoticeCoordinator,
  createSyncEngine,
  engineInterval,
  timerSchedule,
  type Draft,
  type LocalStore,
} from '@notesapp/sync';
import { createDisposableDatabase, openSession } from './support/database.ts';
import { firstSave } from './support/documents.ts';
import { socketClassWith } from './support/notices.ts';

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

/** Waits until a condition holds, failing loudly after a long bound. */
async function waitFor(
  condition: () => boolean | Promise<boolean>,
  detail: string,
): Promise<void> {
  const started = Date.now();
  while (!(await condition())) {
    if (Date.now() - started > 20_000)
      throw new Error(`the notice test stalled while waiting: ${detail}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const origin = 'http://127.0.0.1';
const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-notices-device-'));
const config = loadServerConfig({
  NOTESAPP_ORIGIN: origin,
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'notices-device-test-secret-0123456789abcdef',
  NOTESAPP_LOG_LEVEL: 'silent',
  NOTESAPP_MAX_BODY_BYTES: '4194304',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
});
/**
 * The reconnect of the sync listener of the server. While a test holds it,
 * a lost listener stays down, so a commit in the gap reaches no listener by
 * construction and not by a race against the retry delay.
 */
const reconnect = (() => {
  let holding = false;
  const held: (() => void)[] = [];
  const schedule: ListenerSchedule = (ms, run) => {
    if (!holding) return listenerTimerSchedule(ms, run);
    held.push(run);
    return () => {
      const at = held.indexOf(run);
      if (at !== -1) held.splice(at, 1);
    };
  };
  return {
    schedule,
    hold: () => {
      holding = true;
    },
    /** Whether the lost listener asked for its reconnect. */
    waiting: () => held.length > 0,
    release: () => {
      holding = false;
      for (const run of held.splice(0)) run();
    },
  };
})();
const app = await createApp(config, { listenerSchedule: reconnect.schedule });
await app.listen({ host: '127.0.0.1', port: 0 });
const address: string | AddressInfo | null = app.server.address();
if (address === null || typeof address === 'string')
  throw new Error('The test server did not bind a TCP port.');
const baseUrl = `http://127.0.0.1:${String(address.port)}`;
configureClient(baseUrl, undefined);

const ownerEmail = 'notices-device@notes.invalid';
const ownerPassword = 'owner-password-123456';
const made = await createOwner({
  headers: { origin },
  body: { email: ownerEmail, password: ownerPassword },
});
assert.equal(responseOf(made.response).status, 201);
const signed = await signInWithPassword({
  headers: { origin },
  body: { email: ownerEmail, password: ownerPassword },
});
const cookie = cookieHeader(responseOf(signed.response).headers.getSetCookie());
const headers = { origin, cookie };
const accountId = (await getAccount({ headers })).data?.accountId ?? '';
const workspaceId =
  (await listWorkspaces({ headers })).data?.workspaces[0]?.workspaceId ?? '';

/** One device: its store, lease keeper, coordinator and engine. */
type Device = {
  readonly store: LocalStore;
  readonly coordinator: ReturnType<typeof createNoticeCoordinator>;
  /** How many notices named a workspace, which only the stream can raise. */
  readonly notified: () => number;
  /** How many messages said that the account changed (record 0201). */
  readonly accountChanges: () => number;
  readonly stop: () => Promise<void>;
};

/** Starts one device with a fresh local store, as the web tab runs it. */
async function startDevice(label: string): Promise<Device> {
  const store = await openLocalStore('https://notes.test', {
    indexedDB: new IDBFactory(),
    IDBKeyRange: FakeKeyRange,
    databaseName: `notesapp-notices-${label}`,
    deviceId: `device-${label}`,
  });
  const keeper = createLeaseKeeper(store, { ownerId: label, ttlMs: 30_000 });
  let notified = 0;
  let accountChanges = 0;
  let wake: () => void = () => {};
  const coordinator = createNoticeCoordinator(accountId, {
    keeper,
    offered: async () =>
      ((await getSyncProtocol()).data?.notificationProtocols ?? []).includes(
        syncNoticesProtocol,
      ),
    open: (handlers) =>
      connectSyncNotices(baseUrl, handlers, {
        socketClass: socketClassWith(headers),
      }),
    encode: (generation, workspaceIds) =>
      encodeSyncNoticesMessage({
        kind: 'subscribe',
        generation,
        workspaceIds: [...workspaceIds],
      }),
    wake: () => {
      notified += 1;
      wake();
    },
    wakeAll: () => {
      wake();
    },
    sessionEnded: () => {},
    accountChanged: () => {
      accountChanges += 1;
    },
    schedule: timerSchedule,
  });
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: label,
    headers: () => headers,
    lease: keeper.gate,
    interval: () => engineInterval(coordinator.healthy(), hourMs, Math.random),
  });
  wake = () => {
    engine.requestSync();
  };
  keeper.onChange(() => {
    engine.requestSync();
  });
  // A local queue change wakes the engine, with or without the stream.
  const stopQueue = store.subscribe((change) => {
    if (change.kind === 'queue') engine.requestSync();
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  coordinator.want([workspaceId]);
  keeper.start();
  coordinator.start();
  return {
    store,
    coordinator,
    notified: () => notified,
    accountChanges: () => accountChanges,
    stop: async () => {
      coordinator.stop();
      stopQueue();
      controller.abort();
      engine.stop();
      await running;
      await keeper.stop();
      await store.close();
    },
  };
}

const hourMs = 60 * 60_000;
const device = await startDevice('tab-1');
const { store, coordinator } = device;

/** Whether the local cursor of a store reached one server cursor. */
async function reached(
  cursor: string,
  target: LocalStore = store,
): Promise<boolean> {
  const local = await target.readCursor(accountId, workspaceId);
  return local !== null && BigInt(local) >= BigInt(cursor);
}

/** Commits `count` new notes from another device and answers the cursor. */
async function commitElsewhere(folder: string, count: number): Promise<string> {
  const clientTime = new Date().toISOString();
  const revisions = Array.from({ length: count }, (_, index) => ({
    revisionId: randomUUID(),
    fileId: randomUUID(),
    parents: [],
    path: `${folder}/note-${String(index)}.md`,
    deleted: false,
    content: {
      kind: 'markdown' as const,
      document: firstSave(`# Note ${String(index)}\n`),
    },
    clientTime,
  }));
  const committed = await commitChangeset({
    headers,
    path: { workspaceId },
    body: {
      mutationId: randomUUID(),
      deviceId: 'other-device',
      expectedHeads: Object.fromEntries(
        revisions.map((revision) => [revision.fileId, null]),
      ),
      revisions,
    },
  });
  assert.equal(committed.error, undefined, JSON.stringify(committed.error));
  return committed.data?.cursor ?? '';
}

await test('the device takes the lease, reads a snapshot and accepts its set', async () => {
  await waitFor(
    async () => (await store.readCursor(accountId, workspaceId)) !== null,
    'the first snapshot',
  );
  await waitFor(() => coordinator.healthy(), 'the accepted set');
  assert.ok(engineInterval(coordinator.healthy(), hourMs, () => 0) < hourMs);
  // One account and one tab hold one stream.
  const session = await openSession(database.migrationUrl);
  try {
    const rows = await session.query<{ held: number }>(
      'select count(*)::int as held from stream_reservations where account_id = $1',
      [accountId],
    );
    assert.equal(rows[0]?.held, 1);
  } finally {
    await session.close();
  }
});

await test('a commit of another device reaches this device through a notice', async () => {
  const before = device.notified();
  const cursor = await commitElsewhere('elsewhere', 1);
  await waitFor(() => device.notified() > before, 'the notice');
  await waitFor(() => reached(cursor), 'the pull');
});

await test('a change of the controls of the account reaches the open device', async () => {
  // A lock or an unlock raises the revision of the controls, and the stream
  // tells the device, so the application reads the account again with no
  // reload (records 0189 and 0201). The administrator of this installation
  // is never locked, so a limit changes here.
  const before = device.accountChanges();
  const session = await openSession(database.migrationUrl);
  try {
    await session.query(
      `update accounts set text_limit_bytes = 1000000000,
         controls_revision = controls_revision + 1 where id = $1`,
      [accountId],
    );
  } finally {
    await session.close();
  }
  await waitFor(() => device.accountChanges() > before, 'the account notice');
  // The stream stays open and keeps its set.
  assert.equal(coordinator.healthy(), true);
});

await test('a backlog of several pages drains to its end', async () => {
  // Three commits of sixty notes do not fit one page of a hundred records,
  // so the pass reads page after page until an empty one.
  await commitElsewhere('backlog-a', 60);
  await commitElsewhere('backlog-b', 60);
  const last = await commitElsewhere('backlog-c', 60);
  await waitFor(() => reached(last), 'the whole backlog');
});

/** A new local note in the queue, as the editor makes one. */
function draft(fileId: string, path: string): Draft {
  return {
    accountId,
    workspaceId,
    workingCopyId: randomUUID(),
    fileId,
    baseRevisionId: null,
    text: `# ${path}\n`,
    path,
    sequence: 1,
    deleted: false,
  };
}

/** Runs one statement as the migration role and answers its rows. */
async function asOwnerRows<Row extends object>(
  text: string,
  params: unknown[] = [],
): Promise<Row[]> {
  const session = await openSession(database.migrationUrl);
  try {
    return await session.query<Row>(text, params);
  } finally {
    await session.close();
  }
}

/** Runs one statement as the migration role. */
async function asOwner(text: string, params: unknown[] = []): Promise<void> {
  await asOwnerRows<object>(text, params);
}

/** How long the gap test waits for the ended listener backend to exit. */
const backendExitBoundMs = 5000;

await test('a commit before and during a subscription is read after it', async () => {
  const before = await commitElsewhere('before-subscribe', 1);
  const starting = startDevice('late');
  const during = await commitElsewhere('during-subscribe', 1);
  const late = await starting;
  try {
    await waitFor(() => late.coordinator.healthy(), 'the late set');
    await waitFor(() => reached(before, late.store), 'the commit before');
    await waitFor(() => reached(during, late.store), 'the commit during');
  } finally {
    await late.stop();
  }
});

await test('duplicate notices change nothing', async () => {
  const cursor = await commitElsewhere('duplicate', 1);
  await waitFor(() => reached(cursor), 'the first read');
  const before = device.notified();
  for (let turn = 0; turn < 3; turn += 1)
    await asOwner("select pg_notify('notesapp_sync', $1)", [
      `w:${workspaceId}`,
    ]);
  await waitFor(() => device.notified() > before, 'a repeated notice');
  const next = await commitElsewhere('after-duplicate', 1);
  await waitFor(() => reached(next), 'the next commit');
  assert.deepEqual(await store.pending(accountId, workspaceId), []);
});

await test('a notice missed in a listener gap is read after reconcile', async () => {
  // Another test file or worktree uses the same PostgreSQL service.
  const other = await createDisposableDatabase();
  let lost = false;
  let listening: () => void = () => {};
  const listeningNow = new Promise<void>((resolve) => {
    listening = resolve;
  });
  const listener = openSyncListener(other.runtimeUrl, {
    onHint: () => {},
    onLost: () => {
      lost = true;
    },
    onListening: () => {
      listening();
    },
  });
  try {
    await listeningNow;
    const before = device.notified();
    reconnect.hold();
    // Without a timeout the call returns before the backend exits, and a
    // backend that has not exited yet can still hear the commit below. With
    // a timeout, each call waits until its backend is gone.
    const ended = await asOwnerRows<{ ended: boolean }>(
      'select pg_terminate_backend(pid, $2) as ended from pg_stat_activity where application_name = $1 and datname = current_database()',
      [syncListenerName, backendExitBoundMs],
    );
    assert.equal(ended.length, 1, 'the server holds one listener');
    assert.ok(
      ended.every((row) => row.ended),
      `the listener did not exit in ${String(backendExitBoundMs)} ms`,
    );
    // The server saw the loss when its listener asks to reconnect.
    await waitFor(() => reconnect.waiting(), 'the lost listener');
    const cursor = await commitElsewhere('in-the-gap', 1);
    reconnect.release();
    await waitFor(() => reached(cursor), 'the read after reconcile');
    // The commit fell in the gap, so no notice named it. The read came from
    // the reconcile that followed the restored listener.
    assert.equal(device.notified(), before);
    assert.equal(lost, false, 'the listener of another database stays open');
    assert.equal(listener.listening(), true);
  } finally {
    reconnect.release();
    await listener.close();
    await other.destroy();
  }
});

await test('an expired cursor restarts from a snapshot and converges', async () => {
  const first = await commitElsewhere('before-expiry', 1);
  await waitFor(() => reached(first), 'the read before the expiry');
  // The retention job removes old feed rows. Every row goes here, so the
  // cursor of the device predates the retained feed.
  await asOwner('delete from sync_changes where workspace_id = $1', [
    workspaceId,
  ]);
  const cursor = await commitElsewhere('after-expiry', 1);
  await waitFor(() => reached(cursor), 'the read from a fresh snapshot');
});

await test('an old client with no coordinator still syncs by polling', async () => {
  const old = await openLocalStore('https://notes.test', {
    indexedDB: new IDBFactory(),
    IDBKeyRange: FakeKeyRange,
    databaseName: 'notesapp-notices-old-client',
    deviceId: 'device-old',
  });
  // The engine of a release before the stream: its own lease and a poll.
  const engine = createSyncEngine(old, accountId, workspaceId, {
    ownerId: 'old-client',
    headers: () => headers,
    pollIntervalMs: 50,
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  try {
    // The lease of the browser profile belongs to another tab in this run,
    // so the old client has a profile of its own, as another browser does.
    const cursor = await commitElsewhere('old-client', 1);
    await waitFor(() => reached(cursor, old), 'the poll of the old client');
  } finally {
    controller.abort();
    engine.stop();
    await running;
    await old.close();
  }
});

await test('a local note is sent at once, and still is with no stream', async () => {
  const first = randomUUID();
  await createNote(store, draft(first, 'local/first.md'));
  await waitFor(
    async () => (await store.pending(accountId, workspaceId)).length === 0,
    'the first send',
  );
  const sent = await getFile({ headers, path: { workspaceId, fileId: first } });
  assert.equal(responseOf(sent.response).status, 200);

  // The stream goes away, as it does behind a proxy that refuses the
  // upgrade. The queue change still wakes the engine over HTTP.
  coordinator.stop();
  await waitFor(() => !coordinator.healthy(), 'the stream stops');
  assert.equal(
    engineInterval(coordinator.healthy(), hourMs, () => 0),
    hourMs,
  );
  const second = randomUUID();
  await createNote(store, draft(second, 'local/second.md'));
  await waitFor(
    async () => (await store.pending(accountId, workspaceId)).length === 0,
    'the send without the stream',
  );
  const again = await getFile({
    headers,
    path: { workspaceId, fileId: second },
  });
  assert.equal(responseOf(again.response).status, 200);
});

// Teardown
await device.stop();
await app.close();
await rm(storageRoot, { recursive: true, force: true });
await database.destroy();
