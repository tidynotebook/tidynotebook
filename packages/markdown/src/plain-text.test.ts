/**
 * Checks of the one plain text rule of Markdown (records 0162 and 0167).
 *
 * Search indexes this text and quotes it on the server and on the device, so
 * each case proves what a reader sees: the words stay, the marks and the
 * link addresses go, and two blocks never read as one sentence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Root } from 'mdast';
import { extractLinks, indexNote } from './links.ts';
import { MarkdownLimitError, markdownLimits } from './limits.ts';
import {
  blockSeparator,
  readableText,
  readableTextOf,
  markdownWordCount,
} from './plain-text.ts';
import { renderMarkdown } from './render.ts';

await test('word count reads content without generated separators or syntax', () => {
  const cases: readonly (readonly [string, number])[] = [
    ['', 0],
    ['   \n\t', 0],
    [
      '# T32 D24 Restore focus\n\nOnly synthetic audit text. Restore must keep these bytes.\n',
      13,
    ],
    ['# Title\n\n- one item\n- two\n\n> a quote\n\n---\n\nend', 7],
    ['**one** _two_ ~~three~~ `four five`', 5],
    [
      '[two words](https://hidden.example/a) ![two more](image.png)\n\n[x]: https://hidden.example',
      4,
    ],
    ['```sh\nls notes\n```\n\n$one two$', 4],
    ['| a | b |\n| - | - |\n| c | d |', 4],
    ['---\ntitle: hidden\n---\n\nA <b>bold</b> word<br>here', 4],
    ['A · B\n\nC', 4],
    ['one**two**three', 1],
    ['# Title\n\nTitle', 2],
    ['[unfinished words', 2],
  ];
  for (const [source, expected] of cases)
    assert.equal(markdownWordCount(source), expected, source);
  // Excerpts keep their existing block punctuation.
  assert.equal(readableText('# Title\n\nText'), 'Title · Text');
  assert.throws(
    () => markdownWordCount('x'.repeat(markdownLimits.maxInputBytes + 1)),
    MarkdownLimitError,
  );
});

await test('emphasis marks go and their words stay', () => {
  // The defect this covers: a palette result showed `**` marks and whole
  // link addresses, because the excerpt was cut from the Markdown source.
  assert.equal(
    readableText('The **budget** is _final_, ~~old~~ and `coded` now.'),
    'The budget is final, old and coded now.',
  );
});

await test('a link keeps its label and loses its address', () => {
  assert.equal(
    readableText(
      'See [the plan](../plans/Plan.md) and [ref][r] now.\n\n[r]: https://example.com/hidden\n',
    ),
    'See the plan and ref now.',
  );
  assert.equal(
    readableText('Read [this](https://example.com/a) now.'),
    'Read this now.',
  );
  // A bare address is what a reader sees, so it stays.
  assert.equal(
    readableText('Open https://example.com today.'),
    'Open https://example.com today.',
  );
});

await test('block marks go and every block break stays visible', () => {
  // The defect this covers: a heading and the paragraph under it read as one
  // sentence, "Plan The budget is in the sheet."
  assert.equal(blockSeparator, ' · ');
  assert.equal(
    readableText('# Plan\n\nThe budget is in the sheet.'),
    'Plan · The budget is in the sheet.',
  );
  assert.equal(
    readableText('# Plan\n\n- one item\n- two\n\n> a quote\n\n---\n\nend'),
    'Plan · one item · two · a quote · end',
  );
  assert.equal(
    readableText('| a | b |\n| - | - |\n| c | d |'),
    'a · b · c · d',
  );
  // After the end of a sentence the next block needs only a space.
  assert.equal(
    readableText('The first one.\n\nThe second one'),
    'The first one. The second one',
  );
  // A line break is no block break.
  assert.equal(readableText('one  \ntwo\nthree'), 'one two three');
  assert.equal(readableText('- [ ] a task'), 'a task');
});

await test('code, math and the text of an image stay', () => {
  assert.equal(
    readableText('Run `pnpm verify` first.'),
    'Run pnpm verify first.',
  );
  assert.equal(
    readableText('![A budget chart](chart.png) here'),
    'A budget chart here',
  );
  assert.equal(readableText('```sh\nls notes\n```'), 'ls notes');
  assert.equal(readableText('Area $$\\pi r^2$$ is'), 'Area \\pi r^2 is');
  assert.equal(readableText('Inline \\(y\\) math.'), 'Inline y math.');
});

await test('HTML tags, front matter and a footnote mark go, and text stays', () => {
  assert.equal(readableText('A <b>bold</b> word<br>here'), 'A bold word here');
  assert.equal(readableText('---\ntitle: x\n---\n\nBody text'), 'Body text');
  assert.equal(
    readableText('A <b>bold</b> word\n\n<div>x</div>\n\nend'),
    'A bold word · x · end',
  );
  assert.equal(
    readableText('Text[^1] here.\n\n[^1]: The note.\n'),
    'Text here. The note.',
  );
});

await test('an HTML block keeps the words that a reader sees in it', () => {
  // Record 0157 shows `<details>` and `<summary>` to the reader, and the text
  // dropped every HTML block, so search never found its words.
  assert.equal(
    readableText(
      '<details>\n<summary>Packing list</summary>\n\nTent and stove.\n\n</details>\n',
    ),
    'Packing list · Tent and stove.',
  );
  assert.equal(
    readableText('<p>Fish &amp; chips</p>\n\n<p>Second</p>\n'),
    'Fish & chips · Second',
  );
});

await test('a neutral tag reads as the author typed it, as the renderer shows it', async () => {
  // Record 0160. The renderer writes a tag of `neutralAuthorTags` as text,
  // so the reader sees the tag and every word after it. The text path parsed
  // the same tag as a tag: a script left with its words, and an unclosed
  // `<textarea>` or `<script>` hid the rest of its block from search.
  const cases: ReadonlyArray<[string, string]> = [
    [
      'Before\n\n<script>var shown = 1;</script>\n\nAfter',
      'Before · <script>var shown = 1;</script> · After',
    ],
    ['<style>x</style> after\n', '<style>x</style> after'],
    ['<div>\n<script>one\n\nafter words\n', '<script>one · after words'],
    [
      'before <textarea>typed words\n\nnext block\n',
      'before <textarea>typed words · next block',
    ],
  ];
  for (const [source, text] of cases) {
    assert.equal(readableText(source), text, source);
    // Every word of the text is a word that the page shows.
    const shown = (await renderMarkdown(source))
      .replace(/<\/?[a-z][^>]*>/g, ' ')
      .replaceAll('&#x3C;', '<');
    for (const word of text.split(/[\s·]+/).filter((part) => part !== ''))
      assert.ok(shown.includes(word), `${source}: ${word}`);
  }
});

await test('a value that the parser changed reads as the reader sees it', () => {
  assert.equal(
    readableText('Cost \\* budget &amp; time'),
    'Cost * budget & time',
  );
});

await test('an alert leaves its title in place of its marker', () => {
  assert.equal(
    readableText('> [!WARNING]\n> Keep the boat dry.\n'),
    'Warning · Keep the boat dry.',
  );
});

await test('white space at the edges goes', () => {
  assert.equal(readableText('\n\n  word  \n'), 'word');
  assert.equal(readableText(''), '');
});

await test('empty and white space nodes keep the same inline word boundaries', () => {
  const tree: Root = {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: '\t' },
          { type: 'text', value: '' },
          { type: 'text', value: 'one' },
          { type: 'emphasis', children: [{ type: 'text', value: '' }] },
          { type: 'text', value: ' \u00a0' },
          { type: 'strong', children: [{ type: 'text', value: '\ttwo ' }] },
          { type: 'inlineCode', value: '\nthree' },
          { type: 'text', value: '' },
          { type: 'text', value: 'wo' },
          { type: 'emphasis', children: [{ type: 'text', value: 'rd' }] },
          { type: 'text', value: '\t ' },
        ],
      },
    ],
  };
  assert.equal(readableTextOf(tree), 'one two threeword');
});

await test('empty, hidden and white space blocks keep a pending block break', () => {
  const tree: Root = {
    type: 'root',
    children: [
      { type: 'paragraph', children: [{ type: 'text', value: 'one ' }] },
      { type: 'paragraph', children: [] },
      { type: 'paragraph', children: [{ type: 'text', value: '\t\n' }] },
      { type: 'yaml', value: 'hidden' },
      { type: 'thematicBreak' },
      { type: 'paragraph', children: [{ type: 'text', value: ' two ' }] },
      { type: 'paragraph', children: [{ type: 'text', value: '\t' }] },
    ],
  };
  assert.equal(readableTextOf(tree), 'one · two');
});

await test('every white space character keeps astral text across node boundaries', () => {
  const whiteSpace = [
    '\t',
    '\n',
    '\v',
    '\f',
    '\r',
    ' ',
    '\u00a0',
    '\u1680',
    '\u2000',
    '\u2001',
    '\u2002',
    '\u2003',
    '\u2004',
    '\u2005',
    '\u2006',
    '\u2007',
    '\u2008',
    '\u2009',
    '\u200a',
    '\u2028',
    '\u2029',
    '\u202f',
    '\u205f',
    '\u3000',
    '\ufeff',
  ];
  for (const space of whiteSpace) {
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: `${space}😀${space}` },
            { type: 'text', value: '' },
            { type: 'text', value: space },
            { type: 'inlineCode', value: `${space}🪴${space}` },
          ],
        },
      ],
    };
    assert.equal(readableTextOf(tree), '😀 🪴', JSON.stringify(space));
  }
  assert.equal(readableText('a\u0085b\u200bc'), 'a\u0085b\u200bc');
});

await test('each sentence end chooses a space after empty blocks', () => {
  for (const ending of ['.', '!', '?', ':', ';', '…', 'x', ')', '😀']) {
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: `First${ending}\t` }],
        },
        { type: 'paragraph', children: [{ type: 'text', value: '' }] },
        { type: 'paragraph', children: [{ type: 'text', value: ' \n' }] },
        { type: 'paragraph', children: [{ type: 'text', value: ' Next' }] },
      ],
    };
    const separator = ['.', '!', '?', ':', ';', '…'].includes(ending)
      ? ' '
      : blockSeparator;
    assert.equal(readableTextOf(tree), `First${ending}${separator}Next`);
  }
});

await test('white space HTML blocks preserve text and sentence boundaries', () => {
  const tree: Root = {
    type: 'root',
    children: [
      { type: 'paragraph', children: [{ type: 'text', value: 'Before ' }] },
      { type: 'html', value: '<div> \n<span> </span></div>' },
      {
        type: 'html',
        value: '<p>one </p><p> \t</p><p> two!</p><br><p> three</p>',
      },
      { type: 'paragraph', children: [{ type: 'text', value: ' After' }] },
    ],
  };
  assert.equal(readableTextOf(tree), 'Before · one · two! three · After');
});

await test('an alert and a repeated title keep their text around empty content', () => {
  assert.equal(
    readableText('# Plan\n\n> [!TIP]\n> \n> One **word**.\n\nAfter', {
      title: 'Plan',
    }),
    'Tip · One word. After',
  );
  assert.equal(
    readableText('# Plan\n\n<!-- empty -->', { title: 'Plan' }),
    'Plan',
  );
});

await test('a first block that repeats the note name goes', () => {
  // The excerpt is shown under the name of the note, so a first heading of
  // that name said it twice: "Plan" over "Plan The budget is in the sheet."
  const note = '# Plan\n\nThe budget is in the sheet.';
  assert.equal(
    readableText(note, { title: 'Plan' }),
    'The budget is in the sheet.',
  );
  // The comparison reads the words, not their case or their spaces.
  assert.equal(
    readableText('#  my   PLAN\n\nText', { title: 'My plan' }),
    'Text',
  );
  // A first paragraph of the name alone goes as well.
  assert.equal(
    readableText('Plan\n\nThe budget.', { title: 'Plan' }),
    'The budget.',
  );
  // A first line that only starts with the name is text of the note.
  assert.equal(
    readableText('Plan for May.\n\nText', { title: 'Plan' }),
    'Plan for May. Text',
  );
  // Front matter before the heading is no text of the note.
  assert.equal(
    readableText('---\na: b\n---\n# Plan\n\nText', { title: 'Plan' }),
    'Text',
  );
  // Another heading, a later heading, or no name keeps the heading.
  assert.equal(
    readableText(note, { title: 'Budget' }),
    'Plan · The budget is in the sheet.',
  );
  assert.equal(
    readableText('Intro.\n\n# Plan\n\nText', { title: 'Plan' }),
    'Intro. Plan · Text',
  );
  assert.equal(readableText(note), 'Plan · The budget is in the sheet.');
  // A heading that is all the note holds stays.
  assert.equal(readableText('# Plan', { title: 'Plan' }), 'Plan');
});

await test('one parse gives the same links as extractLinks and the text', () => {
  const source = '# Today\n\nGo to [Plan](Plan.md) now.\n';
  const indexed = indexNote(source, 'notes/Today.md', { title: 'Today' });
  assert.deepEqual(indexed.links, extractLinks(source, 'notes/Today.md'));
  assert.equal(indexed.text, 'Go to Plan now.');
});

await test('a note over the limits is refused', () => {
  assert.throws(
    () => readableText('a'.repeat(markdownLimits.maxInputBytes + 1)),
    MarkdownLimitError,
  );
});

await test('deep HTML is refused with the nesting error, as the renderer refuses it', async () => {
  // An HTML block is one node of the Markdown tree, so its elements passed
  // the depth guard of the parse. The renderer refused 101 levels, and the
  // text path read them: at 500 levels it gave text, and at 5000 levels the
  // HTML parse ran out of stack with a RangeError. The search index of a
  // commit and of the start of the server reads this text, so one such note
  // failed a save with a server fault and stopped the server from starting.
  const depth = markdownLimits.maxNestingDepth;
  for (const levels of [depth + 1, 500, 5000, 60000])
    for (const source of [
      `${'<div>'.repeat(levels)}x\n`,
      `${'<div>'.repeat(levels)}x${'</div>'.repeat(levels)}\n`,
      `${'<table><tr><td>'.repeat(levels)}x\n`,
      `a ${'<span>'.repeat(levels)}x\n`,
    ]) {
      // Inline tags are marks of their paragraph too, so past the mark limit
      // that limit refuses them first, in every reader alike.
      const reason =
        source.startsWith('a ') && levels > markdownLimits.maxBlockMarks
          ? 'block-marks'
          : 'nesting-depth';
      const refused = (error: unknown): boolean =>
        error instanceof MarkdownLimitError && error.reason === reason;
      assert.throws(() => readableText(source), refused, String(levels));
      assert.throws(() => indexNote(source), refused, String(levels));
      await assert.rejects(renderMarkdown(source), refused, String(levels));
    }
  // At the limit, all three read the note.
  const source = `${'<div>'.repeat(depth)}x${'</div>'.repeat(depth)}\n`;
  assert.equal(readableText(source), 'x');
  assert.equal(indexNote(source).text, 'x');
  assert.match(await renderMarkdown(source), />x</);
});
