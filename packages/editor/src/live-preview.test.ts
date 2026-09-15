/**
 * Live preview decoration checks.
 *
 * The decorations come from the Markdown syntax tree, so these tests build a
 * real `EditorState` with the note language and read the decoration set. No
 * DOM is needed: a decoration is data until a view renders it, and the two
 * widgets that do build DOM are checked through their range and their kind
 * rather than through their element.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { noteMarkdown } from './language.ts';
import {
  buildPreview,
  delimiterRowParts,
  headingLevel,
  previewNeedsRebuild,
  tableAlignments,
  type PreviewNode,
} from './live-preview.ts';

/**
 * Builds a state whose whole document is parsed.
 *
 * A view parses at least its viewport before it renders, so the preview
 * reads a ready tree there. A headless state parses in slices and keeps the
 * result in its parse context, so the loop below pumps that work into the
 * state field until the tree covers the document.
 */
function stateOf(doc: string): EditorState {
  let state = EditorState.create({ doc, extensions: [noteMarkdown()] });
  for (
    let attempt = 0;
    attempt < 200 && syntaxTree(state).length < state.doc.length;
    attempt += 1
  ) {
    ensureSyntaxTree(state, state.doc.length, 5000);
    state = state.update({}).state;
  }
  return state;
}

/** One decoration, described as text so a test can assert on it. */
type Described = {
  readonly from: number;
  readonly to: number;
  readonly kind: 'line' | 'mark' | 'hide' | 'widget';
  readonly value: string;
};

/**
 * Lists the decorations of one document with the given selection.
 *
 * The default selection sits on the empty last line, away from every
 * construct, because a cursor on a line is what reveals that line.
 */
function describe(
  doc: string,
  selection: { from: number; to: number } = {
    from: doc.length,
    to: doc.length,
  },
): readonly Described[] {
  const state = stateOf(doc);
  const built = buildPreview(
    state,
    [{ from: 0, to: state.doc.length }],
    selection,
  );
  const found: Described[] = [];
  built.decorations.between(0, state.doc.length, (from, to, value) => {
    const spec = value.spec as {
      class?: string;
      widget?: { constructor: { name: string } };
    };
    if (spec.widget !== undefined)
      found.push({
        from,
        to,
        kind: 'widget',
        value: spec.widget.constructor.name,
      });
    else if (spec.class === undefined)
      found.push({ from, to, kind: 'hide', value: '' });
    else
      found.push({
        from,
        to,
        kind: from === to ? 'line' : 'mark',
        value: spec.class,
      });
  });
  return found;
}

/** The structure the preview reports for one document. */
function structureOf(doc: string): readonly PreviewNode[] {
  const state = stateOf(doc);
  return buildPreview(state, [{ from: 0, to: state.doc.length }], {
    from: state.doc.length,
    to: state.doc.length,
  }).structure;
}

/** Whether a decoration of the given kind and class covers a range. */
function has(
  found: readonly Described[],
  kind: Described['kind'],
  value: string,
  from?: number,
  to?: number,
): boolean {
  return found.some(
    (item) =>
      item.kind === kind &&
      item.value.split(' ').includes(value) &&
      (from === undefined || item.from === from) &&
      (to === undefined || item.to === to),
  );
}

/** The source text a reader still sees, with hidden ranges removed. */
function visibleText(
  doc: string,
  selection: { from: number; to: number } = {
    from: doc.length,
    to: doc.length,
  },
): string {
  const hidden = describe(doc, selection).filter(
    (item) => item.kind === 'hide' || item.kind === 'widget',
  );
  let text = '';
  let at = 0;
  for (const range of [...hidden].sort(
    (left, right) => left.from - right.from,
  )) {
    if (range.from < at) continue;
    text += doc.slice(at, range.from);
    at = range.to;
  }
  return text + doc.slice(at);
}

await test('every heading level gets its own line class', () => {
  const doc = '# a\n\n## b\n\n### c\n\n#### d\n\n##### e\n\n###### f\n';
  const found = describe(doc);
  for (let level = 1; level <= 6; level += 1)
    assert.ok(
      has(found, 'line', `cm-np-h${String(level)}`),
      `h${String(level)}`,
    );
  assert.equal(visibleText(doc).trim().split('\n\n').join(''), 'abcdef');
});

await test('a setext heading is reported at its level', () => {
  assert.deepEqual(structureOf('Title\n=====\n'), [
    { kind: 'heading', level: 1, text: 'Title' },
  ]);
  assert.deepEqual(structureOf('Title\n-----\n'), [
    { kind: 'heading', level: 2, text: 'Title' },
  ]);
});

await test('the heading marker comes back when the cursor is on its line', () => {
  const doc = '# Title\n';
  assert.equal(visibleText(doc, { from: 5, to: 5 }), '# Title\n');
  assert.equal(visibleText(doc, { from: 8, to: 8 }), 'Title\n');
});

await test('emphasis hides both delimiters and reveals both together', () => {
  const doc = 'a **bold** b\n';
  const found = describe(doc);
  assert.ok(has(found, 'mark', 'cm-np-bold', 2, 10));
  assert.equal(visibleText(doc), 'a bold b\n');
  // The cursor inside the word reveals the whole construct, never one side.
  assert.equal(visibleText(doc, { from: 6, to: 6 }), 'a **bold** b\n');
});

await test('an escaped star is never emphasis and never disappears', () => {
  const doc = 'plain \\*star\\* text\n';
  assert.equal(visibleText(doc), doc);
  assert.ok(!has(describe(doc), 'mark', 'cm-np-italic'));
});

await test('an intraword underscore is not emphasis', () => {
  assert.ok(!has(describe('do_a_thing here\n'), 'mark', 'cm-np-italic'));
});

await test('inline code hides its ticks and keeps the mono class', () => {
  const doc = 'call `run()` now\n';
  assert.ok(has(describe(doc), 'mark', 'cm-np-code', 5, 12));
  assert.equal(visibleText(doc), 'call run() now\n');
});

await test('a link hides its target and shows it when the cursor is inside', () => {
  const doc = 'see [label](https://example.com/p) here\n';
  assert.ok(has(describe(doc), 'mark', 'cm-np-link'));
  assert.equal(visibleText(doc), 'see label here\n');
  assert.equal(visibleText(doc, { from: 8, to: 8 }), doc);
});

await test('an autolink and a bare URL are styled as links', () => {
  const found = describe('<https://example.com/x> and https://bare.example\n');
  const links = found.filter(
    (item) => item.kind === 'mark' && item.value.includes('cm-np-link'),
  );
  assert.ok(links.length >= 2);
  assert.equal(
    visibleText('<https://example.com/x> and https://bare.example\n'),
    'https://example.com/x and https://bare.example\n',
  );
});

await test('both thematic break forms render as a rule and never as a bullet', () => {
  for (const rule of ['---', '***']) {
    const doc = `text\n\n${rule}\n\nmore\n`;
    const found = describe(doc);
    assert.ok(has(found, 'widget', 'RuleWidget'), rule);
    assert.ok(!has(found, 'widget', 'BulletWidget'), rule);
    assert.deepEqual(structureOf(doc), [{ kind: 'thematic-break' }]);
  }
});

await test('a bullet is replaced at every depth and an ordered marker is kept', () => {
  const doc = '- a\n  - b\n    - c\n';
  const bullets = describe(doc).filter(
    (item) => item.kind === 'widget' && item.value === 'BulletWidget',
  );
  assert.equal(bullets.length, 3);
  assert.deepEqual(structureOf(doc), [
    { kind: 'list-item', depth: 1, ordered: false },
    { kind: 'list-item', depth: 2, ordered: false },
    { kind: 'list-item', depth: 3, ordered: false },
  ]);
  const ordered = describe('3. three\n4. four\n');
  assert.ok(has(ordered, 'mark', 'cm-np-list-number', 0, 2));
  assert.equal(visibleText('3. three\n4. four\n'), '3. three\n4. four\n');
});

await test('a task marker becomes a checkbox that carries its own position', () => {
  const doc = '- [ ] one\n- [x] two\n';
  const found = describe(doc);
  const boxes = found.filter(
    (item) => item.kind === 'widget' && item.value === 'TaskCheckboxWidget',
  );
  assert.deepEqual(
    boxes.map((box) => [box.from, box.to]),
    [
      [2, 5],
      [12, 15],
    ],
  );
  assert.deepEqual(
    structureOf(doc).filter((item) => item.kind === 'task'),
    [
      { kind: 'task', checked: false },
      { kind: 'task', checked: true },
    ],
  );
});

await test('a task box stays a box while its own line is edited', () => {
  // The defect this covers: a caret on the line turned the box back into
  // `- [ ]`, so the one moment a person wants to tick an item was the one
  // moment the control was gone.
  const doc = '- [ ] one\n- [x] two\n';
  for (const caret of [0, 3, 6, 9]) {
    const found = describe(doc, { from: caret, to: caret });
    const boxes = found.filter(
      (item) => item.kind === 'widget' && item.value === 'TaskCheckboxWidget',
    );
    assert.deepEqual(
      boxes.map((box) => [box.from, box.to]),
      [
        [2, 5],
        [12, 15],
      ],
      `the caret at ${String(caret)} lost a task box`,
    );
    // The bullet of the item stays hidden as well, so the line never shows a
    // stray marker next to the box.
    assert.ok(has(found, 'hide', '', 0, 1));
  }
});

await test('a bullet that is not a task still shows its source when edited', () => {
  // The task box is the one exception to the reveal rule. Every other marker
  // keeps the rule, so a caret on a plain item shows the `-` it wrote.
  const doc = '- one\n';
  assert.ok(
    has(describe(doc, { from: 2, to: 2 }), 'mark', 'cm-np-marker', 0, 1),
  );
});

await test('a fenced block keeps its info string and dims its fences', () => {
  const doc = '```ts\nconst a = 1;\n```\n';
  const found = describe(doc);
  assert.ok(has(found, 'mark', 'cm-np-code-info', 3, 5));
  assert.ok(has(found, 'mark', 'cm-np-marker', 0, 3));
  assert.ok(has(found, 'line', 'cm-np-code-block-line'));
  assert.deepEqual(structureOf(doc), [{ kind: 'code-block', info: 'ts' }]);
});

await test('an indented code block is reported and styled', () => {
  const doc = 'text\n\n    indented\n';
  assert.ok(has(describe(doc), 'line', 'cm-np-code-block-line'));
  assert.deepEqual(structureOf(doc), [{ kind: 'code-block', info: '' }]);
});

await test('a hash inside a fence is code and never a heading', () => {
  const doc = '```\n# not a heading\n```\n';
  assert.deepEqual(
    structureOf(doc).filter((item) => item.kind === 'heading'),
    [],
  );
});

await test('nested quotes nest and each level gets a bar', () => {
  const doc = '> outer\n>\n> > inner\n';
  const found = describe(doc);
  assert.ok(has(found, 'line', 'cm-np-quote-1'));
  assert.ok(has(found, 'line', 'cm-np-quote-2'));
  assert.deepEqual(
    structureOf(doc).filter((item) => item.kind === 'quote'),
    [
      { kind: 'quote', depth: 1 },
      { kind: 'quote', depth: 2 },
    ],
  );
  assert.equal(visibleText(doc), 'outer\n\ninner\n');
});

await test('a table stays text with quiet separators and per column alignment', () => {
  const doc = '| a | b | c |\n| :- | :-: | -: |\n| 1 | 2 | 3 |\n';
  const found = describe(doc);
  assert.ok(has(found, 'line', 'cm-np-table-line'));
  assert.ok(has(found, 'mark', 'cm-np-table-head'));
  assert.ok(has(found, 'mark', 'cm-np-table-pipe'));
  assert.ok(has(found, 'mark', 'cm-np-align-left'));
  assert.ok(has(found, 'mark', 'cm-np-align-center'));
  assert.ok(has(found, 'mark', 'cm-np-align-right'));
  // Every cell keeps its text, so a cell is edited where it stands. Only the
  // delimiter row steps aside, because the columns already state what it
  // says.
  assert.equal(visibleText(doc), '| a | b | c |\n\n| 1 | 2 | 3 |\n');
  assert.deepEqual(structureOf(doc), [{ kind: 'table', rows: 2, columns: 3 }]);
});

await test('the delimiter row comes back when the selection reaches it', () => {
  const doc = '| a | b |\n| :- | -: |\n| 1 | 2 |\n';
  const onTheRow = doc.indexOf('| :-') + 3;
  assert.equal(visibleText(doc, { from: onTheRow, to: onTheRow }), doc);
  const found = describe(doc, { from: onTheRow, to: onTheRow });
  assert.ok(has(found, 'mark', 'cm-np-table-rule'));
});

await test('a separator keeps its box and only changes how visible it is', () => {
  // The columns must not move while a person edits one row, so the box of a
  // separator is there at every moment and only its class changes.
  const doc = '| a | b |\n| :- | -: |\n| 1 | 2 |\n';
  const onFirstRow = doc.indexOf('| a') + 3;
  const quiet = describe(doc).filter(
    (item) => item.kind === 'mark' && item.value.startsWith('cm-np-table-pipe'),
  );
  const shown = describe(doc, { from: onFirstRow, to: onFirstRow }).filter(
    (item) => item.kind === 'mark' && item.value.startsWith('cm-np-table-pipe'),
  );
  assert.equal(quiet.length, 6);
  assert.ok(
    shown.some((item) => item.value.includes('cm-np-table-shown')),
    'the row under the selection shows its separators',
  );
});

await test('every row of a table carries the same boxes', () => {
  // The columns line up only when each row is cut into the same number of
  // pieces. A cell holds its padding spaces, so no text of a row sits
  // outside a cell and the delimiter row is cut the same way.
  const doc = '| a | bbbb |\n| :- | ---: |\n| cc |  d  |\n';
  const found = describe(doc);
  const boxes = (from: number, to: number): number =>
    found.filter(
      (item) =>
        item.kind === 'mark' &&
        item.from >= from &&
        item.to <= to &&
        (item.value.startsWith('cm-np-table-head') ||
          item.value.startsWith('cm-np-table-cell') ||
          item.value === 'cm-np-table-pipe' ||
          item.value === 'cm-np-table-rule'),
    ).length;
  const header = doc.indexOf('\n');
  const delimiter = doc.indexOf('\n', header + 1);
  const row = doc.indexOf('\n', delimiter + 1);
  assert.equal(boxes(0, header), 5);
  assert.equal(boxes(delimiter + 1, row), 5);
  // The delimiter row steps aside while the selection is away from it, and
  // it comes back with the same five boxes when the selection reaches it.
  const onTheRow = header + 3;
  const revealed = describe(doc, { from: onTheRow, to: onTheRow }).filter(
    (item) =>
      item.kind === 'mark' &&
      item.from >= header + 1 &&
      item.to <= delimiter &&
      (item.value === 'cm-np-table-rule' ||
        item.value.startsWith('cm-np-table-pipe')),
  );
  assert.equal(revealed.length, 5);
});

await test('a table row without edge separators keeps its two cells', () => {
  const doc = 'a | b\n--- | ---\n1 | 2\n';
  const found = describe(doc);
  const cells = found.filter(
    (item) => item.kind === 'mark' && item.value.startsWith('cm-np-table-head'),
  );
  assert.equal(cells.length, 2);
  assert.equal(visibleText(doc), 'a | b\n\n1 | 2\n');
});

await test('the delimiter row is cut at every separator', () => {
  assert.deepEqual(delimiterRowParts('| :- |', 10), [
    { from: 10, to: 11, pipe: true },
    { from: 11, to: 15, pipe: false },
    { from: 15, to: 16, pipe: true },
  ]);
  assert.deepEqual(delimiterRowParts('---', 0), [
    { from: 0, to: 3, pipe: false },
  ]);
});

await test('the alignment reader follows the delimiter row', () => {
  assert.deepEqual(tableAlignments('| :- | :-: | -: | --- |'), [
    'left',
    'center',
    'right',
    null,
  ]);
});

await test('a footnote reference and its definition are styled', () => {
  const doc = 'text[^one] more\n\n[^one]: the note\n';
  const found = describe(doc);
  assert.ok(has(found, 'mark', 'cm-np-footnote', 4, 10));
  assert.ok(has(found, 'line', 'cm-np-footnote-definition'));
  assert.equal(visibleText(doc), doc);
});

await test('a hard break and raw HTML keep their source', () => {
  const doc = 'one  \ntwo\n\n<div>raw</div>\n';
  const found = describe(doc);
  assert.ok(has(found, 'mark', 'cm-np-hard-break'));
  assert.ok(has(found, 'mark', 'cm-np-html'));
  assert.equal(visibleText(doc), doc);
});

await test('an entity is left exactly as written', () => {
  assert.equal(visibleText('five &amp; six\n'), 'five &amp; six\n');
});

await test('the heading level reader knows both heading shapes', () => {
  assert.equal(headingLevel('ATXHeading4'), 4);
  assert.equal(headingLevel('SetextHeading2'), 2);
  assert.equal(headingLevel('Paragraph'), 0);
});

await test('only the visible ranges are walked', () => {
  const doc = Array.from(
    { length: 400 },
    (_, index) => `# heading ${String(index)}`,
  ).join('\n\n');
  const state = stateOf(doc);
  const whole = buildPreview(state, [{ from: 0, to: state.doc.length }], {
    from: 0,
    to: 0,
  });
  const window = buildPreview(state, [{ from: 0, to: 200 }], {
    from: 0,
    to: 0,
  });
  assert.ok(window.visited < whole.visited / 4);
  assert.ok(window.structure.length < whole.structure.length);
});

await test('a long document costs a bounded number of tree visits', () => {
  // Five thousand lines of ordinary prose and lists. The walk must stay
  // proportional to the tree, so the count is asserted rather than a clock.
  const lines: string[] = [];
  for (let index = 0; index < 1000; index += 1)
    lines.push(
      `## Section ${String(index)}`,
      '',
      'A paragraph with **bold** and `code`.',
      '',
      `- item ${String(index)}`,
      '',
    );
  const doc = lines.join('\n');
  const state = stateOf(doc);
  const built = buildPreview(state, [{ from: 0, to: state.doc.length }], {
    from: 0,
    to: 0,
  });
  assert.equal(state.doc.lines, 6000);
  // Twelve nodes per source line is already generous for this shape.
  assert.ok(
    built.visited < state.doc.lines * 12,
    `visited ${String(built.visited)} nodes`,
  );
  // One screen costs a small fraction of the document.
  const screen = buildPreview(state, [{ from: 0, to: 2000 }], {
    from: 0,
    to: 0,
  });
  assert.ok(
    screen.visited < built.visited / 10,
    `screen ${String(screen.visited)} of ${String(built.visited)}`,
  );
});

await test('a bare bracket pair with no definition stays plain text', () => {
  // The parser wraps `[word]` in a link node, but CommonMark renders it as
  // text, so hiding its brackets would remove real characters.
  const doc = 'tags: [demo, markdown]\n';
  assert.equal(visibleText(doc), doc);
  assert.ok(!has(describe(doc), 'mark', 'cm-np-link'));
});

await test('a reference link keeps its brackets and is styled', () => {
  const doc = 'a [shown][ref] b\n\n[ref]: /notes/x\n';
  const found = describe(doc);
  assert.ok(has(found, 'mark', 'cm-np-link'));
  assert.ok(has(found, 'line', 'cm-np-link-definition'));
  assert.equal(visibleText(doc), doc);
});

/**
 * Types one string into an empty document, one character at a time.
 *
 * Each step dispatches one transaction and puts the cursor after the typed
 * character, which is what a person typing produces. The callback sees
 * every intermediate state, so a decoration that appears for one keystroke
 * and disappears again cannot hide from the assertion.
 */
function typeInto(text: string, onStep: (state: EditorState) => void): void {
  let state = EditorState.create({ doc: '', extensions: [noteMarkdown()] });
  for (const character of text) {
    const at = state.doc.length;
    state = state.update({
      changes: { from: at, insert: character },
      selection: { anchor: at + 1 },
    }).state;
    for (
      let attempt = 0;
      attempt < 200 && syntaxTree(state).length < state.doc.length;
      attempt += 1
    ) {
      ensureSyntaxTree(state, state.doc.length, 5000);
      state = state.update({}).state;
    }
    onStep(state);
  }
}

/** The heading line classes of one state, as `from:class` entries. */
function headingLines(state: EditorState): readonly string[] {
  const built = buildPreview(
    state,
    [{ from: 0, to: state.doc.length }],
    state.selection.main,
  );
  const found: string[] = [];
  built.decorations.between(0, state.doc.length, (from, to, value) => {
    const spec = value.spec as { class?: string };
    if (from !== to) return;
    if (spec.class === undefined) return;
    if (!spec.class.split(' ').includes('cm-np-heading')) return;
    found.push(`${String(from)}:${spec.class}`);
  });
  return found;
}

await test('typing a second paragraph never resizes the first one', () => {
  // Regression: while the person typed the next line the paragraph above
  // took heading size for one keystroke and returned to paragraph size
  // later. A list and a thematic break both start with the character that
  // ends a setext heading, so both walks pass over that state.
  for (const typed of [
    'Hello\nWorld\n',
    'Hello\n- item\n',
    'Hello\n\n---\n',
    'Hello\n= two\n',
  ])
    typeInto(typed, (state) => {
      assert.deepEqual(
        headingLines(state),
        [],
        `${JSON.stringify(state.doc.toString())} got a heading line`,
      );
    });
});

await test('a setext heading keeps its size while the text line is edited', () => {
  // The underline is the marker line of the construct, so only a cursor on
  // the underline shows the construct as source.
  const doc = 'Title\n=====\n';
  assert.ok(has(describe(doc, { from: 2, to: 2 }), 'line', 'cm-np-h1'));
  assert.ok(!has(describe(doc, { from: 8, to: 8 }), 'line', 'cm-np-h1'));
  assert.ok(has(describe(doc), 'line', 'cm-np-h1'));
});

await test('the preview rebuilds when the parser produced more tree', () => {
  const quiet = {
    docChanged: false,
    selectionSet: false,
    viewportChanged: false,
    treeChanged: false,
  };
  assert.equal(previewNeedsRebuild(quiet), false);
  assert.equal(previewNeedsRebuild({ ...quiet, treeChanged: true }), true);
  assert.equal(previewNeedsRebuild({ ...quiet, docChanged: true }), true);
  assert.equal(previewNeedsRebuild({ ...quiet, selectionSet: true }), true);
  assert.equal(previewNeedsRebuild({ ...quiet, viewportChanged: true }), true);
});
