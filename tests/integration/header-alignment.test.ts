/**
 * The mark of a header control lands on the gutter line of the page.
 *
 * A compact control centres its mark in a 44 px touch box, so the toggle at
 * the start of the frame header stood 14 px inside the gutter on a phone and
 * the account avatar stood 10 px inside it, while the title of the page below
 * stood on the gutter line. One bar showed three different edges.
 * `edgeControlClassName` in `packages/ui/src/control-classes.ts` pulls each
 * control back by exactly that distance, so the box grows into the gutter,
 * the touch target keeps its size, and the mark lands on the line.
 *
 * The unit test beside that module holds the recipe to the arithmetic. This
 * test holds the arithmetic to the served result: Tailwind emits a utility
 * only when a source file uses it, and a negative margin that no rule
 * declares moves nothing. It compiles the one application stylesheet with the
 * compiler that the web build uses, reads the box, the mark and the pull out
 * of the emitted rules, and proves that the pull cancels the distance at
 * every width. Compiling is deterministic and needs no prior build.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  avatarClassName,
  buttonClassName,
  defaultIconSize,
  edgeControlClassName,
  pageGutter,
} from '@notesapp/ui';
import { loadCompiler, webRequire } from './support/tailwind.ts';

const root = resolve(fileURLToPath(import.meta.url), '../../..');
const stylesheet = resolve(root, 'apps/web/src/tailwind.css');
const shell = resolve(root, 'apps/web/src/shell/shell.tsx');

/** The box of every icon-only control of the frame header. */
const headerControl = buttonClassName({
  variant: 'ghost',
  size: 'sm',
  iconOnly: true,
  compact: true,
});

/** The pull of the toggle at the start of the header. */
const togglePull = edgeControlClassName({ edge: 'start', mark: 'icon' });

/** The pull of the account menu at the end of the header. */
const accountPull = edgeControlClassName({ edge: 'end', mark: 'avatar' });

/** Every class name that this test needs a rule for. */
const candidates = [
  ...pageGutter.split(' '),
  ...headerControl.split(' '),
  ...avatarClassName().split(' '),
  ...togglePull.split(' '),
  ...accountPull.split(' '),
];

/** Compiles the application stylesheet with the given candidates. */
async function buildCss(): Promise<string> {
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

const css = await buildCss();
const shellSource = await readFile(shell, 'utf8');

/** How many steps of the spacing scale one declaration of a class is worth. */
function stepsOf(className: string, property: string): number {
  const selector = className.replaceAll(/[.:]/gu, (mark) => `\\\\${mark}`);
  const found = new RegExp(
    `\\.${selector} \\{[^}]*?\\n\\s*${property}: calc\\(var\\(--spacing\\) \\* (-?[\\d.]+)\\);`,
    'u',
  ).exec(css);
  assert.ok(found !== null, `${className} declares no ${property}`);
  return Number(found[1]);
}

/** The width in pixels of one step of the spacing scale. */
const spacingStep = ((): number => {
  const found = /\n\s*--spacing: ([\d.]+)rem;/u.exec(css);
  assert.ok(found !== null, 'the stylesheet declares no spacing base');
  // A browser that no page overrides sets one rem to 16 px, and this
  // stylesheet writes no root font size of its own.
  return Number(found[1]) * 16;
})();

/** Read the real shared role values from the compiled stylesheet. */
assert.ok(headerControl.split(' ').includes('ui-button'));
assert.ok(headerControl.split(' ').includes('ui-icon-button'));
assert.match(css, /width:\s*var\(--ui-compact-height\)/);
const compactPixels = [
  ...css.matchAll(/--ui-compact-height:\s*([\d.]+)px/g),
].map((match) => Number(match[1]));
assert.equal(compactPixels.length, 2, 'one compact size for each pointer');
const boxes = [compactPixels[1] ?? 0, compactPixels[0] ?? 0];

/** The name a failure message gives each width. */
const widths = ['under touch', 'from the medium width up'];

/** Proves that one pull cancels the distance from the box to the mark. */
function holdsTheLine(pull: string, mark: number): void {
  const parts = pull.split(' ');
  assert.equal(parts.length, boxes.length, 'one pull for each width');
  for (const [index, box] of boxes.entries()) {
    const inside = (box - mark) / 2;
    const taken =
      -stepsOf(
        parts[index] ?? '',
        pull.includes('-ms-') ? 'margin-inline-start' : 'margin-inline-end',
      ) * spacingStep;
    assert.equal(taken, inside, widths[index] ?? '');
  }
}

await test('the header reads the one gutter of a page', () => {
  // The pull below is measured from the gutter line, so the header has to
  // stand on the same line as every page of the application.
  assert.match(
    shellSource,
    /<header\n\s+className=\{`[^`]*\$\{pageGutter\}`\}/u,
  );
});

await test('the toggle of the header lands on the gutter line', () => {
  holdsTheLine(togglePull, defaultIconSize);
});

await test('the account avatar lands on the gutter line', () => {
  const size =
    avatarClassName()
      .split(' ')
      .filter((part) => part.startsWith('size-'))[0] ?? '';
  holdsTheLine(accountPull, stepsOf(size, 'width') * spacingStep);
});
