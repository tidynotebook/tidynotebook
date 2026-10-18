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
import {
  assetHashLength,
  cacheControlFor,
  publishedDiagramFrameHref,
  publishedPageScriptFile,
  publishedPageScriptHref,
  linkPreviewCardFile,
  linkPreviewImageSize,
  linkPreviewPlaceholder,
} from '@notesapp/server';
import {
  diagramFontVariable,
  diagramFramePath,
} from '../../apps/web/src/diagram/frame.ts';
import { frameEntry } from '../../apps/web/src/diagram/frame-document.ts';
import { publishedPageScriptName } from '../../apps/web/vite.config.ts';
import {
  appIcons,
  iconHashLength,
  socialCard,
} from '../../apps/web/src/pwa/icons.ts';
import {
  builtScripts,
  deferredLibraries,
  firstScreenScripts,
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

await test('the first screen loads no library that only a note needs', async () => {
  // Record 0177. The frame imported the shortcut list and the format rows
  // of the editor package, and the palette the device search, so a cold
  // start of All notes read CodeMirror and the HTML reader of the renderer.
  await readWorker();
  const first = await firstScreenScripts(distribution);
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
    assert.deepEqual(holders, [], `${library.name} is on the first screen`);
  }
});

await test('the build writes one self-contained diagram script for a published page', async () => {
  // Record 0158. The content policy of a published page names one script of
  // the build by its address, so the script loads no chunk, and the server
  // finds it by the name that the build gives it.
  const href = publishedPageScriptHref(distribution);
  assert.ok(href !== null, 'the server finds no diagram script in the build');
  const name = href.slice('/assets/'.length);
  assert.match(name, publishedPageScriptFile);
  assert.ok(name.startsWith(`${publishedPageScriptName}-`));
  assert.ok(cacheControlFor(href).includes('immutable'));
  const script = await readFile(join(distribution, href), 'utf8');
  // A classic script with no import: the page names it with no module type.
  assert.doesNotMatch(script, /(?:^|[\n;])\s*(?:import|export)[\s{'"(]/);
  assert.doesNotMatch(script, /\bimport\(/);
  // It loads the frame of the editor, at the address that the policy names.
  assert.equal(publishedDiagramFrameHref, diagramFramePath);
  assert.ok(script.includes(diagramFramePath));
  await readFile(join(distribution, publishedDiagramFrameHref));
});

await test('the built diagram frame sets its text in the face of the page', async () => {
  // Record 0061. The frame held a handwritten style block that set its text
  // in a system face, because a face file of the origin is a cross origin
  // request that the sandboxed frame cannot make. The build now writes the
  // one stylesheet of the application into the frame, with every face that
  // it declares inside it, so the frame loads nothing and names the same
  // family as the stylesheet of the page.
  const frame = await readFile(join(distribution, diagramFramePath), 'utf8');
  const styles = [...frame.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(
    (match) => match[1] ?? '',
  );
  assert.equal(styles.length, 1, 'the frame holds one stylesheet');
  const css = styles[0] ?? '';
  const faces = [...css.matchAll(/@font-face\{[^}]*\}/g)].map((m) => m[0]);
  assert.ok(faces.length > 0, 'the frame declares no face');
  for (const face of faces)
    assert.match(face, /src:url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\)/);
  assert.doesNotMatch(css, /url\((['"]?)\/fonts\//);
  const family = (text: string): string | undefined =>
    new RegExp(`${diagramFontVariable}:([^;]+);`).exec(text)?.[1];
  // The stylesheet of the page is the built one that names the face.
  const files = await readdir(join(distribution, 'assets'));
  const sheets = await Promise.all(
    files
      .filter((file) => file.endsWith('.css'))
      .map((file) => readFile(join(distribution, 'assets', file), 'utf8')),
  );
  const page = sheets.find((sheet) => family(sheet) !== undefined);
  assert.ok(page !== undefined, 'the page stylesheet names no face');
  assert.equal(family(css), family(page));
  // The faces of the frame are the faces of the page, file for file.
  const pageFaces = [...page.matchAll(/url\((['"]?)\/fonts\/([^)'"]+)\1\)/g)];
  assert.equal(faces.length, pageFaces.length);
  // The source of the frame names its entry and holds no style of its own,
  // so the one stylesheet above is the only style that it carries.
  const template = await readFile(
    join(import.meta.dirname, '../../apps/web/src/diagram/frame.html'),
    'utf8',
  );
  assert.ok(template.includes(frameEntry));
  assert.doesNotMatch(template, /<style\b|\sstyle\s*=|font-family/);
});

await test('the first screen reads every chunk that its scripts import', async () => {
  const screen = await firstScreenScripts(distribution);
  const files = screen.map((script) => script.file);
  // The frame and All notes are on it, and the editor is not.
  assert.ok(
    files.some((file) => /^assets\/shell-/.test(file)),
    'no frame',
  );
  assert.ok(
    files.some((file) => /^assets\/notes-home-/.test(file)),
    'no list',
  );
  assert.ok(!files.some((file) => /^assets\/editor-/.test(file)), 'editor');
  assert.equal(new Set(files).size, files.length);
});

await test('the built shell holds the screen of a start that failed', async () => {
  // Record 0161. A module of the entry that did not arrive left a white page,
  // because no route boundary runs before React draws. The shell holds the
  // application screen of each cause and the script that shows it.
  const shell = await readFile(join(distribution, 'index.html'), 'utf8');
  assert.doesNotMatch(shell, /__NOTESAPP_START_FAILURE_/);
  // Record 0187. The title reads the product name.
  assert.doesNotMatch(shell, /__NOTESAPP_PRODUCT_NAME__/);
  assert.match(shell, /<title>tidy notebook<\/title>/);
  const load = /<template id="start-failure-load">([\s\S]*?)<\/template>/.exec(
    shell,
  )?.[1];
  const stop = /<template id="start-failure-stop">([\s\S]*?)<\/template>/.exec(
    shell,
  )?.[1];
  assert.ok(load?.includes('tidy notebook did not load'), 'no load screen');
  assert.ok(stop?.includes('tidy notebook stopped'), 'no stop screen');
  for (const screen of [load, stop]) assert.match(screen ?? '', /Reload/);
  assert.match(shell, /addEventListener\(\s*'error'/);
  assert.match(shell, /'unhandledrejection'/);
});

await test('the built shell preloads the entry only on a load that no worker controls', async () => {
  // Record 0180. On a controlled load a preload link and the module script
  // both reached the worker for one module, and the browser aborted one of
  // them, so the entry failed and the page stayed white.
  const shell = await readFile(join(distribution, 'index.html'), 'utf8');
  assert.doesNotMatch(shell, /<link rel="modulepreload"/);
  const script = /<script>(\(function addEntryPreloads[\s\S]*?)<\/script>/.exec(
    shell,
  )?.[1];
  assert.ok(script !== undefined, 'no preload script');
  assert.match(script, /controller/);
  assert.match(script, /\["\/assets\/[^"]+\.js"/);
});

await test('the built shell leaves one place for the link preview and names no origin', async () => {
  // Design 028. The server writes the block from its configured origin at
  // start, so the build names no origin and no description of its own.
  const shell = await readFile(join(distribution, 'index.html'), 'utf8');
  assert.equal(shell.split(linkPreviewPlaceholder).length - 1, 1);
  assert.doesNotMatch(shell, /og:|twitter:|name="description"/);
  const head = shell.slice(0, shell.indexOf('</head>'));
  // The block comes near the start of the head, where WhatsApp reads it.
  assert.ok(head.indexOf(linkPreviewPlaceholder) < head.indexOf('<script'));
});

await test('the build emits one card of a link preview under a hashed name', async () => {
  const names = await readdir(join(distribution, 'assets'));
  const cards = names.filter((name) => linkPreviewCardFile.test(name));
  assert.equal(cards.length, 1, cards.join(', '));
  const stem = socialCard.file.slice(0, socialCard.file.lastIndexOf('.'));
  assert.ok(cards[0]?.startsWith(`${stem}-`));
  const card = `/assets/${cards[0] ?? ''}`;
  assert.equal(
    cacheControlFor(join(distribution, card)),
    'public, max-age=31536000, immutable',
  );
  const bytes = await readFile(join(distribution, card));
  // The PNG header states the size: width and height of the IHDR chunk.
  assert.equal(bytes.subarray(1, 4).toString('latin1'), 'PNG');
  assert.equal(bytes.readUInt32BE(16), linkPreviewImageSize.width);
  assert.equal(bytes.readUInt32BE(20), linkPreviewImageSize.height);
  // Well under the WhatsApp limit of 600 KB.
  assert.ok(bytes.byteLength < 300 * 1024, String(bytes.byteLength));
  // The worker does not precache it, and no document names it.
  const precache = derivePrecache(await directoryFiles(distribution));
  assert.ok(!precache.urls.includes(card));
  const manifest = await readFile(
    join(distribution, 'manifest.webmanifest'),
    'utf8',
  );
  assert.ok(!manifest.includes('social-card'));
});
