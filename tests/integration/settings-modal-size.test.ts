/**
 * The Settings modal from the large width is 940 by 620 px (issue 517).
 *
 * Tailwind reads `max-w-*` from the spacing scale before the container
 * scale, so a spacing token of the same name as the width token made the
 * modal 620 px wide. This test compiles the real stylesheet and reads the
 * value of each class of the panel.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCompiler, webRequire } from './support/tailwind.ts';

const root = resolve(fileURLToPath(import.meta.url), '../../..');
const stylesheet = resolve(root, 'apps/web/src/tailwind.css');

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
  // The panel classes of packages/ui/src/dialog-classes.ts.
  return compiler.build(['lg:max-w-settings', 'lg:h-settings']);
}

const css = await buildCss();

/** The rem value of a theme variable of the stylesheet. */
function remOf(variable: string): number {
  const found = new RegExp(`\\n\\s*${variable}: ([\\d.]+)rem;`, 'u').exec(css);
  assert.ok(found !== null, `the stylesheet declares no ${variable}`);
  return Number(found[1]);
}

/** The theme variable that one declaration of a class reads. */
function variableOf(className: string, property: string): string {
  const selector = className.replaceAll(':', '\\\\:');
  const found = new RegExp(
    `\\.${selector} \\{[^}]*?\\n\\s*${property}: var\\((--[\\w-]+)\\);`,
    'u',
  ).exec(css);
  assert.ok(found !== null, `${className} declares no ${property}`);
  return found[1] ?? '';
}

await test('the Settings modal is 940 px wide and 620 px high', () => {
  const width = remOf(variableOf('lg:max-w-settings', 'max-width')) * 16;
  const height = remOf(variableOf('lg:h-settings', 'height')) * 16;
  assert.equal(width, 940);
  assert.equal(height, 620);
});
