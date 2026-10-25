import assert from 'node:assert/strict';
import test from 'node:test';
import { allOfflineTargetsPinned, offlineTargets } from './offline-files.ts';

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
