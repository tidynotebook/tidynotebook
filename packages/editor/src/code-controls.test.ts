/**
 * The bar of a code block (record 0174): which blocks carry one, their
 * labels, and the code that a copy takes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { syntaxTreeAvailable } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { measureParts } from '@notesapp/markdown';
import {
  barsOnScreen,
  codeBlockBars,
  codeBlockSelection,
  codeBlockText,
} from './code-controls.ts';
import { gatedMarkdown, markdownGrammarOn } from './grammar-gate.ts';
import {
  noteMarkdown,
  noteMarkdownExtensions,
  parsedWhole,
} from './language.ts';

/** A state of the note grammar with the whole text parsed. */
function stateOf(doc: string): EditorState {
  return parsedWhole(
    EditorState.create({ doc, extensions: [noteMarkdown({ headless: true })] }),
  );
}

const note = [
  '# Code',
  '',
  '```py',
  'x = 1',
  '```',
  '',
  '```mermaid',
  'graph TD;',
  '```',
  '',
  '```cobol extra words',
  'MOVE A TO B.',
  '```',
  '',
  '    indented line',
  '',
  '> ```sh',
  '> echo a',
  '> echo b',
  '> ```',
  '',
  '- item',
  '',
  '  ```',
  '  in a list',
  '  ```',
  '',
].join('\n');

await test('each code block carries a bar with its label, and a diagram none', () => {
  assert.deepEqual(
    codeBlockBars(stateOf(note)).map((bar) => bar.label),
    ['Python', 'cobol', null, 'Shell', null],
  );
});

await test('a copy takes the code of the block as the renderer reads it', () => {
  const state = stateOf(note);
  const bars = codeBlockBars(state);
  const text = state.doc.toString();
  assert.deepEqual(
    bars.map((bar) => codeBlockText(text, bar.from)),
    ['x = 1', 'MOVE A TO B.', 'indented line', 'echo a\necho b', 'in a list'],
  );
  // A place outside every block holds no code.
  assert.equal(codeBlockText(text, 0), null);
});

await test('a fence that is a diagram by its first word carries no bar', () => {
  // Review of record 0174: one rule decides a diagram on every surface.
  assert.deepEqual(
    codeBlockBars(stateOf('```mermaid title\ngraph TD;\n```\n')),
    [],
  );
});

await test('a refused copy selects the code of its block and no fence', () => {
  // Review of record 0174: a copy that the browser refused did nothing, and
  // its rejection went unhandled. The one failure path selects the code.
  const state = stateOf(note);
  const text = state.doc.toString();
  assert.deepEqual(
    codeBlockBars(state).map((bar) => {
      const range = codeBlockSelection(state, bar.from);
      return range === null ? null : text.slice(range.from, range.to);
    }),
    ['x = 1', 'MOVE A TO B.', 'indented line', 'echo a\n> echo b', 'in a list'],
  );
  const empty = stateOf('```js\n```\n');
  assert.deepEqual(codeBlockSelection(empty, 0), { from: 5, to: 5 });
  assert.equal(codeBlockSelection(state, 1), null);
});

await test('a fence bar stands on the opening fence and steps aside for an edit there', () => {
  // The opening fence names the language, so the bar of a fence carries the
  // copy action alone and keeps no room above the code.
  const doc = 'Text\n\n```ts\nconst a = 1;\n```\n\nAfter\n';
  const at = (offset: number): EditorState =>
    stateOf(doc).update({ selection: { anchor: offset } }).state;
  assert.deepEqual(codeBlockBars(at(0)), [
    {
      from: doc.indexOf('```ts'),
      to: doc.lastIndexOf('```') + 3,
      label: 'TypeScript',
      fenced: true,
    },
  ]);
  assert.equal(codeBlockBars(at(doc.indexOf('const'))).length, 1);
  assert.equal(codeBlockBars(at(doc.lastIndexOf('```') + 3)).length, 1);
  // The caret on the opening fence: the bar would cover the text there.
  assert.deepEqual(codeBlockBars(at(doc.indexOf('```ts') + 5)), []);
  // An indented block has no fence, so its bar keeps its own room.
  assert.deepEqual(
    codeBlockBars(stateOf('text\n\n    indented\n')).map((bar) => bar.fenced),
    [false],
  );
});

await test('a fence that is still being typed carries no bar', () => {
  const typed = 'Text\n\n```ts';
  const state = stateOf(typed).update({
    selection: { anchor: typed.length },
  }).state;
  assert.deepEqual(codeBlockBars(state), []);
  const lone = stateOf('Text\n\n``` lone words');
  assert.deepEqual(codeBlockBars(lone), []);
});

await test('a screen with no code block reads no limit of the whole note', () => {
  // The bars read the limits of the parse, which convert the whole note to a
  // string, on each key, even with no code block on the screen.
  const state = stateOf(note);
  let asked = 0;
  const copies = (): boolean => {
    asked += 1;
    return true;
  };
  const item = note.indexOf('- item');
  assert.deepEqual(
    barsOnScreen(state, [{ from: item, to: item + 6 }], copies),
    [],
  );
  assert.deepEqual(barsOnScreen(state, [{ from: 0, to: 6 }], copies), []);
  assert.equal(asked, 0);
  const shown = barsOnScreen(state, [{ from: 0, to: 30 }], copies);
  assert.equal(shown.length, 1);
  assert.equal(asked, 1);
  // A note past the limits shows no bar.
  assert.deepEqual(
    barsOnScreen(state, [{ from: 0, to: 30 }], () => false),
    [],
  );
});

await test('the bars read the answer of the grammar gate and never the whole note', (t) => {
  // The bars asked the limits of the parse of the whole note on each key
  // while a code block was on the screen, so a key in a long note read and
  // copied all of it. The gate keeps the answer for each change.
  const long = `${note}\n${'Some *words* and a [link](u).\n\n'.repeat(20_000)}`;
  let state = parsedWhole(
    EditorState.create({
      doc: long,
      extensions: [
        gatedMarkdown(noteMarkdownExtensions({ headless: true }), true, {
          read: measureParts,
          whole: () => {
            throw new Error('a key must not check the whole note');
          },
        }),
      ],
    }),
  );
  let asked = 0;
  const copies = (seen: EditorState): boolean => {
    asked += 1;
    return markdownGrammarOn(seen);
  };
  for (const key of 'abc') {
    // A key can spend the parse budget before it reaches the code block.
    // Move the clock past that budget without a delay or machine load.
    let time = 0;
    const clock = t.mock.method(Date, 'now', () => (time += 100));
    try {
      state = state.update({ changes: { from: 7, insert: key } }).state;
    } finally {
      clock.mock.restore();
    }
    assert.equal(syntaxTreeAvailable(state), false);
    assert.equal(markdownGrammarOn(state), true);
    // A view continues the parse in the background. This headless state
    // must complete the same work before the bars read its tree.
    state = parsedWhole(state);
    const copy = t.mock.method(state.doc, 'toString', () => {
      throw new Error('the bars must not copy the whole note');
    });
    assert.equal(barsOnScreen(state, [{ from: 0, to: 40 }], copies).length, 1);
    assert.equal(copy.mock.callCount(), 0);
    copy.mock.restore();
  }
  assert.equal(asked, 3);
});
