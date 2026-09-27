/**
 * Offline PWA lifecycle checks as module tests.
 *
 * These tests run the real local store over an isolated `fake-indexeddb`
 * backend together with the pure lifecycle rules: readiness needs Markdown
 * and application assets while attachment completeness stays separate,
 * blocked schema upgrades refuse without losing drafts, offline sign-out
 * records a marker that reconnect revokes before anything is restored, and
 * recovery records stay bound to the account that wrote them.
 *
 * Nothing here touches the network and no generated operation is called:
 * revocation is an injected callback that records its order, so the test
 * proves that revocation runs before the marker clears. Actual browser
 * eviction, installation, and retention remain evidence for the authorized
 * device stage.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { IDBFactory, IDBKeyRange as FakeKeyRange } from 'fake-indexeddb';
import {
  blockedUpgradeInstructions,
  createDatabase,
  isBlockedUpgradeError,
  metaKey,
  openLocalStore,
  type LocalStoreOptions,
} from '@notesapp/storage-browser';
import {
  isLeaseExpired,
  LocalStorageError,
  readWorkerLease,
  type Draft,
  type LocalStore,
} from '@notesapp/sync';
import {
  completePendingSignOut,
  copyPendingToRecovery,
  describeStorageFailure,
  downloadProgress,
  isReadyOffline,
  isRecoveryVisible as isRecordVisible,
  signOut,
  SignOutBlockedError,
  signOutKeepingWork,
} from '../../apps/web/src/pwa/lifecycle.ts';
import {
  closeForUpdate,
  holdTabLock,
  listenForUpdates,
  postUpdateMessage,
  runUpdate,
  UpdateFailedError,
  type UpdateRegistration,
  type UpdateWorker,
} from '../../apps/web/src/pwa/update.ts';

const origin = 'https://notes.example.test';

/** A counted clock, so every record carries a distinct client time. */
function createClock(): () => number {
  let current = Date.parse('2026-09-06T10:00:00.000Z');
  return () => {
    current += 1000;
    return current;
  };
}

/** Waits until a condition holds, failing loudly after a bound. */
async function waitUntil(condition: () => boolean): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > 5000)
      throw new Error('the condition did not hold in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** A counted identifier source, so a failure names the record that differs. */
function createIds(prefix: string): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}-${String(next).padStart(4, '0')}`;
  };
}

/** One isolated database and the options that open it. */
type Backend = {
  readonly name: string;
  readonly factory: IDBFactory;
  options: (extra?: Partial<LocalStoreOptions>) => LocalStoreOptions;
};

function createBackend(prefix: string): Backend {
  const factory = new IDBFactory();
  const name = `notesapp-lifecycle-${prefix}`;
  return {
    name,
    factory,
    options: (extra = {}) => ({
      indexedDB: factory,
      IDBKeyRange: FakeKeyRange,
      databaseName: name,
      now: createClock(),
      id: createIds(prefix),
      deviceId: `device-${prefix}`,
      ...extra,
    }),
  };
}

/** One editor working copy of one note. */
function draftOf(
  accountId: string,
  workspaceId: string,
  fileId: string,
  text: string,
  sequence = 1,
): Draft {
  return {
    accountId,
    workspaceId,
    workingCopyId: `copy-${fileId.slice(0, 8)}`,
    fileId,
    baseRevisionId: null,
    text,
    path: 'notes/one.md',
    deleted: false,
    sequence,
  };
}

/** Queues one pending mutation in one workspace. */
async function queueOne(
  store: LocalStore,
  accountId: string,
  workspaceId: string,
  fileId: string,
  text: string,
): Promise<void> {
  const draft = draftOf(accountId, workspaceId, fileId, text);
  await store.saveDraft(draft);
  const entry = await store.checkpoint(draft, null);
  assert.notEqual(entry, null, 'the draft must queue a mutation');
}

await test('readiness needs Markdown and assets, never attachments', () => {
  assert.equal(
    isReadyOffline({
      markdownComplete: true,
      appAssetsComplete: true,
      attachmentsComplete: true,
    }),
    true,
  );
  assert.equal(
    isReadyOffline({
      markdownComplete: true,
      appAssetsComplete: true,
      attachmentsComplete: false,
    }),
    true,
  );
  assert.equal(
    isReadyOffline({
      markdownComplete: false,
      appAssetsComplete: true,
      attachmentsComplete: true,
    }),
    false,
  );
  assert.equal(
    isReadyOffline({
      markdownComplete: true,
      appAssetsComplete: false,
      attachmentsComplete: true,
    }),
    false,
  );
  assert.equal(
    isReadyOffline({
      markdownComplete: false,
      appAssetsComplete: false,
      attachmentsComplete: false,
    }),
    false,
  );
});

await test('download positions report percent and completion', () => {
  assert.deepEqual(downloadProgress(0, 0), {
    downloaded: 0,
    total: 0,
    percent: 100,
    complete: true,
  });
  assert.deepEqual(downloadProgress(1, 4), {
    downloaded: 1,
    total: 4,
    percent: 25,
    complete: false,
  });
  assert.deepEqual(downloadProgress(4, 4), {
    downloaded: 4,
    total: 4,
    percent: 100,
    complete: true,
  });
  // Over-delivery clamps instead of reporting more than the plan.
  assert.deepEqual(downloadProgress(9, 4), {
    downloaded: 4,
    total: 4,
    percent: 100,
    complete: true,
  });
});

await test('a newer stored schema blocks the upgrade without losing drafts', async () => {
  const backend = createBackend('blocked-newer');
  const first = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  await queueOne(first, account, workspace, file, 'kept text\n');
  await first.close();

  const { db, tables } = createDatabase(backend.name, {
    indexedDB: backend.factory,
    IDBKeyRange: FakeKeyRange,
  });
  await db.open();
  try {
    const meta = await tables.meta.get(metaKey);
    assert.ok(meta !== undefined, 'the database holds no meta record');
    await tables.meta.put({ ...meta, schemaVersion: 99 });
  } finally {
    db.close();
  }

  const failure: unknown = await openLocalStore(origin, backend.options()).then(
    () => null,
    (reason: unknown) => reason,
  );
  assert.ok(failure instanceof LocalStorageError);
  assert.equal(failure.kind, 'corrupt');
  assert.equal(isBlockedUpgradeError(failure), true);
  assert.ok(blockedUpgradeInstructions.includes('No draft is discarded'));
});

await test('an interrupted migration with a bad record is refused', async () => {
  const backend = createBackend('blocked-bad-record');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  await store.saveDraft(draftOf(account, workspace, randomUUID(), 'text\n'));
  await store.close();

  const { db, tables } = createDatabase(backend.name, {
    indexedDB: backend.factory,
    IDBKeyRange: FakeKeyRange,
  });
  await db.open();
  try {
    const meta = await tables.meta.get(metaKey);
    assert.ok(meta !== undefined, 'the database holds no meta record');
    await tables.meta.put({ ...meta, migrationState: 'in-progress' });
    const rows = await tables.drafts.toArray();
    const row = rows[0];
    assert.ok(row !== undefined);
    await tables.drafts.put({ ...row, sequence: Number.NaN });
  } finally {
    db.close();
  }

  await assert.rejects(
    openLocalStore(origin, backend.options()),
    (error: unknown) => isBlockedUpgradeError(error),
  );
});

await test('a non-schema local failure is not a blocked upgrade', () => {
  assert.equal(isBlockedUpgradeError(new Error('boom')), false);
  assert.equal(
    isBlockedUpgradeError(new LocalStorageError('quota', 'full')),
    false,
  );
  assert.equal(
    isBlockedUpgradeError(new LocalStorageError('aborted', 'retry')),
    false,
  );
});

await test('a store that cannot open reads as a sentence, not an engine notice', () => {
  // Release 0.5.0 showed "notesapp local storage corrupt: no migration step
  // leads away from schema version 4" in the sidebar. The person reads the
  // cause and the next step instead, and never the notice of the engine.
  const refusals = [
    new LocalStorageError(
      'corrupt',
      'no migration step leads away from schema version 4',
    ),
    new LocalStorageError('corrupt', 'draft.sequence is not a finite number'),
    new LocalStorageError(
      'quota',
      'opening the local database ran out of space',
    ),
    new LocalStorageError('aborted', 'checking the local schema failed'),
  ];
  for (const refusal of refusals) {
    const sentence = describeStorageFailure(refusal);
    assert.equal(sentence.includes('notesapp local storage'), false);
    assert.equal(sentence.includes(refusal.message), false);
  }
  assert.equal(describeStorageFailure(refusals[0]), blockedUpgradeInstructions);
});

await test('online sign-out revokes before it clears private data', async () => {
  const backend = createBackend('online-signout');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  await queueOne(store, account, workspace, file, 'pending\n');

  const events: string[] = [];
  await signOut(store, account, [workspace], true, true, () => {
    events.push('revoke');
    return Promise.resolve();
  });
  events.push('cleared');

  assert.deepEqual(events, ['revoke', 'cleared']);
  assert.deepEqual(await store.pending(account, workspace), []);
  assert.equal(
    await store.readDraft(account, workspace, `copy-${file.slice(0, 8)}`),
    null,
  );
  assert.equal(await store.hasSignOutMarker(account), false);
  await store.close();
});

await test('a sign-out that keeps work deletes every idle partition', async () => {
  // Issue 187. A plain sign-out used to keep every record of the account on
  // the device. Now it keeps only the partitions that hold work (record 0113).
  const backend = createBackend('signout-keeps-work');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const other = randomUUID();
  const busy = randomUUID();
  const idle = randomUUID();
  const otherIdle = randomUUID();
  const file = randomUUID();
  const digest = 'd'.repeat(64);
  await queueOne(store, account, busy, file, 'waiting\n');
  await store.setAttachmentPinned(account, idle, digest, true);
  await store.setAttachmentPinned(other, otherIdle, digest, true);

  const events: string[] = [];
  await signOutKeepingWork(store, () => {
    events.push('revoke');
    return Promise.resolve();
  });

  assert.deepEqual(events, ['revoke']);
  assert.equal((await store.pending(account, busy)).length, 1);
  assert.equal(await store.isAttachmentPinned(account, idle, digest), false);
  assert.equal(await store.isAttachmentPinned(other, otherIdle, digest), false);
  await store.close();
});

await test('sign-out without an explicit discard is refused', async () => {
  const backend = createBackend('needs-discard');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  await queueOne(store, account, workspace, randomUUID(), 'pending\n');

  let revoked = false;
  await assert.rejects(
    signOut(store, account, [workspace], true, false, () => {
      revoked = true;
      return Promise.resolve();
    }),
    (error: unknown) =>
      error instanceof SignOutBlockedError && error.code === 'needs-discard',
  );
  assert.equal(revoked, false);
  assert.equal((await store.pending(account, workspace)).length, 1);

  await assert.rejects(
    signOut(store, account, [workspace], false, false, () => Promise.resolve()),
    (error: unknown) =>
      error instanceof SignOutBlockedError && error.code === 'needs-discard',
  );
  assert.equal(await store.hasSignOutMarker(account), false);
  await store.close();
});

await test('offline sign-out clears data, keeps the marker, revokes on reconnect', async () => {
  const backend = createBackend('offline-signout');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  await queueOne(store, account, workspace, file, 'pending\n');

  const order: string[] = [];
  await signOut(store, account, [workspace], false, true, () => {
    order.push('revoke-while-offline');
    return Promise.resolve();
  });
  // Offline sign-out never revokes: there is no connection for HttpOnly state.
  assert.deepEqual(order, []);
  assert.equal(await store.hasSignOutMarker(account), true);
  assert.deepEqual(await store.pending(account, workspace), []);
  assert.equal(
    await store.readDraft(account, workspace, `copy-${file.slice(0, 8)}`),
    null,
  );
  await store.close();

  // The marker survives a restart of the same browser profile.
  const reopened = await openLocalStore(origin, backend.options());
  assert.equal(await reopened.hasSignOutMarker(account), true);

  const reconnectOrder: string[] = [];
  const processed = await completePendingSignOut(reopened, account, () => {
    reconnectOrder.push('revoke');
    return Promise.resolve();
  });
  assert.equal(processed, true);
  reconnectOrder.push('marker-cleared');
  assert.deepEqual(reconnectOrder, ['revoke', 'marker-cleared']);
  assert.equal(await reopened.hasSignOutMarker(account), false);
  // Nothing left to revoke twice.
  assert.equal(
    await completePendingSignOut(reopened, account, () => Promise.resolve()),
    false,
  );
  await reopened.close();
});

await test('a failed revocation keeps the marker for the next reconnect', async () => {
  const backend = createBackend('revoke-fails');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  await store.setSignOutMarker(account);

  await assert.rejects(
    completePendingSignOut(store, account, () =>
      Promise.reject(new Error('the network dropped')),
    ),
  );
  assert.equal(await store.hasSignOutMarker(account), true);
  await store.close();
});

await test('recovery copies stay bound to the original account', async () => {
  const backend = createBackend('recovery');
  const store = await openLocalStore(origin, backend.options());
  const accountA = randomUUID();
  const accountB = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  await queueOne(store, accountA, workspace, file, 'private edit\n');

  const copied = await copyPendingToRecovery(
    store,
    accountA,
    workspace,
    'purged',
  );
  assert.equal(copied, 1);

  const keptA = await store.recover(accountA, workspace);
  assert.equal(keptA.length, 1);
  const firstKept = keptA[0];
  assert.ok(firstKept !== undefined, 'the recovery copy must exist');
  assert.equal(firstKept.text, 'private edit\n');
  assert.equal(firstKept.reason, 'purged');
  assert.equal(isRecordVisible(firstKept, accountA), true);
  assert.equal(isRecordVisible(firstKept, accountB), false);

  // The queue itself is kept for a later retry; the recovery copy is extra.
  assert.equal((await store.pending(accountA, workspace)).length, 1);

  // The other account sees nothing and cannot remove what it cannot name.
  assert.deepEqual(await store.recover(accountB, workspace), []);
  assert.deepEqual(await store.pending(accountB, workspace), []);

  const stored = await store.addRecovery(accountA, workspace, {
    fileId: randomUUID(),
    path: 'notes/extra.md',
    text: 'extra\n',
    reason: 'sign_out',
  });
  await store.removeRecovery(accountB, workspace, stored.recoveryId);
  assert.equal((await store.recover(accountA, workspace)).length, 2);
  await store.removeRecovery(accountA, workspace, stored.recoveryId);
  assert.equal((await store.recover(accountA, workspace)).length, 1);
  await store.close();
});

await test('pins are workspace scoped and logout keeps only the marker', async () => {
  const backend = createBackend('pins');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const other = randomUUID();

  await store.setAttachmentPinned(account, workspace, 'digest-1', true);
  await store.setHistoryPinned(account, workspace, 'revision-1', true);
  assert.equal(
    await store.isAttachmentPinned(account, workspace, 'digest-1'),
    true,
  );
  assert.equal(
    await store.isHistoryPinned(account, workspace, 'revision-1'),
    true,
  );
  assert.equal(
    await store.isAttachmentPinned(account, other, 'digest-1'),
    false,
  );
  assert.equal(
    await store.isHistoryPinned(account, other, 'revision-1'),
    false,
  );

  await store.setAttachmentPinned(account, workspace, 'digest-1', false);
  assert.equal(
    await store.isAttachmentPinned(account, workspace, 'digest-1'),
    false,
  );

  await store.setAttachmentPinned(account, workspace, 'digest-2', true);
  const file = randomUUID();
  await queueOne(store, account, workspace, file, 'pending\n');
  await signOut(store, account, [workspace], false, true, () =>
    Promise.resolve(),
  );
  assert.equal(
    await store.isAttachmentPinned(account, workspace, 'digest-2'),
    false,
  );
  assert.equal(
    await store.isHistoryPinned(account, workspace, 'revision-1'),
    false,
  );
  assert.equal(await store.hasSignOutMarker(account), true);
  await store.close();
});

/** A worker that waits and activates when it is asked to. */
function waitingWorker(): UpdateWorker & { readonly posted: string[] } {
  let state: ServiceWorkerState = 'installed';
  const listeners = new Set<() => void>();
  const posted: string[] = [];
  return {
    state: () => state,
    postMessage: (message) => {
      posted.push(message.type);
      queueMicrotask(() => {
        state = 'activated';
        for (const listener of [...listeners]) listener();
      });
    },
    onStateChange: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    posted,
  };
}

/** A registration with one worker that already waits. */
function registrationWith(worker: UpdateWorker): UpdateRegistration {
  return {
    waiting: () => worker,
    installing: () => null,
    update: () => Promise.resolve(),
  };
}

await test('two tabs store their text before the new version starts', async () => {
  // Record 0086. Two tabs share one database and one Web Lock, as two tabs
  // of one browser do. The second tab writes its last text only when the
  // first asks it to close, so the test proves that the update waits for it.
  const backend = createBackend('update-two-tabs');
  const storeA = await openLocalStore(origin, backend.options());
  const storeB = await openLocalStore(origin, backend.options());
  const lockA = holdTabLock(storeA, 'tab-a');
  const lockB = holdTabLock(storeB, 'tab-b');
  const inMemoryB = draftOf('account-1', 'workspace-1', 'file-b', '# B\n');
  const eventsB: string[] = [];
  let reloadedB = false;
  const selfHeard: string[] = [];
  const stopA = listenForUpdates('tab-a', (message) => {
    selfHeard.push(message.type);
  });
  const stopB = listenForUpdates('tab-b', (message) => {
    eventsB.push(message.type);
    if (message.type === 'NOTESAPP_UPDATE_SETTLED') {
      reloadedB = true;
      return;
    }
    void closeForUpdate({
      // The second tab is slow to store its text. The update must wait for
      // it however long it takes, so the lock and not the timing decides.
      flushDrafts: () =>
        new Promise((resolve) => setTimeout(resolve, 20)).then(() =>
          storeB.saveDraft(inMemoryB),
        ),
      stopQueue: () => Promise.resolve(),
      closeStore: () => storeB.close(),
      leave: lockB.leave,
    });
  });

  const worker = waitingWorker();
  let reloadedA = false;
  let storedAtStop: string | null = null;
  await runUpdate({
    registration: registrationWith(worker),
    flushDrafts: () =>
      storeA.saveDraft(draftOf('account-1', 'workspace-1', 'file-a', '# A\n')),
    stopQueue: async () => {
      storedAtStop =
        (await storeA.readDraft('account-1', 'workspace-1', 'copy-file-b'))
          ?.text ?? null;
    },
    closeStore: () => storeA.close(),
    tabs: lockA,
    post: (message) => {
      postUpdateMessage('tab-a', message);
    },
    reload: () => {
      reloadedA = true;
    },
  });
  assert.equal(reloadedA, true);
  assert.equal(storedAtStop, '# B\n');
  assert.deepEqual(worker.posted, ['NOTESAPP_SKIP_WAITING']);

  // The new version opens the database and reads the text of both tabs.
  const reopened = await openLocalStore(origin, backend.options());
  assert.equal(
    (await reopened.readDraft('account-1', 'workspace-1', 'copy-file-a'))?.text,
    '# A\n',
  );
  assert.equal(
    (await reopened.readDraft('account-1', 'workspace-1', 'copy-file-b'))?.text,
    '# B\n',
  );
  await reopened.close();
  // A channel message reaches its own tab too, so the sender is filtered.
  assert.deepEqual(selfHeard, []);
  await waitUntil(() => reloadedB);
  assert.deepEqual(eventsB, [
    'NOTESAPP_CLOSE_FOR_UPDATE',
    'NOTESAPP_UPDATE_SETTLED',
  ]);
  stopA();
  stopB();
  lockA.reopen();
  lockA.leave();
});

await test('a tab that cannot store its text keeps the update from starting', async () => {
  const backend = createBackend('update-kept-tab');
  const storeA = await openLocalStore(origin, backend.options());
  const storeB = await openLocalStore(origin, backend.options());
  const lockA = holdTabLock(storeA, 'tab-a', { timeoutMs: 50 });
  const lockB = holdTabLock(storeB, 'tab-b');
  let keptB: 'closed' | 'kept' | null = null;
  const stopB = listenForUpdates('tab-b', (message) => {
    if (message.type !== 'NOTESAPP_CLOSE_FOR_UPDATE') return;
    void closeForUpdate({
      flushDrafts: () => Promise.reject(new Error('quota')),
      stopQueue: () => Promise.resolve(),
      closeStore: () => storeB.close(),
      leave: lockB.leave,
    }).then((outcome) => {
      keptB = outcome;
    });
  });
  const worker = waitingWorker();
  let stopped = false;
  let reloaded = false;
  await assert.rejects(
    runUpdate({
      registration: registrationWith(worker),
      flushDrafts: () => Promise.resolve(),
      stopQueue: () => {
        stopped = true;
        return Promise.resolve();
      },
      closeStore: () => storeA.close(),
      tabs: lockA,
      post: (message) => {
        postUpdateMessage('tab-a', message);
      },
      reload: () => {
        reloaded = true;
      },
    }),
    (error: unknown) =>
      error instanceof UpdateFailedError && error.reason === 'other-tab-open',
  );
  assert.equal(keptB, 'kept');
  assert.equal(stopped, false);
  assert.equal(reloaded, false);
  assert.deepEqual(worker.posted, []);
  // Both tabs still read and write their own store.
  await storeA.saveDraft(draftOf('account-1', 'workspace-1', 'file-a', 'a'));
  await storeB.saveDraft(draftOf('account-1', 'workspace-1', 'file-b', 'b'));
  stopB();
  lockA.leave();
  lockB.leave();
  await storeA.close();
  await storeB.close();
});

await test('without Web Locks an update waits while another tab holds a live lease', async () => {
  const backend = createBackend('update-lease');
  const store = await openLocalStore(origin, backend.options());
  let now = 1_000_000;
  const held = await store.acquireLease('other-tab', now + 30_000);
  assert.equal(held, true);
  assert.equal(isLeaseExpired(now + 30_000, now), false);
  assert.equal(isLeaseExpired(now + 30_000, now + 30_001), true);
  const lease = await readWorkerLease(store);
  assert.deepEqual(lease, { ownerId: 'other-tab', expiresAt: now + 30_000 });

  const tabs = holdTabLock(store, 'this-tab', {
    locks: null,
    clock: () => now,
  });
  assert.equal(await tabs.closeOthers(), false);
  // After expiry the same tab may take over.
  now += 60_000;
  assert.equal(await tabs.closeOthers(), true);
  // The live lease of this tab never blocks its own update.
  await store.acquireLease('this-tab', now + 30_000);
  assert.equal(await tabs.closeOthers(), true);
  await store.close();
});
