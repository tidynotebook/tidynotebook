import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  FileSaveSnapshot,
  LocalCachedNote,
  LocalChange,
  NoteDocument,
} from '@notesapp/sync';
import type { NoteLoadStatus } from '../../lib/note-load-state.ts';
import {
  createDeviceOpens,
  readDeviceNote,
  watchDeviceNote,
  type DeviceNoteStore,
  type DeviceOpens,
  type WatchedStore,
} from './device-note.ts';

const identity = {
  accountId: 'account-one',
  workspaceId: 'workspace-one',
  fileId: 'note-one',
};

const cachedNote: LocalCachedNote = {
  fileId: 'note-one',
  path: 'Folder/Note one.md',
  text: 'held text',
  deleted: false,
  workingCopyId: 'copy-one',
  sequence: 3,
  baseRevisionId: 'revision-one',
  stale: false,
  acceptedText: null,
  acceptedPath: 'Folder/Note one.md',
  acceptedRevisionId: 'revision-one',
  document: null,
};

const saveSnapshot: FileSaveSnapshot = {
  fileId: 'note-one',
  path: 'Folder/Note one.md',
  deleted: false,
  latestDraftSequence: null,
  latestMutationId: null,
  queueState: null,
  acceptedHeadRevisionId: 'revision-one',
  localHeadRevisionId: 'revision-one',
  hasUncheckpointedDraft: false,
};

/**
 * A store that answers the reads of an open from fixed rows.
 *
 * The cached read carries the document of the note, as the store reads the
 * two in one transaction (record 0133).
 */
function storeOf(
  note: LocalCachedNote | null,
  document: NoteDocument | null,
  snapshot: FileSaveSnapshot = saveSnapshot,
): DeviceNoteStore {
  return {
    readCachedNote: () =>
      Promise.resolve(note === null ? null : { ...note, document }),
    readFileSaveSnapshot: () => Promise.resolve(snapshot),
  };
}

await test('a note with its document opens from the device', async () => {
  // Record 0181. The open gave the editor the bytes alone, so the editor
  // took its generation from a later read, which could be a new one.
  const bytes = new Uint8Array([1, 2, 3]);
  const status = await readDeviceNote(
    storeOf(cachedNote, { bytes, epoch: 2 }),
    identity,
  );

  assert.deepEqual(status, {
    kind: 'ready',
    path: 'Folder/Note one.md',
    text: 'held text',
    headRevisionId: 'revision-one',
    workingCopyId: 'copy-one',
    sequence: 3,
    document: { bytes, epoch: 2 },
  });
});

await test('a note of the server without its document asks the server', async () => {
  // The editor would start that note from Markdown on this device, so the
  // server read opens it instead (records 0084, 0088).
  assert.equal(await readDeviceNote(storeOf(cachedNote, null), identity), null);
});

await test('a note that only this device holds opens without a document', async () => {
  const status = await readDeviceNote(
    storeOf(cachedNote, null, {
      ...saveSnapshot,
      acceptedHeadRevisionId: null,
    }),
    identity,
  );

  assert.equal(status?.kind, 'ready');
});

await test('a deleted note opens as deleted and an unknown one asks the server', async () => {
  assert.deepEqual(
    await readDeviceNote(
      storeOf({ ...cachedNote, deleted: true }, null),
      identity,
    ),
    { kind: 'deleted', path: 'Folder/Note one.md' },
  );
  assert.equal(await readDeviceNote(storeOf(null, null), identity), null);
});

await test('a failed read of the device asks the server', async () => {
  const failing: DeviceNoteStore = {
    ...storeOf(cachedNote, null),
    readCachedNote: () => Promise.reject(new Error('blocked')),
  };

  assert.equal(await readDeviceNote(failing, identity), null);
});

/** A store whose announcements of change the test makes itself. */
type FakeStore = WatchedStore & {
  readonly announce: (change: LocalChange) => void;
  readonly watchers: () => number;
};

function fakeStore(): FakeStore {
  const listeners = new Set<(change: LocalChange) => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    announce(change) {
      for (const listener of [...listeners]) listener(change);
    },
    watchers: () => listeners.size,
  };
}

/** A read and a hold that the test settles itself, so no test waits on a clock. */
function controlled(): {
  readonly opens: DeviceOpens<FakeStore>;
  readonly reads: () => number;
  readonly answer: (status: NoteLoadStatus | null) => void;
  readonly spend: () => void;
} {
  let count = 0;
  let answer: (status: NoteLoadStatus | null) => void = () => undefined;
  let spend: () => void = () => undefined;
  const opens = createDeviceOpens<FakeStore>(
    () => {
      count += 1;
      return new Promise((resolve) => {
        answer = resolve;
      });
    },
    () =>
      new Promise((resolve) => {
        spend = resolve;
      }),
  );
  return {
    opens,
    reads: () => count,
    answer: (status) => answer(status),
    spend: () => spend(),
  };
}

const heldNote: NoteLoadStatus = {
  kind: 'ready',
  path: 'Note one.md',
  text: 'held text',
  headRevisionId: 'revision-one',
  sequence: 0,
};

await test('every ask of one note reads the device once', async () => {
  // React asks a suspended screen for the read on each render. A new read
  // each time would never settle.
  const { opens, reads, answer } = controlled();
  const store = fakeStore();
  const first = opens.open(store, identity);

  assert.equal(opens.open(store, identity), first);
  assert.equal(opens.peek(store, identity), first);
  assert.equal(reads(), 1);
  answer(heldNote);
  assert.equal(await first.held, heldNote);
  assert.equal(await first.read, heldNote);
});

await test('a read that outlasts the hold answers slow and keeps its answer', async () => {
  const { opens, answer, spend } = controlled();
  const opened = opens.open(fakeStore(), identity);

  spend();
  assert.equal(await opened.held, 'slow');
  answer(heldNote);
  assert.equal(await opened.read, heldNote);
});

await test('a note only the server can open answers server', async () => {
  const { opens, answer } = controlled();
  const opened = opens.open(fakeStore(), identity);

  answer(null);
  assert.equal(await opened.held, 'server');
});

await test('a forgotten read is never answered again', async () => {
  // The screen forgets the reads once it holds a note, so a later open reads
  // what the device holds then, and not an answer that is old.
  const { opens, reads } = controlled();
  const store = fakeStore();
  const first = opens.open(store, identity);

  opens.forget(store);
  assert.equal(opens.peek(store, identity), null);
  assert.notEqual(opens.open(store, identity), first);
  assert.equal(reads(), 2);
});

await test('the reads of one note stay apart per workspace and per store', () => {
  const { opens, reads } = controlled();
  const store = fakeStore();
  opens.open(store, identity);
  opens.open(store, { ...identity, workspaceId: 'workspace-two' });
  opens.open(fakeStore(), identity);

  assert.equal(reads(), 3);
});

await test('a change of the note drops its kept read', () => {
  // A navigation can start a read and leave it. A later open of that note
  // must not mount the editor on an answer that a later write replaced
  // (record 0085).
  const { opens, reads } = controlled();
  const store = fakeStore();
  const first = opens.open(store, identity);

  store.announce({ ...identity, kind: 'draft' });
  assert.equal(opens.peek(store, identity), null);
  assert.equal(store.watchers(), 0);
  assert.notEqual(opens.open(store, identity), first);
  assert.equal(reads(), 2);
});

await test('a change of another note keeps the kept read', () => {
  const { opens } = controlled();
  const store = fakeStore();
  const first = opens.open(store, identity);

  store.announce({ ...identity, fileId: 'note-two', kind: 'draft' });
  store.announce({
    ...identity,
    workspaceId: 'workspace-two',
    fileId: null,
    kind: 'cursor',
  });
  assert.equal(opens.peek(store, identity), first);
  // A change that names no file can change any note, so it drops the read.
  store.announce({ ...identity, fileId: null, kind: 'reset' });
  assert.equal(opens.peek(store, identity), null);
});

await test('forgetting the reads ends their watch over the store', () => {
  const { opens } = controlled();
  const store = fakeStore();
  opens.open(store, identity);
  opens.open(store, { ...identity, fileId: 'note-two' });

  assert.equal(store.watchers(), 2);
  opens.forget(store);
  assert.equal(store.watchers(), 0);
});

await test('a restore before subscription is read without another store event', async () => {
  const store = fakeStore();
  const seen: (LocalCachedNote | null)[] = [];
  const stop = watchDeviceNote(
    { ...store, readCachedNote: () => Promise.resolve(cachedNote) },
    identity,
    (note) => seen.push(note),
    () => assert.fail('unexpected purge'),
  );
  await Promise.resolve();
  assert.deepEqual(seen, [cachedNote]);
  stop();
  assert.equal(store.watchers(), 0);
});

await test('an older deleted read cannot replace a newer restore or a purge', async () => {
  const store = fakeStore();
  const before = Promise.withResolvers<LocalCachedNote | null>();
  let reads = 0;
  const seen: (LocalCachedNote | null)[] = [];
  let purged = false;
  const stop = watchDeviceNote(
    {
      ...store,
      readCachedNote: () =>
        ++reads === 1 ? before.promise : Promise.resolve(cachedNote),
    },
    identity,
    (note) => seen.push(note),
    () => {
      purged = true;
    },
  );
  store.announce({ ...identity, kind: 'file' });
  await Promise.resolve();
  before.resolve({ ...cachedNote, deleted: true });
  await Promise.resolve();
  assert.deepEqual(seen, [cachedNote]);
  store.announce({ ...identity, kind: 'file' });
  store.announce({ ...identity, kind: 'purge' });
  await Promise.resolve();
  assert.equal(purged, true);
  assert.equal(seen.length, 1);
  stop();
});
