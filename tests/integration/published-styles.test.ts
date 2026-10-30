/**
 * The published page reaches the one built application stylesheet.
 *
 * Plan 007 item 25 had two ways to give the page its presentation: read the
 * stylesheet link of the built shell document, or turn on a build manifest and
 * read that. The first won, because the server already reads that document to
 * hash the inline scripts of its content policy, and a manifest would have
 * been a second output of the build that describes the same fact. This file
 * holds both halves of that choice.
 *
 * This file also holds the one copy that the published page cannot avoid. The
 * server is Node code and `@notesapp/ui` is browser code that imports React,
 * so `tools/check-boundaries.mjs` refuses the import and the class string of
 * the one button and the one field of the page is written twice. This tree is
 * the top of the dependency graph, so it reads both and holds the copy to the
 * recipe of decision 0065.
 *
 * The first half is the artefact: the built shell names exactly one stylesheet
 * and the resolver of the server finds it. The second half is the emission:
 * Tailwind writes a utility only when a source file uses it, and the class
 * names of the published document live in the server, so the stylesheet
 * registers that one file as a source. Compiling is deterministic and needs no
 * prior build; the artefact half needs the build that `pnpm test:integration`
 * already runs.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  builtStylesheetHrefs,
  documentStylesheetHrefs,
  publishedButtonClasses,
  publishedCodeFigureClasses,
  publishedDocumentClasses,
  publishedFieldClasses,
  publishedTextAreaClasses,
  publishedTaskBoxClasses,
} from '@notesapp/server';
import {
  buttonClassName,
  codeFigureClassName,
  defaultThemeFor,
  fieldClassName,
  taskBoxClassName,
  textAreaClassName,
  themeProperties,
  transitionField,
  transitionSurface,
} from '@notesapp/ui';
import {
  codeBlockClass,
  codeLabelClass,
  codeTokenClasses,
  orderedMarkerStyle,
  orderedMarkerStyles,
} from '@notesapp/markdown';
import { devicePaletteRoot } from '../../apps/web/src/lib/first-paint.ts';
import { loadCompiler, webRequire } from './support/tailwind.ts';

const root = resolve(fileURLToPath(import.meta.url), '../../..');
const stylesheet = resolve(root, 'apps/web/src/tailwind.css');
const distribution = join(root, 'apps/web/dist/web');

/** Compiles the application stylesheet with the given candidates. */
async function buildCss(candidates: readonly string[]): Promise<string> {
  const compile = loadCompiler();
  const source = await readFile(stylesheet, 'utf8');
  const compiler = await compile(source, {
    base: dirname(stylesheet),
    loadStylesheet: async (
      id: string,
      base: string,
    ): Promise<{ path: string; base: string; content: string }> => {
      const path = id.startsWith('.')
        ? resolve(base, id)
        : webRequire.resolve(`${id}/index.css`);
      return {
        path,
        base: dirname(path),
        content: await readFile(path, 'utf8'),
      };
    },
  });
  return compiler.build([...candidates]);
}

await test('the built shell document names one stylesheet', async () => {
  const document = join(distribution, 'index.html');
  await stat(document).catch(() => {
    throw new Error(
      'The browser build is absent. Run pnpm build before this test.',
    );
  });
  const hrefs = documentStylesheetHrefs(document, statSync(document));
  assert.equal(hrefs.length, 1, 'the page loads one stylesheet and no second');
  const href = hrefs[0] ?? '';
  assert.ok(href.startsWith('/assets/'));
  assert.ok(href.endsWith('.css'));
  // The file is really there, so the page of a reader loads bytes and not a
  // not-found answer.
  await stat(join(distribution, href.slice(1)));
});

await test('the published page names the mathematics style as well', async () => {
  // The defect this covers: the application imports the mathematics style
  // with the module that renders a formula, so the build writes it as a file
  // of its own that the shell document does not name. The published page
  // holds no script, so it could not load it when it found that it needed it,
  // and mathematics on a published page had no style at all (record 0060).
  const assets = join(distribution, 'assets');
  await stat(assets).catch(() => {
    throw new Error(
      'The browser build is absent. Run pnpm build before this test.',
    );
  });
  const emitted = builtStylesheetHrefs(assets);
  assert.ok(
    emitted.length >= 2,
    'the build emits the theme and the mathematics style',
  );
  // Every one is really there, so the page of a reader loads bytes and not a
  // not-found answer.
  for (const href of emitted) await stat(join(distribution, href.slice(1)));

  // One of them is the mathematics style, which is what carries a formula.
  const contents = await Promise.all(
    emitted.map(async (href) =>
      readFile(join(distribution, href.slice(1)), 'utf8'),
    ),
  );
  assert.ok(
    contents.some((css) => css.includes('.katex')),
    'no emitted stylesheet carries the mathematics style',
  );

  // The shell stylesheet is among them, so the page keeps the theme.
  const document = join(distribution, 'index.html');
  const shell = documentStylesheetHrefs(document, statSync(document));
  for (const href of shell) assert.ok(emitted.includes(href), href);
});

/** One colour as the minifier may write it, in its long lower case form. */
function longColour(value: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short === null) return value.toLowerCase();
  return `#${(short[1] ?? '').repeat(2)}${(short[2] ?? '').repeat(2)}${(short[3] ?? '').repeat(2)}`.toLowerCase();
}

/** The declarations of every rule of one selector in a minified sheet. */
function rulesOf(css: string, selector: string): Map<string, string>[] {
  const rules: Map<string, string>[] = [];
  let from = css.indexOf(`${selector}{`);
  while (from !== -1) {
    const start = from + selector.length + 1;
    const body = css.slice(start, css.indexOf('}', start));
    rules.push(
      new Map(
        body
          .split(';')
          .map((part) => part.split(':'))
          .filter((pair) => pair.length === 2)
          .map(([name, value]) => [name ?? '', longColour(value ?? '')]),
      ),
    );
    from = css.indexOf(`${selector}{`, start);
  }
  return rules;
}

await test('the built stylesheet paints a page with no script in the device palette', async () => {
  // Issue 210: a published page drew the dark palette for every reader. The
  // build writes both default palettes from the registry into the one
  // stylesheet, and the light one answers the light preference (record 0151).
  const document = join(distribution, 'index.html');
  await stat(document).catch(() => {
    throw new Error(
      'The browser build is absent. Run pnpm build before this test.',
    );
  });
  const [href] = documentStylesheetHrefs(document, statSync(document));
  const css = await readFile(join(distribution, (href ?? '').slice(1)), 'utf8');
  const media = css.indexOf('@media (prefers-color-scheme:light){');
  assert.ok(media !== -1, 'the stylesheet answers no light preference');
  const rules = rulesOf(css, devicePaletteRoot);
  assert.equal(rules.length, 2, 'one rule for each preference');
  const lightAt = css.indexOf(`${devicePaletteRoot}{`, media);
  assert.ok(lightAt > media, 'the light rule sits inside the light query');
  for (const [rule, appearance] of [
    [rules[0], 'dark'],
    [rules[1], 'light'],
  ] as const) {
    assert.equal(rule?.get('color-scheme'), appearance);
    for (const [name, value] of themeProperties(defaultThemeFor(appearance)))
      assert.equal(rule?.get(name), longColour(value), `${appearance} ${name}`);
  }
});

await test('every class of the published document reaches the stylesheet', async () => {
  const css = await buildCss(publishedDocumentClasses);
  // The typography of the note body is the part that only this page uses, so
  // nothing else in the application would keep it alive. A descendant variant
  // is the utility that reaches generated markup, and it reads the named type
  // scale of the central theme.
  for (const rule of [
    'h1 {\n    font-size: var(--text-note-h1);',
    'code {\n    font-size: var(--text-note-mono);',
    'ul {\n    list-style-type: disc;',
    'table {\n    border-collapse: collapse;',
  ])
    assert.ok(css.includes(rule), rule);
  // The one column and the colours come from the same compilation, so the
  // page cannot drift from the theme.
  assert.ok(
    css.includes('.max-w-note {\n    max-width: var(--container-note);'),
  );
  assert.ok(css.includes('--notes-accent-text'));
});

await test('the published page draws what the live preview draws', async () => {
  // Issues 237 and 238, design 021. Each rule below is the compiled form of a
  // look that `packages/editor/src/editor-theme.ts` gives the same construct.
  const css = await buildCss(publishedDocumentClasses);
  for (const rule of [
    // A code block is a card in light as well as in dark: the chrome fill,
    // the subtle edge and the card radius.
    'pre {\n    background-color: var(--notes-surface,',
    'pre {\n    border-color: var(--notes-border-subtle,',
    'pre {\n    border-radius: var(--radius-lg);',
    // Each code token takes the colour of its name in the syntax group. The
    // inline theme writes the palette name of the registry into each rule.
    '.notes-code-keyword {\n    color: var(--notes-syntax-keyword,',
    '.notes-code-string {\n    color: var(--notes-syntax-string,',
    '.notes-code-comment {\n    color: var(--notes-syntax-comment,',
    '.notes-code-comment {\n    font-style: italic;',
    '.notes-code-tag {\n    color: var(--notes-syntax-tag,',
    '.notes-code-attribute {\n    color: var(--notes-syntax-attribute,',
    '.notes-code-number {\n    color: var(--notes-syntax-number,',
    '.notes-code-punctuation {\n    color: var(--notes-syntax-punctuation,',
    // A task item has no bullet and draws the task box of the theme.
    'li.task-list-item {\n    list-style-type: none;',
    '.task-list-item input {\n    appearance: none;',
    '.task-list-item input {\n    border-color: var(--notes-border,',
    '.task-list-item input:checked {\n    background-color: var(--notes-accent-fill,',
    'input:checked + .notes-task-mark {\n    display: inline-block;',
    // A table sizes to its text and scrolls on its own, and a header cell
    // follows the alignment of its column.
    'table {\n    display: block;',
    'table {\n    overflow-x: auto;',
    'th {\n    text-align: start;',
    ':is(th, td)[align=right] {\n    text-align: right;',
    ':is(th, td)[align=center] {\n    text-align: center;',
    'th {\n    background-color: var(--notes-surface-hover,',
    // The inline HTML of record 0157.
    'kbd {\n    border-color: var(--notes-border-line,',
    'mark {\n    background-color: var(--notes-accent-surface,',
    // A subscript, a superscript and small text read the named note steps
    // that the editor reads (review R2).
    'sub {\n    font-size: var(--text-note-script);',
    'sup {\n    vertical-align: super;',
    'small {\n    font-size: var(--text-note-small);',
  ])
    assert.ok(css.includes(rule), rule);
  // A header cell no longer forces the left edge over its alignment.
  assert.ok(!css.includes('th {\n    text-align: left;'));
  // A table no longer fills the column.
  assert.ok(!css.includes('table {\n    width: 100%;'));
});

await test('every code token of the renderer has a colour on the page', () => {
  // Record 0159. The renderer writes one class for each token of the one map,
  // so the page must name each class, or a token reads as plain text.
  const classes = publishedDocumentClasses.join(' ');
  for (const name of codeTokenClasses)
    assert.ok(classes.includes(`[&_.${name}]:text-`), name);
});

await test('a nested ordered list of the published page takes the one cycle', async () => {
  // Record 0089. The live preview draws a nested ordered item in the style
  // of its depth, and the published page is the other reader of the note, so
  // it draws the same cycle. The page states each level as a literal class,
  // because Tailwind emits a utility only when a source names it, so this
  // test holds that copy to the cycle of `@notesapp/markdown`.
  const classes = new Set(publishedDocumentClasses.join(' ').split(' '));
  const css = await buildCss(publishedDocumentClasses);
  for (let depth = 1; depth <= 6; depth += 1) {
    const style = orderedMarkerStyle(depth - 1);
    assert.ok(
      classes.has(`[&${'_ol'.repeat(depth)}]:list-${style}`),
      `depth ${String(depth)} names no ${style} class`,
    );
    // The compiled rule is the fact a browser reads. Tailwind writes decimal
    // itself and reads the two other styles from the theme.
    const value =
      style === 'decimal' ? 'decimal' : `var(--list-style-type-${style})`;
    const selector = Array.from({ length: depth }, () => 'ol').join(' ');
    assert.ok(
      css.includes(`${selector} {\n    list-style-type: ${value};`),
      `depth ${String(depth)} draws no ${style} marker`,
    );
  }
  for (const style of orderedMarkerStyles.filter((name) => name !== 'decimal'))
    assert.ok(
      css.includes(`--list-style-type-${style}: ${style};`),
      `the theme names no ${style} style`,
    );
});

await test('a class that no source names is not emitted', async () => {
  // The check above would pass on a stylesheet that emitted every utility, so
  // this case proves that the compilation is narrow.
  const css = await buildCss(['zz-not-a-utility']);
  assert.ok(!css.includes('zz-not-a-utility'));
});

/** The classes of one string, as a set, so the order of two copies is free. */
function classesOf(value: string): Set<string> {
  return new Set(value.split(' ').filter((name) => name !== ''));
}

/** The same set with the classes of one named transition removed. */
function withoutMotion(names: Set<string>, transition: string): Set<string> {
  const motion = classesOf(transition);
  return new Set([...names].filter((name) => !motion.has(name)));
}

await test('the button of the published page is the primary recipe', () => {
  // The page holds no script and no style sheet of its own, so its button is
  // the primary button of the application or it is a second answer to what
  // the one action of a screen looks like (decision 0065). The motion scale
  // is the one part it cannot carry: decision 0054 keeps every transition in
  // packages/ui/src/motion.ts, and the design gate refuses one in this file.
  assert.deepEqual(
    classesOf(publishedButtonClasses),
    withoutMotion(
      classesOf(buttonClassName({ variant: 'primary' })),
      transitionSurface,
    ),
  );
});

await test('the task box of the published page is the task box recipe', () => {
  // The review of the merged branch: the published task box named the
  // component edge under an exception of the design gate. It is the one
  // recipe of the task box, written under the variant of a task item.
  const variant = '[&_.task-list-item_input]:';
  const classes = [...classesOf(publishedTaskBoxClasses)];
  assert.ok(classes.every((name) => name.startsWith(variant)));
  assert.deepEqual(
    new Set(classes.map((name) => name.slice(variant.length))),
    classesOf(taskBoxClassName()),
  );
});

await test('the field of the published page is the field recipe', () => {
  assert.deepEqual(
    classesOf(publishedFieldClasses),
    withoutMotion(classesOf(fieldClassName()), transitionField),
  );
});

await test('a public report keeps a multiline field instead of a single-line height', () => {
  assert.deepEqual(
    classesOf(publishedTextAreaClasses),
    withoutMotion(
      classesOf(textAreaClassName({ size: 'short' })),
      transitionField,
    ),
  );
  for (const name of ['h-8', 'coarse:h-11', 'min-h-64'])
    assert.ok(!classesOf(publishedTextAreaClasses).has(name));
});

await test('the code figure of the published page is the code figure recipe', () => {
  // Review of record 0174: the published page and the documentation site
  // each wrote the classes of a code figure, and they differed.
  assert.deepEqual(
    classesOf(publishedCodeFigureClasses),
    classesOf(codeFigureClassName),
  );
  assert.ok(
    publishedDocumentClasses.includes(`[&_figure.${codeBlockClass}]:relative`),
  );
  for (const name of classesOf(codeFigureClassName))
    assert.ok(
      name.includes(`[&_figure.${codeBlockClass}`) ||
        name.includes(`[&_.${codeLabelClass}]`),
      name,
    );
});
