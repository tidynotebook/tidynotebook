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
import { EditorState } from '@codemirror/state';
import { noteMarkdown, parsedWhole } from './language.ts';
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
 * reads a ready tree there. A headless state parses in slices, so this
 * reads through `parsedWhole`, which pumps that work into the state field
 * until the tree covers the document or refuses.
 */
function stateOf(doc: string): EditorState {
  return parsedWhole(EditorState.create({ doc, extensions: [noteMarkdown()] }));
}

/**
 * The class names of a decoration, or `null` when it sets none.
 *
 * `Decoration.spec` is the object that the caller passed, so CodeMirror
 * declares nothing about it. These readers check each member that the tests
 * below read, so a decoration built in another shape fails the test instead
 * of passing it by accident.
 */
function specClass(spec: unknown): string | null {
  if (typeof spec !== 'object' || spec === null) return null;
  if (!('class' in spec)) return null;
  const className: unknown = spec.class;
  return typeof className === 'string' ? className : null;
}

/** The constructor name of the widget of a decoration, or `null`. */
function specWidget(spec: unknown): string | null {
  if (typeof spec !== 'object' || spec === null) return null;
  if (!('widget' in spec)) return null;
  const widget: unknown = spec.widget;
  if (typeof widget !== 'object' || widget === null) return null;
  return widget.constructor.name;
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
    const widget = specWidget(value.spec);
    if (widget !== null)
      found.push({ from, to, kind: 'widget', value: widget });
    else {
      const className = specClass(value.spec);
      if (className === null) found.push({ from, to, kind: 'hide', value: '' });
      else
        found.push({
          from,
          to,
          kind: from === to ? 'line' : 'mark',
          value: className,
        });
    }
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

await test('leading YAML front matter stays editable and is not a heading', () => {
  const doc = '---\ntitle: Example\ntags: [one, two]\n---\n\n# Body\n';
  const found = describe(doc);
  const metadataLines = found.filter(
    (item) => item.kind === 'line' && item.value.includes('cm-np-front-matter'),
  );
  assert.deepEqual(
    metadataLines.map((item) => item.from),
    [0, 4, 19, 36],
  );
  assert.ok(!has(found, 'line', 'cm-np-h2'));
  assert.ok(!has(found, 'widget', 'RuleWidget'));
  assert.deepEqual(structureOf(doc), [
    { kind: 'front-matter' },
    { kind: 'heading', level: 1, text: 'Body' },
  ]);
  assert.ok(visibleText(doc).startsWith('---\ntitle: Example\n'));
});

await test('a bullet is replaced at every depth', () => {
  const doc = '- a\n  - b\n    - c\n';
  const bullets = describe(doc).filter(
    (item) => item.kind === 'widget' && item.value === 'BulletWidget',
  );
  assert.equal(bullets.length, 3);
  assert.deepEqual(structureOf(doc), [
    { kind: 'list-item', depth: 1, ordered: false, value: null },
    { kind: 'list-item', depth: 2, ordered: false, value: null },
    { kind: 'list-item', depth: 3, ordered: false, value: null },
  ]);
});

/**
 * The drawn label of every ordered marker, in document order.
 *
 * A widget is data until a view renders it, so the label is read from the
 * widget the decoration carries, and a widget of another shape fails.
 */
function orderedLabels(
  doc: string,
  selection?: { from: number; to: number },
): readonly string[] {
  const state = stateOf(doc);
  const built = buildPreview(
    state,
    [{ from: 0, to: state.doc.length }],
    selection ?? { from: state.doc.length, to: state.doc.length },
  );
  const labels: { from: number; label: string }[] = [];
  built.decorations.between(0, state.doc.length, (from, _to, value) => {
    const spec: unknown = value.spec;
    if (typeof spec !== 'object' || spec === null || !('widget' in spec))
      return;
    const widget: unknown = spec.widget;
    if (typeof widget !== 'object' || widget === null) return;
    if (widget.constructor.name !== 'OrderedMarkerWidget') return;
    assert.ok('label' in widget && typeof widget.label === 'string');
    labels.push({ from, label: widget.label });
  });
  // A mark that holds a widget puts the widget on a layer of its own, so the
  // set reports the layers one after the other. The document order is the
  // order a person reads.
  return labels
    .sort((left, right) => left.from - right.from)
    .map((entry) => entry.label);
}

await test('an ordered marker shows the style of its depth', () => {
  // The defect this covers: every depth kept its written decimal number, so
  // a nested list showed no hierarchy (record 0089).
  const doc = [
    '1. one',
    '   1. one a',
    '      1. one a i',
    '         1. one a i 1',
    '            1. one a i 1 A',
    '      2. one a ii',
    '   2. one b',
    '2. two',
    '',
  ].join('\n');
  assert.deepEqual(orderedLabels(doc), [
    '1.',
    'a.',
    'i.',
    '1.',
    'a.',
    'ii.',
    'b.',
    '2.',
  ]);
});

await test('a bullet list between two ordered lists does not count as a level', () => {
  const doc = '1. one\n   - bullet\n     1. inner\n';
  assert.deepEqual(orderedLabels(doc), ['1.', 'a.']);
});

await test('an ordered item shows the value a reader gives it', () => {
  // CommonMark numbers a list from its first item, so a later number in the
  // source says nothing a reader shows. The label follows the reader.
  const doc = '3. three\n3. four\n9. five\n';
  assert.deepEqual(orderedLabels(doc), ['3.', '4.', '5.']);
  assert.deepEqual(
    structureOf(doc).map((node) =>
      node.kind === 'list-item' ? node.value : null,
    ),
    [3, 4, 5],
  );
  // A nested list starts its own count and leaves its parent alone. The
  // nested list starts at one, because CommonMark lets no other number start
  // a list that interrupts the text of its item.
  assert.deepEqual(
    orderedLabels('2. two\n   1. inner\n   1. next\n3. three\n'),
    ['2.', 'a.', 'b.', '3.'],
  );
});

await test('an ordered marker keeps its label while the caret edits its item', () => {
  const doc = '1. one\n   1. inner\n2. two\n';
  const inner = doc.indexOf('inner');
  const found = describe(doc, { from: inner, to: inner });
  assert.deepEqual(orderedLabels(doc, { from: inner, to: inner }), [
    '1.',
    'a.',
    '2.',
  ]);
  const marker = doc.indexOf('1. inner');
  assert.ok(has(found, 'widget', 'OrderedMarkerWidget', marker, marker + 2));
});

await test('an ordered marker shows its source while the selection touches it', () => {
  const doc = '1. one\n   1. inner\n2. two\n';
  const marker = doc.indexOf('1. inner');
  const selection = { from: marker, to: marker + 2 };
  const found = describe(doc, selection);
  assert.ok(has(found, 'mark', 'cm-np-list-number', marker, marker + 2));
  assert.deepEqual(orderedLabels(doc, selection), ['1.', '2.']);
  assert.equal(visibleText(doc, selection), ' one\n   1. inner\n two\n');
});

await test('the count of a long list starts at its first item inside the viewport', () => {
  // A view builds the visible ranges only, so a build that starts inside a
  // list must still count from the first item of that list.
  const doc = Array.from(
    { length: 40 },
    (_, index) => `${String(index + 1)}. item`,
  ).join('\n');
  const state = stateOf(doc);
  const from = state.doc.line(30).from;
  const built = buildPreview(state, [{ from, to: state.doc.line(31).to }], {
    from: -1,
    to: -1,
  });
  assert.deepEqual(
    built.structure.map((node) =>
      node.kind === 'list-item' ? node.value : null,
    ),
    [30, 31],
  );
});

await test('the marker line of an item is one row of a lead and a body', () => {
  // The defect this covers: the editor wraps every line, so the second line
  // of a long item started again at the left edge, under the box or the
  // bullet, and one item read as two. The lead holds the indentation and the
  // marker, the body holds the text, and the body is the box that wraps.
  for (const item of [
    { doc: '- [ ] one\n', lead: [0, 6], body: [6, 9] },
    { doc: '- one\n', lead: [0, 2], body: [2, 5] },
    { doc: '1. one\n', lead: [0, 3], body: [3, 6] },
  ]) {
    const found = describe(item.doc);
    assert.ok(
      has(found, 'line', 'cm-np-list-line', 0, 0),
      `${item.doc} has no row`,
    );
    assert.ok(
      has(found, 'mark', 'cm-np-list-lead', item.lead[0], item.lead[1]),
      `${item.doc} has no lead`,
    );
    assert.ok(
      has(found, 'mark', 'cm-np-list-body', item.body[0], item.body[1]),
      `${item.doc} has no body`,
    );
  }
});

await test('a drawn marker at the start of a line sits inside the lead', () => {
  // The defect this covers: a top level ordered label starts where the lead
  // starts, and a lead that was not inclusive at its start sorted after the
  // widget, so the label stood outside the lead cell and broke over two
  // lines. The browser draws what the order of the set states.
  for (const doc of ['1. one\n', '- one\n']) {
    const state = stateOf(doc);
    const built = buildPreview(state, [{ from: 0, to: state.doc.length }], {
      from: state.doc.length,
      to: state.doc.length,
    });
    const starts: string[] = [];
    for (
      const cursor = built.decorations.iter();
      cursor.value !== null;
      cursor.next()
    ) {
      if (cursor.from !== 0) continue;
      const spec: unknown = cursor.value.spec;
      starts.push(specWidget(spec) ?? specClass(spec) ?? 'hide');
    }
    const lead = starts.indexOf('cm-np-list-lead');
    const widget = starts.findIndex((name) => name.endsWith('Widget'));
    assert.ok(lead !== -1 && widget !== -1, `${doc} lost a decoration`);
    assert.ok(lead < widget, `${doc} draws its marker outside the lead`);
  }
});

await test('a nested item takes its own source indentation into the lead', () => {
  // The lead takes the width of what it holds, so the indentation of a nested
  // item belongs inside it. This is what keeps the alignment right at every
  // depth without a rule that states a distance.
  const found = describe('- one\n  - [ ] two\n');
  assert.ok(has(found, 'line', 'cm-np-list-line', 6, 6));
  assert.ok(has(found, 'mark', 'cm-np-list-lead', 6, 14));
  assert.ok(has(found, 'mark', 'cm-np-list-body', 14, 17));
});

await test('only the marker line of an item is a row', () => {
  // A later line of the same item already carries its indentation in the
  // source, so it stays an ordinary line and nothing moves it twice.
  const rows = describe('- one\n  two\n').filter(
    (item) => item.kind === 'line' && item.value === 'cm-np-list-line',
  );
  assert.deepEqual(
    rows.map((row) => row.from),
    [0],
  );
});

await test('an item with no text grows no body', () => {
  // A mark decoration may not be empty, so an item that holds only its marker
  // gets the lead alone.
  const found = describe('- \n');
  assert.ok(has(found, 'mark', 'cm-np-list-lead', 0, 2));
  assert.ok(!has(found, 'mark', 'cm-np-list-body'));
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

await test('a bullet is drawn at every caret on its line', () => {
  // Record 0132 draws a bullet the way it draws a task box, so a caret on the
  // line never turns the dot back into `-`.
  const doc = '- one\n';
  for (const caret of [0, 1, 2, 5]) {
    const found = describe(doc, { from: caret, to: caret });
    assert.ok(
      has(found, 'widget', 'BulletWidget', 0, 1),
      `the caret at ${String(caret)} lost the bullet`,
    );
    assert.ok(!has(found, 'mark', 'cm-np-marker', 0, 1));
  }
});

await test('a bullet is drawn only once a space follows it', () => {
  // A lone `-` is an empty item to CommonMark, and still the character a
  // person just typed, so it stays that character until the space arrives.
  const lone = describe('-\n', { from: 1, to: 1 });
  assert.ok(!has(lone, 'widget', 'BulletWidget'));
  assert.ok(!has(lone, 'hide', '', 0, 1));
  assert.ok(!has(lone, 'mark', 'cm-np-marker', 0, 1));
  assert.ok(
    has(describe('- \n', { from: 2, to: 2 }), 'widget', 'BulletWidget', 0, 1),
  );
});

await test('a range over a drawn marker shows the source that a copy takes', () => {
  // The defect this covers: a selection over a task still showed the box, so
  // what a person saw was not the `- [ ]` that the copy took.
  const task = 'a\n- [ ] one\n';
  for (const range of [
    { from: 0, to: 11 },
    { from: 7, to: 11 },
    { from: 3, to: 4 },
  ]) {
    const found = describe(task, range);
    assert.ok(
      !found.some((item) => item.value === 'TaskCheckboxWidget'),
      `the range ${JSON.stringify(range)} kept the box`,
    );
    assert.ok(has(found, 'mark', 'cm-np-marker', 2, 3));
    assert.ok(has(found, 'mark', 'cm-np-marker', 4, 7));
  }
  const bullet = describe('- one\n', { from: 0, to: 5 });
  assert.ok(has(bullet, 'mark', 'cm-np-marker', 0, 1));
  assert.ok(!has(bullet, 'widget', 'BulletWidget'));
});

await test('a range that stops at a drawn marker keeps it drawn', () => {
  const doc = 'a\n- [ ] one\n';
  // The text of the item alone, and the line above with its line break.
  for (const range of [
    { from: 8, to: 11 },
    { from: 0, to: 2 },
  ]) {
    const found = describe(doc, range);
    assert.ok(has(found, 'widget', 'TaskCheckboxWidget', 4, 7));
    assert.ok(has(found, 'hide', '', 2, 3));
  }
});

await test('a link says whether a plain click on it opens it', () => {
  // A plain click on a link opens it, and the pointer over it says so. A link
  // the selection touches shows its source instead, so the person is editing
  // that link and a click there places the caret. One class carries that fact
  // to the theme, from the same reveal rule that shows the source, so the
  // cursor and the click cannot disagree.
  const doc = 'see [label](https://example.com) here\n';
  assert.ok(has(describe(doc), 'mark', 'cm-np-link', 4, 32));
  assert.ok(!has(describe(doc), 'mark', 'cm-np-link-open'));
  const edited = describe(doc, { from: 8, to: 8 });
  assert.ok(has(edited, 'mark', 'cm-np-link-open', 4, 32));
});

await test('an autolink and a bare address open the same way', () => {
  // The grammar names three link shapes, and a person reads all three as a
  // link, so all three carry the one class that states it.
  assert.ok(
    has(describe('see <https://example.com> here\n'), 'mark', 'cm-np-link'),
  );
  assert.ok(
    has(
      describe('see https://example.com here\n'),
      'mark',
      'cm-np-link',
      4,
      23,
    ),
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
      { kind: 'quote', depth: 1, tone: null },
      { kind: 'quote', depth: 2, tone: null },
    ],
  );
  assert.equal(visibleText(doc), 'outer\n\ninner\n');
});

await test('a table is a grid: its separators never show, its columns align', () => {
  const doc = '| a | b | c |\n| :- | :-: | -: |\n| 1 | 2 | 3 |\n';
  const found = describe(doc);
  assert.ok(has(found, 'line', 'cm-np-table-line'));
  assert.ok(has(found, 'mark', 'cm-np-table-head'));
  assert.ok(has(found, 'mark', 'cm-np-align-left'));
  assert.ok(has(found, 'mark', 'cm-np-align-center'));
  assert.ok(has(found, 'mark', 'cm-np-align-right'));
  // Record 0095: the cells draw the outline, so neither a separator nor the
  // delimiter row is on the screen. Every cell keeps its text, so a cell is
  // edited where it stands, and its padding never shows (record 0147).
  assert.ok(!found.some((item) => item.value.includes('cm-np-table-pipe')));
  assert.equal(visibleText(doc), 'abc\n\n123\n');
  assert.deepEqual(structureOf(doc), [{ kind: 'table', rows: 2, columns: 3 }]);
});

await test('the delimiter row stays hidden under the selection', () => {
  // The caret never stands on the delimiter row, and a selection that
  // crosses it does not bring the dashes back.
  const doc = '| a | b |\n| :- | -: |\n| 1 | 2 |\n';
  const onTheRow = doc.indexOf('| :-') + 3;
  assert.equal(
    visibleText(doc, { from: onTheRow, to: onTheRow }),
    visibleText(doc),
  );
  assert.ok(
    has(
      describe(doc, { from: onTheRow, to: onTheRow }),
      'line',
      'cm-np-table-closed',
    ),
  );
});

await test('a separator stays hidden on the row of the caret', () => {
  const doc = '| a | b |\n| :- | -: |\n| 1 | 2 |\n';
  const onFirstRow = doc.indexOf('| a') + 3;
  const firstRow = visibleText(doc, { from: onFirstRow, to: onFirstRow }).split(
    '\n',
  )[0];
  assert.equal(firstRow, 'ab');
});

await test('every row of a table carries one box for each column', () => {
  // The columns line up only when each row is cut into the same number of
  // cells. A cell holds its padding spaces, so no text of a row sits outside
  // a cell.
  const doc = '| a | bbbb |\n| :- | ---: |\n| cc |  d  |\n';
  const found = describe(doc);
  const boxes = (from: number, to: number): number =>
    found.filter(
      (item) =>
        item.kind === 'mark' &&
        item.from >= from &&
        item.to <= to &&
        item.value
          .split(' ')
          .some(
            (name) =>
              name === 'cm-np-table-head' || name === 'cm-np-table-cell',
          ),
    ).length;
  const header = doc.indexOf('\n');
  const delimiter = doc.indexOf('\n', header + 1);
  const row = doc.indexOf('\n', delimiter + 1);
  assert.equal(boxes(0, header), 2);
  assert.equal(boxes(header + 1, delimiter), 0);
  assert.equal(boxes(delimiter + 1, row), 2);
});

await test('every separator of a row is a gap cell that wraps it', () => {
  // Regression: a hidden separator left a loose node between two cells, the
  // browser wrapped it in an anonymous cell, and after a column moved some
  // rows split those cells and stopped lining up. A row now holds only
  // cells: a gap, a cell, a gap, and so on, with no hole between them.
  const doc = '| a | bb |\n| --- | --- |\n| c | d |\n';
  const header = doc.indexOf('\n');
  const row = describe(doc)
    .filter((item) => item.kind === 'mark' && item.to <= header)
    .sort((left, right) => left.from - right.from);
  assert.deepEqual(
    row.map((item) => [doc.slice(item.from, item.to), item.value]),
    [
      ['|', 'cm-np-table-gap'],
      [' a ', 'cm-np-table-head'],
      ['|', 'cm-np-table-gap'],
      [' bb ', 'cm-np-table-head'],
      ['|', 'cm-np-table-gap'],
    ],
  );
  // The gap opens before the hidden range of the same separator, so the
  // hidden node lands inside the gap and not beside it.
  const state = stateOf(doc);
  const sides: Record<string, number> = {};
  buildPreview(state, [{ from: 0, to: state.doc.length }], {
    from: doc.length,
    to: doc.length,
  }).decorations.between(0, 1, (from, to, value) => {
    if (from === 0 && to === 1)
      sides[specClass(value.spec) ?? 'hide'] = value.startSide;
  });
  const gap = sides['cm-np-table-gap'];
  const hidden = sides.hide;
  assert.ok(gap !== undefined && hidden !== undefined);
  if (gap !== undefined && hidden !== undefined) assert.ok(gap < hidden);
});

await test('a cell shows its text and not the padding of the source', () => {
  // Record 0147. The writer pads every cell of a column to one width, and a
  // cell that showed those spaces was as wide as the longest cell of its
  // column, so a short column took the width of a long one.
  const doc =
    '| Task           | Who |\n| -------------- | --- |\n| Write a design | Sam |\n';
  assert.equal(visibleText(doc), 'TaskWho\n\nWrite a designSam\n');
  // Regression: the hidden padding rendered beside the cell and not in it,
  // the browser wrapped that loose node in an anonymous cell, and the cell
  // took the width of a column of its own. The cell opens before the hidden
  // padding at its start and closes after the hidden padding at its end.
  const state = stateOf(doc);
  const end = doc.indexOf('|', 1);
  const sides: Record<string, { start: number; end: number }> = {};
  buildPreview(state, [{ from: 0, to: state.doc.length }], {
    from: doc.length,
    to: doc.length,
  }).decorations.between(0, end, (from, to, value) => {
    const name = specClass(value.spec) ?? 'hide';
    if (from === 1 && to === end)
      sides[name] = { start: value.startSide, end: value.endSide };
    if (name === 'hide' && from === 1)
      sides.lead = { start: value.startSide, end: value.endSide };
    if (name === 'hide' && to === end)
      sides.tail = { start: value.startSide, end: value.endSide };
  });
  const cell = sides['cm-np-table-head'];
  const lead = sides.lead;
  const tail = sides.tail;
  assert.ok(cell !== undefined && lead !== undefined && tail !== undefined);
  if (cell !== undefined && lead !== undefined && tail !== undefined) {
    assert.ok(cell.start < lead.start);
    assert.ok(cell.end > tail.end);
  }
});

await test('a space typed at the end of a cell stays on the screen', () => {
  // A space at the end of the text is padding until the next letter. It
  // stays while the caret stands after it, so the caret does not seem to
  // swallow it.
  const doc = '| a  | b   |\n| --- | --- |\n| 1   | 2   |\n';
  const afterSpace = doc.indexOf('a') + 2;
  assert.equal(
    visibleText(doc, { from: afterSpace, to: afterSpace }).split('\n')[0],
    'a b',
  );
  // A space after the caret is padding and stays hidden.
  const afterA = doc.indexOf('a') + 1;
  assert.equal(
    visibleText(doc, { from: afterA, to: afterA }).split('\n')[0],
    'ab',
  );
});

await test('an empty cell keeps one space after the place of its caret', () => {
  // A cell with no text would hold no line box, and a row of empty cells
  // would lose its height. The space it keeps stands after the caret, so the
  // caret of an empty cell starts where the text of every other cell starts.
  const doc = '| a   | b   |\n| --- | --- |\n|     | 2   |\n';
  const row = doc.lastIndexOf('|     |');
  assert.equal(visibleText(doc).split('\n')[2], ' 2');
  const hidden = describe(doc)
    .filter(
      (item) => item.kind === 'hide' && item.from > row && item.to <= row + 6,
    )
    .sort((left, right) => left.from - right.from);
  assert.deepEqual(
    hidden.map((item) => [item.from - row, item.to - row]),
    [
      [1, 2],
      [3, 6],
    ],
  );
});

await test('the cell that holds the caret is the active cell', () => {
  const doc = '| a | b |\n| --- | --- |\n| 1 | 2 |\n';
  const inTwo = doc.indexOf('2') + 1;
  const active = describe(doc, { from: inTwo, to: inTwo }).filter((item) =>
    item.value.includes('cm-np-table-active'),
  );
  assert.equal(active.length, 1);
  assert.equal(doc.slice(active[0]?.from, active[0]?.to).trim(), '2');
  // A range marks no single cell, because it is not one place to write.
  const range = describe(doc, { from: doc.indexOf('1'), to: inTwo });
  assert.ok(!range.some((item) => item.value.includes('cm-np-table-active')));
});

await test('an escaped pipe in a cell shows as a pipe', () => {
  const doc = '| a \\| b | c |\n| --- | --- |\n| 1 | 2 |\n';
  assert.equal(visibleText(doc).split('\n')[0], 'a | bc');
  // The backslash comes back under the selection, so the source stays
  // editable, and an escape outside a table keeps it at every moment.
  const onEscape = doc.indexOf('\\') + 1;
  assert.equal(
    visibleText(doc, { from: onEscape, to: onEscape }).split('\n')[0],
    'a \\| bc',
  );
});

await test('a table row without edge separators keeps its two cells', () => {
  const doc = 'a | b\n--- | ---\n1 | 2\n';
  const found = describe(doc);
  const cells = found.filter(
    (item) => item.kind === 'mark' && item.value.startsWith('cm-np-table-head'),
  );
  assert.equal(cells.length, 2);
  assert.equal(visibleText(doc), 'ab\n\n12\n');
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
    state = parsedWhole(
      state.update({
        changes: { from: at, insert: character },
        selection: { anchor: at + 1 },
      }).state,
    );
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
    if (from !== to) return;
    const className = specClass(value.spec);
    if (className === null) return;
    if (!className.split(' ').includes('cm-np-heading')) return;
    found.push(`${String(from)}:${className}`);
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

await test('an alert quote states its tone and shows its title', () => {
  const doc = '> [!WARNING]\n> Mind the gap.\n';
  const found = describe(doc);
  assert.ok(has(found, 'line', 'cm-np-alert'));
  assert.ok(has(found, 'line', 'cm-np-alert-warning'));
  assert.deepEqual(
    structureOf(doc).filter((item) => item.kind === 'quote'),
    [{ kind: 'quote', depth: 1, tone: 'warning' }],
  );
  // The marker leaves the text. The title widget carries the word, so the
  // visible text of the source is the body alone.
  assert.equal(visibleText(doc), '\nMind the gap.\n');
});

await test('every alert tone reaches its own class', () => {
  for (const tone of ['note', 'tip', 'important', 'warning', 'caution'])
    assert.ok(
      has(
        describe(`> [!${tone.toUpperCase()}]\n> Body.\n`),
        'line',
        `cm-np-alert-${tone}`,
      ),
      tone,
    );
});

await test('a quote that is no alert keeps its first line', () => {
  const doc = '> [!UNKNOWN]\n> Body.\n';
  assert.ok(!has(describe(doc), 'line', 'cm-np-alert'));
  assert.deepEqual(
    structureOf(doc).filter((item) => item.kind === 'quote'),
    [{ kind: 'quote', depth: 1, tone: null }],
  );
});

await test('a table inside a quote carries the inset of that quote', () => {
  const doc = '> | In | Quote |\n> | -- | ----- |\n> | a  | b     |\n';
  const found = describe(doc);
  // A row is a table-row box and takes no padding, so the inset sits on the
  // leading cell of every row.
  assert.ok(has(found, 'mark', 'cm-np-table-lead'));
  assert.ok(has(found, 'mark', 'cm-np-table-quoted-1'));
});

await test('a table at the left edge grows no leading cell', () => {
  const doc = '| A | B |\n| - | - |\n| 1 | 2 |\n';
  assert.ok(!has(describe(doc), 'mark', 'cm-np-table-lead'));
});

await test('a table inside a list item keeps its indentation in a cell', () => {
  const doc = '1. Item\n\n   | A | B |\n   | - | - |\n   | 1 | 2 |\n';
  assert.ok(has(describe(doc), 'mark', 'cm-np-table-lead'));
});
