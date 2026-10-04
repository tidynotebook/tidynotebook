/** Checks the daily cleanup of the object store (record 0192). */
import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ObjectStore,
  PendingUpload,
  StoredObject,
} from '@notesapp/storage-server';
import {
  createObjectCleanup,
  objectCleanupIntervalMs,
} from './object-cleanup.ts';

const day = 24 * 60 * 60 * 1000;

/** A store that holds listed objects and uploads in memory. */
function memoryStore(
  objects: StoredObject[],
  uploads: PendingUpload[],
): { readonly store: ObjectStore; readonly lists: () => number } {
  let lists = 0;
  const refuse = (): never => {
    throw new Error('The cleanup does not call this.');
  };
  const store: ObjectStore = {
    kind: 'filesystem',
    write: refuse,
    read: refuse,
    size: refuse,
    promote: refuse,
    removePrefix: refuse,
    startUpload: refuse,
    writePart: refuse,
    listParts: refuse,
    completeUpload: refuse,
    probe: refuse,
    close: () => undefined,
    async remove(key) {
      const at = objects.findIndex((item) => item.key === key);
      if (at >= 0) objects.splice(at, 1);
    },
    async abortUpload(key) {
      const at = uploads.findIndex((item) => item.key === key);
      if (at >= 0) uploads.splice(at, 1);
    },
    async *list(prefix) {
      lists += 1;
      for (const item of [...objects])
        if (item.key.startsWith(prefix)) yield item;
    },
    async *listUploads(prefix) {
      for (const item of [...uploads])
        if (item.key.startsWith(prefix)) yield item;
    },
  };
  return { store, lists: () => lists };
}

await test('the cleanup removes what waits under staging for more than a day', async () => {
  const now = new Date('2026-10-04T12:00:00Z');
  const old = new Date(now.getTime() - day - 1);
  const fresh = new Date(now.getTime() - day + 60_000);
  const objects: StoredObject[] = [
    { key: 'staging/attachments/old', modifiedAt: old },
    { key: 'staging/attachments/fresh', modifiedAt: fresh },
    { key: 'workspaces/w/attachments/kept', modifiedAt: old },
  ];
  const uploads: PendingUpload[] = [
    { key: 'staging/imports/old.zip', startedAt: old },
    { key: 'staging/imports/fresh.zip', startedAt: fresh },
  ];
  const { store } = memoryStore(objects, uploads);
  const run = createObjectCleanup(store);
  assert.deepEqual(await run(now), { objects: 1, uploads: 1 });
  assert.deepEqual(
    objects.map((item) => item.key),
    ['staging/attachments/fresh', 'workspaces/w/attachments/kept'],
  );
  assert.deepEqual(
    uploads.map((item) => item.key),
    ['staging/imports/fresh.zip'],
  );
});

await test('one process lists the store once a day, though the run is hourly', async () => {
  const { store, lists } = memoryStore([], []);
  const run = createObjectCleanup(store);
  const start = new Date('2026-10-04T00:00:00Z');
  assert.notEqual(await run(start), null);
  assert.equal(lists(), 1);
  // The hourly runs of the same day list nothing.
  for (let hour = 1; hour < 24; hour += 1)
    assert.equal(
      await run(new Date(start.getTime() + hour * 60 * 60 * 1000)),
      null,
    );
  assert.equal(lists(), 1);
  assert.notEqual(
    await run(new Date(start.getTime() + objectCleanupIntervalMs)),
    null,
  );
  assert.equal(lists(), 2);
});
