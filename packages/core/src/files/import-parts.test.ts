/** Checks the rule of the parts of an import (record 0192). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { maxArchiveBytes } from './archive.ts';
import {
  importPartAllowed,
  importPartBytes,
  importPartRanges,
  importPartsBytes,
  importPartsProblem,
  maxImportParts,
} from './import-parts.ts';

await test('a part stays under the body bound of the proxy in front', () => {
  // The proxy refuses a body above 100 MB, so one part is well under it.
  assert.ok(importPartBytes < 100_000_000);
  assert.equal(maxImportParts * importPartBytes >= maxArchiveBytes, true);
  assert.equal((maxImportParts - 1) * importPartBytes < maxArchiveBytes, true);
});

await test('an archive is cut into full parts and one last part', () => {
  const size = 2 * importPartBytes + 7;
  const ranges = importPartRanges(size);
  assert.deepEqual(
    ranges.map((range) => [range.partNumber, range.start, range.end]),
    [
      [1, 0, importPartBytes],
      [2, importPartBytes, 2 * importPartBytes],
      [3, 2 * importPartBytes, size],
    ],
  );
  assert.equal(importPartsProblem(ranges), null);
  assert.equal(importPartsBytes(ranges), size);
  assert.deepEqual(
    importPartRanges(5).map((range) => range.size),
    [5],
  );
  assert.deepEqual(
    importPartRanges(10, 4).map((range) => [range.start, range.end]),
    [
      [0, 4],
      [4, 8],
      [8, 10],
    ],
  );
  assert.deepEqual(importPartRanges(10, 0), []);
  assert.deepEqual(importPartRanges(0), []);
  assert.deepEqual(importPartRanges(-1), []);
  assert.deepEqual(importPartRanges(1.5), []);
});

await test('the largest archive is cut into the most parts', () => {
  const ranges = importPartRanges(maxArchiveBytes);
  assert.equal(ranges.length, maxImportParts);
  assert.equal(importPartsProblem(ranges), null);
});

await test('a part outside the bounds is refused before it is stored', () => {
  assert.equal(importPartAllowed(1, importPartBytes), true);
  assert.equal(importPartAllowed(maxImportParts, 1), true);
  assert.equal(importPartAllowed(0, 1), false);
  assert.equal(importPartAllowed(maxImportParts + 1, 1), false);
  assert.equal(importPartAllowed(1, importPartBytes + 1), false);
  assert.equal(importPartAllowed(1, 0), false);
  assert.equal(importPartAllowed(1.5, 1), false);
});

await test('parts that make no archive name their problem', () => {
  assert.equal(importPartsProblem([]), 'no_parts');
  assert.equal(
    importPartsProblem([
      { partNumber: 1, size: importPartBytes },
      { partNumber: 3, size: 1 },
    ]),
    'missing_part',
  );
  assert.equal(
    importPartsProblem([{ partNumber: 2, size: 1 }]),
    'missing_part',
  );
  assert.equal(
    importPartsProblem([
      { partNumber: 1, size: importPartBytes - 1 },
      { partNumber: 2, size: 1 },
    ]),
    'short_part',
  );
  // The order in which a store lists the parts does not matter.
  assert.equal(
    importPartsProblem([
      { partNumber: 2, size: 1 },
      { partNumber: 1, size: importPartBytes },
    ]),
    null,
  );
  const tooMany = Array.from({ length: maxImportParts }, (_, index) => ({
    partNumber: index + 1,
    size: importPartBytes,
  }));
  assert.equal(importPartsProblem(tooMany), 'too_large');
});
