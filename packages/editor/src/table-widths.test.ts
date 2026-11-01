import assert from 'node:assert/strict';
import test from 'node:test';
import { fitTableColumns } from './table-widths.ts';

await test('columns never expand beyond their measured content', () => {
  assert.deepEqual(
    fitTableColumns([100, 70, 65], [30, 30, 30], 800),
    [100, 70, 65],
  );
});
await test('a narrow table shrinks and wraps before it scrolls', () => {
  const widths = fitTableColumns([300, 70, 65], [30, 30, 30], 250);
  assert.equal(
    widths.reduce((sum, width) => sum + width, 0),
    250,
  );
  assert.ok(
    widths.every((width, column) => width <= ([300, 70, 65][column] ?? 0)),
  );
});
await test('horizontal scroll starts only below the column minimums', () => {
  assert.deepEqual(
    fitTableColumns([100, 70, 65], [30, 30, 30], 60),
    [30, 30, 30],
  );
});
