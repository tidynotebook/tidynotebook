import assert from 'node:assert/strict';
import test from 'node:test';
import { ChangeSet } from '@codemirror/state';
import { TableScrollRecords } from './table-scroll.ts';

await test('each table retains its own identity and offset as earlier text shifts', () => {
  const records = new TableScrollRecords('editor');
  const first = records.register({ from: 10, to: 40 });
  const second = records.register({ from: 60, to: 90 });
  const one = records.get(first),
    two = records.get(second);
  assert.ok(one && two);
  one.left = 23;
  two.left = 181;
  records.map(ChangeSet.of({ from: 20, insert: 'typed' }, 100), (from) =>
    from === 10 ? { from: 10, to: 45 } : { from: 65, to: 95 },
  );
  assert.equal(records.at(10)?.id, first);
  assert.equal(records.at(65)?.id, second);
  assert.equal(records.get(first)?.left, 23);
  assert.equal(records.get(second)?.left, 181);
  assert.notEqual(first, second);
});

await test('deletion and replacement cannot lend a scroll offset to a new table', () => {
  const records = new TableScrollRecords('editor');
  const first = records.register({ from: 10, to: 40 });
  const second = records.register({ from: 60, to: 90 });
  const record = records.get(second);
  assert.ok(record);
  record.left = 181;
  records.map(ChangeSet.of({ from: 10, to: 40 }, 100), () => ({
    from: 30,
    to: 60,
  }));
  assert.equal(records.get(first), undefined);
  assert.equal(records.at(30)?.id, second);
  const replacement = records.register({ from: 5, to: 15 });
  assert.notEqual(replacement, first);
  assert.equal(records.get(replacement)?.left, 0);
  records.map(
    ChangeSet.of({ from: 0, to: 70, insert: 'new note' }, 70),
    () => null,
  );
  assert.equal([...records.values()].length, 0);
  const next = records.register({ from: 0, to: 8 });
  assert.notEqual(next, first);
  assert.notEqual(next, second);
  assert.equal(records.get(next)?.left, 0);
});

await test('unparsed anchors map without text matching and joined headers retire', () => {
  const records = new TableScrollRecords('editor');
  const first = records.register({ from: 10, to: 40 });
  const second = records.register({ from: 60, to: 90 });
  records.map(
    ChangeSet.of({ from: 0, insert: 'prefix' }, 100),
    () => undefined,
  );
  assert.equal(records.at(16)?.id, first);
  assert.equal(records.at(66)?.id, second);
  records.register({ from: 16, to: 96 });
  assert.equal(records.get(second), undefined);
  assert.equal([...records.values()].length, 1);
  records.clear();
  assert.equal([...records.values()].length, 0);
  assert.notEqual(records.register({ from: 16, to: 96 }), first);
});
