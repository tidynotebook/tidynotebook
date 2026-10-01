/**
 * The table grid checks (record 0095).
 *
 * The model, the writer, the commands and the three filters are functions of
 * `EditorState`, so every rule is proved here without a view. The notation
 * marks the selection inside the source: `‸` is a cursor, `«text»` a range.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EditorSelection,
  EditorState,
  type TransactionSpec,
} from '@codemirror/state';
import { formatContextOf } from './format-context.ts';
import { noteMarkdownExtensions } from './language.ts';
import {
  moveColumnEdit,
  moveRowEdit,
  alignColumnEdit,
  insertColumnLeftEdit,
  insertRowAboveEdit,
  addColumnEdit,
  appendColumnEdit,
  appendRowEdit,
  cellAboveEdit,
  cellBelowEdit,
  cellText,
  pastedCells,
  gridParts,
  nextCellEdit,
  previousCellEdit,
  removeColumnEdit,
  removeRowEdit,
  tableAt,
  tableData,
  tableEditSpec,
  tableGridEditing,
  writeTable,
} from './table-grid.ts';

/** Builds a state from text that marks its selection. */
function stateOf(source: string, editing = false): EditorState {
  const extensions = [
    noteMarkdownExtensions(),
    editing ? tableGridEditing() : [],
  ];
  const start = source.indexOf('«');
  if (start !== -1) {
    const rest = source.replace('«', '');
    const end = rest.indexOf('»');
    return EditorState.create({
      doc: rest.replace('»', ''),
      selection: { anchor: start, head: end },
      extensions,
    });
  }
  const cursor = source.indexOf('‸');
  assert.notEqual(cursor, -1, 'the source needs a cursor or a range');
  return EditorState.create({
    doc: source.replace('‸', ''),
    selection: { anchor: cursor },
    extensions,
  });
}

/** The document of a state with its selection marked. */
function marked(state: EditorState): string {
  const { from, to } = state.selection.main;
  const text = state.doc.toString();
  return from === to
    ? `${text.slice(0, from)}‸${text.slice(from)}`
    : `${text.slice(0, from)}«${text.slice(from, to)}»${text.slice(to)}`;
}

/** Applies a spec and returns the marked document. */
function applied(state: EditorState, spec: TransactionSpec | null): string {
  assert.notEqual(spec, null, 'the command declined');
  if (spec === null) return '';
  return marked(state.update(spec).state);
}

/** An aligned table of two columns and one body row. */
const aligned = '| a   | b   |\n| --- | --- |\n| 1   | 2   |';

/** The table of a state, read and written again. */
function rewritten(source: string): string {
  const state = stateOf(`${source}‸`);
  const table = tableAt(state, 1);
  assert.notEqual(table, null, 'no table');
  if (table === null) return '';
  return writeTable(tableData(state, table)).text;
}

await test('an aligned table is written back as it is', () => {
  assert.equal(rewritten(aligned), aligned);
});

await test('the writer aligns the columns and keeps the colons', () => {
  assert.equal(
    rewritten('| a | bbbbb |\n|:-|--:|\n|1|2|'),
    '| a   | bbbbb |\n| :-- | ----: |\n| 1   | 2     |',
  );
  assert.equal(
    rewritten('a | b\n:-: | ---\n1 | 2'),
    '| a   | b   |\n| :-: | --- |\n| 1   | 2   |',
  );
});

await test('a cell that a row holds beyond the header is kept', () => {
  assert.equal(
    rewritten('| a | b |\n| --- | --- |\n| 1 | 2 | 3 |'),
    '| a   | b   |     |\n| --- | --- | --- |\n| 1   | 2   | 3   |',
  );
});

await test('a table in a quote keeps its quote on every line', () => {
  const state = stateOf('> | a | b |\n> | --- | --- |\n> | 1 | 2 |‸');
  const table = tableAt(state, 4);
  assert.notEqual(table, null);
  if (table === null) return;
  assert.equal(
    writeTable(tableData(state, table)).text,
    '| a   | b   |\n> | --- | --- |\n> | 1   | 2   |',
  );
});

await test('Tab moves to the next cell and selects its text', () => {
  const state = stateOf('| a‸   | b   |\n| --- | --- |\n| 1   | 2   |');
  assert.equal(
    applied(state, tableEditSpec(state, nextCellEdit)),
    '| a   | «b»   |\n| --- | --- |\n| 1   | 2   |',
  );
  const endOfRow = stateOf('| a   | b‸   |\n| --- | --- |\n| 1   | 2   |');
  assert.equal(
    applied(endOfRow, tableEditSpec(endOfRow, nextCellEdit)),
    '| a   | b   |\n| --- | --- |\n| «1»   | 2   |',
  );
});

await test('Tab in the last cell adds a row', () => {
  const state = stateOf('| a   | b   |\n| --- | --- |\n| 1   | 2‸   |');
  assert.equal(
    applied(state, tableEditSpec(state, nextCellEdit)),
    '| a   | b   |\n| --- | --- |\n| 1   | 2   |\n| ‸    |     |',
  );
});

await test('Shift and Tab moves back and declines in the first cell', () => {
  const state = stateOf('| a   | b   |\n| --- | --- |\n| 1‸   | 2   |');
  assert.equal(
    applied(state, tableEditSpec(state, previousCellEdit)),
    '| a   | «b»   |\n| --- | --- |\n| 1   | 2   |',
  );
  const first = stateOf('| a‸   | b   |\n| --- | --- |\n| 1   | 2   |');
  assert.equal(tableEditSpec(first, previousCellEdit), null);
});

await test('Enter moves down, and adds a row under the last one', () => {
  const header = stateOf('| a   | b‸   |\n| --- | --- |\n| 1   | 2   |');
  assert.equal(
    applied(header, tableEditSpec(header, cellBelowEdit)),
    '| a   | b   |\n| --- | --- |\n| 1   | 2‸   |',
  );
  const last = stateOf('| a   | b   |\n| --- | --- |\n| 1   | 2‸   |');
  assert.equal(
    applied(last, tableEditSpec(last, cellBelowEdit)),
    '| a   | b   |\n| --- | --- |\n| 1   | 2   |\n|     | ‸    |',
  );
});

await test('Shift and Enter moves up, and stays in the header', () => {
  const body = stateOf('| a   | b   |\n| --- | --- |\n| 1‸   | 2   |');
  assert.equal(
    applied(body, tableEditSpec(body, cellAboveEdit)),
    '| a‸   | b   |\n| --- | --- |\n| 1   | 2   |',
  );
  const header = stateOf('| a‸   | b   |\n| --- | --- |\n| 1   | 2   |');
  assert.equal(
    applied(header, tableEditSpec(header, cellAboveEdit)),
    '| a‸   | b   |\n| --- | --- |\n| 1   | 2   |',
  );
});

await test('the header row and the last column cannot be removed', () => {
  const header = stateOf('| a‸   | b   |\n| --- | --- |\n| 1   | 2   |');
  assert.equal(tableEditSpec(header, removeRowEdit), null);
  const one = stateOf('| a‸   |\n| --- |\n| 1   |');
  assert.equal(tableEditSpec(one, removeColumnEdit), null);
});

await test('a command writes a messy table aligned', () => {
  const state = stateOf('|a|bb|\n|-|-|\n|1‸|2|');
  assert.equal(
    applied(state, tableEditSpec(state, cellAboveEdit)),
    '| a‸   | bb  |\n| --- | --- |\n| 1   | 2   |',
  );
});

await test('a command outside a table declines', () => {
  const state = stateOf('Text‸');
  assert.equal(tableEditSpec(state, nextCellEdit), null);
});

await test('a command changes no character that it keeps', () => {
  // The changes are the smallest ones, so the text of a cell the command did
  // not touch is never replaced, and a remote edit of it survives.
  const moved = stateOf(`${aligned.replace('| a   ', '| a‸   ')}`);
  const move = tableEditSpec(moved, nextCellEdit);
  assert.notEqual(move, null);
  assert.equal(moved.update(move ?? {}).changes.empty, true);

  const state = stateOf(aligned.replace('| a   ', '| a‸   '));
  const spec = tableEditSpec(state, addColumnEdit);
  assert.notEqual(spec, null);
  const changes = state.update(spec ?? {}).changes;
  const kept = [
    aligned.indexOf('b'),
    aligned.indexOf('1'),
    aligned.indexOf('2'),
  ];
  changes.iterChangedRanges((fromA, toA) => {
    for (const at of kept)
      assert.ok(
        at < fromA || at >= toA,
        `the change covers ${aligned[at] ?? ''}`,
      );
  });
});

/** The head after one move of a person to `pos`. */
function moved(
  source: string,
  pos: number,
  userEvent: 'select' | 'select.pointer',
): number {
  const state = stateOf(source, true);
  return state.update({ selection: { anchor: pos }, userEvent }).state.selection
    .main.head;
}

await test('a pointer in the padding of a cell places the caret at its text', () => {
  const at = '| a‸   | b   |\n| --- | --- |\n| 1   | 2   |';
  const doc = aligned;
  // After the text of `b`, in its padding.
  assert.equal(
    moved(at, doc.indexOf('b') + 2, 'select.pointer'),
    doc.indexOf('b') + 1,
  );
  // In the padding before the text of `b`.
  assert.equal(
    moved(at, doc.indexOf('b') - 1, 'select.pointer'),
    doc.indexOf('b'),
  );
});

await test('an empty cell takes the caret one space after its separator', () => {
  const doc = '| a   | b   |\n| --- | --- |\n|     | 2   |';
  const source = doc.replace('| a', '| a‸');
  const row = doc.lastIndexOf('\n') + 1;
  assert.equal(moved(source, row + 4, 'select.pointer'), row + 2);
});

await test('the caret never stands on the delimiter row', () => {
  const source = aligned.replace('| b   ', '| b‸   ');
  const delimiter = aligned.indexOf('| ---', 5);
  // A move down from the header lands in the body, in the same column.
  assert.equal(
    moved(source, delimiter + 9, 'select'),
    aligned.indexOf('2') + 1,
  );
});

await test('an arrow along a row steps from one cell text to the next', () => {
  const source = aligned.replace('| a   ', '| a‸   ');
  const doc = aligned;
  // Right from the end of `a` lands in the padding, and goes on to `b`.
  assert.equal(moved(source, doc.indexOf('a') + 2, 'select'), doc.indexOf('b'));
  // Right from the end of the last cell of a row goes to the next row.
  const endOfB = aligned.replace('| b   ', '| b‸   ');
  assert.equal(moved(endOfB, doc.indexOf('b') + 2, 'select'), doc.indexOf('1'));
  // Left from the start of `b` goes to the end of `a`.
  const startOfB = aligned.replace('| b', '| ‸b');
  assert.equal(
    moved(startOfB, doc.indexOf('b') - 1, 'select'),
    doc.indexOf('a') + 1,
  );
});

await test('End stops at the last cell of the row', () => {
  const source = aligned.replace('| a   ', '| a‸   ');
  const lineEnd = aligned.indexOf('\n');
  assert.equal(moved(source, lineEnd, 'select'), aligned.indexOf('b') + 1);
});

await test('a selected range and a move by a program keep their place', () => {
  const state = stateOf(aligned.replace('| a', '| ‸a'), true);
  const range = state.update({
    selection: EditorSelection.range(0, 12),
    userEvent: 'select',
  }).state.selection.main;
  assert.deepEqual([range.from, range.to], [0, 12]);
  const program = state.update({ selection: { anchor: 4 } }).state.selection
    .main;
  assert.equal(program.head, 4);
});

/**
 * The marked document after one edit of a person at `from` to `to`.
 *
 * The edit runs through the editing extensions, so the filters of the table
 * decide what it does, as they do for a key press.
 */
function edited(
  source: string,
  change: {
    readonly from: number;
    readonly to: number;
    readonly insert?: string;
  },
  userEvent: string,
): string {
  const state = stateOf(source, true);
  const insert = change.insert ?? '';
  return marked(
    state.update({
      changes: { from: change.from, to: change.to, insert },
      selection: { anchor: change.from + insert.length },
      userEvent,
    }).state,
  );
}

/** Backspace at the caret of a marked source, `times` times. */
function backspaces(source: string, times: number): string {
  let current = source;
  for (let index = 0; index < times; index += 1) {
    const head = current.indexOf('‸');
    if (head === 0) break;
    current = edited(current, { from: head - 1, to: head }, 'delete.backward');
  }
  return current;
}

await test('Backspace through a cell empties it and never removes it', () => {
  // The fault the owner met: the padding went after the text, the cell was
  // left with no width, and the row lost it (record 0096).
  const start = '| ab‸  | c   |\n| --- | --- |\n| 1   | 2   |';
  assert.equal(
    backspaces(start, 8),
    '| ‸    | c   |\n| --- | --- |\n| 1   | 2   |',
  );
  const tight = '|a‸|b|\n|-|-|\n|1|2|';
  assert.equal(
    backspaces(tight, 3),
    '| ‸    | b   |\n| --- | --- |\n| 1   | 2   |',
  );
});

await test('Delete at the end of a cell keeps the next cell', () => {
  const start = '| a‸   | b   |\n| --- | --- |\n| 1   | 2   |';
  let current = start;
  for (let index = 0; index < 6; index += 1) {
    const head = current.indexOf('‸');
    current = edited(current, { from: head, to: head + 1 }, 'delete.forward');
  }
  assert.equal(current, start);
});

await test('a selection across two cells clears their text', () => {
  const doc = aligned;
  assert.equal(
    edited(
      `${doc}‸`,
      { from: doc.indexOf('a'), to: doc.indexOf('b') + 1 },
      'delete.selection',
    ),
    '| ‸    |     |\n| --- | --- |\n| 1   | 2   |',
  );
});

await test('a selection across two rows clears their text and keeps both', () => {
  const doc = aligned;
  assert.equal(
    edited(
      `${doc}‸`,
      { from: doc.indexOf('b'), to: doc.indexOf('1') + 1 },
      'delete.selection',
    ),
    '| a   | ‸    |\n| --- | --- |\n|     | 2   |',
  );
});

await test('a cut of a whole row leaves the row with empty cells', () => {
  const doc = `${aligned}\n| 3   | 4   |`;
  const row = doc.lastIndexOf('\n') + 1;
  assert.equal(
    edited(`${doc}‸`, { from: row, to: doc.length }, 'delete.cut'),
    '| a   | b   |\n| --- | --- |\n| 1   | 2   |\n| ‸    |     |',
  );
});

await test('a selection from the text above into a table keeps the table', () => {
  const doc = `Intro\n\n${aligned}`;
  assert.equal(
    edited(
      `${doc}‸`,
      { from: 0, to: doc.indexOf('a') + 1 },
      'delete.selection',
    ),
    '‸\n|     | b   |\n| --- | --- |\n| 1   | 2   |',
  );
});

await test('a selection from a table into the text below keeps the table', () => {
  const doc = `${aligned}\n\nOutro`;
  assert.equal(
    edited(
      `${doc}‸`,
      { from: doc.indexOf('2'), to: doc.indexOf('tro') },
      'delete.selection',
    ),
    // The blank line under the table stays, so the rest of the text is not
    // read as one more row of it.
    '| a   | b   |\n| --- | --- |\n| 1   | ‸    |\n\ntro',
  );
});

await test('the text under a table never joins it as a row', () => {
  // Regression: Backspace at the start of the text under a table removed the
  // blank line between them, and GFM read the text as a new row.
  const doc = `${aligned}\n\nOutro`;
  const outro = doc.indexOf('Outro');
  assert.equal(
    edited(
      `${doc.slice(0, outro)}‸${doc.slice(outro)}`,
      { from: outro - 1, to: outro },
      'delete.backward',
    ),
    `${aligned}\n‸\nOutro`,
  );
  // Text written on the blank line starts under it, and not in the table.
  const blank = doc.indexOf('\n\n') + 1;
  assert.equal(
    edited(`${doc}‸`, { from: blank, to: blank, insert: 'x' }, 'input.type'),
    `${aligned}\n\nx‸\nOutro`,
  );
  // A table with text right under it already is left as it stands.
  const joined = `${aligned}\nOutro`;
  assert.equal(
    edited(
      `${joined}‸`,
      { from: joined.length, to: joined.length, insert: '!' },
      'input.type',
    ),
    `${joined}!‸`,
  );
});

await test('the line break between two rows and the delimiter row stay', () => {
  const doc = aligned;
  const text = (source: string): string => source.replace('‸', '');
  const header = doc.indexOf('\n');
  assert.equal(
    text(
      edited(`${doc}‸`, { from: header, to: header + 1 }, 'delete.backward'),
    ),
    aligned,
  );
  const delimiter = doc.indexOf('| ---');
  assert.equal(
    text(
      edited(
        `${doc}‸`,
        { from: delimiter, to: delimiter + 13 },
        'delete.selection',
      ),
    ),
    aligned,
  );
});

await test('typing inside the text of a cell is left as it is', () => {
  // The common case is not rewritten, so it costs nothing and an IME or an
  // undo meets the plain edit.
  const doc = aligned;
  const at = doc.indexOf('a') + 1;
  assert.equal(
    edited(`${doc}‸`, { from: at, to: at, insert: 'x' }, 'input.type'),
    '| ax‸   | b   |\n| --- | --- |\n| 1   | 2   |',
  );
});

await test('a deletion of the whole table removes it', () => {
  const doc = `Intro\n\n${aligned}\n\nOutro`;
  const state = stateOf(`${doc}‸`, true);
  const from = doc.indexOf('| a');
  const to = from + aligned.length;
  const next = state.update({
    changes: { from, to },
    userEvent: 'delete.selection',
  }).state;
  assert.equal(next.doc.toString(), 'Intro\n\n\n\nOutro');
});

await test('work of another device may change the separators', () => {
  const state = stateOf(aligned.replace('| a', '| ‸a'), true);
  const next = state.update({ changes: { from: 0, to: 1 } }).state;
  assert.equal(next.doc.toString(), aligned.slice(1));
});

await test('a pipe typed into a cell is escaped', () => {
  const doc = aligned;
  const at = doc.indexOf('a') + 1;
  assert.equal(
    edited(`${doc}‸`, { from: at, to: at, insert: '|' }, 'input.type'),
    '| a\\|‸ | b   |\n| --- | --- |\n| 1   | 2   |',
  );
});

await test('a pasted line break in a cell becomes a space', () => {
  const doc = aligned;
  const at = doc.indexOf('a') + 1;
  assert.equal(
    edited(`${doc}‸`, { from: at, to: at, insert: 'x\ny' }, 'input.paste'),
    '| ax y‸ | b   |\n| ---- | --- |\n| 1    | 2   |',
  );
});

await test('text typed outside a table is left as it is', () => {
  const state = stateOf(`Text‸\n\n${aligned}`, true);
  const next = state.update({
    changes: { from: 4, insert: '|\n' },
    userEvent: 'input.type',
  }).state;
  assert.ok(next.doc.toString().startsWith('Text|\n'));
});

await test('the text of a cell escapes a bare pipe and joins its lines', () => {
  assert.equal(cellText('a|b', false), 'a\\|b');
  assert.equal(cellText('a\\|b', false), 'a\\|b');
  assert.equal(cellText('|b', true), '|b');
  assert.equal(cellText('a\r\nb\nc', false), 'a b c');
});

await test('the format context states the row and the columns of the caret', () => {
  assert.deepEqual(formatContextOf(stateOf(aligned.replace('| a', '| a‸'))), {
    table: true,
    bodyRow: false,
    row: 0,
    rows: 2,
    column: 0,
    columns: 2,
    align: null,
    itemUp: false,
    itemDown: false,
  });
  assert.deepEqual(formatContextOf(stateOf(aligned.replace('| 1', '| 1‸'))), {
    table: true,
    bodyRow: true,
    row: 1,
    rows: 2,
    column: 0,
    columns: 2,
    align: null,
    itemUp: false,
    itemDown: false,
  });
});

await test('the format context states whether the caret is in a table', () => {
  assert.equal(
    formatContextOf(stateOf(aligned.replace('| a', '| a‸'))).table,
    true,
  );
  assert.equal(formatContextOf(stateOf(`Text‸\n\n${aligned}`)).table, false);
});

await test('each table gets one wrapper and atomic separators', () => {
  const doc = `${aligned}\n\nText\n\n${aligned}`;
  const state = stateOf(`${doc}‸`);
  const parts = gridParts(state, [{ from: 0, to: doc.length }]);
  const wrappers: [number, number][] = [];
  for (let cursor = parts.wrappers.iter(); cursor.value !== null; cursor.next())
    wrappers.push([cursor.from, cursor.to]);
  const second = doc.lastIndexOf('| a');
  assert.deepEqual(wrappers, [
    [0, aligned.length],
    [second, second + aligned.length],
  ]);
  const atomic: string[] = [];
  parts.atomic.between(0, aligned.length, (from, to) => {
    atomic.push(doc.slice(from, to));
  });
  // Three pipes for each of two rows, and the whole delimiter row.
  assert.deepEqual(atomic, ['|', '|', '|', '| --- | --- |', '|', '|', '|']);
});

await test('a drag moves a body row, and the header row stays first', () => {
  // A handle names its cell, wherever the caret is.
  const doc = `Text‸\n\n${aligned}\n| 3   | 4   |\n| 5   | 6   |`;
  const state = stateOf(doc);
  const five = doc.indexOf('5');
  assert.equal(
    applied(state, tableEditSpec(state, moveRowEdit(1), five)),
    'Text\n\n| a   | b   |\n| --- | --- |\n| 5‸   | 6   |\n| 1   | 2   |\n| 3   | 4   |',
  );
  const header = doc.indexOf('a');
  assert.equal(tableEditSpec(state, moveRowEdit(2), header), null);
  assert.equal(tableEditSpec(state, moveRowEdit(0), five), null);
});

await test('a drag moves a column with its alignment', () => {
  const doc =
    'Text‸\n\n| a   | b   | c   |\n| --- | --: | --- |\n| 1   | 2   | 3   |';
  const state = stateOf(doc);
  assert.equal(
    applied(state, tableEditSpec(state, moveColumnEdit(2), doc.indexOf('b'))),
    'Text\n\n| a   | c   | b‸   |\n| --- | --- | --: |\n| 1   | 3   | 2   |',
  );
  assert.equal(tableEditSpec(state, moveColumnEdit(3), doc.indexOf('b')), null);
});

await test('a space typed at the end of a cell stays before the next text', () => {
  // A rewrite reads the whole text of a cell, so the space that a person just
  // typed is text and not padding.
  const doc = aligned;
  const at = doc.indexOf('a') + 1;
  const spaced = edited(
    `${doc}‸`,
    { from: at, to: at, insert: ' ' },
    'input.type',
  );
  const head = spaced.indexOf('‸');
  assert.equal(
    edited(spaced, { from: head, to: head, insert: '|' }, 'input.type'),
    '| a \\|‸ | b   |\n| ---- | --- |\n| 1    | 2   |',
  );
});

await test('pasted text that holds cells is read as rows of cells', () => {
  // A copied row of this editor, a copied table, and a range of a
  // spreadsheet, which arrives with tabs.
  assert.deepEqual(pastedCells('Alice | Engineer | Core'), [
    ['Alice', 'Engineer', 'Core'],
  ]);
  assert.deepEqual(
    pastedCells('| a   | b   |\n| --- | --- |\n| 1   | 2   |\n'),
    [
      ['a', 'b'],
      ['1', '2'],
    ],
  );
  assert.deepEqual(pastedCells('x\ty\r\nz\tw'), [
    ['x', 'y'],
    ['z', 'w'],
  ]);
  // An escaped pipe is text of its cell.
  assert.deepEqual(pastedCells('a \\| b | c'), [['a \\| b', 'c']]);
  // Text of one cell is not a grid, even with line breaks: a paragraph
  // pasted into a cell stays in that cell.
  assert.equal(pastedCells('plain words'), null);
  assert.equal(pastedCells('two\nlines'), null);
});

await test('a copied row pasted into a row fills its cells', () => {
  const doc = `${aligned}\n| 3   | 4   |`;
  const at = doc.lastIndexOf('| 3') + 2;
  assert.equal(
    edited(
      `${doc}‸`,
      { from: at, to: at + 1, insert: '| x   | y   |' },
      'input.paste',
    ),
    '| a   | b   |\n| --- | --- |\n| 1   | 2   |\n| x   | y‸   |',
  );
});

await test('a paste of more cells than the table holds grows the table', () => {
  const doc = aligned;
  const at = doc.indexOf('2');
  assert.equal(
    edited(
      `${doc}‸`,
      { from: at, to: at + 1, insert: 'p\tq\nr\ts' },
      'input.paste',
    ),
    '| a   | b   |     |\n| --- | --- | --- |\n| 1   | p   | q   |\n|     | r   | s‸   |',
  );
});

await test('a row goes above the row of the caret, never above the header', () => {
  const body = stateOf('| a   | b   |\n| --- | --- |\n| 1‸   | 2   |');
  assert.equal(
    applied(body, tableEditSpec(body, insertRowAboveEdit)),
    '| a   | b   |\n| --- | --- |\n| ‸    |     |\n| 1   | 2   |',
  );
  const header = stateOf('| a‸   | b   |\n| --- | --- |\n| 1   | 2   |');
  assert.equal(tableEditSpec(header, insertRowAboveEdit), null);
});

await test('a column goes left of the column of the caret', () => {
  const state = stateOf('| a‸   | b   |\n| --- | --- |\n| 1   | 2   |');
  assert.equal(
    applied(state, tableEditSpec(state, insertColumnLeftEdit)),
    '| ‸    | a   | b   |\n| --- | --- | --- |\n|     | 1   | 2   |',
  );
});

await test('a column takes the alignment a person sets', () => {
  const state = stateOf('| a   | b‸   |\n| --- | --- |\n| 1   | 2   |');
  assert.equal(
    applied(state, tableEditSpec(state, alignColumnEdit('right'))),
    '| a   | b‸   |\n| --- | --: |\n| 1   | 2   |',
  );
  const centred = stateOf('| a   | b‸   |\n| --- | --: |\n| 1   | 2   |');
  assert.equal(
    applied(centred, tableEditSpec(centred, alignColumnEdit(null))),
    '| a   | b‸   |\n| --- | --- |\n| 1   | 2   |',
  );
});

await test('an add bar adds a row or a column at the end, from any cell', () => {
  // Record 0147. The bar under the table and the bar at its right edge act
  // on the table and not on the cell of the caret, so a press from the
  // header adds at the end all the same.
  const inHeader = stateOf(aligned.replace('| a   ', '| a‸   '));
  assert.equal(
    applied(inHeader, tableEditSpec(inHeader, appendRowEdit)),
    '| a   | b   |\n| --- | --- |\n| 1   | 2   |\n| ‸    |     |',
  );
  assert.equal(
    applied(inHeader, tableEditSpec(inHeader, appendColumnEdit)),
    '| a   | b   | ‸    |\n| --- | --- | --- |\n| 1   | 2   |     |',
  );
  const inBody = stateOf(aligned.replace('| 1   ', '| 1‸   '));
  assert.equal(
    applied(inBody, tableEditSpec(inBody, appendColumnEdit)),
    '| a   | b   | ‸    |\n| --- | --- | --- |\n| 1   | 2   |     |',
  );
});
