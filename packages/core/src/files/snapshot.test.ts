/**
 * Unit checks for snapshot validation and incremental sync decisions.
 *
 * Storage behavior such as repeatable-read capture, token hashing, and expiry
 * is covered by the snapshots integration test against a real database.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Actor, Role } from '../identity/actor.ts';
import { verifyActor } from '../identity/actor.ts';
import {
  formatSyncCursor,
  getChanges,
  getSnapshotPage,
  isSupportedSyncVersion,
  parseSyncCursor,
  snapshotPageSize,
  snapshotPosition,
  startSnapshot,
  syncLimit,
} from './snapshot.ts';
import { ok } from './model.ts';
import type {
  DocumentService,
  SnapshotPage,
  SnapshotStart,
  StartSnapshotInput,
  SyncChangeFeed,
  WorkspaceStore,
  WorkspaceTransaction,
} from './ports.ts';

/** A document service that no snapshot test reaches. */
const documentService: DocumentService = {
  start: () => new Uint8Array(),
  apply: () =>
    ok({ bytes: new Uint8Array(), text: '', state: new Uint8Array() }),
  editRanges: () => {
    throw new Error('Range edits are not used here.');
  },
  replaceText: () =>
    ok({ bytes: new Uint8Array(), text: '', state: new Uint8Array() }),
  keepWrittenCharacter: () =>
    ok({ bytes: new Uint8Array(), text: '', state: new Uint8Array() }),
  observe: () => new Uint8Array(),
  stateVector: () => new Uint8Array(),
  delta: () => new Uint8Array(),
  readText: () => '',
  covers: () => ok(true),
};

const workspaceId = 'w0000000-0000-4000-8000-000000000001';
const ownerId = 'a0000000-0000-4000-8000-000000000001';
const strangerId = 'a0000000-0000-4000-8000-000000000003';

/** A verified actor with read rights in the test workspace. */
function memberActor(accountId: string): Actor {
  const built = verifyActor(accountId, [
    { workspaceId, actions: ['read', 'write'] },
  ]);
  if ('ok' in built && !built.ok) throw new Error('Actor creation failed');
  return 'ok' in built ? built.value : built;
}

/** A store whose transaction reports one role and one canned feed. */
function fakeStore(
  roles: ReadonlyMap<string, Role | null>,
  feed: SyncChangeFeed,
  seen: { token?: string },
): WorkspaceStore {
  const tx: WorkspaceTransaction = {
    search: () => Promise.resolve([]),
    dailyNoteSettings: () => Promise.resolve(null),
    saveDailyNoteSettings: () => Promise.resolve(),
    templateSettings: () => Promise.resolve(null),
    saveTemplateSettings: () => Promise.resolve(),
    backlinks: () => Promise.resolve([]),
    isAcceptedRevision: () => Promise.resolve(false),
    documents: () => Promise.resolve(new Map()),
    role: (id: string) => Promise.resolve(roles.get(id) ?? null),
    receipt: () => Promise.resolve(null),
    heads: () => Promise.resolve(new Map()),
    headStates: () => Promise.resolve(new Map()),
    revisionPaths: () => Promise.resolve(new Map()),
    parents: () => Promise.resolve(new Map()),
    purgedFiles: () => Promise.resolve([]),
    listFiles: () => Promise.resolve({ files: [], nextCursor: null }),
    listDeletedFiles: () => Promise.resolve({ files: [], nextCursor: null }),
    takenPaths: () => Promise.resolve([]),
    file: () => Promise.resolve(null),
    snapshotRevisions: () => Promise.resolve(null),
    revision: () => Promise.resolve(null),
    accept: () => Promise.reject(new Error('no write in this test')),
    onFilesDeleted: () => Promise.resolve(),
    listHistory: () => Promise.resolve({ revisions: [], nextCursor: null }),
    previewPurge: () =>
      Promise.reject(new Error('no purge preview in this test')),
    purgeFiles: () => Promise.reject(new Error('no purge in this test')),
    startSnapshot: (input: StartSnapshotInput): Promise<SnapshotStart> => {
      seen.token = 'started';
      return Promise.resolve({
        token: 'started',
        expiresAt: new Date().toISOString(),
        cursor: '7',
        itemCount: 0,
        pageSize: input.pageSize,
      });
    },
    snapshotPage: () => Promise.resolve(null),
    syncChanges: () => Promise.resolve(feed),
  };
  return {
    documents: documentService,
    transact: <T>(
      _actor: Actor,
      _workspace: string,
      run: (active: WorkspaceTransaction) => Promise<T>,
    ): Promise<T> => run(tx),
  };
}

await test('parseSyncCursor accepts decimal cursors only', () => {
  assert.equal(parseSyncCursor('0'), 0n);
  assert.equal(parseSyncCursor('42'), 42n);
  assert.equal(parseSyncCursor(''), null);
  assert.equal(parseSyncCursor('-1'), null);
  assert.equal(parseSyncCursor('12x'), null);
  assert.equal(parseSyncCursor(' 12'), null);
  assert.equal(formatSyncCursor(42n), '42');
});

await test('page sizes stay inside the served range', () => {
  assert.equal(snapshotPageSize(null), 100);
  assert.equal(snapshotPageSize(undefined), 100);
  assert.equal(snapshotPageSize(0), 1);
  assert.equal(snapshotPageSize(100000), 500);
  assert.equal(syncLimit(null), 100);
  assert.equal(syncLimit(100000), 500);
  assert.equal(snapshotPosition(null), 0);
  assert.equal(snapshotPosition(-4), 0);
});

await test('only sync version 1 is supported', () => {
  assert.equal(isSupportedSyncVersion(1), true);
  assert.equal(isSupportedSyncVersion(2), false);
});

await test('startSnapshot rejects an unsupported version before transacting', async () => {
  let transacted = false;
  const store: WorkspaceStore = {
    documents: documentService,
    transact: <T>(): Promise<T> => {
      transacted = true;
      return Promise.reject(new Error('must not transact'));
    },
  };
  const result = await startSnapshot(store, memberActor(ownerId), workspaceId, {
    syncVersion: 2,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.error.code, 'unsupported_version');
  assert.equal(transacted, false);
});

await test('getChanges rejects a stranger', async () => {
  const store = fakeStore(
    new Map([[ownerId, 'owner']]),
    { changes: [], highWater: '9', oldestRetained: '1' },
    {},
  );
  const result = await getChanges(store, memberActor(strangerId), workspaceId, {
    cursor: '9',
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.error.code, 'forbidden');
});

await test('getChanges reports an empty poll at the high-water mark', async () => {
  const store = fakeStore(
    new Map([[ownerId, 'owner']]),
    { changes: [], highWater: '9', oldestRetained: '1' },
    {},
  );
  const result = await getChanges(store, memberActor(ownerId), workspaceId, {
    cursor: '9',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.value.changes : null, []);
  assert.equal(result.ok ? result.value.nextCursor : '', '9');
});

await test('getChanges requires a snapshot when the cursor predates retention', async () => {
  const store = fakeStore(
    new Map([[ownerId, 'owner']]),
    { changes: [], highWater: '200', oldestRetained: '150' },
    {},
  );
  const result = await getChanges(store, memberActor(ownerId), workspaceId, {
    cursor: '20',
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.error.code, 'snapshot_required');
});

await test('getChanges requires a snapshot when rows vanished below high-water', async () => {
  const store = fakeStore(
    new Map([[ownerId, 'owner']]),
    { changes: [], highWater: '200', oldestRetained: null },
    {},
  );
  const result = await getChanges(store, memberActor(ownerId), workspaceId, {
    cursor: '20',
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.error.code, 'snapshot_required');
});

await test('getChanges continues from the last returned change', async () => {
  const fileId = 'f0000000-0000-4000-8000-000000000001';
  const store = fakeStore(
    new Map([[ownerId, 'owner']]),
    {
      changes: [
        // A permanent deletion names the note alone: its revisions are gone.
        { kind: 'purge', cursor: '11', fileId },
      ],
      highWater: '11',
      oldestRetained: '1',
    },
    {},
  );
  const result = await getChanges(store, memberActor(ownerId), workspaceId, {
    cursor: '9',
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.value.nextCursor : '', '11');
});

await test('getSnapshotPage maps a missing snapshot to snapshot_required', async () => {
  const store = fakeStore(
    new Map([[ownerId, 'owner']]),
    { changes: [], highWater: '0', oldestRetained: null },
    {},
  );
  const result = await getSnapshotPage(
    store,
    memberActor(ownerId),
    workspaceId,
    { token: 'x'.repeat(43) },
  );
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.error.code, 'snapshot_required');
});

await test('snapshot page type carries the captured cursor', async () => {
  const page: SnapshotPage = {
    token: 't',
    cursor: '7',
    expiresAt: new Date().toISOString(),
    position: 0,
    nextPosition: null,
    totalItems: 0,
    items: [],
  };
  assert.equal(page.cursor, '7');
});
