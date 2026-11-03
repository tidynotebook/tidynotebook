/**
 * Outline checks.
 *
 * The outline reads the same syntax tree as the preview, so a `#` inside a
 * fence is code here too. These tests exist because the old outline had its
 * own idea of what a heading is.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { EditorState } from '@codemirror/state';
import { withinParseLimits } from '@notesapp/markdown';
import { gatedMarkdown, markdownGrammarOn } from './grammar-gate.ts';
import { noteMarkdown, parsedWhole } from './language.ts';
import { outlineOf } from './outline.ts';

/** Builds a state whose whole document is parsed. */
function stateOf(doc: string): EditorState {
  return parsedWhole(EditorState.create({ doc, extensions: [noteMarkdown()] }));
}

await test('every heading shape reaches the outline with its level', () => {
  const doc = '# One\n\n### Three\n\nSetext\n======\n\nOther\n------\n';
  assert.deepEqual(
    outlineOf(stateOf(doc)).map((row) => [row.level, row.text]),
    [
      [1, 'One'],
      [3, 'Three'],
      [1, 'Setext'],
      [2, 'Other'],
    ],
  );
});

await test('a hash inside a fence is code and not a heading', () => {
  const doc = '# Real\n\n```\n# Fake\n```\n\n    # Indented\n';
  assert.deepEqual(
    outlineOf(stateOf(doc)).map((row) => row.text),
    ['Real'],
  );
});

await test('a closing hash run is not part of the heading text', () => {
  assert.deepEqual(
    outlineOf(stateOf('## Title ##\n')).map((row) => row.text),
    ['Title'],
  );
});

await test('a row points at the start of its heading', () => {
  const doc = 'intro\n\n## Target\n';
  const [row] = outlineOf(stateOf(doc));
  assert.equal(row?.from, doc.indexOf('## Target'));
  assert.equal(doc.slice(row?.from, row?.to), '## Target');
});

await test('an empty heading has no row, because it cannot be read', () => {
  assert.deepEqual(outlineOf(stateOf('#\n\ntext\n')), []);
});

await test('a row shows the words a reader sees, not the markers', () => {
  assert.deepEqual(
    outlineOf(stateOf('# A **bold** `code` [link](/x) word\n')).map(
      (row) => row.text,
    ),
    ['A bold code link word'],
  );
});

/** A long note with headings on both sides of the initial parse boundary. */
function longNote(): string {
  return Array.from({ length: 42 }, (_, index) => {
    const level = (index % 6) + 1;
    return `${'#'.repeat(level)} Section ${String(index + 1)}\n\n${'Synthetic text for a long note. '.repeat(28)}\n\n`;
  })
    .join('')
    .replace('Synthetic', 'Test note');
}

await test('an initial partial tree supplies every heading in a long note', () => {
  const doc = longNote();
  assert.equal(doc.length, 38400);
  assert.equal(doc.trim().split(/\s+/u).length, 7183);
  const state = EditorState.create({ doc, extensions: [noteMarkdown()] });
  const rows = outlineOf(state);
  assert.equal(rows.length, 42);
  for (const [index, row] of rows.entries()) {
    assert.equal(row.level, (index % 6) + 1);
    assert.equal(row.text, `Section ${String(index + 1)}`);
    assert.equal(
      row.from,
      doc.indexOf(`${'#'.repeat(row.level)} ${row.text}\n`),
    );
    assert.equal(
      doc.slice(row.from, row.to),
      `${'#'.repeat(row.level)} ${row.text}`,
    );
  }
});

await test('long paragraphs and fences do not create outline entries', () => {
  const doc = `${longNote()}${'plain words '.repeat(3000)}\n\n\`\`\`text\n${'# Fake\n## Also fake\n'.repeat(500)}\`\`\`\n\n###### Last\n\nLast setext\n-----------\n`;
  const rows = outlineOf(
    EditorState.create({ doc, extensions: [noteMarkdown()] }),
  );
  assert.equal(rows.length, 44);
  assert.deepEqual(
    rows.slice(-2).map((row) => [row.level, row.text]),
    [
      [6, 'Last'],
      [2, 'Last setext'],
    ],
  );
});

await test('live insert, rename, and delete at the end keep correct offsets', () => {
  let state = EditorState.create({
    doc: longNote(),
    extensions: [noteMarkdown()],
  });
  state = state.update({
    changes: {
      from: state.doc.length,
      insert: '### Repeated\n\n###### Repeated\n',
    },
  }).state;
  assert.deepEqual(
    outlineOf(state)
      .slice(-2)
      .map((row) => row.text),
    ['Repeated', 'Repeated'],
  );
  const from = state.doc.toString().lastIndexOf('Repeated');
  state = state.update({
    changes: { from, to: from + 'Repeated'.length, insert: 'Renamed' },
  }).state;
  assert.equal(outlineOf(state).at(-1)?.text, 'Renamed');
  const last = outlineOf(state).at(-1);
  assert.ok(last);
  state = state.update({
    changes: { from: last.from, to: state.doc.length },
  }).state;
  assert.equal(outlineOf(state).at(-1)?.text, 'Repeated');
  assert.equal(outlineOf(state).length, 43);
});

await test('empty and no-heading notes have no rows', () => {
  for (const doc of ['', 'plain words\n'.repeat(2000)])
    assert.deepEqual(
      outlineOf(EditorState.create({ doc, extensions: [noteMarkdown()] })),
      [],
    );
});

await test('selection and parser updates reuse rows for the same document', () => {
  const state = EditorState.create({
    doc: longNote(),
    extensions: [noteMarkdown()],
  });
  const rows = outlineOf(state);
  for (let index = 0; index < 20; index += 1) {
    const selected = state.update({ selection: { anchor: index } }).state;
    assert.equal(selected.doc, state.doc);
    assert.equal(outlineOf(selected), rows);
  }
  assert.equal(outlineOf(parsedWhole(state)), rows);
});

await test('switching notes and reloading cannot reuse another document offsets', () => {
  const first = stateOf('### Repeated\n\n###### Repeated\n');
  const second = stateOf('A different introduction.\n\n###### Repeated\n');
  const rows = outlineOf(first);
  assert.equal(
    outlineOf(second)[0]?.from,
    second.doc.toString().indexOf('######'),
  );
  assert.notEqual(outlineOf(second)[0]?.from, rows[0]?.from);
  assert.equal(outlineOf(first), rows);
  const reloaded = stateOf(first.doc.toString());
  assert.deepEqual(outlineOf(reloaded), rows);
});

await test('the grammar safety gate hides rows until the document is safe again', () => {
  const doc = '# Safe heading\n\n' + 'text '.repeat(220000);
  const state = EditorState.create({
    doc,
    extensions: [gatedMarkdown(noteMarkdown(), withinParseLimits(doc))],
  });
  assert.equal(markdownGrammarOn(state), false);
  assert.deepEqual(outlineOf(state), []);
  const safe = state.update({
    changes: { from: doc.indexOf('text '), to: doc.length },
  }).state;
  assert.equal(markdownGrammarOn(safe), true);
  assert.deepEqual(
    outlineOf(safe).map((row) => row.text),
    ['Safe heading'],
  );
});

await test('HTML blocks, indented code, and escaped markers stay outside the outline', () => {
  const doc = `${longNote()}<div>\n# HTML text\n</div>\n\n    # Indented code\n\n\\# Escaped marker\n\n~~~typescript\n###### Fenced code\n~~~\n\n### Real end\n`;
  const state = EditorState.create({ doc, extensions: [noteMarkdown()] });
  assert.equal(outlineOf(state).length, 43);
  assert.equal(outlineOf(state).at(-1)?.text, 'Real end');
});

await test('the outline does not parse a document with unsafe nested marks', () => {
  const doc = '# Heading\n\n' + '*a '.repeat(30000) + 'x' + ' b*'.repeat(30000);
  const state = EditorState.create({
    doc,
    extensions: [gatedMarkdown(noteMarkdown(), withinParseLimits(doc))],
  });
  assert.equal(markdownGrammarOn(state), false);
  assert.deepEqual(outlineOf(state), []);
});
