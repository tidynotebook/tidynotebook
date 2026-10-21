/**
 * Renderer checks for the paths the corpus cannot cover on its own: the
 * reference forms, the resource limits, and the sanitizer acting as the second
 * gate behind the URL policy.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { attachmentIdA, noteIdA } from '../test-data/content.ts';
import { parseMarkdown } from './parse.ts';
import { renderMarkdown } from './render.ts';

await test('leading YAML front matter is metadata and not a heading', async () => {
  const source =
    '---\ntitle: Example\nunsafe: <script>alert(1)</script>\n---\n\n# Body\n';
  const tree = parseMarkdown(source);
  assert.deepEqual(
    tree.children.map((node) => node.type),
    ['yaml', 'heading'],
  );
  const matter = tree.children[0];
  if (matter?.type !== 'yaml') assert.fail('expected YAML front matter');
  assert.equal(
    matter.value,
    'title: Example\nunsafe: <script>alert(1)</script>',
  );
  assert.equal(
    await renderMarkdown(source),
    '<pre data-frontmatter="yaml">title: Example\nunsafe: &#x3C;script>alert(1)&#x3C;/script></pre>\n<h1 id="user-content-body">Body</h1>',
  );
});

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
  assert.ok(!html.includes('language-'));
  // The label names the language, and the rest of the info string leaves.
  assert.ok(
    html.includes('<figcaption class="notes-code-label">C++</figcaption>'),
  );
  assert.ok(!html.includes('evil'));
});

await test('a code block is a figure with its language as its caption', async () => {
  // Record 0174. A reader reads the language of a block with no script.
  assert.equal(
    await renderMarkdown('```py\nx = 1\n```\n'),
    '<figure class="notes-code"><figcaption class="notes-code-label">Python</figcaption><pre><code class="language-py">x <span class="notes-code-punctuation">=</span> <span class="notes-code-number">1</span>\n</code></pre></figure>',
  );
  assert.equal(
    await renderMarkdown('    indented\n'),
    '<figure class="notes-code"><pre><code>indented\n</code></pre></figure>',
  );
  // An author can write a figure and a caption, and never the classes of
  // the renderer, so no figure of an author reads as a code block.
  const forged = await renderMarkdown(
    '<figure class="notes-code"><figcaption class="notes-code-label">x</figcaption></figure>\n',
  );
  assert.ok(!forged.includes('notes-code'), forged);
  assert.ok(forged.includes('<figure>'), forged);
});

await test('a script reads as text and a raw picture leaves', async () => {
  // GFM tagfilter: a script tag is never a tag, so it reads as the text the
  // author typed, and it runs nothing.
  const html = await renderMarkdown(
    '<script>alert(1)</script>\n\ntext <img src="x" onerror="alert(2)"> more\n',
  );
  assert.ok(!html.includes('<script'));
  assert.ok(html.includes('&#x3C;script>alert(1)&#x3C;/script>'));
  assert.ok(!html.includes('onerror'));
  assert.ok(html.includes('text  more'));
});

await test('an unclosed tag keeps every later block of the note', async () => {
  // Review C1 of record 0157. A template or an object took every later block
  // and left with it, a select and a plaintext flattened the rest, and a
  // title, a textarea and an xmp read every later tag as text. Each case
  // keeps the words and the blocks after it now.
  const later = '\n\nlater words\n\n- item\n';
  const blocks = '<p>later words</p>\n<ul>\n<li>item</li>\n</ul>';
  for (const opening of [
    '<template>',
    '<object>',
    '<select>',
    'a <plaintext> b',
    'a <title> b',
    'a <xmp> b',
    'a <iframe> b',
    'a <noscript> b',
    'a <noembed> b',
    'a <noframes> b',
    'a <style> b',
  ]) {
    const html = await renderMarkdown(`${opening}${later}`);
    assert.ok(html.includes(blocks), `${opening}: ${html}`);
  }
  // A textarea opens a CommonMark HTML block that ends only at its closing
  // tag, as on GitHub, so the rest of the note is that block. Its words stay,
  // as the text that the author typed.
  const area = await renderMarkdown(`<textarea>${later}`);
  assert.ok(area.includes('&#x3C;textarea>'), area);
  assert.ok(area.includes('later words') && area.includes('- item'), area);
});

await test('the HTML of an author keeps its safe elements', async () => {
  // Issue 235. Every HTML node left with its tags, so `hi<br>next` became one
  // word, a key and a subscript read as plain text, and the title of a folded
  // block disappeared. Record 0157 keeps the safe set of the GitHub renderer.
  const inline = await renderMarkdown(
    'Press <kbd>Ctrl</kbd>, H<sub>2</sub>O, x<sup>2</sup>, <mark>m</mark>, <ins>i</ins>, <del>d</del>, <s>s</s>, <abbr title="HyperText">HTML</abbr>, hi<br>next.\n',
  );
  assert.equal(
    inline,
    '<p>Press <kbd>Ctrl</kbd>, H<sub>2</sub>O, x<sup>2</sup>, <mark>m</mark>, <ins>i</ins>, <del>d</del>, <s>s</s>, <abbr title="HyperText">HTML</abbr>, hi<br>next.</p>',
  );
  const folded = await renderMarkdown(
    '<details open>\n<summary>More</summary>\n\nHidden *text*\n\n</details>\n',
  );
  assert.equal(
    folded,
    '<details open>\n<summary>More</summary>\n<p>Hidden <em>text</em></p>\n</details>',
  );
});

await test('an unsafe neighbour of a safe element leaves', async () => {
  // Each pair is the HTML of an author and what a reader receives. A safe
  // element keeps its tags and loses every attribute that its list does not
  // name, and an element outside the list keeps its words.
  const cases: readonly (readonly [string, string])[] = [
    [
      '<kbd onclick="x()" style="color:red" class="katex" id="submit">K</kbd>',
      '<p><kbd>K</kbd></p>',
    ],
    [
      '<details ontoggle="x()" open>\n<summary>S</summary>\n</details>',
      '<details open>\n<summary>S</summary>\n</details>',
    ],
    ['<a href="javascript:alert(1)">words</a>', '<p>words</p>'],
    ['<a href="https://example.com">words</a>', '<p>words</p>'],
    ['<img src="https://example.com/a.png" onerror="x()">', ''],
    ['<pre data-diagram="mermaid">graph</pre>', '<pre>graph</pre>'],
    ['<span data-math="inline">x^2</span>', '<p><span>x^2</span></p>'],
    ['<input type="checkbox" checked disabled>', ''],
    // GFM tagfilter: a frame and a style read as the text of their tags.
    [
      '<iframe src="https://example.com">fallback</iframe>',
      '&#x3C;iframe src="https://example.com">fallback&#x3C;/iframe>',
    ],
    [
      '<style>p { color: red }</style>',
      '&#x3C;style>p { color: red }&#x3C;/style>',
    ],
    // A template and an object lose their tags and keep their content.
    ['<template><p>t</p></template>', '<p><p>t</p></p>'],
    ['<object data="x.swf">o</object>', '<p>o</p>'],
    ['<form action="https://example.com"><button>Send</button></form>', 'Send'],
    [
      '<table><tr><td colspan="0" rowspan="2" align="justify" style="x">c</td></tr></table>',
      '<table><tbody><tr><td rowspan="2">c</td></tr></tbody></table>',
    ],
    [
      '<ol start="3" type="a"><li>three</li></ol>',
      '<ol start="3"><li>three</li></ol>',
    ],
    // The check mark of the renderer is not an element of the author list.
    [
      '<svg class="notes-task-mark"><polyline points="20 6 9 17 4 12"></polyline></svg>',
      '<p></p>',
    ],
  ];
  for (const [source, expected] of cases)
    assert.equal(await renderMarkdown(`${source}\n`), expected, source);
});

await test('an element of the renderer cannot be forged with its mark', async () => {
  // The mark of an element of the renderer is new for each render, so an
  // author who writes the attribute gains nothing: the element is the work of
  // the author and gets the author list.
  const html = await renderMarkdown(
    '<pre data-notes-renderer="x-0" data-diagram="mermaid">graph</pre>\n\n<a data-notes-renderer="x-1" href="https://example.com">words</a>\n',
  );
  assert.equal(html, '<pre>graph</pre>\n<p>words</p>');
});

await test('an alert keeps its words in a note that holds HTML', async () => {
  // The HTML parse joins the line ending after the marker with the text of
  // the alert, and the alert rule once removed that whole text node.
  const html = await renderMarkdown(
    '> [!NOTE]\n> Press <kbd>K</kbd> to go on.\n',
  );
  assert.equal(
    html,
    '<blockquote class="notes-alert" data-alert="note"><p class="notes-alert-title">Note</p>\n<p>Press <kbd>K</kbd> to go on.</p>\n</blockquote>',
  );
});

await test('a note with HTML keeps the elements of the renderer as they are', async () => {
  // The HTML parse runs only when a note holds HTML, and the renderer gives
  // its own elements back their exact properties after it, so the two paths
  // write one footnote in one form.
  const plain = await renderMarkdown('a[^1]\n\n[^1]: b\n');
  const mixed = await renderMarkdown('a[^1] <kbd>K</kbd>\n\n[^1]: b\n');
  assert.ok(plain.includes('data-footnote-ref aria-describedby'), plain);
  assert.ok(mixed.includes('data-footnote-ref aria-describedby'), mixed);
});

await test('code in a fence of a known language is highlighted', async () => {
  // Issue 237 and record 0159. The tokens and their classes come from the one
  // list of languages and the one map of tokens that the editor reads.
  assert.equal(
    await renderMarkdown('```ts\nconst a: number = 1; // c\n```\n'),
    '<figure class="notes-code"><figcaption class="notes-code-label">TypeScript</figcaption><pre><code class="language-ts"><span class="notes-code-keyword">const</span> a<span class="notes-code-punctuation">:</span> <span class="notes-code-tag">number</span> <span class="notes-code-punctuation">=</span> <span class="notes-code-number">1</span><span class="notes-code-punctuation">;</span> <span class="notes-code-comment">// c</span>\n</code></pre></figure>',
  );
  // A script inside HTML is parsed as JavaScript, as the editor parses it.
  const page = await renderMarkdown(
    '```html\n<script>let x = "s"</script>\n```\n',
  );
  assert.ok(page.includes('<span class="notes-code-keyword">let</span>'), page);
  assert.ok(page.includes('<span class="notes-code-string">"s"</span>'), page);
  // An unknown language and a fence with no info string stay plain text.
  assert.equal(
    await renderMarkdown('```cobol\nMOVE A TO B.\n```\n'),
    '<figure class="notes-code"><figcaption class="notes-code-label">cobol</figcaption><pre><code class="language-cobol">MOVE A TO B.\n</code></pre></figure>',
  );
  assert.equal(
    await renderMarkdown('```\nconst a = 1;\n```\n'),
    '<figure class="notes-code"><pre><code>const a = 1;\n</code></pre></figure>',
  );
});

await test('highlighted code keeps hostile text inert', async () => {
  const html = await renderMarkdown(
    '```html\n<img src=x onerror="alert(1)"></code></pre><script>x</script>\n```\n',
  );
  assert.ok(!html.includes('<img'), html);
  assert.ok(!html.includes('<script'), html);
  assert.ok(html.includes('&#x3C;'), html);
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

await test('one new line breaks the line and two start a paragraph', async () => {
  // Decision 0107. A new line is a line break, the way Obsidian and Notion
  // show it. Only a blank line starts a paragraph.
  const html = await renderMarkdown('line one\nline two\n\nsecond\n');
  assert.equal(html, '<p>line one<br>\nline two</p>\n<p>second</p>');
});

await test('a continuation line of a list item breaks inside its item', async () => {
  // The owner report of 2026-09-25: the second line stays in the item and in
  // its paragraph, on a line of its own.
  const html = await renderMarkdown(
    '1. **Rule.**\n   Use 60 g.\n\n2. **Next.**\n',
  );
  assert.ok(
    html.includes('<p><strong>Rule.</strong><br>\nUse 60 g.</p>'),
    html,
  );
  assert.equal(html.match(/<li>/g)?.length, 2);
});

await test('a new line keeps code and alerts as they are', async () => {
  // A fence keeps its own lines, a code span keeps the CommonMark space, and
  // the line after an alert marker starts the alert with no empty line.
  assert.equal(
    await renderMarkdown('```\na\nb\n```\n'),
    '<figure class="notes-code"><pre><code>a\nb\n</code></pre></figure>',
  );
  assert.equal(
    await renderMarkdown('`one\ntwo`\n'),
    '<p><code>one two</code></p>',
  );
  const alert = await renderMarkdown('> [!NOTE]\n> first\n> second\n');
  assert.ok(alert.includes('<p>first<br>\nsecond</p>'), alert);
  assert.ok(!alert.includes('<p><br>'), alert);
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

/**
 * The note resolver of plan 007 item 26.
 *
 * A surface that opens some notes and not others passes `noteHref`. The
 * published page of decision 0031 is that surface: it opens the notes of one
 * scope, and a link to any other note has to lose its address rather than
 * offer a sign-in screen.
 */
await test('a note resolver decides every link between two notes', async () => {
  const seen: (readonly [string | null, string | null, string])[] = [];
  const html = await renderMarkdown(
    `[inside](/notes/${noteIdA}#part-two)\n\n[portable](../trip/day-two.md)\n`,
    {
      sourcePath: 'notes/trip/day-one.md',
      noteHref: (target) => {
        seen.push([target.id, target.path, target.fragment]);
        return target.path === null ? `/published/abc${target.fragment}` : null;
      },
    },
  );
  assert.deepEqual(seen, [
    [noteIdA, null, '#user-content-part-two'],
    [null, 'notes/trip/day-two.md', ''],
  ]);
  assert.ok(html.includes('<a href="/published/abc#user-content-part-two">'));
  // The note that the surface does not open keeps its words and loses its
  // address, through the one blocked destination path.
  assert.ok(html.includes('<span data-blocked="link">portable</span>'));
  assert.ok(!html.includes('day-two.md'));
});

await test('a portable fragment reaches the resolver namespaced', async () => {
  const fragments: string[] = [];
  await renderMarkdown('[to](day-two.md#a-heading)\n', {
    sourcePath: 'notes/trip/day-one.md',
    noteHref: (target) => {
      fragments.push(target.fragment);
      return null;
    },
  });
  assert.deepEqual(fragments, ['#user-content-a-heading']);
});

await test('an attachment resolver that answers nothing blocks the picture', async () => {
  const html = await renderMarkdown(
    `![a photo](/attachments/${attachmentIdA})\n`,
    {
      attachmentHref: () => null,
    },
  );
  assert.ok(html.includes('<span data-blocked="image">a photo</span>'));
  assert.ok(!html.includes('<img'));
});

await test('an image source accepts HTTPS and no other scheme', async () => {
  // Decision 0067 widened the image source to one scheme. Every other scheme,
  // plain HTTP among them, must still lose the picture and keep the alt text.
  const web = await renderMarkdown('![a](https://example.com/a.png)\n');
  assert.equal(web.match(/<img /g)?.length, 1);
  for (const source of [
    'http://example.com/b.png',
    'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//example.com/a.png',
  ]) {
    const html = await renderMarkdown(`![alt](${source})\n`);
    assert.ok(!html.includes('<img'), source);
    assert.ok(html.includes('<span data-blocked="image">alt</span>'), source);
  }
});

await test('a mermaid fence stays a placeholder on the server path', async () => {
  // Decision 0031. The diagram frame belongs to the shell, so the server
  // renders the source as text and no diagram engine runs here.
  const html = await renderMarkdown('```mermaid\ngraph TD;\n  A-->B;\n```\n', {
    noteHref: () => null,
  });
  assert.equal(html, '<pre data-diagram="mermaid">graph TD;\n  A-->B;</pre>');
  assert.ok(!html.includes('<svg'));
});

await test('a strike opens on two tildes and never on one', async () => {
  // The Lezer grammar of the editor opens a strike on `~~` alone. remark
  // opened one on a single `~` as well, so `H~2~O` struck its own subscript
  // on the published page and stayed text in the note.
  const one = await renderMarkdown('H~2~O stays whole.\n');
  assert.ok(!one.includes('<del>'), one);
  assert.ok(one.includes('H~2~O stays whole.'));
  const two = await renderMarkdown('This is ~~struck~~ text.\n');
  assert.ok(two.includes('<del>struck</del>'), two);
});

await test('a fence is a diagram by the first word of its info string', async () => {
  // Review of record 0174: one rule decides a diagram on every surface.
  for (const info of ['Mermaid', 'mermaid title'])
    assert.equal(
      await renderMarkdown(`\`\`\`${info}\ngraph\n\`\`\`\n`, {
        noteHref: () => null,
      }),
      '<pre data-diagram="mermaid">graph</pre>',
      info,
    );
});

await test('external protocols survive the complete renderer and sanitizer', async () => {
  for (const href of [
    'mailto:a@example.com',
    'tel:+123456789',
    'sms:+123456789',
    'slack://channel',
    'vscode://file/note',
    'obsidian://open',
    'zoommtg://join',
    'spotify:track:123',
    'figma://file/123',
    'notion://page/123',
    'custom+app:target',
  ]) {
    assert.equal(
      await renderMarkdown(`[Open](<${href}>)`),
      `<p><a href="${href}" rel="noopener noreferrer">Open</a></p>`,
    );
    assert.equal(
      await renderMarkdown(`![Image](<${href}>)`),
      '<p><span data-blocked="image">Image</span></p>',
    );
  }
});

await test('unsafe addresses leave no href through default and resolved rendering', async () => {
  for (const href of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java&#x73;cript:alert(1)',
    'java&#9;script:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,test',
    'blob:https://example.com/id',
    'file:///etc/passwd',
    'https://[invalid',
  ]) {
    for (const options of [
      undefined,
      { sourcePath: 'notes/test.md', noteHref: () => null },
    ]) {
      assert.equal(
        await renderMarkdown(`[Open](<${href}>)`, options),
        '<p><span data-blocked="link">Open</span></p>',
      );
      assert.equal(
        await renderMarkdown(`<a href="${href}">Open</a>`, options),
        '<p>Open</p>',
      );
    }
  }
});

await test('the final URL check rejects unsafe resolver output after sanitize', async () => {
  for (const href of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,test',
    'blob:https://example.com/id',
    'file:///etc/passwd',
    'https://[invalid',
  ]) {
    assert.equal(
      await renderMarkdown(`[Note](/notes/${noteIdA})`, {
        noteHref: () => href,
      }),
      '<p><a>Note</a></p>',
    );
  }
  assert.equal(
    await renderMarkdown(`[Note](/notes/${noteIdA})`, {
      noteHref: () => '/published/token?note=one',
    }),
    '<p><a href="/published/token?note=one">Note</a></p>',
  );
});
