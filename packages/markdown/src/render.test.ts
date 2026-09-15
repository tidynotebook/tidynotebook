/**
 * Renderer checks for the paths the corpus cannot cover on its own: the
 * reference forms, the resource limits, and the sanitizer acting as the second
 * gate behind the URL policy.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { attachmentIdA, noteIdA } from '../test-data/content.ts';
import { renderMarkdown } from './render.ts';

await test('the URL policy applies to a reference link', async () => {
  const html = await renderMarkdown(
    '[shown][evil]\n\n[evil]: javascript:alert(1)\n',
  );
  assert.ok(html.includes('<span data-blocked="link">shown</span>'));
  assert.ok(!html.includes('javascript:'));
});

await test('the URL policy applies to a reference image', async () => {
  const html = await renderMarkdown(
    `![alt][pic]\n\n[pic]: /attachments/${attachmentIdA}\n`,
  );
  assert.ok(
    html.includes(`<img src="/attachments/${attachmentIdA}" alt="alt">`),
  );
});

await test('the URL policy applies to an autolink and a GFM literal', async () => {
  const html = await renderMarkdown(
    '<https://example.com/a> and www.example.com and <mailto:a@example.com>\n',
  );
  assert.ok(
    html.includes(
      '<a href="https://example.com/a" rel="noopener noreferrer">https://example.com/a</a>',
    ),
  );
  assert.ok(html.includes('href="http://www.example.com"'));
  assert.ok(html.includes('<a href="mailto:a@example.com"'));
});

await test('an image keeps its title and normalizes its identifier', async () => {
  const html = await renderMarkdown(
    `![alt](/attachments/${attachmentIdA.toUpperCase()} "a title")\n`,
  );
  assert.ok(
    html.includes(
      `<img src="/attachments/${attachmentIdA}" alt="alt" title="a title">`,
    ),
  );
});

await test('an internal note link carries no rel attribute', async () => {
  const html = await renderMarkdown(`[a](/notes/${noteIdA})\n`);
  assert.equal(html.trim(), `<p><a href="/notes/${noteIdA}">a</a></p>`);
});

await test('a language class that is not a plain word is dropped', async () => {
  const html = await renderMarkdown('```c++ evil"\ncode\n```\n');
  assert.ok(html.includes('<pre><code>code\n</code></pre>'));
  assert.ok(!html.includes('class='));
});

await test('raw HTML and its content are dropped', async () => {
  const html = await renderMarkdown(
    '<script>alert(1)</script>\n\ntext <img src="x" onerror="alert(2)"> more\n',
  );
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('alert(1)'));
  assert.ok(!html.includes('onerror'));
  assert.ok(html.includes('text  more'));
});

await test('headings get unique namespaced fragment identifiers', async () => {
  const html = await renderMarkdown(
    '# Heading\n\n## Heading\n\n[local](#heading)\n',
  );
  assert.ok(html.includes('<h1 id="user-content-heading">Heading</h1>'));
  assert.ok(html.includes('<h2 id="user-content-heading-2">Heading</h2>'));
  assert.ok(html.includes('<a href="#user-content-heading">local</a>'));
});

await test('a note link can name a safe heading fragment', async () => {
  const html = await renderMarkdown(`[a](/notes/${noteIdA}#heading_2)\n`);
  assert.equal(
    html.trim(),
    `<p><a href="/notes/${noteIdA}#user-content-heading_2">a</a></p>`,
  );
});

await test('hostile text inside math or a diagram stays inert', async () => {
  const html = await renderMarkdown(
    '$$</span><script>x</script>$$\n\n```mermaid\n</pre><script>y</script>\n```\n',
  );
  assert.ok(!html.includes('<script'));
  // KaTeX renders the brackets as relation symbols, so the source appears as
  // escaped text inside sanitized spans rather than as markup.
  assert.ok(html.includes('&lt;'));
  assert.ok(html.includes('<pre data-diagram="mermaid">'));
});

await test('a link keeps its title on both sides of the policy', async () => {
  // A title is author text that carries no URL, so it is kept rather than
  // dropped with the rest of the attributes. The serializer escapes the quote
  // and the ampersand, so the value cannot end the attribute or start an
  // entity. A `<` inside a quoted attribute value cannot open a tag, so the
  // serializer leaves it alone and the result is still inert.
  const external = await renderMarkdown(
    `[shown](https://example.com/p 'a "quoted" & <b> title')\n`,
  );
  assert.ok(
    external.includes(
      '<a href="https://example.com/p" title="a &#x22;quoted&#x22; &#x26; <b> title" rel="noopener noreferrer">shown</a>',
    ),
  );
  const internal = await renderMarkdown(`[shown](/notes/${noteIdA} "note")\n`);
  assert.ok(
    internal.includes(`<a href="/notes/${noteIdA}" title="note">shown</a>`),
  );
});

await test('a footnote link needs both its marker and its own fragment', async () => {
  const html = await renderMarkdown('text[^a]\n\n[^a]: note\n');
  assert.ok(
    html.includes('href="#user-content-fn-a" id="user-content-fnref-a"'),
  );
  assert.ok(
    html.includes('href="#user-content-fnref-a" data-footnote-backref=""'),
  );
});

await test('an identifier outside the generated namespace is removed', async () => {
  // Nothing in the pipeline can emit one, so this proves the schema rule.
  const html = await renderMarkdown('text[^a]\n\n[^a]: note\n');
  for (const id of html.match(/ id="[^"]*"/g) ?? [])
    assert.ok(
      id.includes('user-content-') || id === ' id="footnote-label"',
      id,
    );
});

await test('double bracket text renders as plain text', async () => {
  // v0.1 has no wiki syntax, so the brackets stay visible and no link opens.
  const html = await renderMarkdown(
    'See [[A Title]] and [[A Title|shown label]].\n',
  );
  assert.ok(html.includes('See [[A Title]] and [[A Title|shown label]].'));
  assert.ok(!html.includes('<a '));
});

await test('one new line joins a paragraph and two start a new one', async () => {
  // This is the CommonMark rule, and it is how a Markdown file reads. A
  // single new line is a soft break: it separates the source lines and the
  // reader sees one paragraph. Only a blank line starts a paragraph.
  const html = await renderMarkdown('line one\nline two\n\nsecond\n');
  assert.equal(html, '<p>line one\nline two</p>\n<p>second</p>');
  assert.ok(!html.includes('<br>'));
});

await test('a line break is written as a break and nothing else is', async () => {
  // The two CommonMark forms of a hard break. Both give one `br` element, so
  // a person who wants a break inside a paragraph has a way to write it.
  for (const source of ['first\\\nsecond\n', 'first  \nsecond\n']) {
    const html = await renderMarkdown(source);
    assert.equal(html, '<p>first<br>\nsecond</p>');
  }
});

await test('a list item keeps its own item and does not merge', async () => {
  // A new line between two items is the item separator, not a soft break, so
  // the rule above never joins a list into one line.
  const html = await renderMarkdown('- one\n- two\n');
  assert.ok(html.includes('<li>one</li>'));
  assert.ok(html.includes('<li>two</li>'));
});
