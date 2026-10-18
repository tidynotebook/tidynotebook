import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import {
  acceptedEncodings,
  ApplicationShellError,
  prepareApplicationShell,
  cacheControlFor,
  isHashedAssetName,
  matchesEntityTag,
  mimeTypeFor,
  publishedDiagramFrameHref,
  publishedPageScriptHref,
  servesApplicationShell,
  servesBrowserAssets,
  stylesheetHrefs,
} from './static-assets.ts';

await test('brotli is preferred over gzip whatever the header order', () => {
  assert.deepEqual(acceptedEncodings('gzip, br'), ['br', 'gzip']);
  assert.deepEqual(acceptedEncodings('br;q=1.0, gzip;q=0.8'), ['br', 'gzip']);
  assert.deepEqual(acceptedEncodings('gzip, deflate'), ['gzip']);
  assert.deepEqual(acceptedEncodings('*'), ['br', 'gzip']);
});

await test('a refused encoding is not served', () => {
  assert.deepEqual(acceptedEncodings('br;q=0, gzip'), ['gzip']);
  assert.deepEqual(acceptedEncodings('identity'), []);
  assert.deepEqual(acceptedEncodings(''), []);
  assert.deepEqual(acceptedEncodings(undefined), []);
});

await test('a hashed file is cached for a year and everything else is not', () => {
  assert.ok(isHashedAssetName('/dist/assets/main-CdE12fGh.js'));
  assert.equal(
    cacheControlFor('/dist/assets/main-CdE12fGh.js'),
    'public, max-age=31536000, immutable',
  );
  assert.equal(cacheControlFor('/dist/index.html'), 'no-cache');
  assert.equal(cacheControlFor('/dist/service-worker.js'), 'no-cache');
  assert.equal(cacheControlFor('/dist/manifest.webmanifest'), 'no-cache');
  assert.equal(cacheControlFor('/dist/icon.svg'), 'no-cache');
  // A hashed document is still revalidated: the shell must never be pinned.
  assert.equal(cacheControlFor('/dist/frame-CdE12fGh.html'), 'no-cache');
});

await test('every emitted name of the bundler carries its hash', () => {
  // Real names of one build. The bundler writes eight characters of its own
  // alphabet, which holds a digit, a letter of either case and `_`.
  for (const name of [
    'main-DQQg1tio.js',
    'editor-CJLxXS_0.js',
    'dist-D_J69Mso.js',
    'note-editor-hOd_chB0.js',
    'attention-link-5pZjb6jT.js',
    'main-BR7H7KVx.css',
    'now-Ca5VK6da.js',
    // Six vendored faces carry a hyphen inside the hash itself. A rule that
    // cut the name at the last hyphen read `rTL` as the hash and served them
    // revalidated for ever.
    'KaTeX_Caligraphic-Regular-CTRA-rTL.woff',
    'KaTeX_Caligraphic-Regular-Di6jR-x-.woff2',
    'KaTeX_Math-BoldItalic-iY-2wyZ7.woff',
    'KaTeX_Math-Italic-t53AETM-.woff2',
    'KaTeX_Script-Regular-C5JkGWo-.ttf',
    'KaTeX_Size4-Regular-BF-4gkZK.woff',
    // The build names an icon the same way (0074).
    'apple-touch-icon-7402c1eb.png',
    'icon-192-85536966.png',
    'maskable-512-2f9c70da.png',
    'icon-58a10ab5.svg',
  ])
    assert.ok(isHashedAssetName(`/dist/assets/${name}`), name);
});

await test('a fixed address is never pinned, whatever its hyphens', () => {
  // A file of the public directory keeps one address across every
  // deployment, so a year of `immutable` pins bytes that a later build
  // replaces. The browser then holds the old bytes and never asks again,
  // which is what an iPhone reported for the installed icon.
  //
  // Each name below is a real one. `apple-touch-icon.png` and the vendored
  // faces read as hashed while the rule accepted a hyphen inside the hash,
  // because `touch-icon` and `latin-ext` are long enough to pass for one.
  for (const name of [
    'apple-touch-icon.png',
    'icon-192.png',
    'icon-512.png',
    'maskable-512.png',
    'icon.svg',
    'fonts/geist-latin-ext.woff2',
    'fonts/geist-latin-ext-italic.woff2',
    'fonts/geist-latin-italic.woff2',
    'fonts/geist-mono-latin.woff2',
    'fonts/geist-mono-latin-ext.woff2',
    'KaTeX_Main-Regular.woff2',
  ]) {
    assert.equal(isHashedAssetName(`/dist/${name}`), false, name);
    assert.equal(cacheControlFor(`/dist/${name}`), 'no-cache', name);
  }
});

await test('an entity tag condition matches by value and by star', () => {
  assert.ok(matchesEntityTag('"abc"', '"abc"'));
  assert.ok(matchesEntityTag('W/"abc"', '"abc"'));
  assert.ok(matchesEntityTag('"other", "abc"', '"abc"'));
  assert.ok(matchesEntityTag('*', '"abc"'));
  assert.equal(matchesEntityTag('"other"', '"abc"'), false);
  assert.equal(matchesEntityTag(undefined, '"abc"'), false);
});

await test('a built file keeps its declared content type', () => {
  assert.equal(mimeTypeFor('/dist/index.html'), 'text/html; charset=utf-8');
  assert.equal(
    mimeTypeFor('/dist/main.js'),
    'application/javascript; charset=utf-8',
  );
  assert.equal(mimeTypeFor('/dist/main.css'), 'text/css; charset=utf-8');
  assert.equal(
    mimeTypeFor('/dist/manifest.webmanifest'),
    'application/manifest+json; charset=utf-8',
  );
  assert.equal(mimeTypeFor('/dist/icon.svg'), 'image/svg+xml');
  // Every font kind the build writes states what it is. The mathematics
  // faces ship as TrueType as well, and those went out as a stream of bytes.
  assert.equal(mimeTypeFor('/dist/KaTeX_Main-Regular.woff2'), 'font/woff2');
  assert.equal(mimeTypeFor('/dist/KaTeX_Main-Regular.woff'), 'font/woff');
  assert.equal(mimeTypeFor('/dist/KaTeX_Main-Regular.ttf'), 'font/ttf');
  assert.equal(mimeTypeFor('/dist/KaTeX_Main-Regular.otf'), 'font/otf');
  assert.equal(mimeTypeFor('/dist/unknown.bin'), 'application/octet-stream');
});

await test('an address that names a file never receives the shell', () => {
  // A module of the build, and a module of an older build that the file
  // system no longer holds. Both name a file, so both get the not-found
  // answer rather than HTML that `nosniff` refuses.
  assert.equal(servesApplicationShell('/assets/shell-AbCdEfGh.js'), false);
  assert.equal(servesApplicationShell('/assets/shell-Gone1234.js'), false);
  assert.equal(servesApplicationShell('/assets/main-AbCdEfGh.css'), false);
  assert.equal(servesApplicationShell('/assets/body-AbCdEfGh.woff2'), false);
  assert.equal(servesApplicationShell('/assets/main-AbCdEfGh.js.map'), false);
  assert.equal(servesApplicationShell('/manifest.webmanifest'), false);
  assert.equal(servesApplicationShell('/service-worker.js'), false);
  assert.equal(servesApplicationShell('/icon.svg'), false);
});

await test('an address that names a page still receives the shell', () => {
  // The router of the application reads these, so the shell has to arrive
  // whoever asks and however many hops the request took.
  assert.ok(servesApplicationShell('/'));
  assert.ok(servesApplicationShell('/login'));
  assert.ok(servesApplicationShell('/settings'));
  assert.ok(servesApplicationShell('/w/one/notes/two'));
  assert.ok(servesApplicationShell('/w/one/notes/two/history'));
  // A dot inside a folder of the address is not a file extension of it.
  assert.ok(servesApplicationShell('/w/one.two/notes/three'));
});

await test('an address that the server owns never receives the shell', () => {
  // The reader boundary of a published link is one of them. A mangled reader
  // address holds no dot in its last segment, so the shell rule alone would
  // hand a reader the application and ask a person with no account to sign in.
  // Decision 0047 gives that address one document or one refusal instead.
  assert.equal(servesBrowserAssets('/published'), false);
  assert.equal(servesBrowserAssets('/published/'), false);
  assert.equal(servesBrowserAssets('/published/a'.repeat(30)), false);
  assert.equal(servesBrowserAssets('/published/token/attachments/one'), false);
  assert.equal(servesBrowserAssets('/api'), false);
  assert.equal(servesBrowserAssets('/api/files'), false);
  assert.equal(servesBrowserAssets('/.well-known/openid-configuration'), false);
});

await test('a page of the application still reaches the built assets', () => {
  // The boundary is the whole first segment and nothing that starts with the
  // same letters, so a note of a person keeps its page.
  assert.ok(servesBrowserAssets('/'));
  assert.ok(servesBrowserAssets('/login'));
  assert.ok(servesBrowserAssets('/assets/main-AbCdEfGh.js'));
  assert.ok(servesBrowserAssets('/published-notes'));
  assert.ok(servesBrowserAssets('/w/one/notes/published'));
});

/**
 * The stylesheet of the built shell document, which plan 007 item 25 decides.
 *
 * The published page loads that one stylesheet, so it cannot drift from the
 * theme. The address is read from the artefact that this server already serves
 * and already parses for the inline script hashes of its content policy. The
 * alternative was a build manifest, which would have been a second output that
 * describes the same fact.
 */
await test('the stylesheet of a built document is read from its links', () => {
  const html = [
    '<!doctype html><html><head>',
    '<link rel="icon" href="/icon.svg">',
    '<link rel="stylesheet" crossorigin href="/assets/main-abc.css">',
    '</head><body></body></html>',
  ].join('\n');
  assert.deepEqual(stylesheetHrefs(html), ['/assets/main-abc.css']);
});

await test('a stylesheet of another origin is never answered', () => {
  const html = [
    `<link rel="stylesheet" href="https://cdn.invalid/a.css">`,
    `<link rel="stylesheet" href="//cdn.invalid/b.css">`,
    `<link rel="stylesheet" href="relative.css">`,
    `<link rel='stylesheet' href='/assets/ok.css'>`,
  ].join('\n');
  assert.deepEqual(stylesheetHrefs(html), ['/assets/ok.css']);
});

await test('a document with no stylesheet answers none', () => {
  assert.deepEqual(stylesheetHrefs('<html><head></head></html>'), []);
  assert.deepEqual(stylesheetHrefs('<link rel="preload" href="/a.css">'), []);
});

await test('a document that names one stylesheet twice answers it once', () => {
  const html = [
    '<link rel="stylesheet" href="/a.css">',
    '<link rel="STYLESHEET" href="/a.css">',
  ].join('\n');
  assert.deepEqual(stylesheetHrefs(html), ['/a.css']);
});

await test('the diagram script of a published page is the one file of its name', async () => {
  // Record 0158. A published page names the diagram script only when the
  // build holds it and the frame that it loads, and a second file of one name
  // would leave the choice to chance.
  const directory = await mkdtemp(join(tmpdir(), 'notesapp-diagram-script-'));
  try {
    await mkdir(join(directory, 'assets'));
    await mkdir(join(directory, 'src/diagram'), { recursive: true });
    await writeFile(join(directory, 'assets/published-page-M0Ar9lYV.js'), '');
    await writeFile(join(directory, 'assets/published-links-BgGi9BLm.js'), '');
    // No frame document yet, so no script.
    assert.equal(publishedPageScriptHref(directory), null);
    await writeFile(join(directory, publishedDiagramFrameHref), '');
    assert.equal(
      publishedPageScriptHref(directory),
      '/assets/published-page-M0Ar9lYV.js',
    );
    await writeFile(join(directory, 'assets/published-page-ZZZZZZZZ.js'), '');
    assert.equal(publishedPageScriptHref(directory), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  assert.equal(publishedPageScriptHref(join(directory, 'gone')), null);
});

await test('MCP is reserved by the server and never receives the application shell', () => {
  assert.equal(servesBrowserAssets('/mcp'), false);
  assert.equal(servesBrowserAssets('/mcp/unknown'), false);
  assert.equal(servesBrowserAssets('/mcp-notes'), true);
});

await test('the start fills the one placeholder of the shell and compresses the filled bytes', () => {
  const html =
    '<html><head><!-- P --><script>run()</script></head><body></body></html>';
  const shell = prepareApplicationShell(html, '<!-- P -->', '<meta a>');
  const filled =
    '<html><head><meta a><script>run()</script></head><body></body></html>';
  assert.equal(shell.identity.bytes.toString('utf8'), filled);
  assert.equal(brotliDecompressSync(shell.encoded.br.bytes).toString(), filled);
  assert.equal(gunzipSync(shell.encoded.gzip.bytes).toString(), filled);
  // Each representation has a tag of its own bytes.
  const tags = new Set([
    shell.identity.tag,
    shell.encoded.br.tag,
    shell.encoded.gzip.tag,
  ]);
  assert.equal(tags.size, 3);
  // The policy names the inline script of the filled shell.
  assert.match(shell.policy, /'sha256-[A-Za-z0-9+/=]+'/);
  // A new block gives new tags, so a cache that held the old shell asks again.
  const next = prepareApplicationShell(html, '<!-- P -->', '<meta b>');
  assert.notEqual(next.identity.tag, shell.identity.tag);
  assert.notEqual(next.encoded.br.tag, shell.encoded.br.tag);
  // The same inputs give the same tags across two starts.
  assert.equal(
    prepareApplicationShell(html, '<!-- P -->', '<meta a>').identity.tag,
    shell.identity.tag,
  );
});

await test('a shell with no placeholder or with two refuses the start', () => {
  assert.throws(
    () => prepareApplicationShell('<head></head>', '<!-- P -->', 'x'),
    ApplicationShellError,
  );
  assert.throws(
    () => prepareApplicationShell('<!-- P --><!-- P -->', '<!-- P -->', 'x'),
    ApplicationShellError,
  );
});
