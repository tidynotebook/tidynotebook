import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allOfflineTargetsPinned,
  offlineTargets,
  createOfflineWriteGate,
} from './offline-files.ts';

await test('offline controls exclude deleted files and missing current targets', () => {
  const image = {
    kind: 'attachment',
    deleted: false,
    acceptedHeadDigest: 'image',
    acceptedHeadRevisionId: 'version',
  } as const;
  const note = { ...image, kind: 'note', acceptedHeadDigest: 'note' } as const;
  const files = [
    image,
    note,
    { ...image, deleted: true },
    { ...image, acceptedHeadDigest: null, acceptedHeadRevisionId: null },
  ];
  assert.deepEqual(offlineTargets(files, 'images'), ['image']);
  assert.deepEqual(offlineTargets(files, 'history'), ['version', 'version']);
  assert.deepEqual(offlineTargets([], 'images'), []);
});

await test('empty, partial and failed reads cannot claim that all files are kept', async () => {
  assert.equal(await allOfflineTargetsPinned([], async () => true), false);
  assert.equal(
    await allOfflineTargetsPinned(['a', 'b'], async (target) => target === 'a'),
    false,
  );
  assert.equal(
    await allOfflineTargetsPinned(['a', 'b'], async () => true),
    true,
  );
  await assert.rejects(
    allOfflineTargetsPinned(['a'], async () => {
      throw new Error('Storage unavailable');
    }),
  );
});

await test('a workspace reread cannot release an unfinished offline write', async () => {
  const write = createOfflineWriteGate();
  const paused = Promise.withResolvers<void>();
  const pins = new Map<string, boolean>();
  const first = write(async () => {
    pins.set('workspace-a/image-1', true);
    await paused.promise;
    pins.set('workspace-a/image-2', true);
  });
  // Settings stays mounted across a workspace change. Its new read can finish
  // before the old workspace has finished writing its remaining pins.
  assert.equal(
    await allOfflineTargetsPinned(['workspace-b/image'], async () => false),
    false,
  );
  assert.equal(
    await write(async () => {
      pins.set('workspace-b/image', true);
    }),
    false,
  );
  assert.equal(pins.has('workspace-b/image'), false);
  paused.resolve();
  assert.equal(await first, true);
  assert.equal(
    await write(async () => {
      pins.set('workspace-b/image', true);
    }),
    true,
  );
  assert.deepEqual(
    [...pins],
    [
      ['workspace-a/image-1', true],
      ['workspace-a/image-2', true],
      ['workspace-b/image', true],
    ],
  );
});

await test('a refused offline write releases the gate for the next change', async () => {
  const write = createOfflineWriteGate();
  await assert.rejects(
    write(async () => {
      throw new Error('Storage unavailable');
    }),
  );
  assert.equal(await write(async () => {}), true);
});
