/**
 * The installed worker that the browser build writes.
 *
 * `pnpm test:integration` builds the workspace first, so these checks read the
 * real output of `apps/web` rather than a fixture. They prove the three
 * properties that only fail in a browser: the worker is a classic script, it
 * carries the addresses of this build, and its cache follows the bytes of this
 * build.
 *
 * The derivation runs a second time here, over the files on disk, and the name
 * it produces must be the name inside the worker. A worker that is stamped
 * from another list, or that keeps a fixed name, therefore fails here.
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { assetHashLength, cacheControlFor } from '@notesapp/server';
import { appIcons, iconHashLength } from '../../apps/web/src/pwa/icons.ts';
import {
  builtScripts,
  deferredLibraries,
  firstRouteScripts,
} from '../../tools/performance/first-route.ts';
import {
  derivePrecache,
  directoryFiles,
  workerFileName,
} from '../../apps/web/src/pwa/precache.ts';

const distribution = join(import.meta.dirname, '../../apps/web/dist/web');

/** The emitted directory, whose names carry a hash of their bytes. */
const hashedDirectory = '/assets/';

/** A neighbour that the build writes beside a file and never serves. */
const notServed = /\.(?:br|gz|map)$/;

/** Every served file of the build, by address. */
async function servedFiles(): Promise<readonly string[]> {
  const files = await directoryFiles(distribution);
  return files.map((file) => file.url).filter((url) => !notServed.test(url));
}

/** The built worker, or a failure that names the one cause. */
async function readWorker(): Promise<string> {
  try {
    return await readFile(join(distribution, workerFileName), 'utf8');
  } catch {
    throw new Error(
      'The browser build is absent. Run pnpm build before this test.',
    );
  }
}

await test('the built worker is a classic script', async () => {
  const worker = await readWorker();
  // The page registers the worker with no module type, so a top level
  // `import` or `export` would fail before the worker ran once.
  assert.doesNotMatch(worker, /(?:^|\n)\s*(?:import|export)[\s{'"(]/);
});

await test('the built worker holds the addresses of this build', async () => {
  const worker = await readWorker();
  const precache = derivePrecache(await directoryFiles(distribution));
  assert.ok(precache.urls.includes('/index.html'));
  assert.ok(precache.urls.includes('/manifest.webmanifest'));
  assert.ok(!precache.urls.includes(`/${workerFileName}`));
  assert.ok(!precache.urls.some((url) => url.startsWith('/src/diagram/')));
  for (const url of precache.urls) assert.ok(worker.includes(url), url);
});

await test('the cache of the built worker follows its bytes', async () => {
  const worker = await readWorker();
  const precache = derivePrecache(await directoryFiles(distribution));
  assert.ok(worker.includes(precache.cacheName), precache.cacheName);
  // A fixed name served the shell of an older deployment until the browser
  // evicted it, because the address of the shell never changes.
  assert.ok(!worker.includes('notesapp-app-v1'));
});

await test('the two sides agree on the length of a hash', () => {
  // `apps/web` is browser code and imports no server package, so the two
  // constants cannot read each other. This is where they meet.
  assert.equal(iconHashLength, assetHashLength);
});

await test('a year of caching follows the name the build wrote', async () => {
  // The server reads a content hash out of a name. A file of the emitted
  // directory carries one, so it is pinned. Every other served file keeps one
  // address across deployments, so it is revalidated. A rule that read a hash
  // where the build wrote none pinned `/apple-touch-icon.png` for a year, and
  // an installed icon on a device never changed again.
  const files = await servedFiles();
  assert.ok(files.length > 0, 'the browser build is absent');
  for (const url of files) {
    const pinned = cacheControlFor(url).includes('immutable');
    assert.equal(pinned, url.startsWith(hashedDirectory), url);
  }
});

await test('the shell and the manifest name icons that the build wrote', async () => {
  const shell = await readFile(join(distribution, 'index.html'), 'utf8');
  const manifest: unknown = JSON.parse(
    await readFile(join(distribution, 'manifest.webmanifest'), 'utf8'),
  );
  const emitted = new Set(await servedFiles());
  const named: string[] = [];
  for (const element of shell.match(/<link\b[^>]*>/g) ?? []) {
    if (!/rel="(?:icon|apple-touch-icon)"/.test(element)) continue;
    named.push(/href="([^"]+)"/.exec(element)?.[1] ?? '');
  }
  assert.ok(
    typeof manifest === 'object' && manifest !== null && 'icons' in manifest,
  );
  const icons: unknown = manifest.icons;
  assert.ok(Array.isArray(icons));
  for (const icon of icons) {
    assert.ok(typeof icon === 'object' && icon !== null && 'src' in icon);
    const source: unknown = icon.src;
    assert.ok(typeof source === 'string');
    named.push(source);
  }
  assert.equal(named.length, appIcons.length);
  for (const address of named) {
    // A fixed address is what a stale cache entry answers, so no icon keeps
    // one. See decision 0074.
    assert.ok(address.startsWith(hashedDirectory), address);
    assert.ok(emitted.has(address), address);
  }
});

await test('the built shell fits the content viewport when a keyboard opens', async () => {
  const shell = await readFile(join(distribution, 'index.html'), 'utf8');
  assert.match(
    shell,
    /<meta\s+name="viewport"\s+content="[^"]*interactive-widget=resizes-content"/,
  );
  assert.match(shell, /<div id="root" class="min-h-viewport"/);
  assert.doesNotMatch(shell, /<div id="root" class="min-h-dvh"/);
});

await test('no icon keeps a fixed address of its own', async () => {
  const root = await readdir(distribution);
  for (const icon of appIcons) assert.ok(!root.includes(icon.file), icon.file);
});

await test('the first route loads no library that only a note needs', async () => {
  await readWorker();
  const first = await firstRouteScripts(distribution);
  const every = await builtScripts(distribution);
  for (const library of deferredLibraries) {
    // The marker must name the library in the build at all, or the check
    // below would pass for a marker that the library no longer holds.
    assert.ok(
      every.some((script) => script.bytes.includes(library.marker)),
      `no built chunk holds the marker of ${library.name}`,
    );
    const holders = first
      .filter((script) => script.bytes.includes(library.marker))
      .map((script) => script.file);
    assert.deepEqual(holders, [], `${library.name} is on the first route`);
  }
});
