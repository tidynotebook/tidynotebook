/**
 * The code highlight style must never colour a Markdown construct.
 *
 * A heading, strong text, emphasis, and a link belong to the note typography,
 * which the live preview decorations style. If the fenced-code highlight style
 * also carried those tags, it would repaint the Markdown heading, the bold
 * run, and the link with the code palette, so the note text would take a code
 * colour. This test holds the boundary.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { insertNewlineAndIndent, toggleComment } from '@codemirror/commands';
import {
  ensureSyntaxTree,
  syntaxTree,
  syntaxTreeAvailable,
} from '@codemirror/language';
import { EditorState, type Transaction } from '@codemirror/state';
import { tags, type Tag } from '@lezer/highlight';
import { TreeFragment } from '@lezer/common';
import {
  codeLanguages as fenceLanguages,
  codeTokenNames,
} from '@notesapp/markdown';
import {
  codeHighlightSpecs,
  codeLanguages,
  fenceLanguageOf,
  noteMarkdown,
  parsedWhole,
  syntaxTokenNames,
} from './language.ts';
import { previewStructureOf } from './live-preview.ts';

await test('a partial cached parse keeps math and the text after it at their source ranges', () => {
  const doc =
    '# Editor and math\n\n```javascript\nfunction greet(name) {\n  return `Hello, ${name}`;\n}\nconst count = 42;\n```\n\nInline math: $E = mc^2$.\n\n$$\n\\frac{a}{b} + \\sqrt{x^2 + y^2}\n$$\n\nEnd of smoke test.\n';
  const parser = noteMarkdown({ headless: true }).language.parser;
  const full = parser.parse(doc);
  const partial = parser.parse(doc, TreeFragment.addTree(full), [
    { from: 0, to: 137 },
  ]);
  const after = parser.parse(doc, TreeFragment.addTree(partial));
  const blocks: { name: string; from: number; to: number; source: string }[] =
    [];
  after.iterate({
    enter(node) {
      if (
        node.name === 'MathBlock' ||
        node.name === 'InlineMath' ||
        node.name === 'FencedCode' ||
        node.name === 'Paragraph'
      )
        blocks.push({
          name: node.name,
          from: node.from,
          to: node.to,
          source: doc.slice(node.from, node.to),
        });
    },
  });
  assert.deepEqual(blocks, [
    { name: 'FencedCode', from: 19, to: 106, source: doc.slice(19, 106) },
    {
      name: 'Paragraph',
      from: 108,
      to: 132,
      source: 'Inline math: $E = mc^2$.',
    },
    { name: 'InlineMath', from: 121, to: 131, source: '$E = mc^2$' },
    {
      name: 'MathBlock',
      from: 134,
      to: 170,
      source: '$$\n\\frac{a}{b} + \\sqrt{x^2 + y^2}\n$$',
    },
    { name: 'Paragraph', from: 172, to: 190, source: 'End of smoke test.' },
  ]);
});

await test('partial cached parses inside code and math keep the complete tree', () => {
  const doc = 'Text $x$.\n\n```text\ncode\n```\n\n$$\nx^2\n$$\n\ntail\n';
  const parser = noteMarkdown({ headless: true }).language.parser;
  const full = parser.parse(doc);
  const nodesOf = (tree: typeof full): string[] => {
    const nodes: string[] = [];
    tree.iterate({
      enter: (node) => {
        nodes.push(`${node.name}:${String(node.from)}..${String(node.to)}`);
      },
    });
    return nodes;
  };
  for (let end = 1; end < doc.length; end += 1) {
    const partial = parser.parse(doc, TreeFragment.addTree(full), [
      { from: 0, to: end },
    ]);
    const after = parser.parse(doc, TreeFragment.addTree(partial));
    assert.deepEqual(
      nodesOf(after),
      nodesOf(full),
      `partial end ${String(end)}`,
    );
  }
});

await test('the offline preview keeps the same structure before and after a fence language loads', async () => {
  const language = fenceLanguageOf('python');
  assert.ok(language !== null);
  assert.equal(language.support, undefined);
  const doc = '```python\ndef f(x):\n    return x\n```\n\n# After code\n';
  const before = previewStructureOf(doc);
  assert.deepEqual(before, [
    { kind: 'code-block', info: 'python' },
    { kind: 'heading', level: 1, text: 'After code' },
  ]);
  assert.equal(language.support, undefined);
  const state = parsedWhole(
    EditorState.create({ doc, extensions: [noteMarkdown({ headless: true })] }),
  );
  assert.equal(syntaxTreeAvailable(state), true);
  await language.load();
  assert.deepEqual(previewStructureOf(doc), before);
});

/** Every tag the code highlight style paints, flattened. */
function styledTags(): readonly Tag[] {
  return codeHighlightSpecs.flatMap((spec) =>
    Array.isArray(spec.tag) ? spec.tag : [spec.tag],
  );
}

await test('the code style never paints a Markdown construct', () => {
  const painted = styledTags();
  for (const markdownTag of [
    tags.heading,
    tags.strong,
    tags.emphasis,
    tags.link,
    tags.url,
  ])
    assert.ok(
      !painted.includes(markdownTag),
      'the code highlight style must not carry a Markdown tag',
    );
});

await test('the code style never paints a marker of a note', () => {
  // Every marker of a note carries `tags.processingInstruction`, which
  // `@lezer/highlight` defines as a child of `tags.meta`, and a highlight
  // style paints a child through its parent. One entry for the meta token of
  // a language therefore painted the list mark, the quote mark and the table
  // separator of every note, in a span inside the decoration that styles
  // them, so no rule of the theme adapter could take the colour back.
  const painted = styledTags();
  for (const markerTag of [tags.meta, tags.processingInstruction])
    assert.ok(
      !painted.includes(markerTag),
      'the code highlight style must not carry a marker tag',
    );
});

await test('the code style still paints the code constructs', () => {
  const painted = styledTags();
  for (const codeTag of [
    tags.keyword,
    tags.string,
    tags.comment,
    tags.number,
    tags.invalid,
  ])
    assert.ok(
      painted.includes(codeTag),
      'the code highlight style is complete',
    );
});

await test('the fence languages are the one list of the renderer', () => {
  // Record 0159. The published page highlights a fence with the list of
  // `@notesapp/markdown`, so the editor builds its languages from the same
  // entries, in the same order, and a new entry reaches both surfaces.
  assert.deepEqual(
    codeLanguages.map((description) => description.name),
    fenceLanguages.map((language) => language.name),
  );
  for (const language of fenceLanguages) {
    const description = codeLanguages.find(
      (entry) => entry.name === language.name,
    );
    for (const alias of language.aliases)
      assert.ok(description?.alias.includes(alias), alias);
  }
  // One rule names the language of a fence on both surfaces.
  assert.equal(fenceLanguageOf('TS')?.name, 'typescript');
  assert.equal(fenceLanguageOf('js title="a"')?.name, 'javascript');
  assert.equal(fenceLanguageOf('cobol'), null);
});

await test('every code colour but the invalid one is a syntax colour', () => {
  // `invalid` takes the danger colour of the palette, and every other token
  // of the shared map is a name of the syntax group of a theme.
  for (const token of codeTokenNames)
    if (token !== 'invalid')
      assert.ok(
        syntaxTokenNames.some((name) => name === token),
        `${token} is no syntax colour`,
      );
  assert.equal(codeHighlightSpecs.length, codeTokenNames.length);
});

await test('the syntax contract keeps the heading and link names', () => {
  // The names stay in the shared contract with the theme registry even though
  // the code style no longer reads them, so the agreement test still holds.
  assert.ok(syntaxTokenNames.includes('heading'));
  assert.ok(syntaxTokenNames.includes('link'));
});

/**
 * Many short paragraphs, each its own block, well past the 3000 character
 * initial viewport of `@codemirror/language`.
 *
 * A single unbroken paragraph of the same length would not prove the
 * refusal: the incremental parser must finish a block it has already
 * started, so one giant paragraph parses to its end in the first pass
 * regardless of length. Many short blocks give the parser a boundary to
 * stop at inside the first 3000 characters, so the first pass is provably
 * partial.
 */
function manyShortParagraphs(count: number): string {
  return `${'word '.repeat(10)}\n\n`.repeat(count);
}

await test('parsedWhole pumps the parser until the tree covers the document', () => {
  const doc = manyShortParagraphs(60);
  const state = parsedWhole(
    EditorState.create({ doc, extensions: [noteMarkdown()] }),
  );
  assert.equal(syntaxTree(state).length, state.doc.length);
});

await test('parsedWhole refuses a document the bound cannot cover', () => {
  const doc = manyShortParagraphs(60);
  const fresh = EditorState.create({ doc, extensions: [noteMarkdown()] });
  // A fresh state only ever parses its initial viewport, capped at 3000
  // characters, so a document past that length is partial before the first
  // pump. An attempt bound of 0 forces the refusal without depending on how
  // fast the machine running the test is.
  assert.ok(syntaxTree(fresh).length < fresh.doc.length);
  assert.throws(
    () => parsedWhole(fresh, { attempts: 0 }),
    /the parser stopped at \d+ of \d+ characters/,
  );
});

await test('parsedWhole installs a completed context tree in the state field', () => {
  const doc = manyShortParagraphs(60);
  const fresh = EditorState.create({ doc, extensions: [noteMarkdown()] });
  const tree = ensureSyntaxTree(fresh, doc.length, 5000);
  assert.notEqual(tree, null);
  assert.equal(syntaxTreeAvailable(fresh), true);
  assert.notEqual(syntaxTree(fresh), tree);
  const completed = parsedWhole(fresh);
  assert.equal(syntaxTree(completed), tree);
  assert.equal(syntaxTreeAvailable(completed), true);
});

/** Runs one state command on a note with the caret at `‸`, and answers the text. */
async function afterCommand(
  text: string,
  command: (target: {
    state: EditorState;
    dispatch: (transaction: Transaction) => void;
  }) => boolean,
): Promise<string> {
  for (const description of codeLanguages) await description.load();
  const at = text.indexOf('‸');
  let state = parsedWhole(
    EditorState.create({
      doc: text.replace('‸', ''),
      selection: { anchor: at },
      extensions: [noteMarkdown()],
    }),
  );
  command({
    state,
    dispatch: (transaction) => {
      state = transaction.state;
    },
  });
  return state.doc.toString();
}

await test('a fence indents and comments in the way of its language', async () => {
  // Record 0173. A fence took a bare parser and lost the editing of its
  // language, so Enter after a block opener kept the indentation of the line
  // above and the comment key wrote nothing.
  assert.equal(
    await afterCommand('```python\ndef f(x):‸\n```\n', insertNewlineAndIndent),
    '```python\ndef f(x):\n  \n```\n',
  );
  assert.equal(
    await afterCommand('```js\nif (a) {‸}\n```\n', insertNewlineAndIndent),
    '```js\nif (a) {\n  \n}\n```\n',
  );
  assert.equal(
    await afterCommand('```sh\necho a‸\n```\n', toggleComment),
    '```sh\n# echo a\n```\n',
  );
  assert.equal(
    await afterCommand('```sql\nSELECT 1‸\n```\n', toggleComment),
    '```sql\n-- SELECT 1\n```\n',
  );
});
