import assert from 'node:assert/strict';
import test from 'node:test';
import { contentRowOffsets, contentRowWindow } from './content-row-window.ts';

await test('content rows reserve the measured height of each name', () => {
  const offsets = contentRowOffsets([44, 64, 44, 64, 44], 4);
  assert.deepEqual(offsets, [0, 48, 116, 164, 232, 280]);
  assert.deepEqual(contentRowWindow(offsets, 116, 44, 0), {
    start: 2,
    end: 3,
    before: 116,
    after: 116,
  });
});
await test('content windows keep neighbours without losing variable space', () => {
  const offsets = contentRowOffsets([44, 64, 44, 64, 44], 4);
  assert.deepEqual(contentRowWindow(offsets, 116, 44, 1), {
    start: 1,
    end: 4,
    before: 48,
    after: 48,
  });
  assert.deepEqual(contentRowWindow([0], 0, 500, 8), {
    start: 0,
    end: 0,
    before: 0,
    after: 0,
  });
});
