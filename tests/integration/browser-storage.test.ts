/**
 * Local drafts, immutable checkpoints, and the sync queue.
 *
 * Dexie runs against `fake-indexeddb` here, injected through the Dexie
 * constructor options. That proves the transaction boundaries, the partition
 * keys, the local branch rule, and the failure kinds of this code. It does not
 * prove real browser durability: eviction, persistent storage permission,
 * private mode limits, and actual quota behavior differ per browser and per
 * device, and remain evidence for the authorized device stage.
 *
 * Every test builds its own `IDBFactory`, so runs never share state.
 */
import {
  documentStateVector,
  encodeDocumentDelta,
  readDocumentText,
  replaceDocumentText,
  startDocument,
} from '@notesapp/note-document';
import { markRelease04, storeRelease04Save } from './support/release-0-4.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import test from 'node:test';
import { IDBFactory, IDBKeyRange as FakeKeyRange } from 'fake-indexeddb';
import {
  contentDigest,
  type AcceptedChangeset,
  type AcceptedRevision,
} from '@notesapp/core';
import {
  isLocalStorageError,
  LocalStorageError,
  parkRefusedSave,
  type Draft,
  type LocalChange,
  type LocalStore,
  type QueueEntry,
} from '@notesapp/sync';
import {
  createDatabase,
  metaKey,
  migrationSteps,
  openLocalStore,
  partitionRange,
  type LocalStoreOptions,
  type MetaRow,
} from '@notesapp/storage-browser';

const origin = 'https://notes.example.test';

/** A counted clock, so every record carries a distinct client time. */
function createClock(): () => number {
  let current = Date.parse('2026-09-06T10:00:00.000Z');
  return () => {
    current += 1000;
    return current;
  };
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
  const name = `notesapp-${prefix}`;
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
  workingCopyId: string,
  text: string,
  extra: Partial<Draft> = {},
): Draft {
  return {
    accountId,
    workspaceId,
    workingCopyId,
    fileId,
    baseRevisionId: null,
    text,
    path: 'notes/one.md',
    deleted: false,
    sequence: 1,
    ...extra,
  };
}

/** Accepts every revision of a queued mutation, as the server would. */
function acceptanceOf(
  entry: QueueEntry | null,
  accountId: string,
  cursor: string,
): AcceptedChangeset {
  assert.ok(entry !== null, 'the mutation must be queued');
  const revisions: AcceptedRevision[] = entry.input.revisions.map(
    (revision) => ({
      revisionId: revision.id,
      fileId: revision.fileId,
      parents: revision.parents,
      path: revision.path,
      deleted: revision.deleted,
      // The workspace derives the text and its digest from the accepted
      // document, so the acceptance states what it wrote (record 0081).
      digest:
        revision.content.kind === 'attachment'
          ? revision.content.digest
          : 'a'.repeat(64),
      size: 0,
      actorAccountId: accountId,
      serverTime: '2026-09-06T12:00:00.000Z',
      message: revision.message,
      epoch: revision.content.kind === 'markdown' ? 1 : null,
      acceptedState: null,
      merged: false,
    }),
  );
  return {
    mutationId: entry.input.mutationId,
    revisionIds: revisions.map((revision) => revision.revisionId),
    cursor,
    revisions,
    superseded: [],
  };
}

/**
 * Wraps an IndexedDB factory so one store method fails on demand.
 *
 * A browser reports a full profile as a `QuotaExceededError` and a refused
 * transaction as an abort. `fake-indexeddb` simulates neither, so the test
 * injects the failure at the store boundary and checks that the whole
 * transaction rolls back and that the caller receives the right kind.
 */
function createFailingFactory(
  base: IDBFactory,
  failure: () => {
    store: string;
    method: string;
    error: Error;
    reject?: (args: readonly unknown[]) => boolean;
  } | null,
): IDBFactory {
  const bind = (target: object, property: string | symbol): unknown => {
    const value: unknown = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  };
  const wrapStore = (store: IDBObjectStore): IDBObjectStore =>
    new Proxy(store, {
      get(target, property) {
        const chosen = failure();
        if (
          chosen !== null &&
          chosen.store === target.name &&
          chosen.method === property
        )
          return (...args: readonly unknown[]): unknown => {
            if (chosen.reject === undefined || chosen.reject(args))
              throw chosen.error;
            const method: unknown = Reflect.get(target, property, target);
            if (typeof method !== 'function') return method;
            return Reflect.apply(method, target, args);
          };
        return bind(target, property);
      },
    });
  // Dexie builds its storage stack from `transaction.db`, so the wrapper has
  // to travel back through that member as well.
  const wrapTransaction = (transaction: IDBTransaction): IDBTransaction =>
    new Proxy(transaction, {
      get(target, property) {
        if (property === 'objectStore')
          return (name: string) => wrapStore(target.objectStore(name));
        if (property === 'db') return wrapDatabase(target.db);
        return bind(target, property);
      },
    });
  const wrapDatabase = (database: IDBDatabase): IDBDatabase =>
    new Proxy(database, {
      get(target, property) {
        if (property === 'transaction')
          return (
            names: string | readonly string[],
            mode?: IDBTransactionMode,
          ) => {
            const stores = typeof names === 'string' ? names : [...names];
            return wrapTransaction(
              mode === undefined
                ? target.transaction(stores)
                : target.transaction(stores, mode),
            );
          };
        return bind(target, property);
      },
    });
  return new Proxy(base, {
    get(target, property) {
      if (property !== 'open') return bind(target, property);
      return (name: string, version?: number): IDBOpenDBRequest => {
        const request =
          version === undefined
            ? target.open(name)
            : target.open(name, version);
        return new Proxy(request, {
          get(requestTarget, requestProperty) {
            if (requestProperty === 'result') {
              const result: unknown = requestTarget.result;
              return result instanceof Object
                ? wrapDatabase(requestTarget.result)
                : result;
            }
            return bind(requestTarget, requestProperty);
          },
          set(requestTarget, requestProperty, value: unknown) {
            return Reflect.set(requestTarget, requestProperty, value);
          },
        });
      };
    },
  });
}

/** The stored meta record, or a test failure when the database holds none. */
async function storedMeta(
  tables: ReturnType<typeof createDatabase>['tables'],
): Promise<MetaRow> {
  const meta = await tables.meta.get(metaKey);
  assert.ok(meta !== undefined, 'the database holds no meta record');
  return meta;
}

/** Reads rows that the port does not expose, for storage level checks. */
async function withRawDatabase<T>(
  backend: Backend,
  run: (tables: ReturnType<typeof createDatabase>['tables']) => Promise<T>,
): Promise<T> {
  const { db, tables } = createDatabase(backend.name, {
    indexedDB: backend.factory,
    IDBKeyRange: FakeKeyRange,
  });
  await db.open();
  try {
    return await run(tables);
  } finally {
    db.close();
  }
}

await test('a draft save and a checkpoint commit as one transaction each', async () => {
  const backend = createBackend('basic');
  const store: LocalStore = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  const draft = draftOf(account, workspace, file, 'copy-a', '# One\n');

  await store.saveDraft(draft);
  assert.deepEqual(await store.readDraft(account, workspace, 'copy-a'), draft);
  assert.deepEqual(await store.readCachedNote(account, workspace, file), {
    fileId: file,
    path: 'notes/one.md',
    text: '# One\n',
    deleted: false,
    workingCopyId: 'copy-a',
    sequence: 1,
    baseRevisionId: null,
    stale: false,
    acceptedText: null,
    acceptedPath: null,
    acceptedRevisionId: null,
    // No checkpoint has started the document of the note yet.
    document: null,
  });

  const entry = await store.checkpoint(draft, null, 'text');
  assert.notEqual(entry, null);
  assert.equal(entry?.state, 'pending');
  assert.equal(entry?.digest, null);
  assert.equal(entry?.input.deviceId, 'device-basic');
  // A file the server has not accepted yet must not exist there.
  assert.deepEqual(entry?.input.expectedHeads, { [file]: null });
  const revision = entry?.input.revisions[0];
  assert.equal(revision?.parents.length, 0);
  // The save carries the work of this device, not its text (record 0081).
  assert.equal(revision?.content.kind, 'markdown');
  assert.equal(
    revision?.content.kind === 'markdown'
      ? revision.content.document.work.kind
      : null,
    'update',
  );

  const checkpoints = await store.listCheckpoints(account, workspace, file);
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0]?.accepted, false);
  assert.equal(checkpoints[0]?.message, null);
  assert.deepEqual(await store.pending(account, workspace), [entry]);
  await store.close();
});

await test('a deletion checkpoint submits a tombstone with no text', async () => {
  const backend = createBackend('tombstone');
  const store: LocalStore = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  const draft = draftOf(account, workspace, file, 'copy-a', '# Body\n');

  await store.saveDraft(draft);
  assert.notEqual(await store.checkpoint(draft, null, 'text'), null);

  const removed = { ...draft, deleted: true, sequence: 2 };
  await store.saveDraft(removed);
  const entry = await store.checkpoint(removed, null, 'text');
  const revision = entry?.input.revisions[0];
  assert.equal(revision?.deleted, true);
  // A deletion carries no text work at all. It states the complete state
  // that this device had seen, so the workspace can refuse a deletion that
  // would hide an edit of another device (record 0083).
  assert.equal(
    revision?.content.kind === 'markdown'
      ? revision.content.document.work.kind
      : null,
    'none',
  );
  assert.ok(
    revision?.content.kind === 'markdown' &&
      (revision.content.document.observed?.byteLength ?? 0) > 0,
  );
  await store.close();
});

await test('an unchanged checkpoint is suppressed and a named one is not', async () => {
  const backend = createBackend('unchanged');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  const draft = draftOf(account, workspace, file, 'copy-a', 'text\n');

  await store.saveDraft(draft);
  assert.notEqual(await store.checkpoint(draft, null, 'text'), null);
  assert.equal(await store.checkpoint(draft, null, 'text'), null);
  assert.notEqual(
    await store.checkpoint(draft, 'before the rewrite', 'text'),
    null,
  );

  const changed = { ...draft, text: 'text and more\n', sequence: 2 };
  await store.saveDraft(changed);
  assert.notEqual(await store.checkpoint(changed, null, 'text'), null);

  const checkpoints = await store.listCheckpoints(account, workspace, file);
  assert.deepEqual(
    checkpoints.map((entry) => entry.message),
    [null, 'before the rewrite', null],
  );
  // Every checkpoint after the first has exactly one parent, and it is the
  // previous checkpoint of the same working copy.
  assert.deepEqual(checkpoints[1]?.parents, [checkpoints[0]?.revisionId]);
  assert.deepEqual(checkpoints[2]?.parents, [checkpoints[1]?.revisionId]);
  await store.close();
});

await test('an unchanged working copy of an accepted file writes nothing', async () => {
  const backend = createBackend('accepted');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  const first = draftOf(account, workspace, file, 'copy-a', 'body\n');
  await store.saveDraft(first);
  const entry = await store.checkpoint(first, null, 'text');
  const revisionId = entry?.input.revisions[0]?.id ?? '';
  await store.acknowledge(account, acceptanceOf(entry, account, '10'));
  await withRawDatabase(backend, async (tables) => {
    await tables.drafts.delete([origin, account, workspace, 'copy-a']);
  });
  assert.deepEqual(await store.readCachedNote(account, workspace, file), {
    fileId: file,
    path: 'notes/one.md',
    text: 'body\n',
    deleted: false,
    sequence: 0,
    baseRevisionId: revisionId,
    stale: false,
    acceptedText: null,
    acceptedPath: 'notes/one.md',
    acceptedRevisionId: revisionId,
    document: await store.readNoteDocument(account, workspace, file),
  });

  // A second tab opens the accepted head and leaves without typing.
  const reopened = draftOf(account, workspace, file, 'copy-b', 'body\n', {
    baseRevisionId: revisionId,
  });
  await store.saveDraft(reopened);
  assert.equal(await store.checkpoint(reopened, null, 'text'), null);
  assert.deepEqual(await store.pending(account, workspace), []);
  await store.close();
});

await test('a cached local deletion does not reopen accepted content', async () => {
  const backend = createBackend('deleted-cache');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  const deleted = {
    ...draftOf(account, workspace, file, 'copy-a', 'old body\n'),
    deleted: true,
  };

  await store.saveDraft(deleted);

  assert.deepEqual(await store.readCachedNote(account, workspace, file), {
    fileId: file,
    path: 'notes/one.md',
    text: 'old body\n',
    deleted: true,
    workingCopyId: 'copy-a',
    sequence: 1,
    baseRevisionId: null,
    stale: false,
    acceptedText: null,
    acceptedPath: null,
    acceptedRevisionId: null,
    // No checkpoint has started the document of the note yet.
    document: null,
  });
  await store.close();
});

await test('two working copies of one file create ordered local saves', async () => {
  const backend = createBackend('branch');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();

  const base = draftOf(account, workspace, file, 'copy-a', 'start\n');
  await store.saveDraft(base);
  const first = await store.checkpoint(base, null, 'text');
  const firstRevision = first?.input.revisions[0]?.id ?? '';
  await store.acknowledge(account, acceptanceOf(first, account, '11'));

  // Two tabs open the same accepted head and both edit it.
  const tabA = draftOf(account, workspace, file, 'copy-a2', 'start and A\n', {
    baseRevisionId: firstRevision,
  });
  const tabB = draftOf(account, workspace, file, 'copy-b2', 'start and B\n', {
    baseRevisionId: firstRevision,
  });
  await store.saveDraft(tabA);
  await store.saveDraft(tabB);
  const fromA = await store.checkpoint(tabA, null, 'text');
  const fromB = await store.checkpoint(tabB, null, 'text');
  const revisionA = fromA?.input.revisions[0]?.id ?? '';
  const revisionB = fromB?.input.revisions[0]?.id ?? '';
  assert.notEqual(revisionA, revisionB);
  // Both name the accepted head that their tab read. The server rebases the
  // later save on the earlier one and reports the head that it passed, so the
  // person is told that the text of the first tab moved into history.
  assert.deepEqual(fromA?.input.revisions[0]?.parents, [firstRevision]);
  assert.deepEqual(fromB?.input.revisions[0]?.parents, [firstRevision]);

  const file2 = await withRawDatabase(backend, (tables) =>
    tables.acceptedFiles.get([origin, account, workspace, file]),
  );
  // The newest local save is the local head, and both texts are kept: the
  // first tab's checkpoint stays until the server acknowledges it.
  assert.equal(file2?.localHeadRevisionId, revisionB);
  assert.equal(file2?.acceptedHeadRevisionId, firstRevision);
  const kept = await store.listCheckpoints(account, workspace, file);
  assert.deepEqual(
    kept.map((checkpoint) => checkpoint.revisionId).sort(),
    [firstRevision, revisionA, revisionB].sort(),
  );

  await store.markSending(
    account,
    fromA?.input.mutationId ?? '',
    'branch-a-digest',
  );
  await store.acknowledge(account, acceptanceOf(fromA, account, '12'));
  const sibling = (await store.pending(account, workspace)).find(
    (entry) => entry.input.mutationId === fromB?.input.mutationId,
  );
  // The later save remains queued with the accepted head that it observed.
  // Its precondition is not advanced here, because its revision is not a
  // child of the accepted revision. The server therefore rebases it and
  // reports the head of the first tab as superseded.
  assert.deepEqual(sibling?.input.expectedHeads, {
    [file]: firstRevision,
  });

  // The precondition moves to the head that the server accepted, exactly as
  // the sync engine does after a refused precondition.
  const moved = await store.reparentQueueEntry(
    account,
    fromB?.input.mutationId ?? '',
    { [file]: revisionA },
  );
  assert.deepEqual(moved?.input.expectedHeads, { [file]: revisionA });
  assert.equal(moved?.state, 'pending');
  assert.equal(moved?.digest, null);
  await store.close();
});

await test('a discarded deletion leaves the note in its accepted state', async () => {
  const backend = createBackend('discard');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();

  const base = draftOf(account, workspace, file, 'copy-a', 'body\n');
  await store.saveDraft(base);
  const created = await store.checkpoint(base, null, 'text');
  const acceptedHead = created?.input.revisions[0]?.id ?? '';
  await store.acknowledge(account, acceptanceOf(created, account, '10'));

  // The person deletes the note, and the server refuses the deletion because
  // the note changed on another device.
  const removal = {
    ...draftOf(account, workspace, file, 'copy-a', '', {
      baseRevisionId: acceptedHead,
      sequence: 2,
    }),
    deleted: true,
  };
  await store.saveDraft(removal);
  const queued = await store.checkpoint(removal, null, 'text');
  assert.ok(queued !== null);
  await store.discardQueueEntry(account, queued.input.mutationId);

  assert.deepEqual(await store.pending(account, workspace), []);
  const kept = await store.listCheckpoints(account, workspace, file);
  assert.deepEqual(
    kept.map((checkpoint) => checkpoint.revisionId),
    [acceptedHead],
  );
  const row = await withRawDatabase(backend, (tables) =>
    tables.acceptedFiles.get([origin, account, workspace, file]),
  );
  assert.equal(row?.deleted, false);
  assert.equal(row?.localHeadRevisionId, acceptedHead);
  assert.equal(row?.acceptedHeadRevisionId, acceptedHead);
  // The tombstone draft that recorded the refused deletion is gone, so it
  // cannot shadow the note that stays live.
  assert.equal(await store.readDraft(account, workspace, 'copy-a'), null);
  const drafts = await withRawDatabase(backend, (tables) =>
    tables.drafts
      .where('[serverOrigin+accountId+workspaceId+fileId]')
      .equals([origin, account, workspace, file])
      .toArray(),
  );
  assert.deepEqual(drafts, []);
  await store.close();
});

await test('a failed transaction leaves no checkpoint, content, or queue entry', async () => {
  const backend = createBackend('abort');
  let failing = false;
  const factory = createFailingFactory(backend.factory, () =>
    failing
      ? {
          store: 'queue',
          method: 'add',
          error: new DOMException('forced abort', 'AbortError'),
        }
      : null,
  );
  const store = await openLocalStore(
    origin,
    backend.options({ indexedDB: factory }),
  );
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  const draft = draftOf(account, workspace, file, 'copy-a', 'first\n');
  await store.saveDraft(draft);
  const accepted = await store.checkpoint(draft, null, 'text');
  assert.notEqual(accepted, null);

  failing = true;
  const changed = { ...draft, text: 'second\n', sequence: 2 };
  await store.saveDraft(changed);
  const error: unknown = await store.checkpoint(changed, null, 'text').then(
    () => null,
    (reason: unknown) => reason,
  );
  assert.ok(isLocalStorageError(error), 'the failure must be typed');
  assert.equal(error.kind, 'aborted');

  failing = false;
  // The first checkpoint is intact and the failed one wrote nothing.
  const checkpoints = await store.listCheckpoints(account, workspace, file);
  assert.equal(checkpoints.length, 1);
  assert.equal((await store.pending(account, workspace)).length, 1);
  const digests = await withRawDatabase(backend, async (tables) => {
    const range = partitionRange(origin, account, workspace);
    const rows = await tables.contents
      .where('[serverOrigin+accountId+workspaceId+digest]')
      .between(range.lower, range.upper, true, true)
      .toArray();
    return rows.map((row) => row.digest);
  });
  assert.deepEqual(digests, [await contentDigest('first\n')]);
  await store.close();
});

await test('a full profile reports the quota failure kind', async () => {
  const backend = createBackend('quota');
  let failing = false;
  const factory = createFailingFactory(backend.factory, () =>
    failing
      ? {
          store: 'contents',
          method: 'put',
          error: new DOMException('no space left', 'QuotaExceededError'),
        }
      : null,
  );
  const store = await openLocalStore(
    origin,
    backend.options({ indexedDB: factory }),
  );
  const account = randomUUID();
  const workspace = randomUUID();
  const draft = draftOf(account, workspace, randomUUID(), 'copy-a', 'a note\n');
  await store.saveDraft(draft);
  failing = true;
  const error: unknown = await store.checkpoint(draft, null, 'text').then(
    () => null,
    (reason: unknown) => reason,
  );
  assert.ok(isLocalStorageError(error));
  assert.equal(error.kind, 'quota');
  // The message names the operation and carries no note text.
  assert.match(error.message, /creating a checkpoint/u);
  assert.doesNotMatch(error.message, /a note/u);
  failing = false;
  assert.deepEqual(await store.pending(account, workspace), []);
  await store.close();
});

await test('acknowledgment preserves later drafts and checkpoints', async () => {
  const backend = createBackend('ack');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  const draft = draftOf(account, workspace, file, 'copy-a', 'one\n');
  await store.saveDraft(draft);
  const submitted = await store.checkpoint(draft, null, 'text');
  const submittedRevision = submitted?.input.revisions[0]?.id ?? '';
  const mutationId = submitted?.input.mutationId ?? '';

  // The user keeps typing while the mutation is in flight.
  const later = { ...draft, text: 'one and two\n', sequence: 2 };
  await store.saveDraft(later);
  const laterEntry = await store.checkpoint(later, null, 'text');
  assert.notEqual(laterEntry, null);
  assert.equal(laterEntry?.state, 'pending');
  assert.deepEqual(laterEntry?.input.expectedHeads, { [file]: null });
  assert.deepEqual(laterEntry?.input.revisions[0]?.parents, [
    submittedRevision,
  ]);

  await store.markSending(account, mutationId, 'digest-1');
  const sending = await store.pending(account, workspace);
  assert.equal(sending[0]?.state, 'sending');
  assert.equal(sending[0]?.digest, 'digest-1');
  // The digest freezes: a second send cannot describe another request.
  await store.markSending(account, mutationId, 'digest-2');
  assert.equal(
    (await store.pending(account, workspace))[0]?.digest,
    'digest-1',
  );

  await store.acknowledge(account, acceptanceOf(submitted, account, '42'));
  const remaining = await store.pending(account, workspace);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]?.input.mutationId, laterEntry?.input.mutationId);
  assert.deepEqual(remaining[0]?.input.expectedHeads, {
    [file]: submittedRevision,
  });

  const checkpoints = await store.listCheckpoints(account, workspace, file);
  assert.deepEqual(
    checkpoints.map((entry) => entry.accepted),
    [true, false],
  );
  assert.deepEqual(await store.readDraft(account, workspace, 'copy-a'), later);

  const record = await withRawDatabase(backend, (tables) =>
    tables.acceptedFiles.get([origin, account, workspace, file]),
  );
  assert.equal(record?.acceptedHeadRevisionId, submittedRevision);
  // The local head still names the newer checkpoint.
  assert.equal(record?.localHeadRevisionId, laterEntry?.input.revisions[0]?.id);
  await store.close();
});

await test('acknowledging one mutation twice changes nothing', async () => {
  const backend = createBackend('replay');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  const draft = draftOf(account, workspace, file, 'copy-a', 'one\n');
  await store.saveDraft(draft);
  const entry = await store.checkpoint(draft, null, 'text');
  const result = acceptanceOf(entry, account, '7');

  await store.acknowledge(account, result);
  const afterFirst = await withRawDatabase(backend, (tables) =>
    tables.acceptedFiles.get([origin, account, workspace, file]),
  );
  await store.acknowledge(account, result);
  const afterSecond = await withRawDatabase(backend, (tables) =>
    tables.acceptedFiles.get([origin, account, workspace, file]),
  );
  assert.deepEqual(afterSecond, afterFirst);
  assert.deepEqual(await store.pending(account, workspace), []);
  assert.equal(
    (await store.listCheckpoints(account, workspace, file)).length,
    1,
  );
  await store.close();
});

await test('an acknowledgment tells every tab that the queue changed', async () => {
  // Only the lease tab sends, and the sidebar of every other tab reads the
  // queue again on a queue change. An acknowledgment that only named the file
  // left those tabs on "Sending your save" after the save reached the server,
  // and kept the background engine of a drained workspace running.
  const backend = createBackend('acknowledged-queue');
  const store = await openLocalStore(origin, backend.options());
  const otherStore = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  const draft = draftOf(account, workspace, file, 'copy-a', 'one\n');
  await store.saveDraft(draft);
  const entry = await store.checkpoint(draft, null, 'text');
  const changes: string[] = [];
  const unsubscribe = otherStore.subscribe((change) => {
    changes.push(`${change.kind}:${change.workspaceId}:${change.fileId ?? ''}`);
  });
  await store.acknowledge(account, acceptanceOf(entry, account, '7'));
  assert.deepEqual(await otherStore.pending(account, workspace), []);
  assert.ok(
    changes.includes(`queue:${workspace}:${file}`),
    changes.join(', '),
  );
  unsubscribe();
  await otherStore.close();
  await store.close();
});

await test('one account cannot see the records of another', async () => {
  const backend = createBackend('partition');
  const store = await openLocalStore(origin, backend.options());
  const accountA = randomUUID();
  const accountB = randomUUID();
  const workspace = randomUUID();
  const otherWorkspace = randomUUID();
  const file = randomUUID();

  const draft = draftOf(accountA, workspace, file, 'copy-a', 'private\n');
  await store.saveDraft(draft);
  await store.checkpoint(draft, null, 'text');

  assert.equal(await store.readDraft(accountB, workspace, 'copy-a'), null);
  assert.equal(await store.readDraft(accountA, otherWorkspace, 'copy-a'), null);
  assert.deepEqual(await store.pending(accountB, workspace), []);
  assert.deepEqual(await store.pending(accountA, otherWorkspace), []);
  assert.deepEqual(await store.listCheckpoints(accountB, workspace, file), []);
  assert.deepEqual(await store.recover(accountB, workspace), []);

  // The other account also cannot change a mutation it can name.
  const entries = await store.pending(accountA, workspace);
  const mutationId = entries[0]?.input.mutationId ?? '';
  await store.markConflict(accountB, mutationId);
  assert.equal((await store.pending(accountA, workspace))[0]?.state, 'pending');
  await store.markConflict(accountA, mutationId);
  assert.equal(
    (await store.pending(accountA, workspace))[0]?.state,
    'conflict',
  );
  await store.close();
});

await test('the queued workspaces of an account name only the ones with work', async () => {
  // Record 0050. The application runs a sync engine for the open workspace and
  // for every workspace this call names, so a save that a person leaves behind
  // still reaches the server.
  const backend = createBackend('queued-workspaces');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const stranger = randomUUID();
  const withWork = randomUUID();
  const alsoWithWork = randomUUID();
  const quiet = randomUUID();

  assert.deepEqual(await store.queuedWorkspaces(account), []);

  for (const workspace of [withWork, alsoWithWork]) {
    const draft = draftOf(
      account,
      workspace,
      randomUUID(),
      `copy-${workspace}`,
      'queued\n',
    );
    await store.saveDraft(draft);
    await store.checkpoint(draft, null, 'text');
  }
  // A draft alone is not queued work. Only a checkpoint queues a mutation, so
  // this workspace stays out of the answer.
  await store.saveDraft(
    draftOf(account, quiet, randomUUID(), 'copy-quiet', 'not queued yet\n'),
  );
  // Another account's queue belongs to that account.
  const theirs = draftOf(
    stranger,
    randomUUID(),
    randomUUID(),
    'copy-stranger',
    'theirs\n',
  );
  await store.saveDraft(theirs);
  await store.checkpoint(theirs, null, 'text');

  assert.deepEqual(
    [...(await store.queuedWorkspaces(account))].sort(),
    [withWork, alsoWithWork].sort(),
  );

  // A workspace leaves the answer when its queue drains, which is what stops
  // its background engine.
  const entries = await store.pending(account, withWork);
  const first = entries[0] ?? null;
  await store.acknowledge(account, acceptanceOf(first, account, '1'));
  assert.deepEqual(await store.queuedWorkspaces(account), [alsoWithWork]);
  await store.close();
});

await test('an interrupted migration is completed on the next open', async () => {
  const backend = createBackend('migration');
  const first = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  const draft = draftOf(account, workspace, file, 'copy-a', 'kept\n');
  await first.saveDraft(draft);
  await first.checkpoint(draft, null, 'text');
  await first.close();

  await withRawDatabase(backend, async (tables) => {
    const meta = await storedMeta(tables);
    assert.equal(meta.migrationState, 'complete');
    await tables.meta.put({ ...meta, migrationState: 'in-progress' });
  });

  const second = await openLocalStore(origin, backend.options());
  const repaired = await withRawDatabase(backend, (tables) =>
    tables.meta.get(metaKey),
  );
  assert.equal(repaired?.migrationState, 'complete');
  // Pending work survived the repair.
  assert.equal((await second.pending(account, workspace)).length, 1);
  assert.deepEqual(await second.readDraft(account, workspace, 'copy-a'), draft);
  await second.close();
});

/** The requested row count of an IndexedDB getAll call. */
function getAllCount(args: readonly unknown[]): number | null {
  const count = args[1];
  if (typeof count === 'number') return count;
  const options = args[0];
  if (typeof options !== 'object' || options === null) return null;
  const optionCount: unknown = Reflect.get(options, 'count');
  return typeof optionCount === 'number' ? optionCount : null;
}

await test('migration repair validates records in bounded batches', async () => {
  const backend = createBackend('cursor-migration');
  const first = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  for (let index = 0; index < 120; index += 1)
    await first.saveDraft(
      draftOf(
        account,
        workspace,
        randomUUID(),
        `copy-${String(index)}`,
        `kept ${String(index)}\n`,
      ),
    );
  await first.close();

  await withRawDatabase(backend, async (tables) => {
    const meta = await tables.meta.get(metaKey);
    assert.ok(meta !== undefined);
    await tables.meta.put({ ...meta, migrationState: 'in-progress' });
  });

  let migrationIsRunning = true;
  const noWholeDraftRead = createFailingFactory(backend.factory, () =>
    migrationIsRunning
      ? {
          store: 'drafts',
          method: 'getAll',
          error: new Error('migration read an unbounded drafts batch'),
          reject: (args) => {
            const count = getAllCount(args);
            return count === null || count > 100;
          },
        }
      : null,
  );
  const repaired = await openLocalStore(
    origin,
    backend.options({ indexedDB: noWholeDraftRead }),
  );
  migrationIsRunning = false;
  assert.equal((await repaired.listLocalFiles(account, workspace)).length, 120);
  await repaired.close();
});

await test('a record upgrade edits the stored rows of a real database', async () => {
  // The upgrades of version 3 and version 4 write through the stored record
  // itself, so they run over real rows here and not over a hand built object.
  // Version 3 gives every queue entry an error code. Version 4 removes what
  // the conflict branch feature wrote and drops the two recovery reasons that
  // no shipped path can produce.
  const backend = createBackend('record-upgrade');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  const draft = draftOf(account, workspace, file, 'copy-a', 'kept\n');
  await store.saveDraft(draft);
  const queued = await store.checkpoint(draft, null, 'text');
  assert.ok(queued !== null);
  await store.close();

  const key = [origin, account, workspace, queued.input.mutationId];
  await withRawDatabase(backend, async (tables) => {
    // Put the stored records back in the shape of the earlier release. The
    // edit runs through `modify`, which hands over the stored record itself,
    // so the test writes the older shape without claiming the newer one.
    await tables.queue.toCollection().modify((value) => {
      const stored: Record<string, unknown> = value;
      delete stored['errorCode'];
      stored['conflictGroupId'] = randomUUID();
      stored['branchMutationId'] = randomUUID();
      stored['branchState'] = 'open';
    });
    await tables.recovery.put({
      serverOrigin: origin,
      accountId: account,
      workspaceId: workspace,
      recoveryId: randomUUID(),
      fileId: file,
      path: 'notes/revoked.md',
      text: 'text\n',
      reason: 'purged',
      code: null,
      mutationId: null,
      createdAt: '2026-09-06T10:00:00.000Z',
    });
    await tables.recovery.toCollection().modify((value) => {
      const stored: Record<string, unknown> = value;
      stored['reason'] = 'access_revoked';
    });
  });

  await withRawDatabase(backend, async (tables) => {
    for (const from of [2, 3] as const) {
      const upgrade = migrationSteps.find((entry) => entry.from === from);
      assert.ok(upgrade !== undefined, `the upgrade from ${String(from)}`);
      await upgrade.run(tables);
    }
  });

  await withRawDatabase(backend, async (tables) => {
    const row = await tables.queue.get(key);
    assert.ok(row !== undefined);
    const upgraded: Record<string, unknown> = { ...row };
    assert.equal(upgraded['errorCode'], null);
    assert.equal('conflictGroupId' in upgraded, false);
    assert.equal('branchMutationId' in upgraded, false);
    assert.equal('branchState' in upgraded, false);
    assert.deepEqual(await tables.recovery.toArray(), []);
  });

  // The upgraded database opens, so every row still matches its validator.
  const reopened = await openLocalStore(origin, backend.options());
  assert.equal(
    (await reopened.pending(account, workspace)).length,
    1,
    'the queued mutation survived the upgrade',
  );
  await reopened.close();
});

await test('a database this application cannot read is refused', async () => {
  const newer = createBackend('newer');
  const opened = await openLocalStore(origin, newer.options());
  await opened.close();
  await withRawDatabase(newer, async (tables) => {
    const meta = await storedMeta(tables);
    await tables.meta.put({ ...meta, schemaVersion: 99 });
  });
  await assert.rejects(
    openLocalStore(origin, newer.options()),
    (error: unknown) =>
      error instanceof LocalStorageError && error.kind === 'corrupt',
  );

  const broken = createBackend('broken');
  const store = await openLocalStore(origin, broken.options());
  const account = randomUUID();
  const workspace = randomUUID();
  await store.saveDraft(
    draftOf(account, workspace, randomUUID(), 'copy-a', 'text\n'),
  );
  await store.close();
  await withRawDatabase(broken, async (tables) => {
    const meta = await storedMeta(tables);
    await tables.meta.put({ ...meta, migrationState: 'in-progress' });
    // A record whose shape this application does not accept.
    const rows = await tables.drafts.toArray();
    const row = rows[0];
    assert.ok(row !== undefined);
    await tables.drafts.put({ ...row, sequence: Number.NaN });
  });
  await assert.rejects(
    openLocalStore(origin, broken.options()),
    (error: unknown) =>
      error instanceof LocalStorageError && error.kind === 'corrupt',
  );
});

await test('local save and cached opening stay inside their targets', async () => {
  const backend = createBackend('latency');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  // A typical note in the design's corpus is 5 to 20 KiB.
  const body = 'The quick brown fox jumps over the lazy dog.\n'.repeat(300);
  const saveSamples: number[] = [];
  for (let index = 0; index < 60; index += 1) {
    const draft = draftOf(
      account,
      workspace,
      file,
      'copy-a',
      `${body}${String(index)}\n`,
      { sequence: index + 1 },
    );
    const started = performance.now();
    await store.saveDraft(draft);
    saveSamples.push(performance.now() - started);
  }
  const readSamples: number[] = [];
  for (let index = 0; index < 60; index += 1) {
    const started = performance.now();
    const cached = await store.readCachedNote(account, workspace, file);
    readSamples.push(performance.now() - started);
    assert.equal(cached?.text.endsWith(`${String(59)}\n`), true);
  }
  saveSamples.sort((left, right) => left - right);
  readSamples.sort((left, right) => left - right);
  const at = (samples: readonly number[], fraction: number): number =>
    samples[
      Math.min(samples.length - 1, Math.ceil(samples.length * fraction) - 1)
    ] ?? 0;
  process.stdout.write(
    `draft save over ${String(saveSamples.length)} runs: p50 ${at(saveSamples, 0.5).toFixed(2)} ms, ` +
      `p95 ${at(saveSamples, 0.95).toFixed(2)} ms, max ${(saveSamples.at(-1) ?? 0).toFixed(2)} ms ` +
      `(fake-indexeddb in Node, not browser durability)\n`,
  );
  process.stdout.write(
    `cached note open over ${String(readSamples.length)} runs: p50 ${at(readSamples, 0.5).toFixed(2)} ms, ` +
      `p95 ${at(readSamples, 0.95).toFixed(2)} ms, max ${(readSamples.at(-1) ?? 0).toFixed(2)} ms ` +
      `(fake-indexeddb in Node, not a browser paint)\n`,
  );
  assert.ok(
    at(saveSamples, 0.95) < 150,
    `the save target is 150 ms, measured ${at(saveSamples, 0.95).toFixed(2)} ms`,
  );
  assert.ok(
    at(readSamples, 0.95) < 150,
    `the cached open target is 150 ms, measured ${at(readSamples, 0.95).toFixed(2)} ms`,
  );
  await store.close();
});

await test('local files and save state follow committed writes per file', async () => {
  const backend = createBackend('reactive-files');
  const store = await openLocalStore(origin, backend.options());
  const otherStore = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const firstFile = randomUUID();
  const secondFile = randomUUID();
  const changes: string[] = [];
  const otherChanges: string[] = [];
  const unsubscribe = store.subscribe((change) => {
    changes.push(`${change.kind}:${change.fileId ?? 'workspace'}`);
  });
  const unsubscribeOther = otherStore.subscribe((change) => {
    otherChanges.push(`${change.kind}:${change.fileId ?? 'workspace'}`);
  });
  const first = draftOf(account, workspace, firstFile, 'copy-a', 'first\n', {
    sequence: 1,
  });
  const second = draftOf(account, workspace, secondFile, 'copy-b', 'second\n', {
    path: 'notes/two.md',
    sequence: 1,
  });
  await store.saveDraft(first);
  await store.saveDraft(second);
  assert.deepEqual(
    (await store.listLocalFiles(account, workspace)).map((file) => file.path),
    ['notes/one.md', 'notes/two.md'],
  );
  assert.equal(
    (await store.readFileSaveSnapshot(account, workspace, firstFile))
      .hasUncheckpointedDraft,
    true,
  );
  const queued = await store.checkpoint(first, null, 'text');
  assert.ok(queued !== null);
  const firstState = await store.readFileSaveSnapshot(
    account,
    workspace,
    firstFile,
  );
  const secondState = await store.readFileSaveSnapshot(
    account,
    workspace,
    secondFile,
  );
  assert.equal(firstState.latestMutationId, queued.input.mutationId);
  assert.equal(firstState.queueState, 'pending');
  assert.equal(firstState.hasUncheckpointedDraft, false);
  assert.equal(secondState.latestMutationId, null);
  assert.equal(secondState.hasUncheckpointedDraft, true);
  assert.deepEqual(changes, [
    `draft:${firstFile}`,
    `draft:${secondFile}`,
    `queue:${firstFile}`,
  ]);
  assert.deepEqual(otherChanges, changes);
  unsubscribe();
  unsubscribeOther();
  await otherStore.close();
  await store.close();
});

await test('an uncheckpointed draft still describes a note that is in sync', async () => {
  const backend = createBackend('leading-draft');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  const draft = draftOf(account, workspace, fileId, 'copy-a', 'saved\n');
  await store.saveDraft(draft);
  const queued = await store.checkpoint(draft, null, 'text');
  await store.acknowledge(account, acceptanceOf(queued, account, '2'));
  // Typing writes a draft and no checkpoint, so the accepted head does not
  // move. The text must survive a reload.
  await store.saveDraft({ ...draft, text: 'typed\n', sequence: 2 });

  const cached = await store.readCachedNote(account, workspace, fileId);
  assert.equal(cached?.text, 'typed\n');
  assert.deepEqual(
    (await store.listLocalFiles(account, workspace)).map((file) => file.path),
    ['notes/one.md'],
  );
  await store.close();
});

await test('a purge marker drops the note from the local file list', async () => {
  const backend = createBackend('purged-file');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  const draft = draftOf(account, workspace, fileId, 'copy-a', 'purge me\n');
  await store.saveDraft(draft);
  const queued = await store.checkpoint(draft, null, 'text');
  await store.acknowledge(account, acceptanceOf(queued, account, '7'));
  assert.deepEqual(
    (await store.listLocalFiles(account, workspace)).map((file) => file.fileId),
    [fileId],
  );

  // The ordered feed carries a purge as a file record with no revision, so
  // the local cache learns that the note is gone for good.
  await store.applyRemoteChanges(
    account,
    workspace,
    [{ file: null, purgedFileId: fileId }],
    '8',
  );

  assert.deepEqual(await store.listLocalFiles(account, workspace), []);
  assert.deepEqual(await store.listAcceptedFiles(account, workspace), []);
  assert.deepEqual(await store.listSearchFiles(account, workspace), []);
  assert.equal(await store.readCursor(account, workspace), '8');
  await store.close();
});

await test('a restore from the server puts a deleted note back in the tree', async () => {
  const backend = createBackend('restored-file');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  const draft = draftOf(account, workspace, fileId, 'copy-a', 'keep me\n');
  await store.saveDraft(draft);
  const saved = await store.checkpoint(draft, null, 'text');
  await store.acknowledge(account, acceptanceOf(saved, account, '3'));
  const removed = await store.checkpoint(
    { ...draft, deleted: true, text: '', sequence: 2 },
    null,
    'text',
  );
  await store.acknowledge(account, acceptanceOf(removed, account, '4'));
  assert.deepEqual(
    (await store.listLocalFiles(account, workspace)).map(
      (file) => file.deleted,
    ),
    [true],
  );

  const digest = await contentDigest('keep me\n');
  await store.applyRemoteChanges(
    account,
    workspace,
    [
      {
        file: {
          fileId,
          revisionId: 'restore-revision',
          path: 'notes/one.md',
          fileKind: 'note',
          document: null,
          deleted: false,
          digest,
          text: 'keep me\n',
        },
        purgedFileId: null,
      },
    ],
    '5',
  );

  const listed = await store.listLocalFiles(account, workspace);
  assert.deepEqual(
    listed.map((file) => ({ fileId: file.fileId, deleted: file.deleted })),
    [{ fileId, deleted: false }],
  );
  assert.deepEqual(
    (await store.listSearchFiles(account, workspace)).map((file) => file.path),
    ['notes/one.md'],
  );
  // The note opens with its content again: the draft of the deletion no
  // longer describes the file, because the server moved past it.
  const cached = await store.readCachedNote(account, workspace, fileId);
  assert.equal(cached?.deleted, false);
  assert.equal(cached?.text, 'keep me\n');
  await store.close();
});

await test('a restore reaches a device whose deletion draft holds the text', async () => {
  const backend = createBackend('restored-with-draft');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  const draft = draftOf(account, workspace, fileId, 'copy-a', 'keep me\n');
  await store.saveDraft(draft);
  const saved = await store.checkpoint(draft, null, 'text');
  await store.acknowledge(account, acceptanceOf(saved, account, '3'));

  // The editor deletes the note it has open, so the deletion draft keeps the
  // buffer while the tombstone revision carries no text.
  const removal = { ...draft, deleted: true, sequence: 2 };
  await store.saveDraft(removal);
  const removed = await store.checkpoint(removal, null, 'text');
  await store.acknowledge(account, acceptanceOf(removed, account, '4'));
  // The accepted head is the tombstone, so the accepted file states the
  // deletion. Nothing local moved past it.
  assert.deepEqual(
    (await store.listAcceptedFiles(account, workspace)).map(
      (file) => file.deleted,
    ),
    [true],
  );

  const digest = await contentDigest('keep me\n');
  await store.applyRemoteChanges(
    account,
    workspace,
    [
      {
        file: {
          fileId,
          revisionId: 'restore-revision',
          path: 'notes/one.md',
          fileKind: 'note',
          document: null,
          deleted: false,
          digest,
          text: 'keep me\n',
        },
        purgedFileId: null,
      },
    ],
    '5',
  );

  // A tombstone carries no text, so the text of the deletion draft is not
  // unsent work and the restore of the server wins.
  const listed = await store.listLocalFiles(account, workspace);
  assert.deepEqual(
    listed.map((file) => ({ fileId: file.fileId, deleted: file.deleted })),
    [{ fileId, deleted: false }],
  );
  const cached = await store.readCachedNote(account, workspace, fileId);
  assert.equal(cached?.deleted, false);
  assert.equal(cached?.text, 'keep me\n');

  // The tombstone draft goes with the deletion it recorded. A draft that
  // stayed would shadow every later edit of the note it names.
  assert.equal(await store.readDraft(account, workspace, 'copy-a'), null);
  await store.close();
});

await test('snapshot activation and clearing publish committed invalidations', async () => {
  const backend = createBackend('committed-invalidations');
  const store = await openLocalStore(origin, backend.options());
  const otherStore = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  const changes: string[] = [];
  const unsubscribe = otherStore.subscribe((change) => {
    changes.push(`${change.kind}:${change.fileId ?? 'all'}`);
  });
  const text = '# Snapshot\n';
  const digest = await contentDigest(text);
  await store.stageSnapshot(
    account,
    workspace,
    'snapshot-token',
    ['rev-1'],
    '7',
  );
  await store.storeSnapshotRevision(account, workspace, {
    token: 'snapshot-token',
    revisionId: 'rev-1',
    fileId: file,
    path: 'notes/snapshot.md',
    kind: 'note',
    deleted: false,
    digest,
    text,
    document: startDocument(text),
    epoch: 1,
    serverTime: null,
  });
  await store.activateSnapshot('snapshot-token');
  assert.deepEqual(changes, [`file:${file}`, 'cursor:all']);
  changes.length = 0;
  await store.clearPrivateData(account, workspace);
  assert.deepEqual(changes, ['reset:all']);
  unsubscribe();
  await otherStore.close();
  await store.close();
});

await test('browser stores share a fallback bus without BroadcastChannel', async () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'window',
  );
  const channelDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'BroadcastChannel',
  );
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {},
  });
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    configurable: true,
    value: undefined,
  });
  try {
    const backend = createBackend('browser-fallback-bus');
    const store = await openLocalStore(origin, backend.options());
    const otherStore = await openLocalStore(origin, backend.options());
    await store.close();
    const writingStore = await openLocalStore(origin, backend.options());
    const account = randomUUID();
    const workspace = randomUUID();
    const file = randomUUID();
    const changes: string[] = [];
    const unsubscribe = otherStore.subscribe((change) => {
      changes.push(`${change.kind}:${change.fileId ?? 'all'}`);
    });
    await writingStore.saveDraft(
      draftOf(account, workspace, file, 'copy-a', 'fallback text\n'),
    );
    assert.deepEqual(changes, [`draft:${file}`]);
    unsubscribe();
    await writingStore.close();
    await otherStore.close();
  } finally {
    if (windowDescriptor === undefined)
      Reflect.deleteProperty(globalThis, 'window');
    else Object.defineProperty(globalThis, 'window', windowDescriptor);
    if (channelDescriptor === undefined)
      Reflect.deleteProperty(globalThis, 'BroadcastChannel');
    else
      Object.defineProperty(globalThis, 'BroadcastChannel', channelDescriptor);
  }
});

await test('a draft that matches a newer accepted head is dropped on open', async () => {
  const backend = createBackend('draft-matches-head');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();

  // This device saves once and keeps typing, so a draft exists over the
  // accepted head it created.
  const first = draftOf(account, workspace, file, 'copy-a', 'one\n');
  await store.saveDraft(first);
  const entry = await store.checkpoint(first, null, 'text');
  const firstRevision = entry?.input.revisions[0]?.id ?? '';
  await store.acknowledge(account, acceptanceOf(entry, account, '10'));
  const shared = '# Shared\n';
  await store.saveDraft({ ...first, text: shared, sequence: 2 });

  // Another device saves exactly that text, and the change feed brings it.
  const remoteRevision = randomUUID();
  await store.applyRemoteChanges(
    account,
    workspace,
    [
      {
        file: {
          fileId: file,
          revisionId: remoteRevision,
          path: 'notes/one.md',
          fileKind: 'note',
          document: null,
          deleted: false,
          digest: await contentDigest(shared),
          text: shared,
        },
        purgedFileId: null,
      },
    ],
    '11',
  );

  const cached = await store.readCachedNote(account, workspace, file);
  assert.equal(cached?.stale, false);
  assert.equal(cached?.text, shared);
  // The draft says nothing the accepted head does not say, so it is gone and
  // the head is what opened.
  assert.equal(cached?.workingCopyId, undefined);
  assert.equal(cached?.baseRevisionId, remoteRevision);
  assert.equal(await store.readDraft(account, workspace, 'copy-a'), null);
  assert.notEqual(remoteRevision, firstRevision);
  await store.close();
});

await test('a draft over an older accepted head opens as stale', async () => {
  const backend = createBackend('draft-stale');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();

  const first = draftOf(account, workspace, file, 'copy-a', 'one\n');
  await store.saveDraft(first);
  const entry = await store.checkpoint(first, null, 'text');
  const firstRevision = entry?.input.revisions[0]?.id ?? '';
  await store.acknowledge(account, acceptanceOf(entry, account, '10'));
  await store.saveDraft({ ...first, text: 'my own text\n', sequence: 2 });

  const remoteText = '# From the other device\n';
  const remoteRevision = randomUUID();
  await store.applyRemoteChanges(
    account,
    workspace,
    [
      {
        file: {
          fileId: file,
          revisionId: remoteRevision,
          path: 'notes/one.md',
          fileKind: 'note',
          document: null,
          deleted: false,
          digest: await contentDigest(remoteText),
          text: remoteText,
        },
        purgedFileId: null,
      },
    ],
    '11',
  );

  const cached = await store.readCachedNote(account, workspace, file);
  assert.equal(cached?.stale, true);
  // Both texts reach the caller, so the person chooses and nothing is lost.
  assert.equal(cached?.text, 'my own text\n');
  assert.equal(cached?.acceptedText, remoteText);
  assert.equal(cached?.acceptedRevisionId, remoteRevision);
  assert.equal(cached?.baseRevisionId, firstRevision);
  assert.equal(cached?.workingCopyId, 'copy-a');

  // Keeping the text moves only its base, so the next save reaches the
  // server head instead of naming the one it replaced.
  await store.rebaseDraft(account, workspace, 'copy-a');
  const kept = await store.readCachedNote(account, workspace, file);
  assert.equal(kept?.stale, false);
  assert.equal(kept?.text, 'my own text\n');
  assert.equal(kept?.baseRevisionId, remoteRevision);
  const next = await store.checkpoint(
    {
      ...first,
      text: 'my own text\n',
      sequence: 3,
      baseRevisionId: kept?.baseRevisionId ?? null,
    },
    null,
    'text',
  );
  assert.deepEqual(next?.input.expectedHeads, { [file]: remoteRevision });
  assert.deepEqual(next?.input.revisions[0]?.parents, [remoteRevision]);
  await store.close();
});

await test('a working copy with nothing to recover follows a newer head', async () => {
  const backend = createBackend('settled-draft-follows');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  const first = 'one\n';

  // The note as the server holds it, and the flush an editor writes when it
  // opens the note and the person types nothing.
  await store.cacheServerNote(account, workspace, {
    fileId: file,
    path: 'notes/one.md',
    kind: 'note',
    revisionId: 'rev-1',
    digest: await contentDigest(first),
    text: first,
  });
  const opened = draftOf(account, workspace, file, 'copy-a', first, {
    baseRevisionId: 'rev-1',
  });
  await store.saveDraft(opened);

  const second = 'two\n';
  await store.applyRemoteChanges(
    account,
    workspace,
    [
      {
        file: {
          fileId: file,
          revisionId: 'rev-2',
          path: 'notes/one.md',
          fileKind: 'note',
          document: null,
          deleted: false,
          digest: await contentDigest(second),
          text: second,
        },
        purgedFileId: null,
      },
    ],
    '2',
  );

  // The working copy said only what the head it was written over said, so it
  // has nothing left to recover and it does not shadow the newer text.
  assert.equal(await store.readDraft(account, workspace, 'copy-a'), null);
  const cached = await store.readCachedNote(account, workspace, file);
  assert.equal(cached?.text, second);
  assert.equal(cached?.stale, false);
  assert.equal(cached?.baseRevisionId, 'rev-2');
  await store.close();
});

await test('a save names the accepted revision its content descends from', async () => {
  const backend = createBackend('precondition-of-parent');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();

  await store.cacheServerNote(account, workspace, {
    fileId: file,
    path: 'notes/one.md',
    kind: 'note',
    revisionId: 'rev-1',
    digest: await contentDigest('one\n'),
    text: 'one\n',
    document: startDocument('one\n'),
    epoch: 1,
  });
  // The person types over the text of `rev-1`, and the ordered feed brings a
  // version of another device before the version of this device is written.
  const typed = draftOf(account, workspace, file, 'copy-a', 'mine\n', {
    baseRevisionId: 'rev-1',
  });
  await store.saveDraft(typed);
  await store.applyRemoteChanges(
    account,
    workspace,
    [
      {
        file: {
          fileId: file,
          revisionId: 'rev-2',
          path: 'notes/one.md',
          fileKind: 'note',
          document: null,
          deleted: false,
          digest: await contentDigest('theirs\n'),
          text: 'theirs\n',
        },
        purgedFileId: null,
      },
    ],
    '2',
  );

  const queued = await store.checkpoint(typed, null, 'text');
  // The precondition names `rev-1`, which this text was written over. A
  // precondition of `rev-2` would tell the server that this save had read the
  // version of the other device, and the server would replace it in silence.
  assert.deepEqual(queued?.input.expectedHeads, { [file]: 'rev-1' });
  assert.deepEqual(queued?.input.revisions[0]?.parents, ['rev-1']);

  // A second version of the same working copy keeps naming that revision,
  // because the chain between them has not reached the server yet.
  const again = await store.checkpoint(
    { ...typed, text: 'mine again\n', sequence: 2 },
    null,
    'text',
  );
  assert.deepEqual(again?.input.expectedHeads, { [file]: 'rev-1' });
  await store.close();
});

await test('a deletion names the revision it removes, not a newer head', async () => {
  const backend = createBackend('precondition-of-deletion');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();

  await store.cacheServerNote(account, workspace, {
    fileId: file,
    path: 'notes/one.md',
    kind: 'note',
    revisionId: 'rev-1',
    digest: await contentDigest('one\n'),
    text: 'one\n',
    document: startDocument('one\n'),
    epoch: 1,
  });
  const typed = draftOf(account, workspace, file, 'copy-a', 'mine\n', {
    baseRevisionId: 'rev-1',
  });
  await store.saveDraft(typed);
  await store.applyRemoteChanges(
    account,
    workspace,
    [
      {
        file: {
          fileId: file,
          revisionId: 'rev-2',
          path: 'notes/one.md',
          fileKind: 'note',
          document: null,
          deleted: false,
          digest: await contentDigest('theirs\n'),
          text: 'theirs\n',
        },
        purgedFileId: null,
      },
    ],
    '2',
  );

  const [queued] = await store.trashFiles(account, workspace, [file]);
  // The server refuses a deletion whose precondition is behind the head, so
  // this value is what keeps a deletion from removing text this device never
  // read.
  assert.deepEqual(queued?.input.expectedHeads, { [file]: 'rev-1' });
  await store.close();
});

await test('a restore reaches a device that holds the replaced text', async () => {
  const backend = createBackend('restore-over-working-copy');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();

  // The note as this device wrote it and the server accepted it. The working
  // copy stays, because the editor is open on the note.
  const written = draftOf(account, workspace, file, 'copy-a', 'newest\n');
  await store.saveDraft(written);
  const entry = await store.checkpoint(written, null, 'text');
  await store.acknowledge(account, acceptanceOf(entry, account, '4'));

  // History restore writes an older version as the newest one on the server.
  await store.applyRemoteChanges(
    account,
    workspace,
    [
      {
        file: {
          fileId: file,
          revisionId: 'restored-revision',
          path: 'notes/one.md',
          fileKind: 'note',
          document: null,
          deleted: false,
          digest: await contentDigest('older\n'),
          text: 'older\n',
        },
        purgedFileId: null,
      },
    ],
    '5',
  );

  // The working copy held exactly the text the restore replaced, so it keeps
  // nothing. Without the drop the note would open with `newest` again and the
  // restore would read as an action that did nothing.
  assert.equal(await store.readDraft(account, workspace, 'copy-a'), null);
  const cached = await store.readCachedNote(account, workspace, file);
  assert.equal(cached?.text, 'older\n');
  assert.equal(cached?.stale, false);
  await store.close();
});

await test('a remote change keeps a draft that differs from it', async () => {
  const backend = createBackend('remote-keeps-draft');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();

  const first = draftOf(account, workspace, file, 'copy-a', 'one\n');
  await store.saveDraft(first);
  const entry = await store.checkpoint(first, null, 'text');
  const firstRevision = entry?.input.revisions[0]?.id ?? '';
  await store.acknowledge(account, acceptanceOf(entry, account, '10'));
  // The draft is renamed as well as retyped, so its identity is at stake.
  await store.saveDraft({
    ...first,
    text: 'my own text\n',
    path: 'notes/renamed.md',
    sequence: 2,
  });

  const remoteRevision = randomUUID();
  await store.applyRemoteChanges(
    account,
    workspace,
    [
      {
        file: {
          fileId: file,
          revisionId: remoteRevision,
          path: 'notes/one.md',
          fileKind: 'note',
          document: null,
          deleted: false,
          digest: await contentDigest('# Other\n'),
          text: '# Other\n',
        },
        purgedFileId: null,
      },
    ],
    '11',
  );

  const accepted = (await store.listAcceptedFiles(account, workspace)).find(
    (row) => row.fileId === file,
  );
  // The accepted head follows the server. The local head does not move,
  // because a draft that differs from the arriving head is unsubmitted work.
  // Without the draft half of the dirty test the local head would be the
  // remote revision and the draft would keep shadowing it.
  assert.equal(accepted?.acceptedHeadRevisionId, remoteRevision);
  assert.equal(accepted?.localHeadRevisionId, firstRevision);
  const draft = await store.readDraft(account, workspace, 'copy-a');
  assert.equal(draft?.text, 'my own text\n');
  assert.equal(draft?.path, 'notes/renamed.md');
  // The rename is still the identity the note opens with, and the open is
  // stale, so the person is told before that rename becomes a version.
  const cached = await store.readCachedNote(account, workspace, file);
  assert.equal(cached?.path, 'notes/renamed.md');
  assert.equal(cached?.stale, true);
  assert.equal(cached?.acceptedPath, 'notes/one.md');
  await store.close();
});

await test('a checkpoint of an older buffer is refused', async () => {
  const backend = createBackend('stale-checkpoint');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();

  const older = draftOf(account, workspace, file, 'copy-a', 'first text\n');
  await store.saveDraft(older);
  await store.saveDraft({ ...older, text: 'newest text\n', sequence: 5 });

  await assert.rejects(
    () => store.checkpoint(older, null, 'text'),
    (thrown: unknown) => {
      assert.ok(isLocalStorageError(thrown));
      assert.equal(thrown.kind, 'stale');
      return true;
    },
  );
  // Nothing was written, so the newest text is still the working copy.
  assert.deepEqual(await store.pending(account, workspace), []);
  assert.equal(
    (await store.listCheckpoints(account, workspace, file)).length,
    0,
  );
  assert.equal(
    (await store.readDraft(account, workspace, 'copy-a'))?.text,
    'newest text\n',
  );
  await store.close();
});

await test('a parked save keeps its text in the recovery area', async () => {
  const backend = createBackend('parked-save');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();

  const draft = draftOf(account, workspace, file, 'copy-a', 'refused text\n');
  await store.saveDraft(draft);
  const entry = await store.checkpoint(draft, null, 'text');
  assert.ok(entry !== null);

  // The server refused the save for good, so the queue parks it.
  await parkRefusedSave(store, account, entry, 'path_conflict');
  const parked = await store.listLocalConflicts(account, workspace);
  assert.equal(parked.length, 1);
  assert.equal(parked[0]?.errorCode, 'path_conflict');

  const kept = await store.recover(account, workspace);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.text, 'refused text\n');
  assert.equal(kept[0]?.path, 'notes/one.md');
  assert.equal(kept[0]?.reason, 'save_refused');
  assert.equal(kept[0]?.code, 'path_conflict');
  assert.equal(kept[0]?.mutationId, entry.input.mutationId);
  assert.equal(kept[0]?.fileId, file);

  // Discarding the parked entry leaves the queue empty and never sends it.
  await store.discardQueueEntry(account, entry.input.mutationId);
  assert.deepEqual(await store.pending(account, workspace), []);
  await store.close();
});

await test('an unknown refusal code still parks the text', async () => {
  const backend = createBackend('parked-unknown');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();

  const draft = draftOf(account, workspace, file, 'copy-a', 'kept text\n');
  await store.saveDraft(draft);
  const entry = await store.checkpoint(draft, null, 'text');
  assert.ok(entry !== null);
  await parkRefusedSave(store, account, entry, 'deleted_remotely');

  const kept = await store.recover(account, workspace);
  assert.equal(kept[0]?.code, 'deleted_remotely');
  assert.equal(kept[0]?.reason, 'save_refused');
  await store.close();
});

await test('a draft with no base is not reported as stale', async () => {
  const backend = createBackend('draft-no-base');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();

  // The note starts on this device, so its first draft names no base.
  const created = draftOf(account, workspace, file, 'copy-a', 'first\n');
  await store.saveDraft(created);
  const entry = await store.checkpoint(created, null, 'text');
  const revisionId = entry?.input.revisions[0]?.id ?? '';
  await store.acknowledge(account, acceptanceOf(entry, account, '10'));

  // A second working copy of the same file writes without a base, which is
  // what a caller does when its own draft row was already removed. An
  // unknown base is not evidence that the server moved on, so no stale
  // choice is offered and no false warning reaches the person. The accepted
  // row is then the newer statement of the file and it opens instead.
  await store.saveDraft(
    draftOf(account, workspace, file, 'copy-b', 'later text\n', {
      baseRevisionId: null,
      sequence: 1,
    }),
  );
  const cached = await store.readCachedNote(account, workspace, file);
  assert.equal(cached?.stale, false);
  assert.equal(cached?.acceptedText, null);
  assert.equal(cached?.text, 'first\n');
  assert.equal(cached?.acceptedRevisionId, revisionId);
  await store.close();
});

await test('a queued save of this device never reads as a stale draft', async () => {
  const backend = createBackend('own-head-not-stale');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();

  const first = draftOf(account, workspace, file, 'copy-a', 'one\n');
  await store.saveDraft(first);
  const accepted = await store.checkpoint(first, null, 'text');
  const acceptedRevision = accepted?.input.revisions[0]?.id ?? '';
  await store.acknowledge(account, acceptanceOf(accepted, account, '10'));

  // A second save waits for the server, so the accepted head is behind the
  // work of this device rather than ahead of it. That is not a stale draft.
  const second = { ...first, text: 'two\n', sequence: 2 };
  await store.saveDraft(second);
  const queued = await store.checkpoint(second, null, 'text');
  assert.ok(queued !== null);
  await store.saveDraft({ ...second, text: 'three\n', sequence: 3 });

  const cached = await store.readCachedNote(account, workspace, file);
  assert.equal(cached?.stale, false);
  assert.equal(cached?.acceptedText, null);
  assert.equal(cached?.text, 'three\n');
  assert.equal(cached?.acceptedRevisionId, acceptedRevision);
  await store.close();
});

await test('forgetting a purged file removes every local trace of it', async () => {
  const backend = createBackend('forget-purged');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();

  // The file exists on the device: an accepted head, a queued edit, and a
  // recovery copy parked for it. A purge must take all three.
  const draft = draftOf(account, workspace, file, 'copy-a', '# One\n');
  await store.saveDraft(draft);
  const created = await store.checkpoint(draft, null, 'text');
  await store.acknowledge(account, acceptanceOf(created, account, '1'));
  const edited = { ...draft, text: '# Two\n', sequence: 2 };
  await store.saveDraft(edited);
  const queued = await store.checkpoint(edited, null, 'text');
  assert.ok(queued !== null);
  await parkRefusedSave(store, account, queued, 'purged');

  const changes: LocalChange[] = [];
  const unsubscribe = store.subscribe((change) => changes.push(change));
  await store.forgetPurgedFiles(account, workspace, [file]);
  unsubscribe();

  assert.deepEqual(changes, [
    { accountId: account, workspaceId: workspace, fileId: file, kind: 'purge' },
  ]);
  assert.deepEqual(await store.listLocalFiles(account, workspace), []);
  assert.deepEqual(await store.listAcceptedFiles(account, workspace), []);
  assert.deepEqual(await store.pending(account, workspace), []);
  assert.deepEqual(await store.recover(account, workspace), []);
  assert.equal(await store.readDraft(account, workspace, 'copy-a'), null);
  await withRawDatabase(backend, async (tables) => {
    const checkpoints = await tables.checkpoints
      .where('[serverOrigin+accountId+workspaceId+fileId]')
      .equals([origin, account, workspace, file])
      .toArray();
    assert.deepEqual(checkpoints, []);
  });
  await store.close();
});

await test('a purge marker forgets the queue and recovery, not only the file row', async () => {
  const backend = createBackend('purge-marker-forget');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();

  const draft = draftOf(account, workspace, file, 'copy-a', 'purge me\n');
  await store.saveDraft(draft);
  const created = await store.checkpoint(draft, null, 'text');
  await store.acknowledge(account, acceptanceOf(created, account, '1'));
  // A queued edit and a parked recovery copy are still on the device when the
  // purge marker arrives. A re-send of the edit, or the recovery copy, would
  // bring the note back, so the marker must clear both.
  const edited = { ...draft, text: 'edit\n', sequence: 2 };
  await store.saveDraft(edited);
  const queued = await store.checkpoint(edited, null, 'text');
  assert.ok(queued !== null);
  await parkRefusedSave(store, account, queued, 'save_refused');

  const changes: LocalChange[] = [];
  const unsubscribe = store.subscribe((change) => changes.push(change));
  await store.applyRemoteChanges(
    account,
    workspace,
    [{ file: null, purgedFileId: file }],
    '2',
  );
  unsubscribe();

  assert.deepEqual(changes, [
    { accountId: account, workspaceId: workspace, fileId: file, kind: 'purge' },
  ]);
  assert.deepEqual(await store.listLocalFiles(account, workspace), []);
  assert.deepEqual(await store.pending(account, workspace), []);
  assert.deepEqual(await store.recover(account, workspace), []);
  await store.close();
});

await test('a fresh snapshot forgets a purged note but keeps unsent local work', async () => {
  const backend = createBackend('snapshot-forget');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const purged = randomUUID();
  const local = randomUUID();
  const kept = randomUUID();

  // One note is accepted and then purged on the server. One note is a local
  // draft this device has not sent. The snapshot below contains neither, plus
  // one note the server does hold.
  const purgedDraft = draftOf(account, workspace, purged, 'copy-p', 'gone\n');
  await store.saveDraft(purgedDraft);
  const acceptedPurged = await store.checkpoint(purgedDraft, null, 'text');
  await store.acknowledge(account, acceptanceOf(acceptedPurged, account, '1'));
  const localDraft = draftOf(account, workspace, local, 'copy-l', 'mine\n', {
    path: 'notes/mine.md',
  });
  await store.saveDraft(localDraft);
  const localEntry = await store.checkpoint(localDraft, null, 'text');
  assert.ok(localEntry !== null);

  const text = '# Kept\n';
  const digest = await contentDigest(text);
  await store.stageSnapshot(account, workspace, 'token', ['rev-kept'], '9');
  await store.storeSnapshotRevision(account, workspace, {
    token: 'token',
    revisionId: 'rev-kept',
    fileId: kept,
    path: 'notes/kept.md',
    kind: 'note',
    deleted: false,
    digest,
    text,
    document: startDocument(text),
    epoch: 1,
    serverTime: null,
  });
  await store.activateSnapshot('token');

  const files = (await store.listLocalFiles(account, workspace)).map(
    (file) => file.fileId,
  );
  assert.ok(files.includes(kept), 'the snapshot note is present');
  assert.ok(files.includes(local), 'the unsent local note is kept');
  assert.ok(!files.includes(purged), 'the purged note is forgotten');
  const stillQueued = (await store.pending(account, workspace)).some((entry) =>
    entry.input.revisions.some((revision) => revision.fileId === local),
  );
  assert.ok(stillQueued, 'the unsent local mutation is kept');
  await store.close();
});

await test('acknowledging a tombstone removes the leftover deletion draft', async () => {
  const backend = createBackend('ack-tombstone-draft');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();

  const draft = draftOf(account, workspace, file, 'copy-a', '# Body\n');
  await store.saveDraft(draft);
  const created = await store.checkpoint(draft, null, 'text');
  await store.acknowledge(account, acceptanceOf(created, account, '1'));
  const removal = { ...draft, deleted: true, text: '', sequence: 2 };
  await store.saveDraft(removal);
  const removed = await store.checkpoint(removal, null, 'text');
  await store.acknowledge(account, acceptanceOf(removed, account, '2'));

  // The deletion draft is redundant once the server accepts the tombstone,
  // and a leftover would shadow a later restore of the same file.
  assert.equal(await store.readDraft(account, workspace, 'copy-a'), null);
  await withRawDatabase(backend, async (tables) => {
    const drafts = await tables.drafts
      .where('[serverOrigin+accountId+workspaceId+fileId]')
      .equals([origin, account, workspace, file])
      .toArray();
    assert.deepEqual(drafts, []);
  });
  assert.deepEqual(
    (await store.listLocalFiles(account, workspace)).map(
      (file) => file.deleted,
    ),
    [true],
  );
  await store.close();
});

await test('a move survives the next save of an open working copy', async () => {
  const backend = createBackend('move-open-copy');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  // The person opens a note and it reaches the server, so the editor holds
  // working copy `copy-a` over the accepted head.
  const opened = draftOf(account, workspace, fileId, 'copy-a', 'text\n');
  await store.saveDraft(opened);
  const first = await store.checkpoint(opened, null, 'text');
  await store.acknowledge(account, acceptanceOf(first, account, '2'));

  const [queued] = await store.moveFiles(account, workspace, [
    { fileId, toPath: 'Work/one.md' },
  ]);
  assert.ok(queued !== undefined, 'the move queues one mutation');
  assert.equal(queued.input.revisions[0]?.path, 'Work/one.md');
  await store.acknowledge(account, acceptanceOf(queued, account, '3'));
  assert.deepEqual(
    (await store.listLocalFiles(account, workspace)).map((file) => file.path),
    ['Work/one.md'],
    'the move shows at once',
  );
  // The move gave every working copy of the file the new path, so the open
  // editor cannot write the old one back.
  assert.equal(
    (await store.readDraft(account, workspace, 'copy-a'))?.path,
    'Work/one.md',
  );

  // The person types one more character into the open editor and it becomes
  // a version. The editor writes the working copy it holds, whose path is
  // the one the move gave it.
  const held = await store.readDraft(account, workspace, 'copy-a');
  assert.ok(held !== null);
  const typed: Draft = { ...held, text: 'text edited\n', sequence: 2 };
  await store.saveDraft(typed);
  const after = await store.checkpoint(typed, null, 'text');

  assert.deepEqual(
    (await store.listLocalFiles(account, workspace)).map((file) => file.path),
    ['Work/one.md'],
    'the note stays in the folder',
  );
  assert.equal(after?.input.revisions[0]?.path, 'Work/one.md');
  assert.equal(
    (await store.readCachedNote(account, workspace, fileId))?.path,
    'Work/one.md',
  );
  await store.close();
});

await test('a move keeps text that is typed and not yet a version', async () => {
  const backend = createBackend('move-unsaved');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  const opened = draftOf(account, workspace, fileId, 'copy-a', 'saved\n');
  await store.saveDraft(opened);
  const first = await store.checkpoint(opened, null, 'text');
  await store.acknowledge(account, acceptanceOf(first, account, '2'));
  await store.saveDraft({ ...opened, text: 'typed\n', sequence: 2 });

  const [queued] = await store.moveFiles(account, workspace, [
    { fileId, toPath: 'Work/one.md' },
  ]);

  // The move carries what the note reads with, so nothing the person typed
  // is reverted by the move.
  assert.equal(queued?.input.revisions[0]?.path, 'Work/one.md');
  const cached = await store.readCachedNote(account, workspace, fileId);
  assert.equal(cached?.text, 'typed\n');
  assert.equal(cached?.path, 'Work/one.md');
  await store.close();
});

await test('a folder move writes every note or none of them', async () => {
  const backend = createBackend('move-folder');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const first = randomUUID();
  const second = randomUUID();
  for (const [index, fileId] of [first, second].entries()) {
    const draft = draftOf(
      account,
      workspace,
      fileId,
      `copy-${String(index)}`,
      `note ${String(index)}\n`,
      { path: `Inbox/note-${String(index)}.md` },
    );
    await store.saveDraft(draft);
    const queued = await store.checkpoint(draft, null, 'text');
    await store.acknowledge(
      account,
      acceptanceOf(queued, account, String(index + 2)),
    );
  }

  const moved = await store.moveFiles(account, workspace, [
    { fileId: first, toPath: 'Done/note-0.md' },
    { fileId: second, toPath: 'Done/note-1.md' },
  ]);
  assert.equal(moved.length, 2);
  assert.deepEqual(
    (await store.listLocalFiles(account, workspace)).map((file) => file.path),
    ['Done/note-0.md', 'Done/note-1.md'],
  );

  // A file this device does not know refuses the whole set, so a folder
  // rename never leaves half of its notes moved.
  await assert.rejects(
    () =>
      store.moveFiles(account, workspace, [
        { fileId: first, toPath: 'Later/note-0.md' },
        { fileId: randomUUID(), toPath: 'Later/gone.md' },
      ]),
    (error: unknown) => isLocalStorageError(error) && error.kind === 'stale',
  );
  assert.deepEqual(
    (await store.listLocalFiles(account, workspace)).map((file) => file.path),
    ['Done/note-0.md', 'Done/note-1.md'],
  );
  await store.close();
});

await test('a move to the path a note already carries writes nothing', async () => {
  const backend = createBackend('move-in-place');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  const draft = draftOf(account, workspace, fileId, 'copy-a', 'text\n');
  await store.saveDraft(draft);
  const queued = await store.checkpoint(draft, null, 'text');
  await store.acknowledge(account, acceptanceOf(queued, account, '2'));

  assert.deepEqual(
    await store.moveFiles(account, workspace, [
      { fileId, toPath: 'notes/one.md' },
    ]),
    [],
  );
  assert.equal((await store.pending(account, workspace)).length, 0);
  assert.equal(
    (await store.listCheckpoints(account, workspace, fileId)).length,
    1,
  );
  await store.close();
});

await test('a deletion survives the next save of an open working copy', async () => {
  const backend = createBackend('trash-open-copy');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  // The person opens a note and it reaches the server, so the editor holds
  // working copy `copy-a` over the accepted head.
  const opened = draftOf(account, workspace, fileId, 'copy-a', 'text\n');
  await store.saveDraft(opened);
  const first = await store.checkpoint(opened, null, 'text');
  await store.acknowledge(account, acceptanceOf(first, account, '2'));

  // The sidebar moves the note to Trash while the editor is open.
  const [queued] = await store.trashFiles(account, workspace, [fileId]);
  assert.ok(queued !== undefined, 'the deletion queues one mutation');
  const tombstone = queued.input.revisions[0];
  assert.equal(tombstone?.deleted, true);
  assert.equal(
    tombstone?.content.kind === 'markdown'
      ? tombstone.content.document.work.kind
      : null,
    'none',
    'a tombstone carries no text work',
  );

  // The deletion reached every working copy, so the editor cannot state the
  // note live again.
  assert.equal(
    (await store.readDraft(account, workspace, 'copy-a'))?.deleted,
    true,
  );
  assert.equal(
    (await store.readFileSaveSnapshot(account, workspace, fileId)).deleted,
    true,
  );

  await store.acknowledge(account, acceptanceOf(queued, account, '3'));
  assert.deepEqual(
    (await store.listLocalFiles(account, workspace)).filter(
      (file) => !file.deleted,
    ),
    [],
    'the note stays in Trash',
  );
  await store.close();
});

await test('a folder deletion writes every tombstone or none of them', async () => {
  const backend = createBackend('trash-folder');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const first = randomUUID();
  const second = randomUUID();
  for (const [index, fileId] of [first, second].entries()) {
    const draft = draftOf(
      account,
      workspace,
      fileId,
      `copy-${String(index)}`,
      `note ${String(index)}\n`,
      { path: `Inbox/note-${String(index)}.md` },
    );
    await store.saveDraft(draft);
    const queued = await store.checkpoint(draft, null, 'text');
    await store.acknowledge(
      account,
      acceptanceOf(queued, account, String(index + 2)),
    );
  }

  // A file this device does not know refuses the whole set, so a folder
  // deletion never leaves half of its notes behind.
  await assert.rejects(
    () => store.trashFiles(account, workspace, [first, randomUUID()]),
    (error: unknown) => isLocalStorageError(error) && error.kind === 'stale',
  );
  assert.deepEqual(
    (await store.listLocalFiles(account, workspace))
      .filter((file) => !file.deleted)
      .map((file) => file.path),
    ['Inbox/note-0.md', 'Inbox/note-1.md'],
  );

  assert.equal(
    (await store.trashFiles(account, workspace, [first, second])).length,
    2,
  );
  assert.deepEqual(
    (await store.listLocalFiles(account, workspace)).filter(
      (file) => !file.deleted,
    ),
    [],
  );
  // Deleting a note that is already in Trash writes nothing.
  assert.deepEqual(await store.trashFiles(account, workspace, [first]), []);
  await store.close();
});

await test('a note in Trash refuses a move', async () => {
  const backend = createBackend('trash-then-move');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  const draft = draftOf(account, workspace, fileId, 'copy-a', 'text\n');
  await store.saveDraft(draft);
  const queued = await store.checkpoint(draft, null, 'text');
  await store.acknowledge(account, acceptanceOf(queued, account, '2'));
  await store.trashFiles(account, workspace, [fileId]);

  await assert.rejects(
    () =>
      store.moveFiles(account, workspace, [{ fileId, toPath: 'Work/one.md' }]),
    (error: unknown) => isLocalStorageError(error) && error.kind === 'stale',
  );
  await store.close();
});

await test('an editor that has not learned of a deletion cannot undo it', async () => {
  const backend = createBackend('trash-late-editor');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  const opened = draftOf(account, workspace, fileId, 'copy-a', 'text\n');
  await store.saveDraft(opened);
  const first = await store.checkpoint(opened, null, 'text');
  await store.acknowledge(account, acceptanceOf(first, account, '2'));

  // The sidebar, another tab, or another device moves the note to Trash.
  await store.trashFiles(account, workspace, [fileId]);

  // The open editor flushes one last version before it learns. It still holds
  // the note as live, so its write would undo the deletion. The store refuses
  // the version and keeps the tombstone on the draft it writes.
  await store.saveDraft({ ...opened, text: 'late\n', sequence: 2 });
  assert.equal(
    (await store.readDraft(account, workspace, 'copy-a'))?.deleted,
    true,
    'a draft never states a trashed file live',
  );
  await assert.rejects(
    () =>
      store.checkpoint(
        { ...opened, text: 'late\n', sequence: 2 },
        null,
        'text',
      ),
    (error: unknown) => isLocalStorageError(error) && error.kind === 'stale',
  );
  assert.deepEqual(
    (await store.listLocalFiles(account, workspace)).filter(
      (file) => !file.deleted,
    ),
    [],
    'the note stays in Trash',
  );
  // Only the tombstone is on its way up, so no live revision reaches the
  // server to be refused and kept as a second note.
  const pending = await store.pending(account, workspace);
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.input.revisions[0]?.deleted, true);
  await store.close();
});

await test('a note whose document this device lacks does not reach Trash', async () => {
  const backend = createBackend('trash-without-body');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  // The ordered feed can name a file without carrying its body, so a second
  // device holds the note in its tree with no content row behind it.
  await store.applyRemoteChanges(
    account,
    workspace,
    [
      {
        file: {
          fileId,
          revisionId: 'server-1',
          path: 'notes/one.md',
          fileKind: 'note',
          document: null,
          deleted: false,
          digest: 'digest-not-stored',
          text: null,
        },
        purgedFileId: null,
      },
    ],
    '2',
  );
  assert.equal(
    (await store.listLocalFiles(account, workspace)).length,
    1,
    'the note is in the tree',
  );
  assert.equal(
    await store.hasContent(account, workspace, 'digest-not-stored'),
    false,
  );

  // A deletion states the complete state that this device had seen, and a
  // device without the document of the note has seen none of its text. The
  // server refuses such a deletion (record 0083), so the store refuses it
  // first and the note stays until its document arrives (record 0088).
  await assert.rejects(
    () => store.trashFiles(account, workspace, [fileId]),
    (error: unknown) => isLocalStorageError(error) && error.kind === 'stale',
  );
  assert.deepEqual(
    (await store.listLocalFiles(account, workspace)).map((file) => file.path),
    ['notes/one.md'],
  );
  assert.deepEqual(await store.pending(account, workspace), []);
  await store.close();
});

await test('a move refuses a note whose body this device lacks', async () => {
  const backend = createBackend('move-without-body');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  await store.applyRemoteChanges(
    account,
    workspace,
    [
      {
        file: {
          fileId,
          revisionId: 'server-1',
          path: 'notes/one.md',
          fileKind: 'note',
          document: null,
          deleted: false,
          digest: 'digest-not-stored',
          text: null,
        },
        purgedFileId: null,
      },
    ],
    '2',
  );

  // A move keeps the text, so it cannot run without the body. Guessing it
  // would write the wrong content as a version.
  await assert.rejects(
    () =>
      store.moveFiles(account, workspace, [{ fileId, toPath: 'Work/one.md' }]),
    (error: unknown) => isLocalStorageError(error) && error.kind === 'stale',
  );
  assert.deepEqual(
    (await store.listLocalFiles(account, workspace)).map((file) => file.path),
    ['notes/one.md'],
  );
  await store.close();
});

await test('a note read from the server becomes one this device can act on', async () => {
  const backend = createBackend('cache-server-note');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  const text = '# Read over HTTP\n';
  const digest = await contentDigest(text);

  // The screen reached the note before the ordered feed reached the store.
  await store.cacheServerNote(account, workspace, {
    fileId,
    path: 'notes/one.md',
    kind: 'note',
    revisionId: 'server-head',
    digest,
    text,
    document: startDocument(text),
    epoch: 1,
  });

  const cached = await store.readCachedNote(account, workspace, fileId);
  assert.equal(cached?.text, text);
  assert.equal(cached?.baseRevisionId, 'server-head');
  // The action now names the head the server has, not a create precondition.
  const [queued] = await store.trashFiles(account, workspace, [fileId]);
  assert.equal(queued?.input.expectedHeads[fileId], 'server-head');
  assert.equal(queued?.input.revisions[0]?.deleted, true);
  assert.equal(queued?.input.revisions[0]?.parents[0], 'server-head');
  // The cursor belongs to the ordered feed and this read never moves it.
  assert.equal(await store.readCursor(account, workspace), null);
  await store.close();
});

await test('a read of the server never writes over what this device holds', async () => {
  const backend = createBackend('cache-server-note-keeps-local');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  const draft = draftOf(account, workspace, fileId, 'copy-a', 'mine\n');
  await store.saveDraft(draft);
  await store.checkpoint(draft, null, 'text');

  await store.cacheServerNote(account, workspace, {
    fileId,
    path: 'somewhere/else.md',
    kind: 'note',
    revisionId: 'server-head',
    digest: await contentDigest('theirs\n'),
    text: 'theirs\n',
  });

  const cached = await store.readCachedNote(account, workspace, fileId);
  assert.equal(cached?.text, 'mine\n', 'local work stays');
  assert.equal(cached?.path, 'notes/one.md');
  await store.close();
});

/** A store of release 0.4 with one queued save over a server head. */
async function release04Store(
  prefix: string,
  texts: {
    readonly base: string;
    readonly local: string;
    readonly deleted?: boolean;
    readonly state?: 'pending' | 'sending';
    readonly digest?: string | null;
  },
): Promise<{
  readonly backend: Backend;
  readonly account: string;
  readonly workspace: string;
  readonly fileId: string;
  readonly mutationId: string;
  readonly revisionId: string;
}> {
  const backend = createBackend(prefix);
  await (await openLocalStore(origin, backend.options())).close();
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  const mutationId = randomUUID();
  const revisionId = randomUUID();
  const baseDigest = await contentDigest(texts.base);
  await withRawDatabase(backend, async (tables) => {
    await tables.contents.put({
      serverOrigin: origin,
      accountId: account,
      workspaceId: workspace,
      digest: baseDigest,
      text: texts.base,
      bytes: null,
      size: texts.base.length,
    });
    await tables.acceptedFiles.put({
      serverOrigin: origin,
      accountId: account,
      workspaceId: workspace,
      fileId,
      kind: 'note',
      path: 'notes/one.md',
      deleted: false,
      acceptedHeadRevisionId: 'server-head',
      acceptedHeadDigest: baseDigest,
      localHeadRevisionId: 'server-head',
      updatedAt: '2026-09-06T10:00:00.000Z',
    });
    await tables.cursors.put({
      serverOrigin: origin,
      accountId: account,
      workspaceId: workspace,
      cursor: '41',
      updatedAt: '2026-09-06T10:00:00.000Z',
    });
  });
  const { db, tables } = createDatabase(backend.name, {
    indexedDB: backend.factory,
    IDBKeyRange: FakeKeyRange,
  });
  await db.open();
  try {
    await storeRelease04Save(
      { db, tables },
      {
        serverOrigin: origin,
        accountId: account,
        workspaceId: workspace,
        fileId,
        mutationId,
        revisionId,
        parentId: 'server-head',
        expectedHead: 'server-head',
        path: 'notes/one.md',
        text: texts.local,
        sequence: 1,
        state: texts.state ?? 'pending',
        digest: texts.digest ?? null,
        deleted: texts.deleted ?? false,
      },
    );
    await markRelease04({ db, tables });
  } finally {
    db.close();
  }
  return { backend, account, workspace, fileId, mutationId, revisionId };
}

/** Writes the document that a snapshot of the server brings. */
async function snapshotBrings(
  backend: Backend,
  key: { account: string; workspace: string; fileId: string },
  serverText: string,
): Promise<void> {
  await withRawDatabase(backend, async (tables) => {
    const bytes = startDocument(serverText);
    await tables.documents.put({
      serverOrigin: origin,
      accountId: key.account,
      workspaceId: key.workspace,
      fileId: key.fileId,
      bytes,
      epoch: 1,
      appliedVector: documentStateVector(bytes),
    });
    await tables.cursors.put({
      serverOrigin: origin,
      accountId: key.account,
      workspaceId: key.workspace,
      cursor: '42',
      updatedAt: '2026-09-06T10:00:00.000Z',
    });
  });
}

await test('a store of release 0.4 opens and keeps its work for placement', async () => {
  // Release 0.5.0 refused this store with "no migration step leads away from
  // schema version 4" (record 0088).
  const legacy = await release04Store('release-0-4-opens', {
    base: 'alpha\nbeta\ngamma\n',
    local: 'alpha\nbeta, written offline\ngamma\n',
  });
  const store = await openLocalStore(origin, legacy.backend.options());
  try {
    const { account, workspace } = legacy;
    assert.deepEqual(await store.pending(account, workspace), []);
    assert.deepEqual(await store.legacySaves(account, workspace), [
      { mutationId: legacy.mutationId, state: 'pending', digest: null },
    ]);
    // The next pull is a full snapshot, which carries every document.
    assert.equal(await store.readCursor(account, workspace), null);
    assert.deepEqual(await store.queuedWorkspaces(account), [workspace]);
    // Nothing waits for a document before the snapshot runs.
    assert.deepEqual(await store.placeLegacyWork(account, workspace), {
      waiting: 2,
    });
  } finally {
    await store.close();
  }
  await withRawDatabase(legacy.backend, async (tables) => {
    const base = await tables.legacyBases.get([
      origin,
      legacy.account,
      legacy.workspace,
      'server-head',
    ]);
    assert.equal(base?.text, 'alpha\nbeta\ngamma\n');
  });
});

await test('placement joins earlier work with the document of the server', async () => {
  const legacy = await release04Store('release-0-4-joins', {
    base: 'alpha\nbeta\ngamma\ndelta\n',
    local: 'alpha, written offline\nbeta\ngamma\ndelta\n',
  });
  const { account, workspace, fileId } = legacy;
  await (await openLocalStore(origin, legacy.backend.options())).close();
  // Another device changed a line apart from it while this device waited.
  await snapshotBrings(
    legacy.backend,
    legacy,
    'alpha\nbeta\ngamma\ndelta, written elsewhere\n',
  );
  const store = await openLocalStore(origin, legacy.backend.options());
  try {
    assert.deepEqual(await store.placeLegacyWork(account, workspace), {
      waiting: 0,
    });
    const joined =
      'alpha, written offline\nbeta\ngamma\ndelta, written elsewhere\n';
    const [entry] = await store.pending(account, workspace);
    assert.equal(entry?.input.mutationId, legacy.mutationId);
    assert.equal(entry?.state, 'pending');
    const content = entry?.input.revisions[0]?.content;
    assert.equal(content?.kind, 'markdown');
    assert.equal(
      content?.kind === 'markdown' ? content.document.work.kind : null,
      'update',
    );
    const document = await store.readNoteDocument(account, workspace, fileId);
    assert.equal(readDocumentText(document?.bytes ?? new Uint8Array()), joined);
    const cached = await store.readCachedNote(account, workspace, fileId);
    assert.equal(cached?.text, joined);
    assert.deepEqual(await store.legacySaves(account, workspace), []);
    assert.deepEqual(await store.recover(account, workspace), []);
  } finally {
    await store.close();
  }
});

await test('earlier work that cannot be placed goes to Needs attention once', async () => {
  const legacy = await release04Store('release-0-4-keeps', {
    base: 'alpha\nbeta\ngamma\n',
    local: 'alpha\nbeta, written offline\ngamma\n',
  });
  const { account, workspace, fileId } = legacy;
  await (await openLocalStore(origin, legacy.backend.options())).close();
  // Another device changed the same line, so the texts cannot say which wins.
  await snapshotBrings(
    legacy.backend,
    legacy,
    'alpha\nbeta, written elsewhere\ngamma\n',
  );
  const store = await openLocalStore(origin, legacy.backend.options());
  try {
    assert.deepEqual(await store.placeLegacyWork(account, workspace), {
      waiting: 0,
    });
    const kept = await store.recover(account, workspace);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.text, 'alpha\nbeta, written offline\ngamma\n');
    assert.equal(kept[0]?.code, 'unplaced_work');
    assert.deepEqual(await store.pending(account, workspace), []);
    // The note reads the text of the server, which no work of this device
    // replaced.
    const document = await store.readNoteDocument(account, workspace, fileId);
    assert.equal(
      readDocumentText(document?.bytes ?? new Uint8Array()),
      'alpha\nbeta, written elsewhere\ngamma\n',
    );
    // The note offers Review of the kept text, so one action reaches it
    // (record 0087).
    const [offered] = await store.listReviews(account, workspace, fileId);
    assert.deepEqual(offered?.cause, {
      kind: 'recovery',
      recoveryId: kept[0]?.recoveryId,
    });
    assert.equal(offered?.text, 'alpha\nbeta, written offline\ngamma\n');
    assert.deepEqual(await store.placeLegacyWork(account, workspace), {
      waiting: 0,
    });
    assert.equal((await store.recover(account, workspace)).length, 1);
    assert.equal(
      (await store.listReviews(account, workspace, fileId)).length,
      1,
      'a second placement run keeps one Review',
    );
    // A kept text that the person removes takes its Review with it.
    await store.removeRecovery(account, workspace, kept[0]?.recoveryId ?? '');
    assert.deepEqual(await store.listReviews(account, workspace, fileId), []);
  } finally {
    await store.close();
  }
});

await test('a note of the server takes no save before its document is here', async () => {
  const backend = createBackend('save-needs-document');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  try {
    await store.cacheServerNote(account, workspace, {
      fileId,
      path: 'notes/one.md',
      kind: 'note',
      revisionId: 'server-head',
      digest: await contentDigest('theirs\n'),
      text: 'theirs\n',
    });
    const draft = draftOf(account, workspace, fileId, 'copy-a', 'mine\n', {
      baseRevisionId: 'server-head',
    });
    await store.saveDraft(draft);
    // A document started here would hold the text twice once it joins the
    // document of the server (record 0084). Nothing is written.
    await assert.rejects(
      store.checkpoint(draft, null, 'text'),
      (error: unknown) =>
        error instanceof LocalStorageError && error.kind === 'stale',
    );
    await assert.rejects(
      store.trashFiles(account, workspace, [fileId]),
      (error: unknown) =>
        error instanceof LocalStorageError && error.kind === 'stale',
    );
    assert.deepEqual(await store.pending(account, workspace), []);
    // The server read brings the document, and the save then works on it.
    await store.cacheServerNote(account, workspace, {
      fileId,
      path: 'notes/one.md',
      kind: 'note',
      revisionId: 'server-head',
      digest: await contentDigest('theirs\n'),
      text: 'theirs\n',
      document: startDocument('theirs\n'),
      epoch: 1,
    });
    assert.ok((await store.checkpoint(draft, null, 'text')) !== null);
  } finally {
    await store.close();
  }
});

await test('sign-out leaves no document of a note on the device', async () => {
  const backend = createBackend('sign-out-documents');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  try {
    const draft = draftOf(account, workspace, fileId, 'copy-a', 'private\n');
    await store.saveDraft(draft);
    await store.checkpoint(draft, null, 'text');
    assert.ok(
      (await store.readNoteDocument(account, workspace, fileId)) !== null,
    );
    await store.clearPrivateData(account);
    // The document holds the text of the note, so it leaves with the rest.
    assert.equal(
      await store.readNoteDocument(account, workspace, fileId),
      null,
    );
  } finally {
    await store.close();
  }
});

await test('a sign-in deletes the idle data of every other account', async () => {
  // Record 0113. A shared device keeps no private data of an absent account,
  // except the partitions that hold work, which wait for their account.
  const backend = createBackend('idle-accounts');
  const store = await openLocalStore(origin, backend.options());
  const elsewhere = await openLocalStore(
    'https://other.example.test',
    backend.options({ id: createIds('elsewhere') }),
  );
  const signedIn = randomUUID();
  const absent = randomUUID();
  const withRecovery = randomUUID();
  const withTyping = randomUUID();
  const settingsOnly = randomUUID();
  const idle = randomUUID();
  const queued = randomUUID();
  const recovered = randomUUID();
  const typed = randomUUID();
  const own = randomUUID();
  const idleFile = randomUUID();
  const typedFile = randomUUID();
  const resets: LocalChange[] = [];
  const unsubscribe = store.subscribe((change) => {
    if (change.kind === 'reset') resets.push(change);
  });
  try {
    // A saved note that reached the server holds no work.
    const saved = draftOf(absent, idle, idleFile, 'copy-idle', 'saved\n');
    await store.saveDraft(saved);
    await store.acknowledge(
      absent,
      acceptanceOf(await store.checkpoint(saved, null, 'text'), absent, '1'),
    );
    await store.setAttachmentPinned(absent, idle, 'b'.repeat(64), true);
    // A save that waits for the server is work.
    const waiting = draftOf(absent, queued, randomUUID(), 'copy-q', 'queued\n');
    await store.saveDraft(waiting);
    await store.checkpoint(waiting, null, 'text');
    // Kept text of the recovery area is work.
    await store.addRecovery(withRecovery, recovered, {
      fileId: randomUUID(),
      path: 'notes/kept.md',
      text: 'kept\n',
      reason: 'save_refused',
    });
    // Text that was typed after the last version is work.
    const typing = draftOf(withTyping, typed, typedFile, 'copy-t', 'saved\n');
    await store.saveDraft(typing);
    await store.acknowledge(
      withTyping,
      acceptanceOf(
        await store.checkpoint(typing, null, 'text'),
        withTyping,
        '1',
      ),
    );
    await store.saveDraft({ ...typing, text: 'saved\ntyped\n', sequence: 2 });
    // An account that signed out offline keeps its marker and nothing else.
    await store.setSignOutMarker(settingsOnly);
    await withRawDatabase(backend, async (tables) => {
      await tables.preferences.put({
        serverOrigin: origin,
        accountId: settingsOnly,
        workspaceId: '',
        name: 'theme',
        value: 'dark',
      });
    });
    // The data of the signed-in account and of another installation stay.
    const mine = draftOf(signedIn, own, randomUUID(), 'copy-own', 'mine\n');
    await store.saveDraft(mine);
    await store.acknowledge(
      signedIn,
      acceptanceOf(await store.checkpoint(mine, null, 'text'), signedIn, '1'),
    );
    const theirs = draftOf(absent, idle, idleFile, 'copy-else', 'other\n');
    await elsewhere.saveDraft(theirs);
    await elsewhere.acknowledge(
      absent,
      acceptanceOf(
        await elsewhere.checkpoint(theirs, null, 'text'),
        absent,
        '1',
      ),
    );

    const kept = await store.clearIdleAccounts(signedIn);

    assert.deepEqual(
      [...kept].sort(),
      [absent, withRecovery, withTyping].sort(),
    );
    // The idle partition is gone, with its text and its document.
    assert.deepEqual(await store.listLocalFiles(absent, idle), []);
    assert.equal(await store.readDraft(absent, idle, 'copy-idle'), null);
    assert.equal(await store.readNoteDocument(absent, idle, idleFile), null);
    assert.equal(
      await store.isAttachmentPinned(absent, idle, 'b'.repeat(64)),
      false,
    );
    assert.deepEqual(resets, [
      { accountId: absent, workspaceId: idle, fileId: null, kind: 'reset' },
    ]);
    // Every partition with work stays as it was.
    assert.equal((await store.pending(absent, queued)).length, 1);
    assert.equal((await store.recover(withRecovery, recovered)).length, 1);
    assert.equal(
      (await store.readDraft(withTyping, typed, 'copy-t'))?.text,
      'saved\ntyped\n',
    );
    assert.ok(
      (await store.readNoteDocument(withTyping, typed, typedFile)) !== null,
    );
    // The settings of an account with no work go, and its marker stays, so
    // the next start of that account still revokes the old session first.
    assert.equal(await store.hasSignOutMarker(settingsOnly), true);
    await withRawDatabase(backend, async (tables) => {
      assert.equal(
        await tables.preferences.get([origin, settingsOnly, '', 'theme']),
        undefined,
      );
    });
    // Nothing of the signed-in account or of another installation moved.
    assert.equal((await store.listLocalFiles(signedIn, own)).length, 1);
    assert.equal((await elsewhere.listLocalFiles(absent, idle)).length, 1);
    // A second sign-in finds nothing more to delete.
    assert.deepEqual(
      [...(await store.clearIdleAccounts(signedIn))].sort(),
      [absent, withRecovery, withTyping].sort(),
    );
    assert.equal(resets.length, 1);
  } finally {
    unsubscribe();
    await elsewhere.close();
    await store.close();
  }
});

await test('a store of release 0.5.0 keeps its drafts and reads a snapshot again', async () => {
  // Only the step from release 0.4 marks drafts. A draft of 0.5 holds work
  // that its document already holds, and a three-way join would refuse it.
  const backend = createBackend('release-0-5-0');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  const draft = draftOf(account, workspace, fileId, 'copy-a', 'saved\n');
  await store.saveDraft(draft);
  await store.checkpoint(draft, null, 'text');
  await store.saveDraft({ ...draft, text: 'saved\ntyped\n', sequence: 2 });
  // The editor writes each keystroke into the document at once, so the
  // document can hold more than the last draft write.
  const held = await store.readNoteDocument(account, workspace, fileId);
  assert.ok(held !== null);
  const ahead = replaceDocumentText(held.bytes, 'saved\ntyped\nmore\n');
  assert.ok(ahead.ok);
  await store.mergeNoteWork(
    account,
    workspace,
    fileId,
    encodeDocumentDelta(ahead.value.document, documentStateVector(held.bytes)),
  );
  await store.close();
  await withRawDatabase(backend, async (tables) => {
    await tables.cursors.put({
      serverOrigin: origin,
      accountId: account,
      workspaceId: workspace,
      cursor: '9',
      updatedAt: '2026-09-06T10:00:00.000Z',
    });
    const meta = await storedMeta(tables);
    await tables.meta.put({ ...meta, schemaVersion: 5 });
  });
  const reopened = await openLocalStore(origin, backend.options());
  try {
    assert.deepEqual(await reopened.legacySaves(account, workspace), []);
    assert.deepEqual(await reopened.placeLegacyWork(account, workspace), {
      waiting: 0,
    });
    const cached = await reopened.readCachedNote(account, workspace, fileId);
    assert.equal(cached?.text, 'saved\ntyped\n');
    assert.equal((await reopened.pending(account, workspace)).length, 1);
    assert.deepEqual(await reopened.recover(account, workspace), []);
    // The feed of 0.5.0 could keep a note empty, so the next pull reads a
    // snapshot, which carries the whole document of every note.
    assert.equal(await reopened.readCursor(account, workspace), null);
  } finally {
    await reopened.close();
  }
});

await test('a batch that release 0.4 sent settles every save it covered', async () => {
  // Release 0.4 sent a run of unsent saves as one request under the first
  // identity and marked only that one as sent. The receipt names every
  // revision, so no covered save goes out a second time.
  const legacy = await release04Store('release-0-4-batch', {
    base: 'one\n',
    local: 'one\ntwo\n',
    state: 'sending',
    digest: 'b'.repeat(64),
  });
  const { account, workspace, fileId } = legacy;
  const second = { mutationId: randomUUID(), revisionId: randomUUID() };
  const raw = createDatabase(legacy.backend.name, {
    indexedDB: legacy.backend.factory,
    IDBKeyRange: FakeKeyRange,
  });
  await raw.db.open();
  try {
    await storeRelease04Save(raw, {
      serverOrigin: origin,
      accountId: account,
      workspaceId: workspace,
      fileId,
      mutationId: second.mutationId,
      revisionId: second.revisionId,
      parentId: legacy.revisionId,
      expectedHead: 'server-head',
      path: 'notes/one.md',
      text: 'one\ntwo\nthree\n',
      sequence: 2,
      state: 'pending',
      digest: null,
    });
    await markRelease04(raw);
  } finally {
    raw.db.close();
  }
  const store = await openLocalStore(origin, legacy.backend.options());
  try {
    assert.equal((await store.legacySaves(account, workspace)).length, 2);
    await store.settleLegacySave(account, legacy.mutationId, {
      kind: 'accepted',
      result: {
        mutationId: legacy.mutationId,
        revisionIds: [legacy.revisionId, second.revisionId],
        revisions: [],
        cursor: '12',
        superseded: [],
      },
    });
    assert.deepEqual(await store.legacySaves(account, workspace), []);
    const kept = await store.listCheckpoints(account, workspace, fileId);
    assert.deepEqual(
      kept.map((checkpoint) => checkpoint.accepted),
      [true, true],
    );
  } finally {
    await store.close();
  }
});

await test('a deletion of release 0.4 over text it never saw leaves the note', async () => {
  // The document holds work that 0.4 never saw, and a deletion must not hide
  // it (record 0083). The note stays and nothing is sent.
  const legacy = await release04Store('release-0-4-deletion', {
    base: 'alpha\n',
    local: '',
    deleted: true,
  });
  const { account, workspace } = legacy;
  await (await openLocalStore(origin, legacy.backend.options())).close();
  await snapshotBrings(legacy.backend, legacy, 'alpha\nwritten elsewhere\n');
  const store = await openLocalStore(origin, legacy.backend.options());
  try {
    assert.deepEqual(await store.placeLegacyWork(account, workspace), {
      waiting: 0,
    });
    assert.deepEqual(await store.pending(account, workspace), []);
    assert.deepEqual(await store.legacySaves(account, workspace), []);
    assert.deepEqual(await store.recover(account, workspace), []);
  } finally {
    await store.close();
  }
});

await test('a snapshot keeps the instant each note was saved', async () => {
  // A snapshot used to write every note at the instant it arrived, so every
  // note read "just now" on a device that had just downloaded the workspace.
  const backend = createBackend('snapshot-saved-instant');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  const text = '# Written last week\n';
  try {
    await store.stageSnapshot(
      account,
      workspace,
      'token-saved',
      ['rev-1'],
      '7',
    );
    await store.storeSnapshotRevision(account, workspace, {
      token: 'token-saved',
      revisionId: 'rev-1',
      fileId: file,
      path: 'notes/last-week.md',
      kind: 'note',
      deleted: false,
      digest: await contentDigest(text),
      text,
      document: startDocument(text),
      epoch: 1,
      serverTime: '2026-09-16T08:30:00.000Z',
    });
    await store.activateSnapshot('token-saved');
    const [listed] = await store.listLocalFiles(account, workspace);
    assert.equal(listed?.updatedAt, '2026-09-16T08:30:00.000Z');
  } finally {
    await store.close();
  }
});

/** The same acceptance, with every note revision marked as merged. */
function mergedAcceptanceOf(
  entry: QueueEntry | null,
  accountId: string,
  cursor: string,
): AcceptedChangeset {
  const accepted = acceptanceOf(entry, accountId, cursor);
  return {
    ...accepted,
    revisions: accepted.revisions.map((revision) => ({
      ...revision,
      merged: revision.epoch !== null,
    })),
  };
}

await test('a merged save keeps its own checkpoint for Review', async () => {
  const backend = createBackend('review-merge');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  try {
    const first = draftOf(account, workspace, file, 'copy-a', 'one\n');
    await store.saveDraft(first);
    const created = await store.checkpoint(first, null, 'text');
    // A save that saw everything is not a merge, so nothing waits.
    await store.acknowledge(account, acceptanceOf(created, account, '1'));
    assert.deepEqual(await store.listReviews(account, workspace, file), []);

    const second = { ...first, text: 'one\ntwo\n', sequence: 2 };
    await store.saveDraft(second);
    const merging = await store.checkpoint(second, null, 'text');
    const changes: LocalChange[] = [];
    const unsubscribe = store.subscribe((change) => changes.push(change));
    await store.acknowledge(account, mergedAcceptanceOf(merging, account, '2'));
    unsubscribe();
    assert.ok(
      changes.some((change) => change.kind === 'review'),
      'the answer announces the Review',
    );

    // Later work of this device never becomes the base: not a draft, and not
    // a later save that saw everything.
    const third = { ...first, text: 'one\ntwo\nthree\n', sequence: 3 };
    await store.saveDraft(third);
    const later = await store.checkpoint(third, null, 'text');
    await store.saveDraft({ ...third, text: 'typing\n', sequence: 4 });
    await store.acknowledge(account, acceptanceOf(later, account, '3'));

    const reviews = await store.listReviews(account, workspace, file);
    assert.equal(reviews.length, 1);
    assert.deepEqual(reviews[0]?.cause, {
      kind: 'merge',
      revisionId: merging?.input.revisions[0]?.id,
    });
    assert.equal(reviews[0]?.text, 'one\ntwo\n');
  } finally {
    await store.close();
  }
});

await test('one commit makes one Review and a later merge makes another', async () => {
  const backend = createBackend('review-batch');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const file = randomUUID();
  try {
    const draft = draftOf(account, workspace, file, 'copy-a', 'a\n');
    await store.saveDraft(draft);
    const firstSave = await store.checkpoint(draft, null, 'text');
    const next = { ...draft, text: 'a\nb\n', sequence: 2 };
    await store.saveDraft(next);
    const secondSave = await store.checkpoint(next, null, 'text');
    // One sent batch is one commit, and every answer of it shares the cursor.
    // The Review compares the last text that the batch sent.
    await store.acknowledge(
      account,
      mergedAcceptanceOf(firstSave, account, '5'),
    );
    await store.acknowledge(
      account,
      mergedAcceptanceOf(secondSave, account, '5'),
    );
    const batch = await store.listReviews(account, workspace, file);
    assert.equal(batch.length, 1);
    assert.equal(batch[0]?.text, 'a\nb\n');

    const last = { ...draft, text: 'a\nb\nc\n', sequence: 3 };
    await store.saveDraft(last);
    const thirdSave = await store.checkpoint(last, null, 'text');
    await store.acknowledge(
      account,
      mergedAcceptanceOf(thirdSave, account, '6'),
    );
    const both = await store.listReviews(account, workspace, file);
    assert.deepEqual(
      both.map((review) => review.text),
      ['a\nb\n', 'a\nb\nc\n'],
      'the Reviews read oldest first',
    );

    // Clearing one Review leaves the other, and clearing it again does
    // nothing.
    const changes: LocalChange[] = [];
    const unsubscribe = store.subscribe((change) => changes.push(change));
    await store.clearReview(account, workspace, both[0]?.reviewId ?? '');
    await store.clearReview(account, workspace, both[0]?.reviewId ?? '');
    unsubscribe();
    assert.deepEqual(changes, [
      {
        accountId: account,
        workspaceId: workspace,
        fileId: file,
        kind: 'review',
      },
    ]);
    const left = await store.listReviews(account, workspace, file);
    assert.deepEqual(
      left.map((review) => review.reviewId),
      [both[1]?.reviewId],
    );
    // The checkpoint that the cleared Review named stays in local history.
    assert.equal(
      (await store.listCheckpoints(account, workspace, file)).length,
      3,
    );

    // A later merge offers Review again.
    await store.clearReview(account, workspace, both[1]?.reviewId ?? '');
    const again = { ...draft, text: 'a\nb\nc\nd\n', sequence: 4 };
    await store.saveDraft(again);
    const fourthSave = await store.checkpoint(again, null, 'text');
    await store.acknowledge(
      account,
      mergedAcceptanceOf(fourthSave, account, '7'),
    );
    const offered = await store.listReviews(account, workspace, file);
    assert.deepEqual(
      offered.map((review) => review.text),
      ['a\nb\nc\nd\n'],
    );
  } finally {
    await store.close();
  }
});

await test('a purge and a reset take the Reviews of their notes', async () => {
  const backend = createBackend('review-forget');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const purged = randomUUID();
  const other = randomUUID();
  try {
    for (const file of [purged, other]) {
      const draft = draftOf(account, workspace, file, `copy-${file}`, 'x\n');
      await store.saveDraft(draft);
      const entry = await store.checkpoint(draft, null, 'text');
      await store.acknowledge(
        account,
        mergedAcceptanceOf(entry, account, file),
      );
    }
    await store.forgetPurgedFiles(account, workspace, [purged]);
    assert.deepEqual(await store.listReviews(account, workspace, purged), []);
    assert.equal(
      (await store.listReviews(account, workspace, other)).length,
      1,
    );

    await store.clearPrivateData(account, workspace);
    assert.deepEqual(await store.listReviews(account, workspace, other), []);
    await withRawDatabase(backend, async (tables) => {
      assert.deepEqual(await tables.reviews.toArray(), []);
    });
  } finally {
    await store.close();
  }
});

/** Writes one text into the stored document, as a device with its own identity. */
async function writeIntoDocument(
  store: LocalStore,
  key: { account: string; workspace: string; fileId: string },
  text: string,
): Promise<void> {
  const held = await store.readNoteDocument(
    key.account,
    key.workspace,
    key.fileId,
  );
  assert.ok(held !== null, 'the note must hold a document');
  const written = replaceDocumentText(held.bytes, text);
  assert.ok(written.ok);
  await store.mergeNoteWork(
    key.account,
    key.workspace,
    key.fileId,
    encodeDocumentDelta(
      written.value.document,
      documentStateVector(held.bytes),
    ),
  );
}

await test('a checkpoint of an open note freezes its document and writes no text', async () => {
  // Record 0133: the buffer of an open editor can lag work that the store
  // took first. A diff of that buffer wrote a revert of the work as work of
  // this device, and a task box toggled on two devices read "[  ]".
  const backend = createBackend('frozen-document');
  const store = await openLocalStore(origin, backend.options());
  const key = {
    account: randomUUID(),
    workspace: randomUUID(),
    fileId: randomUUID(),
  };
  try {
    const made = draftOf(
      key.account,
      key.workspace,
      key.fileId,
      'copy-frozen',
      '- [ ] task\n',
    );
    await store.saveDraft(made);
    assert.ok((await store.checkpoint(made, null, 'text')) !== null);
    // Work of another device reaches the document before the editor joins it.
    await writeIntoDocument(store, key, '- [x] task\n');

    // The editor still shows the box unchecked and saves.
    const lagging = { ...made, sequence: 2 };
    await store.saveDraft(lagging);
    const entry = await store.checkpoint(lagging, 'Saved', 'document');
    assert.ok(entry !== null, 'the checkpoint must queue a mutation');

    const held = await store.readNoteDocument(
      key.account,
      key.workspace,
      key.fileId,
    );
    assert.equal(
      readDocumentText(held?.bytes ?? startDocument('')),
      '- [x] task\n',
    );
    // The version and the draft say what the document says.
    const revisionId = entry.input.revisions[0]?.id ?? '';
    assert.equal(
      await store.readRevisionText(key.account, key.workspace, revisionId),
      '- [x] task\n',
    );
    assert.equal(
      (await store.readDraft(key.account, key.workspace, 'copy-frozen'))?.text,
      '- [x] task\n',
    );
  } finally {
    await store.close();
  }
});

await test('a checkpoint of an open note refuses a note whose document is not here', async () => {
  // Record 0084: a device never starts the document of a note that the
  // server holds, and a frozen save has no text to start one from.
  const backend = createBackend('frozen-missing');
  const store = await openLocalStore(origin, backend.options());
  const account = randomUUID();
  const workspace = randomUUID();
  const fileId = randomUUID();
  try {
    const draft = draftOf(account, workspace, fileId, 'copy-missing', 'x\n', {
      baseRevisionId: randomUUID(),
    });
    await store.saveDraft(draft);
    await assert.rejects(
      store.checkpoint(draft, null, 'document'),
      (failure: unknown) =>
        isLocalStorageError(failure) && failure.kind === 'stale',
    );
    assert.equal(
      await store.readNoteDocument(account, workspace, fileId),
      null,
    );
  } finally {
    await store.close();
  }
});

await test('a cached note gives the document of the same read as its text', async () => {
  // Record 0133: the loader read the text and the document in two reads, so
  // work between them made the open write the difference as new work.
  const backend = createBackend('cached-document');
  const store = await openLocalStore(origin, backend.options());
  const key = {
    account: randomUUID(),
    workspace: randomUUID(),
    fileId: randomUUID(),
  };
  try {
    const made = draftOf(
      key.account,
      key.workspace,
      key.fileId,
      'copy-cached',
      '- [ ] task\n',
    );
    await store.saveDraft(made);
    await store.checkpoint(made, null, 'text');
    await writeIntoDocument(store, key, '- [x] task\n');
    await store.saveDraft({ ...made, text: '- [x] task\n', sequence: 2 });

    const cached = await store.readCachedNote(
      key.account,
      key.workspace,
      key.fileId,
    );
    assert.equal(cached?.text, '- [x] task\n');
    assert.equal(
      readDocumentText(cached?.document?.bytes ?? startDocument('')),
      '- [x] task\n',
    );
  } finally {
    await store.close();
  }
});
