import assert from 'node:assert/strict';
import test from 'node:test';
import { compareLines } from '@notesapp/editor';
import { countDiffRows, diffBlocks } from './diff-rows.ts';
import {
  changeCountText,
  controlsWhenShown,
  currentVersionText,
  rowChangeOf,
  rowChangeText,
  rowReading,
} from './history-rows.ts';

await test('a count reads as plain words in both numbers', () => {
  assert.equal(changeCountText({ added: 1, removed: 0 }), '1 line added');
  assert.equal(
    changeCountText({ added: 3, removed: 2 }),
    '3 lines added, 2 lines removed',
  );
  assert.equal(changeCountText({ added: 0, removed: 1 }), '1 line removed');
  assert.equal(changeCountText({ added: 0, removed: 0 }), 'No line changed');
});

await test('the first version has nothing to compare with', () => {
  const change = rowChangeOf({
    deleted: false,
    restored: false,
    first: true,
    count: null,
  });
  assert.deepEqual(change, { kind: 'first' });
  assert.equal(rowChangeText(change), 'First version');
});

await test('a deletion is the whole message of its version', () => {
  const change = rowChangeOf({
    deleted: true,
    restored: false,
    first: false,
    count: { added: 0, removed: 9 },
  });
  assert.equal(rowChangeText(change), 'Note deleted');
});

await test('a restore says so and still reports its counts', () => {
  const change = rowChangeOf({
    deleted: false,
    restored: true,
    first: false,
    count: { added: 4, removed: 1 },
  });
  assert.equal(
    rowChangeText(change),
    'Earlier text brought back, 4 lines added, 1 line removed',
  );
});

await test('a comparison that did not finish still says something true', () => {
  const change = rowChangeOf({
    deleted: false,
    restored: false,
    first: false,
    count: null,
  });
  assert.equal(rowChangeText(change), 'Text changed');
});

await test('no row reading names a revision or an instant', () => {
  const readings = [
    rowChangeText(
      rowChangeOf({
        deleted: false,
        restored: false,
        first: false,
        count: { added: 2, removed: 0 },
      }),
    ),
    rowChangeText(
      rowChangeOf({
        deleted: true,
        restored: false,
        first: false,
        count: null,
      }),
    ),
  ];
  for (const reading of readings) {
    assert.doesNotMatch(reading, /[0-9a-f]{8}-[0-9a-f]{4}/);
    assert.doesNotMatch(reading, /\d{4}-\d{2}-\d{2}T/);
  }
});

await test('a merged version says that it holds changes of another device', () => {
  const edited = rowChangeOf({
    deleted: false,
    restored: false,
    first: false,
    count: { added: 2, removed: 1 },
  });
  assert.equal(
    rowReading(edited, true),
    '2 lines added, 1 line removed, with changes from another device',
  );
  assert.equal(rowReading(edited, false), '2 lines added, 1 line removed');
  assert.equal(
    rowReading({ kind: 'unknown' }, true),
    'Text changed, with changes from another device',
  );
  // A deletion and a first version keep their one message.
  assert.equal(rowReading({ kind: 'deleted' }, true), 'Note deleted');
  assert.equal(rowReading({ kind: 'first' }, true), 'First version');
});

await test('the current version states what the server holds', () => {
  // The review of the merged branch: the panel said that the note holds
  // this text now, which is false while this device holds unsent edits.
  assert.ok(currentVersionText.includes('server'));
  assert.ok(!/holds this text now/u.test(currentVersionText));
});

await test('a row and a tab name a panel only while it is in the page', () => {
  // The review of the merged branch: a closed row and an inactive tab named
  // an id that no element held.
  assert.equal(controlsWhenShown('history-panel-2', true), 'history-panel-2');
  assert.equal(controlsWhenShown('history-panel-2', false), undefined);
});

await test('an unchanged save and a later checkbox edit have different comparison baselines', () => {
  const previous = '- [ ] Pack bags\n';
  const selected = previous;
  const current = '- [x] Pack bags\n';
  const atSave = compareLines(previous, selected);
  const withCurrent = compareLines(selected, current);
  assert.equal(atSave.kind, 'complete');
  assert.equal(withCurrent.kind, 'complete');
  if (atSave.kind !== 'complete' || withCurrent.kind !== 'complete') return;
  assert.equal(
    rowReading(
      { kind: 'edited', count: countDiffRows(diffBlocks(atSave.hunks)) },
      false,
    ),
    'No line changed',
  );
  assert.deepEqual(countDiffRows(diffBlocks(withCurrent.hunks)), {
    added: 1,
    removed: 1,
  });
});
