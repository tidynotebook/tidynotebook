/**
 * The controls of a table checks (record 0147).
 *
 * The controls find the cell under the pointer again at each measure, from
 * the place of the pointer, and never keep a cell element: a click restyles
 * the cell it lands in and the cell it leaves, the editor draws them again,
 * and a kept element left the grips on the row that the caret had left. A
 * drive of the note surface proves that part. The rule of which cell the
 * pointer names is pure, so it is proved here.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { pointedPlace } from './table-controls.ts';

const size = { rows: 3, columns: 4 };
const inside = { above: false, before: false };

await test('the pointer names the cell it is over', () => {
  assert.deepEqual(
    pointedPlace({ row: 1, column: 2 }, size, inside, { row: 2, column: 0 }),
    { row: 1, column: 2 },
  );
});

await test('a pointer over a grip keeps the row or the column it named', () => {
  // On the row grip, left of the grid: the row is under the pointer and
  // the column stays where it was.
  assert.deepEqual(
    pointedPlace(
      { row: 1, column: -1 },
      size,
      { above: false, before: true },
      { row: 2, column: 3 },
    ),
    { row: 1, column: 3 },
  );
  // On the add bar under the grid: the column is under the pointer and the
  // row stays where it was.
  assert.deepEqual(
    pointedPlace({ row: -1, column: 0 }, size, inside, { row: 1, column: 2 }),
    { row: 1, column: 0 },
  );
});

await test('with no earlier place the pointer names the nearest edge', () => {
  assert.deepEqual(
    pointedPlace(
      { row: -1, column: -1 },
      size,
      { above: true, before: true },
      null,
    ),
    { row: 0, column: 0 },
  );
  assert.deepEqual(pointedPlace({ row: -1, column: -1 }, size, inside, null), {
    row: 2,
    column: 3,
  });
});
