import assert from 'node:assert/strict';
import test from 'node:test';
import { EditorState } from '@codemirror/state';
import {
  editingTransaction,
  insertTextSpec,
  isTaskToggle,
  linkSpanAt,
  taskToggleAt,
  toggleTaskSpec,
} from './commands.ts';
import { noteMarkdown, parsedWhole } from './language.ts';

await test('an editing command asks to keep the caret in view', () => {
  // CodeMirror scrolls the caret back into view only when the transaction
  // asks for it. A command that leaves the flag out writes a line below the
  // fold and the view stays where it was, so the person types into a line
  // they cannot see. One rule covers every command of this package.
  const spec = editingTransaction({
    changes: { from: 4, insert: '\n' },
    selection: { anchor: 5 },
  });
  assert.equal(spec.scrollIntoView, true);
  assert.equal(spec.userEvent, 'input.format');
  assert.deepEqual(spec.selection, { anchor: 5 });
  assert.deepEqual(spec.changes, { from: 4, insert: '\n' });
});

/**
 * A state whose whole document is parsed.
 *
 * `linkSpanAt` reads the syntax tree, so a test needs the tree of the whole
 * document. A headless state parses in slices, so this reads through
 * `parsedWhole`, which pumps that work into the state field.
 */
function stateOf(doc: string): EditorState {
  return parsedWhole(EditorState.create({ doc, extensions: [noteMarkdown()] }));
}

/** The span of the link at one position, described for a test. */
function spanAt(
  doc: string,
  position: number,
): { from: number; to: number; target: string } | null {
  const span = linkSpanAt(stateOf(doc), position);
  return span === null
    ? null
    : { from: span.from, to: span.to, target: span.target.target };
}

await test('the three link shapes name their target and their range', () => {
  // The tree answers, so this reads the same nodes that the live preview
  // decorates and the click cannot disagree with the reveal about where one
  // link starts and ends.
  assert.deepEqual(spanAt('see [label](https://example.com) here\n', 8), {
    from: 4,
    to: 32,
    target: 'https://example.com',
  });
  assert.deepEqual(spanAt('see <https://example.com> here\n', 10), {
    from: 4,
    to: 25,
    target: 'https://example.com',
  });
  assert.deepEqual(spanAt('see https://example.com here\n', 10), {
    from: 4,
    to: 23,
    target: 'https://example.com',
  });
});

await test('a link answers on either of its own edges', () => {
  // A click lands on an offset, and the offset of the first character of a
  // link belongs to the text before it as well.
  const doc = 'see [label](https://example.com) here\n';
  assert.equal(spanAt(doc, 4)?.target, 'https://example.com');
  assert.equal(spanAt(doc, 32)?.target, 'https://example.com');
  assert.equal(spanAt(doc, 3), null);
  assert.equal(spanAt(doc, 33), null);
});

await test('what names no target places the caret instead', () => {
  // A footnote, a reference link, a bare bracket pair and the target of an
  // image each name no address to open, so a click on them stays a click.
  assert.equal(spanAt('a [^1] note\n\n[^1]: text\n', 3), null);
  assert.equal(
    spanAt('see [a][b] here\n\n[b]: https://example.com\n', 6),
    null,
  );
  assert.equal(spanAt('see [word] here\n', 6), null);
  assert.equal(spanAt('see ![alt](pic.png) here\n', 13), null);
  assert.equal(spanAt('plain text\n', 3), null);
});

await test('a wrapped destination loses the brackets that hold it', () => {
  // `[label](<a b>)` wraps its destination, and the brackets are notation.
  assert.equal(
    spanAt('see [label](<https://example.com/a b>) here\n', 8)?.target,
    'https://example.com/a b',
  );
});

await test('a toggle of a task box states that it is one', () => {
  // Record 0134: the screen saves a toggle at once, so another device reads
  // it before the person reaches that device. Typing keeps the pause.
  const state = EditorState.create({
    doc: '- [ ] one\n- [x] two\n',
    selection: { anchor: 3 },
  });
  const pointed = taskToggleAt(state, 12);
  assert.ok(pointed !== null);
  const toggled = state.update(pointed);
  assert.equal(toggled.state.doc.toString(), '- [ ] one\n- [ ] two\n');
  assert.equal(isTaskToggle(toggled), true);

  const selected = toggleTaskSpec(state);
  assert.ok(selected !== null);
  // The key runs the toggle through the one editing wrapper, which keeps it.
  const keyed = state.update(editingTransaction(selected));
  assert.equal(keyed.state.doc.toString(), '- [x] one\n- [x] two\n');
  assert.equal(isTaskToggle(keyed), true);

  const typed = state.update({
    changes: { from: 9, insert: 's' },
    userEvent: 'input.type',
  });
  assert.equal(isTaskToggle(typed), false);
});

await test('an inserted text leaves the caret after it', () => {
  // Two images attached one after the other read in the order of the attach.
  let state = EditorState.create({ doc: 'Top\n\n', selection: { anchor: 5 } });
  for (const text of ['![a](a.png)', '![b](b.png)'])
    state = state.update(editingTransaction(insertTextSpec(state, text))).state;
  assert.equal(state.doc.toString(), 'Top\n\n![a](a.png)![b](b.png)');
  assert.equal(state.selection.main.head, state.doc.length);
});

await test('an inserted text replaces the selection', () => {
  const state = EditorState.create({
    doc: 'one two three',
    selection: { anchor: 4, head: 7 },
  });
  const next = state.update(insertTextSpec(state, 'six')).state;
  assert.equal(next.doc.toString(), 'one six three');
  assert.equal(next.selection.main.head, 7);
  assert.equal(next.selection.main.empty, true);
});

await test('syntax-marked email and web autolinks use their rendered destination', () => {
  for (const [source, target] of [
    ['<a@example.com>', 'mailto:a@example.com'],
    ['a@example.com', 'mailto:a@example.com'],
    ['www.example.com', 'http://www.example.com'],
    ['<mailto:a@example.com>', 'mailto:a@example.com'],
  ]) {
    assert.equal(spanAt(source ?? '', 2)?.target, target);
  }
  assert.equal(spanAt('[Mail](a@example.com)', 2)?.target, 'a@example.com');
  assert.equal(spanAt('[Site](www.example.com)', 2)?.target, 'www.example.com');
});
