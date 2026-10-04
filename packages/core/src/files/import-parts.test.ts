/** Checks the rule of the parts of an import (record 0192). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { maxArchiveBytes } from './archive.ts';
import {
  importPartBytes,
  importPartRanges,
  importPartSize,
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
  assert.equal(importPartsProblem(ranges, size), null);
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
  assert.equal(importPartsProblem(ranges, maxArchiveBytes), null);
});

await test('a part holds the size of its place in the declared archive', () => {
  // Codex review of PR 288. A start declared a size that the parts did not
  // keep to, so a start of 1 byte could send and complete a whole archive.
  const declared = importPartBytes + 7;
  assert.equal(importPartSize(declared, 1), importPartBytes);
  assert.equal(importPartSize(declared, 2), 7);
  assert.equal(importPartSize(declared, 3), null);
  assert.equal(importPartSize(declared, 0), null);
  assert.equal(importPartSize(declared, 1.5), null);
  assert.equal(importPartSize(1, 1), 1);
  assert.equal(importPartSize(maxArchiveBytes, maxImportParts + 1), null);
});

await test('parts that make no declared archive name their problem', () => {
  const declared = importPartBytes + 7;
  const whole = [
    { partNumber: 1, size: importPartBytes },
    { partNumber: 2, size: 7 },
  ];
  assert.equal(importPartsProblem(whole, declared), null);
  // The order in which a store lists the parts does not matter.
  assert.equal(importPartsProblem([...whole].reverse(), declared), null);
  assert.equal(importPartsProblem([], declared), 'missing_part');
  assert.equal(importPartsProblem([], 0), 'missing_part');
  assert.equal(
    importPartsProblem([{ partNumber: 1, size: importPartBytes }], declared),
    'missing_part',
  );
  assert.equal(
    importPartsProblem(
      [
        { partNumber: 1, size: importPartBytes },
        { partNumber: 2, size: 8 },
      ],
      declared,
    ),
    'wrong_part',
  );
  // A part past the declared archive makes the archive larger than the
  // start checked.
  assert.equal(
    importPartsProblem([...whole, { partNumber: 3, size: 1 }], declared),
    'wrong_part',
  );
  assert.equal(importPartsProblem([{ partNumber: 1, size: 1 }], 1), null);
  assert.equal(
    importPartsProblem([{ partNumber: 1, size: 1 }], maxArchiveBytes + 1),
    'too_large',
  );
});
