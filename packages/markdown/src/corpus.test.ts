/**
 * Corpus checks.
 *
 * These tests read the one shared document and assert specific structures in
 * the rendered HTML. They deliberately avoid a whole-document snapshot: a
 * snapshot would pass again after someone weakened the policy and updated the
 * expected text.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { corpusMarkdown } from '../test-data/content.ts';
import { extractAttachmentRefs, extractLinks } from './links.ts';
import { parseMarkdown } from './parse.ts';
import { renderMarkdown } from './render.ts';

const html = await renderMarkdown(corpusMarkdown);

await test('the corpus renders no script element and no raw HTML', () => {
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('raw block'));
  assert.ok(!html.includes('<b>'));
  assert.ok(!html.includes('<span onclick'));
  // The text around a raw element survives; only the markup is dropped.
  assert.ok(html.includes('Inline raw bold text and span text.'));
});

await test('the corpus renders no event handler attribute', () => {
  assert.ok(!/\son[a-z]+=/i.test(html));
  assert.ok(!html.includes('onerror'));
});

await test('the corpus renders no blocked URL scheme', () => {
  for (const scheme of ['javascript:', 'data:', 'vbscript:', 'file:'])
    assert.ok(!html.includes(scheme), scheme);
  assert.ok(!html.includes('//evil.example.com'));
});

await test('a blocked link keeps its text and loses its destination', () => {
  assert.ok(html.includes('<span data-blocked="link">click me</span>'));
  assert.ok(html.includes('<span data-blocked="link">broken note</span>'));
});

await test('an external link is marked and opens no named window', () => {
  assert.ok(
    html.includes(
      '<a href="https://example.com/page" rel="noopener noreferrer">external site</a>',
    ),
  );
  assert.ok(!html.includes('target='));
});

await test('only an attachment image survives as an image element', () => {
  assert.ok(
    html.includes(
      '<img src="/attachments/0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d" alt="diagram attachment">',
    ),
  );
  assert.ok(
    html.includes(
      '<span data-external-image="https://example.com/photo.png">external picture</span>',
    ),
  );
  assert.ok(html.includes('<span data-blocked="image">bad image</span>'));
  assert.equal(html.match(/<img /g)?.length, 1);
});

await test('the corpus renders a GFM table with alignment', () => {
  assert.ok(html.includes('<th align="left">Column</th>'));
  assert.ok(html.includes('<th align="right">Right</th>'));
  assert.ok(html.includes('<td align="right">1</td>'));
});

await test('task items render as disabled checkboxes', () => {
  assert.ok(
    html.includes(
      '<li class="task-list-item"><input type="checkbox" checked disabled> finished task</li>',
    ),
  );
  assert.ok(
    html.includes(
      '<li class="task-list-item"><input type="checkbox" disabled> open task</li>',
    ),
  );
});

await test('nested lists render to their full depth', () => {
  assert.ok(html.includes('<li>level one'));
  assert.ok(html.includes('<li>level two'));
  assert.ok(html.includes('level three with a <a href="/notes/'));
});

await test('a footnote renders with a matching back reference', () => {
  assert.ok(
    html.includes(
      '<sup><a href="#user-content-fn-one" id="user-content-fnref-one" data-footnote-ref aria-describedby="footnote-label">1</a></sup>',
    ),
  );
  assert.ok(html.includes('<li id="user-content-fn-one">'));
  assert.ok(
    html.includes('<a href="#user-content-fnref-one" data-footnote-backref=""'),
  );
  assert.ok(html.includes('<section data-footnotes class="footnotes">'));
  // A double prefix here would point the back reference at nothing.
  assert.ok(!html.includes('user-content-user-content-'));
});

await test('front matter renders as document content', () => {
  assert.ok(html.includes('title: Corpus example'));
  assert.ok(html.includes('tags: [demo, markdown]'));
  // No front matter extension is installed, so the parser reports no metadata
  // node for it.
  const types = new Set<string>();
  const collect = (node: { type: string; children?: unknown }): void => {
    types.add(node.type);
    const children = node.children;
    if (Array.isArray(children))
      for (const child of children)
        collect(child as { type: string; children?: unknown });
  };
  collect(parseMarkdown(corpusMarkdown));
  assert.ok(!types.has('yaml'));
  assert.ok(!types.has('toml'));
});

await test('math renders to sanitized KaTeX and diagrams stay source', () => {
  assert.ok(html.includes('class="notes-math notes-math-inline"'));
  // Both inline pairs of the delimiter rule reach the math stage, so the
  // corpus holds two inline math spans and no leftover parenthesis pair.
  assert.equal(
    html.split('class="notes-math notes-math-inline"').length - 1,
    2,
  );
  assert.ok(!html.includes('(a^2 + b^2 = c^2)'));
  assert.ok(html.includes('class="notes-math notes-math-display"'));
  assert.ok(html.includes('class="katex"'));
  assert.ok(!html.includes('<span data-math="inline">E = mc^2</span>'));
  assert.ok(html.includes('<pre data-diagram="mermaid">graph TD;\n  A-->B;'));
});

await test('a block quote nests and carries no presentation', () => {
  // The live preview draws the bar and the muted text of a quote. The
  // reference HTML carries the structure only, so a class or a style here
  // would be a second presentation of the same construct.
  const opening = html.match(/<blockquote[^>]*>/g) ?? [];
  assert.equal(opening.length, 3);
  for (const tag of opening) assert.equal(tag, '<blockquote>');
  assert.equal((html.match(/<\/blockquote>/g) ?? []).length, 3);
  // The corpus quotes one quote inside another, so the reference path must
  // report two levels, exactly as the live preview reports two bars.
  let depth = 0;
  let deepest = 0;
  for (const tag of html.match(/<\/?blockquote>/g) ?? []) {
    depth += tag.startsWith('</') ? -1 : 1;
    deepest = Math.max(deepest, depth);
  }
  assert.equal(deepest, 2);
});

await test('an unclosed fence renders as a code block', () => {
  assert.ok(
    html.includes('<pre><code class="language-js">const unclosed = true;\n'),
  );
});

await test('text that looks like markup is escaped', () => {
  assert.ok(html.includes('5 &#x3C; 6 &#x26; 7 > 4'));
  assert.ok(html.includes('an escaped *star*'));
});

await test('a hard line break renders as a break element', () => {
  assert.ok(html.includes('A hard break ends this line<br>'));
});

await test('a soft line break joins its paragraph and draws no break', () => {
  // The two source lines of the first paragraph of the corpus are one
  // paragraph to a reader. Only the hard break above writes a `br`.
  assert.ok(html.includes('escaped *star*.\nUnicode: caf\u00e9'));
  assert.equal(html.match(/<br>/g)?.length, 1);
});

await test('Unicode renders exactly as written', () => {
  assert.ok(html.includes('caf\u00e9 in composed form'));
  assert.ok(html.includes('cafe\u0301 with a combining mark'));
  assert.ok(html.includes('\u{1F30D}'));
});

await test('parsing and rendering leave the source string untouched', async () => {
  const before = corpusMarkdown;
  parseMarkdown(corpusMarkdown);
  extractLinks(corpusMarkdown);
  extractAttachmentRefs(corpusMarkdown);
  await renderMarkdown(corpusMarkdown);
  assert.equal(corpusMarkdown, before);
  assert.equal(corpusMarkdown.length, before.length);
});

await test('the corpus parses to the same tree every time', () => {
  const first = JSON.stringify(parseMarkdown(corpusMarkdown));
  const second = JSON.stringify(parseMarkdown(corpusMarkdown));
  assert.equal(first, second);
});

await test('every top-level node maps onto its own source text', () => {
  const tree = parseMarkdown(corpusMarkdown);
  let previous = 0;
  for (const node of tree.children) {
    const from = node.position?.start.offset;
    const to = node.position?.end.offset;
    assert.ok(from !== undefined && to !== undefined, node.type);
    assert.ok(from >= previous, `${node.type} starts before the previous node`);
    assert.ok(to > from, `${node.type} has an empty range`);
    // Only white space separates one block from the next, so the offsets
    // address the original text and nothing was re-serialized.
    assert.equal(corpusMarkdown.slice(previous, from).trim(), '');
    previous = to;
  }
  assert.equal(corpusMarkdown.slice(previous).trim(), '');
});
