import assert from 'node:assert/strict';
import test from 'node:test';
import { ChangeSet, EditorState } from '@codemirror/state';
import { noteMarkdownExtensions, parsedWhole } from './language.ts';
import { tableAt } from './table-grid.ts';
import { TableScrollRecords } from './table-scroll.ts';

await test('default table identities work without secure-context browser APIs', () => {
  const crypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  assert.ok(crypto);
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: undefined,
  });
  try {
    const first = new TableScrollRecords();
    const second = new TableScrollRecords();
    const one = first.register({ from: 0, to: 20 });
    const two = second.register({ from: 0, to: 20 });
    assert.notEqual(one, two);
    first.clear();
    assert.notEqual(first.register({ from: 0, to: 20 }), one);
    const named = new TableScrollRecords('editor');
    assert.equal(named.register({ from: 0, to: 20 }), 'editor-1');
  } finally {
    Object.defineProperty(globalThis, 'crypto', crypto);
  }
});

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

await test('a partial header replacement retains a valid table without leading pipes', () => {
  const source = 'Before\n\nAlpha | Beta\n--- | ---\nfirst | second\n\nAfter';
  for (const edit of [
    {
      from: source.indexOf('Alpha'),
      to: source.indexOf('Alpha') + 5,
      insert: 'Z',
    },
    { from: source.indexOf('Alpha'), to: source.indexOf('Alpha') + 1 },
    { from: 0, insert: 'Earlier prose\n\n' },
    { from: source.indexOf('Alpha'), insert: 'New ' },
  ]) {
    const state = parsedWhole(
      EditorState.create({
        doc: source,
        extensions: noteMarkdownExtensions({ headless: true }),
      }),
    );
    const table = tableAt(state, source.indexOf('Alpha'));
    assert.ok(table);
    const records = new TableScrollRecords('editor');
    const id = records.register(table);
    const record = records.get(id);
    assert.ok(record);
    record.left = 181;
    const transaction = state.update({ changes: edit });
    const next = parsedWhole(transaction.state);
    let calls = 0;
    records.map(transaction.changes, (from) => {
      calls++;
      const table = tableAt(next, from);
      const header = table?.rows[0];
      return table !== null && header !== undefined && from <= header.to
        ? table
        : null;
    });
    assert.equal(
      calls,
      1,
      'The grammar must check whether the header survives.',
    );
    assert.equal(records.get(id)?.left, 181);
    const surviving = tableAt(next, next.doc.toString().indexOf(' | Beta'));
    assert.ok(surviving);
    assert.equal(records.at(surviving.from)?.id, id);
  }
});

await test('mapped header fallback refuses removed syntax and full replacements', () => {
  const state = parsedWhole(
    EditorState.create({
      doc: 'Alpha | Beta\n--- | ---\nfirst | second',
      extensions: noteMarkdownExtensions({ headless: true }),
    }),
  );
  const table = tableAt(state, 0);
  assert.ok(table);
  for (const replacement of ['New note', 'Gamma | Delta\n--- | ---\nx | y']) {
    const records = new TableScrollRecords('editor');
    const id = records.register(table);
    let calls = 0;
    records.map(
      ChangeSet.of(
        { from: table.from, to: table.to, insert: replacement },
        state.doc.length,
      ),
      () => {
        calls++;
        return { from: 0, to: replacement.length };
      },
    );
    assert.equal(
      calls,
      0,
      'A full replacement cannot borrow a table identity.',
    );
    assert.equal(records.get(id), undefined);
  }
  const records = new TableScrollRecords('editor');
  const id = records.register(table);
  const transaction = state.update({
    changes: { from: 0, to: 'Alpha | Beta'.length, insert: 'Alpha Beta' },
  });
  const next = parsedWhole(transaction.state);
  let calls = 0;
  records.map(transaction.changes, (from) => {
    calls++;
    return tableAt(next, from);
  });
  assert.equal(calls, 1);
  assert.equal(
    records.get(id),
    undefined,
    'A partial edit without a surviving header is refused.',
  );
});
