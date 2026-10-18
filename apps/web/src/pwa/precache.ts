/**
 * The build step that names the precache of the installed worker.
 *
 * This module runs in Node during the build and never reaches a browser. It
 * does two things and nothing else:
 *
 *   1. It reads the files of one finished build and derives the list of
 *      addresses that the worker precaches, together with the name of the
 *      cache that holds them.
 *   2. It compiles `service-worker.ts` into one classic script at the fixed
 *      served name, with that list and that cache name written into it.
 *
 * The rules of step 1 are pure functions, so each one is proved on its own.
 * The Vite plugin below holds the effects: it reads the emitted bundle, reads
 * the public directory, and emits the worker.
 *
 * The cache name carries a digest of every precached file, so a build with
 * different bytes fills a cache with a different name and the `activate`
 * handler of the worker deletes the older one. A fixed name kept an entry
 * whose address never changes, such as `/index.html`, until the browser
 * evicted it. See
 * [decision 0045](../../../../docs/decisions/0045-the-build-names-the-precache.md).
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { build, type Plugin } from 'vite';
import { isAssetPath } from './asset-kinds.ts';
import { socialCard } from './icons.ts';

/** The served name of the worker. The server and the page both know it. */
export const workerFileName = 'service-worker.js';

/** The source that the worker is compiled from. */
const workerEntry = 'src/pwa/service-worker.ts';

/** The name of the cache that holds the precache, before its stamp. */
export const appCachePrefix = 'notesapp-app-';

/**
 * The address prefix of the diagram frame.
 *
 * The worker precaches the application shell only (decision 0013). The frame
 * carries its whole renderer in one document, so it loads on demand.
 */
const excludedPrefix = '/src/diagram/';

/** The address prefix of the emitted card of a link preview. */
const socialCardPrefix = `/assets/${socialCard.file.slice(0, socialCard.file.lastIndexOf('.'))}-`;

/**
 * The largest file that the worker precaches.
 *
 * A precache entry is fetched during the install of the worker, so a very
 * large file would hold the install open and fill the storage of the device
 * for an asset that few people open.
 */
export const maximumPrecachedBytes = 8 * 1024 * 1024;

/** The compiled worker of one build. */
export type BuiltWorker = {
  /** The classic script that the browser installs. */
  readonly code: string;
  /** The source map of that script, or null when none was produced. */
  readonly map: string | null;
};

/** One file of a finished build, as the rules below read it. */
export type BuiltFile = {
  /** The served address, from the root of the scope. */
  readonly url: string;
  /** The count of bytes of the file. */
  readonly size: number;
  /** A digest of the bytes of the file. */
  readonly digest: string;
};

/** The precache of one build. */
export type Precache = {
  /** Every address the worker fetches during its install, in order. */
  readonly urls: readonly string[];
  /** The name of the cache that holds them. */
  readonly cacheName: string;
  /** The addresses that the size cap left out. */
  readonly oversize: readonly string[];
};

/**
 * Whether the worker precaches one file at all.
 *
 * The worker is left out of its own precache. It is served with no-cache and
 * the browser fetches it again on every load, so an entry for it would only
 * store the body of the worker that is already running.
 */
function isPrecached(file: BuiltFile): boolean {
  if (file.url === `/${workerFileName}`) return false;
  if (file.url.startsWith(excludedPrefix)) return false;
  // Only a crawler reads the card of a link preview (design 028).
  if (file.url.startsWith(socialCardPrefix)) return false;
  return isAssetPath(file.url);
}

/**
 * The precache of one build.
 *
 * The addresses are sorted, so two builds of the same files produce the same
 * list and the same stamp whatever order the file system reports.
 */
export function derivePrecache(files: readonly BuiltFile[]): Precache {
  const chosen = files
    .filter((file) => isPrecached(file))
    .sort((left, right) => (left.url < right.url ? -1 : 1));
  const kept = chosen.filter((file) => file.size <= maximumPrecachedBytes);
  const stamp = createHash('sha256')
    .update(kept.map((file) => `${file.url} ${file.digest}`).join('\n'))
    .digest('hex')
    .slice(0, 16);
  return {
    urls: kept.map((file) => file.url),
    cacheName: `${appCachePrefix}${stamp}`,
    oversize: chosen
      .filter((file) => file.size > maximumPrecachedBytes)
      .map((file) => file.url),
  };
}

/** The bytes of one emitted chunk or asset. */
function bytesOf(source: string | Uint8Array): Uint8Array {
  return typeof source === 'string' ? Buffer.from(source, 'utf8') : source;
}

/** One built file, from its address and its bytes. */
function builtFile(url: string, bytes: Uint8Array): BuiltFile {
  return {
    url,
    size: bytes.byteLength,
    digest: createHash('sha256').update(bytes).digest('hex'),
  };
}

/**
 * One entry of a finished bundle, as this module reads it.
 *
 * A chunk carries its code and an asset carries its source. The shape holds
 * the two fields that name the bytes and nothing else, so the reader below
 * needs no claim about the wider type of the bundler.
 */
export type BundleEntry = {
  readonly type: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
};

/**
 * Every file that a finished bundle holds.
 *
 * The bundle is the list that Rollup emits, so it needs no directory walk and
 * it holds the bytes that were just built. It does not hold the public
 * directory, which Vite copies into the output on its own; `directoryFiles`
 * reads that directory instead.
 */
export function bundleFiles(
  bundle: Readonly<Record<string, BundleEntry>>,
): readonly BuiltFile[] {
  const files: BuiltFile[] = [];
  for (const [name, item] of Object.entries(bundle)) {
    const source = item.code ?? item.source;
    if (source !== undefined)
      files.push(builtFile(`/${name}`, bytesOf(source)));
  }
  return files;
}

/**
 * Every file of one directory, with an address from the root of that
 * directory.
 *
 * The plugin reads the public directory with it, because Vite copies that
 * directory into the output and those files never pass through the bundle. A
 * missing directory answers an empty list, so a build without a public
 * directory precaches the bundle only.
 */
export async function directoryFiles(
  directory: string,
): Promise<readonly BuiltFile[]> {
  let entries;
  try {
    entries = await readdir(directory, {
      recursive: true,
      withFileTypes: true,
    });
  } catch {
    return [];
  }
  const files: BuiltFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = resolve(entry.parentPath, entry.name);
    const url = `/${relative(directory, full).split(sep).join('/')}`;
    files.push(builtFile(url, await readFile(full)));
  }
  return files;
}

/**
 * Compiles the worker into one classic script.
 *
 * The page registers the worker with no module type, so the browser loads it
 * as a classic script and an `import` statement inside it would fail at once.
 * The nested build therefore asks for one self-contained script in the `iife`
 * format, and it refuses any result that is not exactly one script.
 *
 * The precache and the cache name arrive as two build constants, which the
 * worker declares and reads. The check below proves that both were written,
 * because an unwritten constant would only fail in the browser.
 *
 * The map is emitted next to the script with no comment that names it, the
 * way the main build emits its own maps: nothing that a browser loads asks
 * for it, and an operator who keeps the build can still read a stack.
 *
 * The nested build sets `configFile: false`, so it never loads the
 * configuration of the application again and cannot recurse.
 */
export async function buildWorker(
  directory: string,
  precache: Precache,
): Promise<BuiltWorker> {
  const result = await build({
    configFile: false,
    root: directory,
    logLevel: 'warn',
    define: {
      __NOTESAPP_PRECACHE__: JSON.stringify(precache.urls),
      __NOTESAPP_APP_CACHE__: JSON.stringify(precache.cacheName),
    },
    build: {
      write: false,
      target: 'es2024',
      minify: true,
      sourcemap: 'hidden',
      rollupOptions: {
        input: resolve(directory, workerEntry),
        output: { format: 'iife' },
      },
    },
  });
  const chunks = (Array.isArray(result) ? result : [result])
    .flatMap((one) => ('output' in one ? one.output : []))
    .filter((item) => item.type === 'chunk');
  const first = chunks[0];
  if (chunks.length !== 1 || first === undefined)
    throw new Error('The worker must build to exactly one classic script.');
  const code = first.code;
  if (code.includes('__NOTESAPP_PRECACHE__'))
    throw new Error('The worker did not receive the addresses of this build.');
  if (!code.includes(precache.cacheName))
    throw new Error('The worker did not receive the name of its cache.');
  const map = first.map;
  return {
    code,
    map: map === null || map === undefined ? null : map.toString(),
  };
}

/**
 * Writes the precache of this build into the worker and emits it.
 *
 * The hook runs after every other `generateBundle` hook, so the bundle it
 * reads is the whole output: the shell document, the chunks, the styles, the
 * fonts, the application manifest, and the diagram frame. The worker is
 * emitted as an asset of the same build, so Vite writes it into the output
 * directory before `tools/precompress-assets.mjs` runs.
 */
export function precacheWorker(): Plugin {
  let root = '';
  let publicDirectory = '';
  return {
    name: 'notesapp-precache-worker',
    apply: 'build',
    configResolved(config): void {
      root = config.root;
      publicDirectory = config.publicDir;
    },
    generateBundle: {
      order: 'post',
      async handler(_options, bundle): Promise<void> {
        const precache = derivePrecache([
          ...bundleFiles(bundle),
          ...(await directoryFiles(publicDirectory)),
        ]);
        for (const url of precache.oversize)
          this.warn(`${url} is too large to precache.`);
        const worker = await buildWorker(root, precache);
        this.emitFile({
          type: 'asset',
          fileName: workerFileName,
          source: worker.code,
        });
        if (worker.map !== null)
          this.emitFile({
            type: 'asset',
            fileName: `${workerFileName}.map`,
            source: worker.map,
          });
      },
    },
  };
}
