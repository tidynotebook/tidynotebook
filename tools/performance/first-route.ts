/**
 * The JavaScript that the first route of the built web application loads.
 *
 * The first route is every script and every module preload that the built
 * `index.html` names. A deferred chunk, such as the editor or the math module,
 * stays out of it. `firstScreenScripts` adds the lazy chunks of the frame and
 * All notes, which a cold start also loads. `bundle-budget.mjs` measures the
 * first screen, and `tests/integration/web-build.test.ts` holds what it must
 * not contain, so the two read one definition of it.
 */
import { readdir, readFile, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

/** One script file of the build, by its path inside the build directory. */
export type BuiltScript = {
  readonly file: string;
  readonly bytes: Buffer;
};

/**
 * A library that only a deferred screen needs, and a string that only its
 * code holds. KaTeX renders a formula in a note, and the first route has no
 * formula to render (issue 206).
 */
export const deferredLibraries = [
  { name: 'KaTeX', marker: 'KaTeX parse error' },
  // The editor engine loads with the note, never with the frame (record
  // 0177). The class names a node of the view of CodeMirror.
  { name: 'CodeMirror', marker: 'cm-scroller' },
  // The HTML reader under the Markdown renderer and the device search.
  { name: 'parse5', marker: 'abandoned-head-element-child' },
] as const;

/**
 * The lazy modules that the workspace address renders before All notes
 * states its count: the frame and All notes. The build names a lazy chunk by
 * its module, so the chunk of `shell/shell.tsx` starts with `shell-`.
 */
export const firstScreenChunks = ['shell', 'notes-home'] as const;

/** Reads one script of the build, refusing a path outside of it. */
async function readScript(
  dist: string,
  reference: string,
): Promise<BuiltScript> {
  const realDist = await realpath(dist);
  const realFile = await realpath(resolve(dist, reference.replace(/^\//, '')));
  if (realFile !== realDist && !realFile.startsWith(`${realDist}${sep}`))
    throw new Error('A JavaScript reference leaves the build root.');
  return { file: relative(dist, realFile), bytes: await readFile(realFile) };
}

/** The scripts that the first route loads, in the order of their names. */
export async function firstRouteScripts(
  dist: string,
): Promise<readonly BuiltScript[]> {
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  const references = new Set<string>();
  for (const match of html.matchAll(
    /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+[.]js)["'][^>]*>/g,
  )) {
    const value = match[1];
    if (value !== undefined) references.add(value);
  }
  if (references.size === 0)
    throw new Error('The built index has no initial JavaScript references.');
  return Promise.all(
    [...references]
      .sort((left, right) => left.localeCompare(right))
      .map((reference) => readScript(dist, reference)),
  );
}

/** Every script that the build emitted, the deferred chunks included. */
export async function builtScripts(
  dist: string,
): Promise<readonly BuiltScript[]> {
  const names = await readdir(join(dist, 'assets'));
  return Promise.all(
    names
      .filter((name) => name.endsWith('.js'))
      .sort((left, right) => left.localeCompare(right))
      .map((name) => readScript(dist, `assets/${name}`)),
  );
}

/** The chunks that one script imports statically, by their file names. */
function staticImports(script: BuiltScript): readonly string[] {
  const text = script.bytes.toString('utf8');
  const found = new Set<string>();
  // A static import names its chunk right after `import` or `from`. A
  // dynamic import is `import(`, which this pattern does not take.
  for (const match of text.matchAll(
    /(?:\bimport\s*|\bfrom\s*)["']\.\/([^"']+\.js)["']/g,
  )) {
    const name = match[1];
    if (name !== undefined) found.add(name);
  }
  return [...found];
}

async function screenChunk(
  dist: string,
  scripts: readonly BuiltScript[],
  name: string,
): Promise<BuiltScript> {
  const candidates = scripts.filter((script) =>
    new RegExp(`^assets/${name}-[^/]+\\.js$`).test(script.file),
  );
  if (candidates.length === 1 && candidates[0] !== undefined)
    return candidates[0];

  // A syntax mode can have the same chunk name as an application screen.
  const entries = await Promise.all(
    candidates.map(async (script) => {
      const map: unknown = JSON.parse(
        await readFile(join(dist, `${script.file}.map`), 'utf8'),
      );
      return map !== null &&
        typeof map === 'object' &&
        'sources' in map &&
        Array.isArray(map.sources) &&
        map.sources.some(
          (source: unknown) =>
            typeof source === 'string' &&
            source.includes('/src/') &&
            !source.includes('/node_modules/') &&
            source.endsWith(`/${name}.tsx`),
        )
        ? script
        : null;
    }),
  );
  const found = entries.filter((entry) => entry !== null);
  if (found.length !== 1 || found[0] === undefined)
    throw new Error(
      `The build does not identify one screen chunk for ${name}.`,
    );
  return found[0];
}

/**
 * The scripts of the first screen: the first route, the lazy chunks of the
 * frame and All notes, and every chunk that those import statically. A cold
 * start loads all of them before the list states its count (record 0177).
 */
export async function firstScreenScripts(
  dist: string,
  additionalChunks: readonly string[] = [],
): Promise<readonly BuiltScript[]> {
  const every = await builtScripts(dist);
  const byName = new Map(
    every.map((script) => [script.file.replace(/^assets\//, ''), script]),
  );
  const start = [
    ...(await firstRouteScripts(dist)),
    ...(await Promise.all(
      [...firstScreenChunks, ...additionalChunks].map((name) =>
        screenChunk(dist, every, name),
      ),
    )),
  ];
  const seen = new Map<string, BuiltScript>();
  const queue = [...start];
  for (
    let script = queue.shift();
    script !== undefined;
    script = queue.shift()
  ) {
    if (seen.has(script.file)) continue;
    seen.set(script.file, script);
    for (const name of staticImports(script)) {
      const next = byName.get(name);
      if (next === undefined)
        throw new Error(`${script.file} imports a chunk the build lacks.`);
      queue.push(next);
    }
  }
  return [...seen.values()].sort((left, right) =>
    left.file.localeCompare(right.file),
  );
}
