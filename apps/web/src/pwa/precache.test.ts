/**
 * The rules that decide what the installed worker precaches.
 *
 * The build step derives one list of addresses and one cache name from the
 * files of a finished build, and it compiles the worker with both written
 * into it. Each rule is proved here on its own, and the last test compiles
 * the real worker, because a worker that is not a classic script, or that
 * keeps a placeholder, only fails in a browser.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appCachePrefix,
  buildWorker,
  bundleFiles,
  derivePrecache,
  maximumPrecachedBytes,
  type BuiltFile,
} from './precache.ts';

/** One file of a build, with a digest that stands for its bytes. */
function file(url: string, digest = 'aa', size = 10): BuiltFile {
  return { url, size, digest };
}

/** A build of the kinds that the worker keeps and the kinds it drops. */
const mixedBuild: readonly BuiltFile[] = [
  file('/index.html'),
  file('/manifest.webmanifest'),
  file('/icon.svg'),
  file('/apple-touch-icon.png'),
  file('/assets/main-AbCdEfGh.js'),
  file('/assets/main-AbCdEfGh.css'),
  file('/assets/font-AbCdEfGh.woff2'),
  file('/assets/main-AbCdEfGh.js.map'),
  file('/assets/main-AbCdEfGh.js.br'),
  file('/service-worker.js'),
  file('/src/diagram/frame.html'),
  file('/assets/social-card-AbCdEfGh.png'),
];

await test('the precache keeps the shell and drops the rest', () => {
  const precache = derivePrecache(mixedBuild);
  assert.deepEqual(precache.urls, [
    '/apple-touch-icon.png',
    '/assets/font-AbCdEfGh.woff2',
    '/assets/main-AbCdEfGh.css',
    '/assets/main-AbCdEfGh.js',
    '/icon.svg',
    '/index.html',
    '/manifest.webmanifest',
  ]);
});

await test('the worker stays out of its own precache', () => {
  assert.ok(!derivePrecache(mixedBuild).urls.includes('/service-worker.js'));
});

await test('the diagram frame stays out of the precache', () => {
  const urls = derivePrecache(mixedBuild).urls;
  assert.ok(!urls.some((url) => url.startsWith('/src/diagram/')));
});

await test('the card of a link preview stays out of the precache', () => {
  // Only a crawler reads it (design 028).
  const urls = derivePrecache(mixedBuild).urls;
  assert.ok(!urls.some((url) => url.includes('social-card')));
});

await test('a file over the size cap is reported and left out', () => {
  const precache = derivePrecache([
    file('/index.html'),
    file('/assets/huge-AbCdEfGh.js', 'bb', maximumPrecachedBytes + 1),
  ]);
  assert.deepEqual(precache.urls, ['/index.html']);
  assert.deepEqual(precache.oversize, ['/assets/huge-AbCdEfGh.js']);
});

await test('a file at the size cap stays in the precache', () => {
  const precache = derivePrecache([
    file('/assets/large-AbCdEfGh.js', 'bb', maximumPrecachedBytes),
  ]);
  assert.deepEqual(precache.urls, ['/assets/large-AbCdEfGh.js']);
  assert.deepEqual(precache.oversize, []);
});

await test('the same files name the same cache', () => {
  const first = derivePrecache(mixedBuild);
  const second = derivePrecache([...mixedBuild].reverse());
  assert.equal(first.cacheName, second.cacheName);
  assert.match(first.cacheName, new RegExp(`^${appCachePrefix}[0-9a-f]{16}$`));
});

await test('new bytes under an old address name a new cache', () => {
  // The address of the shell never changes, so a fixed cache name served the
  // shell of the last deployment until the browser evicted it.
  const before = derivePrecache([file('/index.html', 'first')]);
  const after = derivePrecache([file('/index.html', 'second')]);
  assert.notEqual(before.cacheName, after.cacheName);
});

await test('a new address names a new cache', () => {
  const before = derivePrecache([file('/index.html')]);
  const after = derivePrecache([file('/index.html'), file('/icon.svg')]);
  assert.notEqual(before.cacheName, after.cacheName);
});

await test('a bundle reports its chunks and its assets', () => {
  const files = bundleFiles({
    'assets/main-AbCdEfGh.js': { type: 'chunk', code: 'export const a = 1;' },
    'index.html': { type: 'asset', source: '<!doctype html>' },
    'icon-192.png': { type: 'asset', source: Uint8Array.from([1, 2, 3]) },
  });
  assert.deepEqual(files.map((one) => one.url).sort(), [
    '/assets/main-AbCdEfGh.js',
    '/icon-192.png',
    '/index.html',
  ]);
  const icon = files.find((one) => one.url === '/icon-192.png');
  assert.equal(icon?.size, 3);
  assert.equal(
    files.find((one) => one.url === '/index.html')?.size,
    '<!doctype html>'.length,
  );
});

await test('the built worker is one classic script that holds its precache', async () => {
  const precache = derivePrecache([file('/index.html'), file('/icon.svg')]);
  // The root of the package, which is the root of the build as well.
  const worker = await buildWorker(`${import.meta.dirname}/../..`, precache);
  // A classic script is what the page registers, so a top level `import` or
  // `export` would fail in the browser before the worker ran once.
  assert.doesNotMatch(worker.code, /(?:^|\n)\s*(?:import|export)[\s{'"(]/);
  assert.ok(worker.code.includes(precache.cacheName));
  assert.ok(worker.code.includes('/index.html'));
  assert.ok(!worker.code.includes('__NOTESAPP_PRECACHE__'));
  assert.ok(!worker.code.includes('__NOTESAPP_APP_CACHE__'));
});
