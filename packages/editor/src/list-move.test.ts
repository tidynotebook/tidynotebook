/**
 * List item move checks (record 0106).
 *
 * Each test builds a real `EditorState` with the note language, the numbering
 * filter of record 0089 and the CodeMirror history, then applies the move as
 * its command dispatches it. The notation marks the cursor with `‸`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { history, undo } from '@codemirror/commands';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { editingTransaction } from './commands.ts';
import { noteMarkdown, parsedWhole } from './language.ts';
import {
  listItemAt,
  listMoveContextOf,
  moveListItemDownSpec,
  moveListItemSpec,
  moveListItemUpSpec,
} from './list-move.ts';
import { orderedListNumbering } from './list-numbering.ts';
import { tableGridEditing } from './table-grid.ts';

/**
 * Builds a parsed state from text that marks the head of the selection with
 * `‸` and, for a range, its anchor with `«`.
 */
function stateOf(source: string): EditorState {
  const doc = source.replace('‸', '').replace('«', '');
  const head = source.replace('«', '').indexOf('‸');
  const anchor = source.replace('‸', '').indexOf('«');
  return parsedWhole(
    EditorState.create({
      doc,
      selection: {
        anchor: anchor === -1 ? Math.max(head, 0) : anchor,
        head: Math.max(head, 0),
      },
      extensions: [
        noteMarkdown(),
        orderedListNumbering(),
        // The table filter keeps the structure of a table from an edit of a
        // person (record 0095), so a move must pass it whole.
        tableGridEditing(),
        history({ newGroupDelay: 0 }),
      ],
    }),
  );
}

/** Applies one spec as a command dispatches it. */
function apply(state: EditorState, spec: TransactionSpec | null): EditorState {
  assert.notEqual(spec, null, 'the move declined');
  return state.update(editingTransaction(spec ?? {})).state;
}

/** The text of a state with its caret marked. */
function marked(state: EditorState): string {
  const doc = state.doc.toString();
  const head = state.selection.main.head;
  return `${doc.slice(0, head)}‸${doc.slice(head)}`;
}

/** Moves the item of the caret to place `to` and reads the result. */
function move(source: string, to: number): string {
  const state = stateOf(source);
  return marked(
    apply(state, moveListItemSpec(state, state.selection.main.head, to)),
  );
}

/** Requires that the move of the item of the caret to place `to` declines. */
function moveOrNull(source: string, to: number): void {
  const state = stateOf(source);
  assert.equal(moveListItemSpec(state, state.selection.main.head, to), null);
}

await test('an item moves up and down among its siblings', () => {
  assert.equal(move('- a\n- b\n- c‸', 0), '- c‸\n- a\n- b');
  assert.equal(move('- a‸\n- b\n- c', 2), '- b\n- c\n- a‸');
  assert.equal(move('- a\n- b‸\n- c', 2), '- a\n- c\n- b‸');
});

await test('a task item keeps its box and its state', () => {
  assert.equal(
    move('- [ ] milk\n- [x] ba‸nk\n- [ ] report', 0),
    '- [x] ba‸nk\n- [ ] milk\n- [ ] report',
  );
});

await test('a pointer reorder does not ask to scroll to a distant selection', () => {
  const tasks = Array.from(
    { length: 100 },
    (_, index) => `- [ ] task ${String(index)}`,
  ).join('\n');
  const state = stateOf(`${tasks}\n\nReading place‸`);
  const spec = moveListItemSpec(state, state.doc.line(2).from, 4);
  assert.notEqual(spec, null);
  const transaction = state.update(
    editingTransaction({ ...spec, scrollIntoView: false }),
  );
  assert.equal(transaction.scrollIntoView, false);
  assert.equal(transaction.isUserEvent('input.format'), true);
  assert.equal(transaction.state.doc.line(5).text, '- [ ] task 1');
  assert.deepEqual(transaction.state.selection, state.selection);
  let restored = transaction.state;
  assert.equal(
    undo({
      state: restored,
      dispatch: (undone) => {
        restored = undone.state;
      },
    }),
    true,
  );
  assert.equal(restored.doc.toString(), state.doc.toString());
  assert.deepEqual(restored.selection, state.selection);
});

await test('a keyboard item move still asks to show the moved caret', () => {
  const state = stateOf('- [ ] first‸\n- [ ] second');
  const spec = moveListItemDownSpec(state);
  assert.notEqual(spec, null);
  const transaction = state.update(editingTransaction(spec ?? {}));
  assert.equal(transaction.scrollIntoView, true);
  assert.equal(marked(transaction.state), '- [ ] second\n- [ ] first‸');
});

await test('an item moves with its later lines and its children', () => {
  assert.equal(
    move('- a\n- b‸\n  more of b\n  - child\n- c', 2),
    '- a\n- c\n- b‸\n  more of b\n  - child',
  );
});

await test('a nested item moves among its own siblings only', () => {
  const source = '- a\n  - x\n  - y‸\n- b';
  assert.equal(move(source, 0), '- a\n  - y‸\n  - x\n- b');
  moveOrNull(source, 2);
});

await test('a loose list keeps a blank line between its items', () => {
  assert.equal(move('- a\n\n- b\n\n- c‸', 0), '- c‸\n\n- a\n\n- b');
  assert.equal(move('- a‸\n\n- b\n\n- c', 2), '- b\n\n- c\n\n- a‸');
});

await test('an item moves with the table it holds', () => {
  const table = '  | x   | y   |\n  | --- | --- |\n  | 1   | 2   |';
  assert.equal(
    move(`- a\n\n${table}\n\n- b\n\n- c‸`, 0),
    `- c‸\n\n- a\n\n${table}\n\n- b`,
  );
});

await test('an item in a quote keeps its quote marks', () => {
  assert.equal(move('> - a\n> - b‸', 0), '> - b‸\n> - a');
});

await test('an ordered list keeps its start and its sequence', () => {
  assert.equal(
    move('1. one\n2. two\n3. three‸', 0),
    '1. three‸\n2. one\n3. two',
  );
  assert.equal(
    move('1. one‸\n2. two\n3. three', 2),
    '1. two\n2. three\n3. one‸',
  );
  assert.equal(move('4. one\n5. two‸', 0), '4. two‸\n5. one');
  assert.equal(
    move('- p\n\n  3. one\n  4. two‸', 0),
    '- p\n\n  3. two‸\n  4. one',
  );
});

await test('a number that shrinks keeps the children of its item', () => {
  const items = Array.from(
    { length: 9 },
    (_, index) => `${String(index + 1)}. i${String(index + 1)}\n`,
  ).join('');
  const source = `${items}10. last‸\n    - child`;
  const result = move(source, 0);
  assert.ok(result.startsWith('1. last‸\n   - child\n2. i1\n'), result);
  assert.ok(result.endsWith('10. i9'), result);
});

await test('one undo puts the list and its numbers back', () => {
  const state = stateOf('1. one\n2. two\n3. three‸');
  const moved = apply(state, moveListItemSpec(state, state.doc.length, 0));
  let restored = moved;
  undo({
    state: moved,
    dispatch: (transaction) => {
      restored = transaction.state;
    },
  });
  assert.equal(restored.doc.toString(), '1. one\n2. two\n3. three');
});

await test('a move declines where the item cannot go', () => {
  moveOrNull('- a‸\n- b', 0);
  moveOrNull('- a‸\n- b', 2);
  moveOrNull('- a‸\n- b', -1);
  moveOrNull('Text‸\n\n- a\n- b', 0);
  // An item that shares its line with the marker of its parent cannot move
  // alone.
  moveOrNull('- - a\n  - b‸', 0);
});

await test('the item of a line is the innermost item that holds it', () => {
  const source = '- a\n  - x‸\n  - y\n- b';
  const state = stateOf(source);
  const place = listItemAt(state, state.selection.main.head);
  assert.equal(place?.items.length, 2);
  assert.equal(place?.index, 0);
  assert.equal(
    state.doc.sliceString(place?.items[0]?.from ?? 0, place?.items[0]?.to),
    '- x',
  );
});

await test('the keyboard moves the item of the caret by one place', () => {
  const state = stateOf('- a\n- b‸\n- c');
  assert.equal(
    marked(apply(state, moveListItemUpSpec(state))),
    '- b‸\n- a\n- c',
  );
  assert.equal(
    marked(apply(state, moveListItemDownSpec(state))),
    '- a\n- c\n- b‸',
  );
  assert.equal(moveListItemUpSpec(stateOf('- a‸\n- b')), null);
  assert.equal(moveListItemDownSpec(stateOf('- a\n- b‸')), null);
});

await test('a selection over two items is left to the line move', () => {
  const state = stateOf('- a«\n- b‸\n- c');
  assert.equal(moveListItemUpSpec(state), null);
  assert.deepEqual(listMoveContextOf(state), {
    itemUp: false,
    itemDown: false,
  });
});

await test('the move context states where the item can go', () => {
  assert.deepEqual(listMoveContextOf(stateOf('- a‸\n- b')), {
    itemUp: false,
    itemDown: true,
  });
  assert.deepEqual(listMoveContextOf(stateOf('- a\n- b‸')), {
    itemUp: true,
    itemDown: false,
  });
  assert.deepEqual(listMoveContextOf(stateOf('- only‸')), {
    itemUp: false,
    itemDown: false,
  });
  assert.deepEqual(listMoveContextOf(stateOf('Text‸')), {
    itemUp: false,
    itemDown: false,
  });
});
