/**
 * The editor theme adapter reads real custom properties.
 *
 * CodeMirror builds its own DOM, so `packages/editor/src/editor-theme.ts`
 * writes presentation in TypeScript with `var(--...)` values. Tailwind emits
 * a theme variable only when something uses it, and `@theme inline` emits
 * none at all, so an adapter can silently read a property that the built
 * stylesheet never declares. That is how the mono font, the sizes, and the
 * radii disappeared once before.
 *
 * This test compiles the one application stylesheet with the Tailwind
 * compiler that the web build uses and asserts that every name the adapter
 * reads is declared. Compiling is deterministic and needs no prior build.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { editorThemeVariables } from '@notesapp/editor';

const root = resolve(fileURLToPath(import.meta.url), '../../..');
const stylesheet = resolve(root, 'apps/web/src/tailwind.css');

/** The Tailwind compiler that the web build uses. */
type Compile = (
  source: string,
  options: unknown,
) => Promise<{ build: (candidates: string[]) => string }>;

/** The module loader of the web application, so its toolchain is used. */
const load = createRequire(resolve(root, 'apps/web/package.json'));

/** Loads the Tailwind compiler through the web application resolver. */
function loadCompiler(): Compile {
  const loaded: unknown = load('tailwindcss');
  const module = loaded as {
    compile?: unknown;
    default?: { compile?: unknown };
  };
  const compile = module.compile ?? module.default?.compile;
  assert.equal(typeof compile, 'function');
  return compile as Compile;
}

/** Compiles the application stylesheet to plain CSS. */
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
        : load.resolve(`${id}/index.css`);
      return {
        path,
        base: dirname(path),
        content: await readFile(path, 'utf8'),
      };
    },
  });
  return compiler.build([]);
}

const css = await buildCss();

await test('no shipped document holds a colour value of its own', async () => {
  // The theme registry of `@notesapp/ui` is the only place a colour value
  // may live (audit UI-48). The shell document takes its palette from the
  // build step, and the diagram frame receives one in its render request.
  for (const name of [
    'apps/web/index.html',
    'apps/web/src/diagram/frame.html',
  ]) {
    const source = await readFile(resolve(root, name), 'utf8');
    const found = source.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    assert.deepEqual(found, [], `${name} holds a colour value`);
  }
  const html = await readFile(resolve(root, 'apps/web/index.html'), 'utf8');
  assert.match(html, /__NOTESAPP_THEMES__/);
  assert.match(html, /__NOTESAPP_THEME_COLOUR__/);
});

await test('the built stylesheet declares every variable the editor reads', () => {
  const missing = editorThemeVariables.filter(
    (name) => !new RegExp(`${name}\\s*:`).test(css),
  );
  assert.deepEqual(missing, [], `missing: ${missing.join(', ')}`);
});

await test('the note surface keeps its designed typography', () => {
  assert.match(css, /--text-note:\s*1rem/);
  assert.match(css, /--text-note--line-height:\s*1\.65/);
  assert.match(css, /--note-measure:\s*42rem/);
  assert.match(css, /--note-h1:\s*2em/);
  assert.match(css, /--note-h6:\s*1em/);
  assert.match(css, /--note-mono-size:\s*0\.9em/);
});
