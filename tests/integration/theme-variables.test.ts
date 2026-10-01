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
import { readFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { editorThemeVariables, touchFieldQuery } from '@notesapp/editor';
import {
  defaultThemeFor,
  importedThemeFamily,
  readThemeFile,
  scrollbarValue,
  themeFamilies,
  themeFileText,
  themeProperties,
  touchFieldText,
} from '@notesapp/ui';
import {
  importedPaletteStorageKey,
  inlineImportedFamily,
  themeRegistryData,
} from '../../apps/web/src/lib/first-paint.ts';
import { loadCompiler, webRequire } from './support/tailwind.ts';

const root = resolve(fileURLToPath(import.meta.url), '../../..');
const stylesheet = resolve(root, 'apps/web/src/tailwind.css');

/** Compiles the application stylesheet, with these classes, to plain CSS. */
async function buildCss(candidates: readonly string[] = []): Promise<string> {
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
const stylesheetSource = await readFile(stylesheet, 'utf8');

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

await test('the shell document states the colour scheme of the first paint', async () => {
  // A browser draws the scrollbar of every region that scrolls, a native
  // control and a remembered field from the colour scheme, and it assumes a
  // light page until the document states one. The script that writes the
  // stored palette therefore states the appearance as well, and the branch
  // that runs when that script fails states the dark default with it.
  const html = await readFile(resolve(root, 'apps/web/index.html'), 'utf8');
  // `apps/web/src/theme-wiring.test.ts` runs the script and holds that the
  // scheme is the appearance of the palette that it paints.
  assert.match(html, /colorScheme = shown;/);
  assert.match(html, /colorScheme = 'dark'/);
  // The scrollbar of the first paint reads the same palette property that the
  // script writes, so the bar never stands in a colour of its own.
  assert.ok(html.includes(`scrollbarColor = '${scrollbarValue}'`));
});

await test('the shell document paints the chosen imported theme from its one key', async () => {
  // Record 0143. The device keeps the palette of the chosen imported theme
  // under one key, and the script of the first paint reads that key and
  // paints it only for the family that it names.
  const html = await readFile(resolve(root, 'apps/web/index.html'), 'utf8');
  assert.ok(
    html.includes(`localStorage.getItem('${importedPaletteStorageKey}')`),
    'the script reads the key of the imported palette',
  );
  assert.match(html, /kept\.family === family/);
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
  assert.match(css, /--container-note:\s*40rem/);
  assert.match(css, /--text-note-h1:\s*1\.5em/);
  assert.match(css, /--text-note-h6:\s*1em/);
  assert.match(css, /--text-note-mono:\s*0\.9em/);
  assert.match(css, /--font-weight-note-heading:\s*600/);
});

await test('the named steps of the interface reach the stylesheet', () => {
  // Decision 0065 adds the keyboard step, the dialog radius, the 44 px header
  // and the note measure to the central theme. A utility that reads a step
  // the stylesheet never declares renders nothing at all.
  assert.match(css, /--text-kbd:\s*0\.6875rem/);
  assert.match(css, /--text-kbd--line-height:\s*1rem/);
  assert.match(css, /--radius-xl:\s*0\.75rem/);
  assert.match(css, /--spacing-header:\s*2\.75rem/);
});

await test('a field under touch sets its text at 16 px', async () => {
  // The defect this covers: Safari on iOS zoomed the page into every field
  // on a tap, because the text of each field was under 16 px. The class of a
  // field and the panel theme of the editor state the rule under one query.
  assert.match(css, /--text-base:\s*1rem/);
  const touch = await buildCss([touchFieldText]);
  const query = touchFieldQuery.replace(/[()]/g, '\\$&');
  assert.match(
    touch,
    new RegExp(
      `@media ${query}\\s*\\{\\s*\\.pointer-coarse\\\\:text-base\\s*\\{\\s*font-size:\\s*var\\(--text-base\\)`,
    ),
    'the editor query is the query of the class',
  );
  // The served stylesheet holds the rule, because the recipe is a source.
  const assets = resolve(root, 'apps/web/dist/web/assets');
  const served = (
    await Promise.all(
      (await readdir(assets))
        .filter((name) => name.endsWith('.css'))
        .map((name) => readFile(resolve(assets, name), 'utf8')),
    )
  ).join('\n');
  assert.ok(
    served.includes('.pointer-coarse\\:text-base{font-size:var(--text-base)'),
    'the served rule',
  );
  assert.match(served, /--text-base:1rem/);
});

await test('the compact tree spacing reaches the built stylesheet', async () => {
  const assets = resolve(root, 'apps/web/dist/web/assets');
  const stylesheets = (await readdir(assets)).filter((name) =>
    name.endsWith('.css'),
  );
  const spacing = (
    await Promise.all(
      stylesheets.map((name) => readFile(resolve(assets, name), 'utf8')),
    )
  ).join('\n');
  assert.ok(spacing.includes('.space-y-0\\.5'), 'sibling gap');
  assert.ok(spacing.includes('.mt-0\\.5'), 'branch gap');
  assert.ok(spacing.includes('.pl-2'), 'branch indent');
});

await test('the one vendored face is declared and its files are served', async () => {
  // Decision 0061. The stylesheet is the one file that may declare a face, so
  // a missing declaration or a missing file leaves the product in the system
  // stack on every device and nothing else would report it.
  assert.match(css, /--font-sans:\s*'Geist',/);
  assert.match(css, /--font-mono:\s*'Geist Mono',/);
  const faces = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map(
    (found) => found[0],
  );
  assert.equal(faces.length, 6, 'the count of declared faces');
  const files = new Set<string>();
  for (const face of faces) {
    assert.match(face, /font-display:\s*swap/, face);
    assert.match(face, /font-weight:\s*100 900/, face);
    assert.match(face, /unicode-range:/, face);
    const source = /url\('(\/fonts\/[^']+)'\)/.exec(face);
    assert.ok(source !== null, face);
    files.add(source[1] ?? '');
  }
  assert.equal(files.size, 6, 'one file per declared face');
  for (const file of files) {
    const bytes = await readFile(resolve(root, 'apps/web/public', `.${file}`));
    assert.ok(bytes.byteLength > 0, file);
  }
});

await test('every palette fallback of the stylesheet is the registry value', () => {
  // Decision 0062. The literal fallbacks keep the first paint correct before
  // the inline script runs, so they are a second copy of the Default dark
  // palette. This test is what stops that copy from drifting.
  const registry = new Map(themeProperties(defaultThemeFor('dark')));
  const block = /@theme inline \{([\s\S]*?)\n\}/.exec(stylesheetSource);
  assert.ok(block !== null, 'the stylesheet states no inline theme block');
  const declarations = [
    ...(block[1] ?? '').matchAll(
      /--color-[a-z-]+:\s*var\((--notes-[a-z-]+),\s*(#[0-9a-f]{6})\);/g,
    ),
  ];
  assert.ok(declarations.length > 0, 'no palette fallback was read');
  for (const [, property, fallback] of declarations) {
    const expected = registry.get(property ?? '');
    assert.ok(expected !== undefined, `${property ?? ''} is not a token`);
    assert.equal(fallback, expected, property ?? '');
  }
  // Every palette name of the block carries a fallback, so none of them can
  // slip past the check above by stating no value at all.
  const named = [...(block[1] ?? '').matchAll(/var\((--notes-[a-z-]+)/g)];
  assert.equal(named.length, declarations.length, 'a fallback is missing');
});

/** What the first paint script wrote on the root element of the page. */
type FirstPaint = {
  readonly attributes: Map<string, string>;
  readonly style: Map<string, string>;
};

/**
 * Runs the script of the first paint of the shell document, as the build
 * writes it, against stored settings and a device preference.
 *
 * The script runs before any module, so its own text is what a person gets.
 * The sandbox gives it the four things it reads: local storage, the media
 * query of the device, the root element and the colour meta element.
 */
function firstPaint(
  stored: Readonly<Record<string, string>>,
  deviceDark: boolean,
): FirstPaint {
  const html = readFileSync(resolve(root, 'apps/web/index.html'), 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
  assert.ok(script.includes('__NOTESAPP_THEMES__'));
  const attributes = new Map<string, string>();
  const style = new Map<string, string>();
  const element = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    style: new Proxy(
      { setProperty: (name: string, value: string) => style.set(name, value) },
      {
        set: (target, name, value) => {
          style.set(String(name), String(value));
          return true;
        },
      },
    ),
  };
  runInNewContext(script.replace('__NOTESAPP_THEMES__', themeRegistryData()), {
    localStorage: { getItem: (key: string) => stored[key] ?? null },
    window: { matchMedia: () => ({ matches: deviceDark }) },
    document: { documentElement: element, querySelector: () => null },
  });
  return { attributes, style };
}

await test('the first paint states the appearance of the variant it paints', () => {
  // Nord publishes a dark palette alone. A light choice paints that palette,
  // so the page states dark, as `applyTheme` does once React runs.
  const nord = firstPaint(
    { 'notesapp.theme': 'light', 'notesapp.theme-family': 'nord' },
    false,
  );
  const nordPalette = themeFamilies.find(
    (family) => family.id === 'nord',
  )?.variants;
  assert.deepEqual(
    nordPalette?.map((variant) => variant.appearance),
    ['dark'],
  );
  assert.equal(nord.attributes.get('data-theme-id'), nordPalette?.[0]?.id);
  assert.equal(nord.attributes.get('data-theme'), 'dark');
  assert.equal(nord.style.get('colorScheme'), 'dark');
  // An imported theme with a dark palette alone does the same (record 0143).
  const read = readThemeFile(
    themeFileText({
      id: 'night',
      name: 'Night',
      source: { project: 'Night', url: '', licence: '' },
      variants: nordPalette ?? [],
    }),
  );
  assert.ok(read.ok);
  const imported = importedThemeFamily('custom-night', read.theme);
  const night = firstPaint(
    {
      'notesapp.theme': 'system',
      'notesapp.theme-family': imported.id,
      [importedPaletteStorageKey]: inlineImportedFamily(imported),
    },
    false,
  );
  assert.equal(night.attributes.get('data-theme-id'), 'custom-night-dark');
  assert.equal(night.attributes.get('data-theme'), 'dark');
  assert.equal(night.style.get('colorScheme'), 'dark');
  // A family with both palettes paints the one that the device asks for.
  const github = firstPaint(
    { 'notesapp.theme': 'system', 'notesapp.theme-family': 'github' },
    false,
  );
  assert.equal(github.attributes.get('data-theme'), 'light');
  assert.equal(github.style.get('colorScheme'), 'light');
});
