/**
 * The find and replace panel (issue 247): its words and its keys.
 *
 * The panel itself is DOM, which a test of this package cannot build, so the
 * browser run shows it. These tests hold what a person reads and the keys.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { closeSearchPanel, gotoLine, searchKeymap } from '@codemirror/search';
import {
  currentSearchMatch,
  editorPhrases,
  matchCountWords,
  noteSearchKeymap,
  replaceAllAnnouncement,
  searchPanelKey,
  searchPanelWords,
} from './search-panel.ts';

/** Whether a text is in sentence case: one capital at its start. */
function sentenceCase(text: string): boolean {
  const first = text.charAt(0);
  return (
    first === first.toUpperCase() &&
    text.slice(1) === text.slice(1).toLowerCase()
  );
}

await test('every word of the panel is in sentence case', () => {
  // The panel of the package said next, regexp and by word.
  for (const words of Object.values(searchPanelWords))
    assert.ok(sentenceCase(words), words);
  for (const [phrase, words] of Object.entries(editorPhrases))
    assert.ok(
      sentenceCase(words) || words === words.toLowerCase(),
      `${phrase}: ${words}`,
    );
});

await test('the panel keeps every key of the package but the line dialog', () => {
  assert.equal(noteSearchKeymap.length, searchKeymap.length - 1);
  assert.ok(!noteSearchKeymap.some((binding) => binding.run === gotoLine));
  // Escape closes the panel and F3 finds the next match, as before.
  assert.ok(noteSearchKeymap.some((binding) => binding.key === 'Escape'));
  assert.ok(noteSearchKeymap.some((binding) => binding.key === 'F3'));
});

/** What the editor announces after a replace of `count` matches. */
function replacedWords(count: number): readonly string[] {
  const state = EditorState.create({
    doc: 'a '.repeat(count),
    extensions: [EditorState.phrases.of(editorPhrases), replaceAllAnnouncement],
  });
  // The transaction of `replaceAll` of the package, as it builds it.
  const changes = Array.from({ length: count }, (_, index) => ({
    from: index * 2,
    to: index * 2 + 1,
    insert: 'b',
  }));
  const transaction = state.update({
    changes,
    effects: EditorView.announce.of(
      `${state.phrase('replaced $ matches', count)}.`,
    ),
    userEvent: 'input.replace.all',
  });
  assert.equal(transaction.state.doc.toString(), 'b '.repeat(count));
  return transaction.effects
    .filter((effect) => effect.is(EditorView.announce))
    .map((effect) => String(effect.value));
}

await test('a replace of every match counts one match and many matches', () => {
  // Review of issue 247: one match read "Replaced 1 matches".
  assert.deepEqual(replacedWords(1), ['Replaced 1 match.']);
  assert.deepEqual(replacedWords(3), ['Replaced 3 matches.']);
});

await test('the count of matches reads one match and many matches', () => {
  // Audit N13: one match read "1 matches". The phone keeps its short form.
  assert.deepEqual(matchCountWords(1), { full: '1 match', short: '1 found' });
  assert.deepEqual(matchCountWords(250), {
    full: '250 matches',
    short: '250 found',
  });
});

await test('Enter finds and replaces in the fields of the panel', () => {
  // Review of issue 247: no test held the keys of the panel.
  const enter = { key: 'Enter', shiftKey: false };
  const shiftEnter = { key: 'Enter', shiftKey: true };
  assert.equal(searchPanelKey(enter, 'find'), 'next');
  assert.equal(searchPanelKey(shiftEnter, 'find'), 'previous');
  assert.equal(searchPanelKey(enter, 'replace'), 'replace');
  assert.equal(searchPanelKey(shiftEnter, 'replace'), 'replace');
  assert.equal(searchPanelKey(enter, 'other'), null);
  assert.equal(searchPanelKey({ key: 'a', shiftKey: false }, 'find'), null);
});

await test('Escape in the panel closes it, which gives the focus to the text', () => {
  // `closeSearchPanel` focuses the view when the focus is in the panel, so
  // the binding of Escape in the scope of the panel returns the focus.
  const escape = noteSearchKeymap.find((binding) => binding.key === 'Escape');
  assert.ok(escape !== undefined);
  assert.equal(escape.run, closeSearchPanel);
  assert.ok((escape.scope ?? 'editor').split(' ').includes('search-panel'));
});

await test('an ordinal requires one exact selection, including regex zero-width results', () => {
  const make = (selection: EditorSelection) =>
    EditorState.create({
      doc: 'seed seed',
      selection,
      extensions: EditorState.allowMultipleSelections.of(true),
    });
  const matches = [
    { from: 0, to: 4 },
    { from: 5, to: 9 },
  ];
  assert.equal(
    currentSearchMatch(make(EditorSelection.single(5, 9)), matches),
    1,
  );
  assert.equal(
    currentSearchMatch(make(EditorSelection.single(4)), matches),
    -1,
  );
  assert.equal(
    currentSearchMatch(make(EditorSelection.single(1, 3)), matches),
    -1,
  );
  assert.equal(
    currentSearchMatch(
      make(
        EditorSelection.create([
          EditorSelection.range(0, 4),
          EditorSelection.range(5, 9),
        ]),
      ),
      matches,
    ),
    -1,
  );
  assert.equal(
    currentSearchMatch(make(EditorSelection.single(5)), [{ from: 5, to: 5 }]),
    0,
  );
  assert.equal(currentSearchMatch(make(EditorSelection.single(5)), []), -1);
});
