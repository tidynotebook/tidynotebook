/**
 * The JavaScript that the first route of the built web application loads.
 *
 * The first route is every script and every module preload that the built
 * `index.html` names. A deferred chunk, such as the editor or the math module,
 * stays out of it. `bundle-budget.mjs` measures this list, and
 * `tests/integration/web-build.test.ts` holds what it must not contain, so the
 * two read one definition of the first route.
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
] as const;

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
