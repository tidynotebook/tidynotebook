/**
 * Delivery of the built browser assets.
 *
 * The application serves its own front end, so caching, compression and the
 * document security policy belong here rather than to a reverse proxy that a
 * self-hosted installation may not have.
 *
 * Three rules decide every answer:
 *
 *   * A hashed file never changes under its name, so it is cached for a year
 *     and marked immutable. Everything else is revalidated on every load.
 *   * A precompressed neighbour is served when the caller accepts its
 *     encoding. The build writes `.br` and `.gz` next to each compressible
 *     file, so nothing is compressed per request.
 *   * A document gets the content policy of its kind, and the installed
 *     application worker gets a policy that lets it reach its own origin.
 *     Everything else keeps the base policy of `security-headers.ts`.
 *
 * A fourth rule decides what an address with no file behind it receives. The
 * web application is one document with a router on the device, so an address
 * that names a page of that router still gets the shell. An address that names
 * a file does not. See `servesApplicationShell`.
 *
 * A fifth rule runs before all four: an address that the server answers by
 * itself holds no file of the build and no page of the router, so it reaches
 * neither. See `servesBrowserAssets`.
 */
import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, readFileSync, statSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { basename, join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  appShellContentPolicy,
  framedDocumentContentPolicy,
  inlineScriptHashes,
  serviceWorkerContentPolicy,
} from './security-headers.ts';

/** MIME content type mapping for web assets. */
export function mimeTypeFor(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs'))
    return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.webmanifest'))
    return 'application/manifest+json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.ico')) return 'image/x-icon';
  if (filePath.endsWith('.woff')) return 'font/woff';
  if (filePath.endsWith('.woff2')) return 'font/woff2';
  // The mathematics faces of the build ship as TrueType beside their web font
  // forms, and about twenty of them went out as a stream of bytes. A browser
  // renders them all the same, because font loading does not read the type,
  // but a caller that does read it was told nothing true.
  if (filePath.endsWith('.ttf')) return 'font/ttf';
  if (filePath.endsWith('.otf')) return 'font/otf';
  // Source maps are not served (decision 0013), so no `.map` type is mapped.
  return 'application/octet-stream';
}

/**
 * Whether one address with no file behind it receives the application shell.
 *
 * The router of the application lives on the device, so the server holds no
 * list of its pages. An address that names no file and no operation is
 * therefore still a page, and it gets the shell so that the router can read
 * it. An address that names a file is not a page: the caller asked for a
 * script, a style, a font, or an image, and the shell is the wrong kind of
 * bytes. Every answer carries `nosniff`, so a shell that arrives in place of a
 * script is refused by the browser, and the page then reports a module that
 * cannot load instead of the file that is missing. Such an address gets 404.
 *
 * The address is the one input. The name of the last segment is the only thing
 * about a request that no hop can change, so the rule holds for a browser, for
 * an installed worker that asks again on behalf of a page, and for a command
 * line caller.
 *
 * `Sec-Fetch-Dest` is not the key, although it states what the caller will do
 * with the bytes. It names the immediate caller, and the installed worker of
 * this application is a legitimate immediate caller: a navigation that the
 * worker fetches again arrives with `Sec-Fetch-Dest: empty`, and a rule that
 * read that header refused the page of the person. The `/assets/` prefix is not
 * the key either, because it names the output directory of one build tool and
 * misses `/service-worker.js`, `/manifest.webmanifest`, and the icons.
 */
export function servesApplicationShell(path: string): boolean {
  const lastSegment = path.slice(path.lastIndexOf('/') + 1);
  return !/\.[A-Za-z0-9]+$/.test(lastSegment);
}

/**
 * The first segment of every address that the server answers by itself.
 *
 * One list, because one rule reads it: an address under one of these names is
 * never a file of the build and never a page of the router on the device, so
 * the built assets answer none of them. Two of the three are the API and the
 * discovery path of the identity library. The third is the reader boundary of
 * a published link, which decision 0047 gives one document and one refusal. A
 * reader that opens a mangled address must read that document or that refusal,
 * and never the application, which asks a person with no account to sign in.
 */
const serverBoundaries = [
  '/api',
  '/.well-known',
  '/published',
  '/mcp',
] as const;

/**
 * Whether the built browser assets answer this address at all.
 *
 * The check runs before the file lookup and before `servesApplicationShell`,
 * so an address that the server owns reaches neither of them.
 */
export function servesBrowserAssets(path: string): boolean {
  return !serverBoundaries.some(
    (boundary) => path === boundary || path.startsWith(`${boundary}/`),
  );
}

/** A content encoding that the build can prepare in advance. */
export type StaticEncoding = 'br' | 'gzip';

/** The file name suffix of one prepared encoding. */
export const encodingSuffix: Readonly<Record<StaticEncoding, string>> = {
  br: '.br',
  gzip: '.gz',
};

/**
 * The encodings that one `Accept-Encoding` header permits.
 *
 * A `q=0` weight is a refusal, so it is honoured. Order of preference is the
 * server's own: Brotli first, because the build spends its time there.
 */
export function acceptedEncodings(
  header: string | undefined,
): readonly StaticEncoding[] {
  if (header === undefined || header.trim() === '') return [];
  const permitted = new Set<string>();
  for (const part of header.split(',')) {
    const [rawName, ...parameters] = part.split(';');
    const name = (rawName ?? '').trim().toLowerCase();
    if (name === '') continue;
    const weight = parameters
      .map((parameter) => parameter.trim().toLowerCase())
      .find((parameter) => parameter.startsWith('q='));
    if (weight !== undefined && Number(weight.slice(2)) === 0) continue;
    permitted.add(name);
  }
  const order: StaticEncoding[] = ['br', 'gzip'];
  return order.filter(
    (encoding) => permitted.has(encoding) || permitted.has('*'),
  );
}

/**
 * The length of the hash that the bundler writes into an emitted name.
 *
 * Rollup, and Vite above it, write eight characters. The build asserts the
 * same length over its own output, so a release that changes it fails the
 * gate instead of quietly serving every asset as revalidated.
 */
export const assetHashLength = 8;

/** The characters that the bundler draws a hash from. */
const assetHashCharacters = /^[A-Za-z0-9_-]+$/;

/**
 * Whether a built file carries a content hash in its name.
 *
 * Vite writes `name-<hash>.ext` for every emitted chunk and asset, so the
 * name changes whenever the bytes change. Such a file can be cached for as
 * long as the browser likes.
 *
 * The rule reads that construction and nothing looser: the hash is the last
 * `assetHashLength` characters before the extension, and a hyphen stands
 * directly in front of them. A hyphen inside the hash is therefore read
 * correctly, which six of the vendored mathematics faces need.
 *
 * A rule that accepted any hyphen followed by eight or more characters read a
 * hash where the build wrote none. `apple-touch-icon.png` passed on the
 * strength of `touch-icon`, and every vendored Geist face passed on the
 * strength of `latin-ext`. Each of those keeps one address across every
 * deployment, so a browser that read one pinned those bytes for a year and
 * never asked for the file again. An installed icon on an iPhone stayed at the
 * drawing of the deployment that first served it. Every icon now carries a
 * hash of its own (decision 0074), and `tests/integration/web-build.test.ts`
 * reads the real build to hold the two sides together.
 */
export function isHashedAssetName(filePath: string): boolean {
  const name = basename(filePath);
  const dot = name.lastIndexOf('.');
  if (dot === -1) return false;
  const stem = name.slice(0, dot);
  if (stem.length <= assetHashLength) return false;
  if (stem[stem.length - assetHashLength - 1] !== '-') return false;
  return assetHashCharacters.test(stem.slice(-assetHashLength));
}

/** Names that must be revalidated on every load, whatever their extension. */
const alwaysRevalidated = new Set([
  'index.html',
  'service-worker.js',
  'manifest.webmanifest',
]);

/** The cache directive of one built file. */
export function cacheControlFor(filePath: string): string {
  const name = basename(filePath);
  if (alwaysRevalidated.has(name) || name.endsWith('.html')) return 'no-cache';
  return isHashedAssetName(filePath)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}

/**
 * The entity tag of one representation.
 *
 * It is derived from the size and the modification time of the file that
 * holds the bytes, so a rebuild always produces a new tag and two encodings
 * of the same file never share one.
 */
export function entityTag(stats: Stats): string {
  const digest = createHash('sha256')
    .update(`${String(stats.size)}:${String(stats.mtimeMs)}`)
    .digest('base64url')
    .slice(0, 27);
  return `"${digest}"`;
}

/** Whether an `If-None-Match` header names the tag of the answer. */
export function matchesEntityTag(
  header: string | undefined,
  tag: string,
): boolean {
  if (header === undefined) return false;
  if (header.trim() === '*') return true;
  return header
    .split(',')
    .map((candidate) => candidate.trim().replace(/^W\//, ''))
    .includes(tag);
}

/** One HTML document, its content policy, and the file time it was read at. */
type DocumentPolicy = { readonly policy: string; readonly mtimeMs: number };

/**
 * Content policies of the documents that have been served.
 *
 * Building one means reading the file and hashing its inline scripts, so the
 * result is kept until the file changes.
 */
const documentPolicies = new Map<string, DocumentPolicy>();

/**
 * The content policy of one HTML document.
 *
 * `index.html` is the application shell. Every other document of the build is
 * a framed one; the diagram preview is the only such document today.
 */
export function documentContentPolicy(
  filePath: string,
  relativePath: string,
  stats: Stats,
): string {
  const cached = documentPolicies.get(filePath);
  if (cached !== undefined && cached.mtimeMs === stats.mtimeMs)
    return cached.policy;
  const policy =
    relativePath === 'index.html'
      ? appShellContentPolicy(
          inlineScriptHashes(readFileSync(filePath, 'utf8')),
        )
      : framedDocumentContentPolicy;
  documentPolicies.set(filePath, { policy, mtimeMs: stats.mtimeMs });
  return policy;
}

/** The stylesheets of one built document, and the file time they were read at. */
type DocumentStylesheets = {
  readonly hrefs: readonly string[];
  readonly mtimeMs: number;
};

/**
 * Stylesheet addresses of the documents that have been read.
 *
 * Reading one means reading the file, so the answer is kept until the file
 * changes, exactly as a content policy is above.
 */
const documentStylesheets = new Map<string, DocumentStylesheets>();

/** Matches one `<link>` element of a document. */
const linkElement = /<link\b[^>]*>/gi;

/** Reads one attribute of an element, or `null`. */
function attributeOf(element: string, name: string): string | null {
  const found = new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*')`, 'i').exec(
    element,
  );
  const quoted = found?.[1];
  return quoted === undefined ? null : quoted.slice(1, -1);
}

/**
 * The stylesheet addresses that one built HTML document loads.
 *
 * The published page of decision 0031 uses the built stylesheet of the
 * application, so that the page cannot drift from the theme. The build writes
 * that address into the shell document under a hashed name, and this function
 * reads it from the artefact that the server already serves, rather than from
 * a second build output that would describe the same fact.
 *
 * Only a same-origin address is answered. A document of this build names no
 * other one, and a page that this server writes must never load a stylesheet
 * from somewhere else.
 *
 * The answer holds every stylesheet that the document names, in order. The
 * build emits one today, and a build that emitted a second would show it here
 * rather than lose it.
 */
export function documentStylesheetHrefs(
  filePath: string,
  stats: Stats,
): readonly string[] {
  const cached = documentStylesheets.get(filePath);
  if (cached !== undefined && cached.mtimeMs === stats.mtimeMs)
    return cached.hrefs;
  const hrefs = stylesheetHrefs(readFileSync(filePath, 'utf8'));
  documentStylesheets.set(filePath, { hrefs, mtimeMs: stats.mtimeMs });
  return hrefs;
}

/**
 * Every stylesheet that the build emitted, in name order.
 *
 * The published page of decision 0031 holds no script, so it cannot load a
 * stylesheet when it finds that it needs one. The application can and does:
 * `apps/web/src/lib/markdown.ts` imports the mathematics style with the
 * module that renders a formula, so the build writes that style as a file of
 * its own that the shell document does not name. Mathematics on a published
 * page therefore had no style at all.
 *
 * The page takes every emitted stylesheet. It renders the whole Markdown
 * language of this product, so it needs the whole style of that language, and
 * the first load of the application is untouched, which is what record 0044
 * protects. See
 * [decision 0060](../../../../docs/decisions/0060-the-published-page-takes-every-style.md).
 */
export function builtStylesheetHrefs(
  assetsDirectory: string,
): readonly string[] {
  let names: readonly string[];
  try {
    names = readdirSync(assetsDirectory);
  } catch {
    // A deployment that serves no built assets, which is what a development
    // run and most tests are, answers no stylesheet. The page is still
    // readable text.
    return [];
  }
  return names
    .filter((name) => name.endsWith('.css'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => `/assets/${name}`);
}

/**
 * The name of the one script of a published page, with its hash.
 *
 * `publishedDiagramScript` in `apps/web/vite.config.ts` writes the file under
 * this name (record 0158), and `tests/integration/web-build.test.ts` holds the
 * two together.
 */
export const publishedPageScriptFile = /^published-page-[A-Za-z0-9_-]{8}\.js$/;

/**
 * The address of the diagram frame document of the build.
 *
 * The editor and the published page load the same frame. Its address is
 * `diagramFramePath` of `apps/web/src/diagram/frame.ts`, which the server
 * cannot import, so `tests/integration/web-build.test.ts` holds this copy to
 * the built script that names it.
 */
export const publishedDiagramFrameHref = '/src/diagram/frame.html';

/**
 * The address of the one script of a published page, or `null`.
 *
 * The build writes one such file. A deployment that serves no built assets,
 * or a build with no frame document, answers `null`, and a published page
 * then shows the source of each diagram as a code block.
 *
 * @param webDirectory the built web directory, which holds `assets/` and the
 *   frame document.
 */
export function publishedPageScriptHref(webDirectory: string): string | null {
  if (statFile(join(webDirectory, publishedDiagramFrameHref)) === null)
    return null;
  let names: readonly string[];
  try {
    names = readdirSync(join(webDirectory, 'assets'));
  } catch {
    return null;
  }
  const found = names.filter((name) => publishedPageScriptFile.test(name));
  // Two files of one name would leave the choice of script to chance, so a
  // build that holds them answers none and the page stays readable.
  return found.length === 1 ? `/assets/${found[0] ?? ''}` : null;
}

/** The same-origin stylesheet addresses of one HTML document. */
export function stylesheetHrefs(html: string): readonly string[] {
  const hrefs: string[] = [];
  for (const element of html.match(linkElement) ?? []) {
    const relation = (attributeOf(element, 'rel') ?? '').toLowerCase();
    if (!relation.split(/\s+/).includes('stylesheet')) continue;
    const href = attributeOf(element, 'href');
    // A protocol relative address and an absolute one both name another
    // origin, and a relative one would resolve against the published address.
    if (href === null || !href.startsWith('/') || href.startsWith('//'))
      continue;
    if (!hrefs.includes(href)) hrefs.push(href);
  }
  return hrefs;
}

/** What `sendStaticFile` needs about the file it is asked to send. */
export type StaticFileRequest = {
  /** Absolute path of the identity representation. */
  readonly filePath: string;
  /** Path of the same file inside the built directory, with `/` separators. */
  readonly relativePath: string;
};

/**
 * Answers one request for a built file.
 *
 * The reply is returned rather than awaited, so the caller can return it from
 * a Fastify handler in the usual way.
 */
export function sendStaticFile(
  request: FastifyRequest,
  reply: FastifyReply,
  target: StaticFileRequest,
): FastifyReply {
  const contentType = mimeTypeFor(target.filePath);
  const identity = statSync(target.filePath);

  let bodyPath = target.filePath;
  let bodyStats = identity;
  let encoding: StaticEncoding | null = null;
  for (const candidate of acceptedEncodings(
    typeof request.headers['accept-encoding'] === 'string'
      ? request.headers['accept-encoding']
      : undefined,
  )) {
    const variant = `${target.filePath}${encodingSuffix[candidate]}`;
    const stats = statFile(variant);
    // A stale variant is ignored. The build writes it after the file it
    // compresses, so an older one cannot describe the current bytes.
    if (stats === null || stats.mtimeMs < identity.mtimeMs) continue;
    bodyPath = variant;
    bodyStats = stats;
    encoding = candidate;
    break;
  }

  const tag = entityTag(bodyStats);
  reply
    .header('content-type', contentType)
    .header('cache-control', cacheControlFor(target.filePath))
    .header('etag', tag)
    .header('vary', 'Accept-Encoding');
  if (encoding !== null) reply.header('content-encoding', encoding);
  if (contentType.startsWith('text/html'))
    reply.header(
      'content-security-policy',
      documentContentPolicy(target.filePath, target.relativePath, identity),
    );
  if (basename(target.filePath) === 'service-worker.js')
    reply.header('content-security-policy', serviceWorkerContentPolicy);
  if (
    target.relativePath !== 'index.html' &&
    contentType.startsWith('text/html')
  )
    reply.header('x-frame-options', 'SAMEORIGIN');

  if (matchesEntityTag(request.headers['if-none-match'], tag))
    return reply.status(304).send();
  return reply
    .status(200)
    .header('content-length', String(bodyStats.size))
    .send(createReadStream(bodyPath));
}

/** One prepared representation of the application shell. */
type ShellRepresentation = {
  readonly bytes: Buffer;
  readonly tag: string;
};

/**
 * The application shell of one start, with every part of its answer.
 *
 * The built shell holds the placeholder of the link preview, and the block
 * names the canonical origin of the configuration (design 028). The start
 * fills it once and keeps the bytes in memory, so the image file system can
 * stay read only. The precompressed neighbours of the build hold the
 * placeholder, so the start compresses the filled bytes again, and each
 * representation gets an entity tag from a digest of its own bytes.
 */
export type ApplicationShell = {
  readonly identity: ShellRepresentation;
  readonly encoded: Readonly<Record<StaticEncoding, ShellRepresentation>>;
  /** The content policy, from the inline scripts of the filled shell. */
  readonly policy: string;
};

/** The failure of a start whose built shell cannot carry the preview. */
export class ApplicationShellError extends Error {
  constructor(detail: string) {
    super(`notesapp: the built application shell ${detail}`);
    this.name = 'ApplicationShellError';
  }
}

/** One representation and the tag of its bytes. */
function shellRepresentation(bytes: Buffer): ShellRepresentation {
  const digest = createHash('sha256')
    .update(bytes)
    .digest('base64url')
    .slice(0, 27);
  return { bytes, tag: `"${digest}"` };
}

/**
 * Fills the placeholder of the built shell and prepares each encoding.
 *
 * The block must replace exactly one placeholder. A shell with two came from
 * a broken build, and the start refuses it rather than serve two previews.
 */
export function prepareApplicationShell(
  html: string,
  placeholder: string,
  block: string,
): ApplicationShell {
  const parts = html.split(placeholder);
  if (parts.length !== 2)
    throw new ApplicationShellError(
      `holds ${String(parts.length - 1)} link preview placeholders, and it must hold one. Build the web application again.`,
    );
  const filled = parts.join(block);
  const identity = Buffer.from(filled, 'utf8');
  return {
    identity: shellRepresentation(identity),
    encoded: {
      br: shellRepresentation(
        brotliCompressSync(identity, {
          params: {
            [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
            [constants.BROTLI_PARAM_SIZE_HINT]: identity.byteLength,
          },
        }),
      ),
      gzip: shellRepresentation(gzipSync(identity, { level: 9 })),
    },
    policy: appShellContentPolicy(inlineScriptHashes(filled)),
  };
}

/**
 * Answers one request for the application shell from memory.
 *
 * The headers are those that `sendStaticFile` writes for `index.html`.
 */
export function sendApplicationShell(
  request: FastifyRequest,
  reply: FastifyReply,
  shell: ApplicationShell,
): FastifyReply {
  const encoding =
    acceptedEncodings(
      typeof request.headers['accept-encoding'] === 'string'
        ? request.headers['accept-encoding']
        : undefined,
    )[0] ?? null;
  const body = encoding === null ? shell.identity : shell.encoded[encoding];
  reply
    .header('content-type', mimeTypeFor('index.html'))
    .header('cache-control', cacheControlFor('index.html'))
    .header('etag', body.tag)
    .header('vary', 'Accept-Encoding')
    .header('content-security-policy', shell.policy);
  if (encoding !== null) reply.header('content-encoding', encoding);
  if (matchesEntityTag(request.headers['if-none-match'], body.tag))
    return reply.status(304).send();
  return reply
    .status(200)
    .header('content-length', String(body.bytes.byteLength))
    .send(body.bytes);
}

/** The stats of a file, or null when it is missing or is not a file. */
export function statFile(filePath: string): Stats | null {
  try {
    const stats = statSync(filePath);
    return stats.isFile() ? stats : null;
  } catch {
    return null;
  }
}
