/** Surface fill and visible content can change while wrapper boxes stay fixed. */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { compareSurface } from '../browser/symmetry.ts';

await test('parity detects changed fill, current state and inner content', () => {
  const root = mkdtempSync(join(tmpdir(), 'content-parity-'));
  const before = join(root, 'before.json'),
    after = join(root, 'after.json');
  const row = {
    key: 'row',
    text: 'Notes',
    x: 8,
    y: 8,
    width: 28,
    height: 28,
    contentX: 14,
    surface: 'rgb(34, 34, 34)',
    current: 'page',
  };
  try {
    writeFileSync(before, JSON.stringify([row]));
    for (const change of [
      { surface: 'transparent' },
      { current: null },
      { contentX: 22 },
    ]) {
      writeFileSync(after, JSON.stringify([{ ...row, ...change }]));
      assert.equal(compareSurface(before, after).length, 1);
    }
    writeFileSync(after, JSON.stringify([{ ...row, contentX: 15 }]));
    assert.deepEqual(compareSurface(before, after), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
