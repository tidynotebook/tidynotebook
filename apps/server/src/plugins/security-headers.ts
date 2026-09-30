/**
 * The security headers of every answer.
 *
 * One hook writes the same base set on every response, so a route cannot
 * forget them and a new route gets them for free. The base policy is the
 * strictest one that works for a data answer: it permits nothing at all. The
 * static handler replaces the content policy for the two document kinds that
 * this deployment serves, because a document does need to load its own
 * scripts, styles and images.
 */
import { createHash } from 'node:crypto';

/** One header name and its value. */
export type HeaderPair = readonly [string, string];

/**
 * Content policy of an answer that is not a document.
 *
 * An API answer, an attachment and a problem answer load nothing, so nothing
 * is permitted. `frame-ancestors 'none'` also stops an attachment from being
 * framed by another page, which is what makes a stored file harmless when a
 * browser decides to render it.
 */
export const dataContentPolicy = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Content policy of the application shell.
 *
 * Scripts are same-origin files plus the exact inline scripts of the served
 * document, named by their hash. There is no `'unsafe-inline'` for scripts,
 * so an injected `<script>` cannot run even if one reaches the document.
 *
 * Styles keep `'unsafe-inline'`. The shell sets a few presentation values
 * from TypeScript for the editor adapter, and a style nonce cannot reach
 * those. An inline style cannot execute code, so this is a much smaller
 * allowance than an inline script.
 *
 * Images add `blob:` and `data:`, because an attachment is fetched as bytes
 * and shown through `URL.createObjectURL`, and `https:`, because decision 0067
 * loads a picture that a note names by address. The renderer emits no other
 * scheme on an image source, so the two lists state one rule.
 */
export function appShellContentPolicy(scriptHashes: readonly string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self'${scriptHashes.map((hash) => ` '${hash}'`).join('')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    // The diagram preview is a same-origin document in a sandboxed frame.
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Content policy of a document that the shell frames.
 *
 * The diagram preview is the only one. It is loaded with `sandbox`
 * `allow-scripts` and no `allow-same-origin`, so it already runs in an opaque
 * origin with no access to application storage or to the parent document.
 * Its renderer is a self-contained bundle whose entry stays inline, so this
 * policy keeps `'unsafe-inline'` for scripts and applies to that path only.
 * The shell policy above never has it.
 */
export const framedDocumentContentPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  // Only the application shell may frame it.
  "frame-ancestors 'self'",
].join('; ');

/**
 * Content policy of the published page of a read-only link.
 *
 * The page is a document that the server builds for a person with no account,
 * so it is the strictest document policy of this deployment. It permits
 * nothing by default and then names the four things the page needs: the built
 * application stylesheet, the pictures of the notes in its own scope and the
 * pictures they name over HTTPS (decision 0067), the fonts of that
 * stylesheet, and the address that its password form sends to.
 *
 * `script-src 'none'` is the rule of decision 0031. The page holds no script,
 * so an injected one cannot run even if a later change let one through the
 * sanitizer. `style-src` has no `'unsafe-inline'`, so a `<style>` element
 * cannot apply. `style-src-attr` allows a `style` attribute, because KaTeX
 * places each row and each script of a formula with one (decision 0140). The
 * math sanitizer of `@notesapp/markdown` is the one producer of such an
 * attribute, and it keeps a numeric size, `position: relative` and the error
 * red only. A browser that does not know `style-src-attr` falls back to
 * `style-src`.
 *
 * `frame-ancestors 'none'` denies framing, so no other page can put a
 * published note inside itself and read the address around it.
 */
export const publishedDocumentContentPolicy = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' https:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  // The password form sends to this origin and to no other one.
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Headers that belong to the published page and to no other answer.
 *
 * Three rules of decision 0030, 0046 and 0047 meet on this one answer.
 *
 * - The address is the credential, so the page sends `no-referrer`. A reader
 *   that follows an external link out of a published note names no origin and
 *   no address to the site it reaches. The base policy of this file is
 *   `strict-origin-when-cross-origin`, which would name the origin.
 * - The link opens nothing the moment the owner revokes it, and a stored copy
 *   would outlive that. `no-store` therefore forbids every cache, and
 *   `private` names the one reader that the answer belongs to, so no shared
 *   cache keeps a note behind a secret address.
 * - A published address that a person pastes in public must not become a
 *   search result, so the page asks a crawler to keep it out of an index.
 */
export const publishedDocumentHeaders: readonly HeaderPair[] = [
  ['content-security-policy', publishedDocumentContentPolicy],
  ['cache-control', 'private, no-store'],
  ['referrer-policy', 'no-referrer'],
  ['x-robots-tag', 'noindex, nofollow'],
];

/**
 * Content policy of the installed application worker script.
 *
 * A browser enforces the content policy of the service worker script response
 * on the worker itself. The worker reads its precache manifest, then serves
 * navigations, assets and pinned bytes from its own origin, so it must reach
 * that origin. The base policy permits nothing and would fail its install.
 */
export const serviceWorkerContentPolicy = [
  "default-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Capabilities that the application never uses.
 *
 * The list is short on purpose: it names the device and payment capabilities
 * that a notes application has no reason to reach, and leaves everything else
 * to the browser default.
 */
const permissionsPolicy = [
  'accelerometer=()',
  'camera=()',
  'display-capture=()',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'payment=()',
  'usb=()',
].join(', ');

/** One year, the value that a preload list expects. */
const hstsMaxAgeSeconds = 31536000;

/**
 * The headers that every answer carries.
 *
 * HSTS is written only when the configured origin is HTTPS. A deployment that
 * is reached over plain HTTP would lock itself out of its own address.
 */
export function baseSecurityHeaders(origin: string): readonly HeaderPair[] {
  const headers: HeaderPair[] = [
    ['content-security-policy', dataContentPolicy],
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'DENY'],
    ['referrer-policy', 'strict-origin-when-cross-origin'],
    ['permissions-policy', permissionsPolicy],
    ['cross-origin-resource-policy', 'same-origin'],
    ['cross-origin-opener-policy', 'same-origin'],
  ];
  if (origin.startsWith('https://'))
    headers.push([
      'strict-transport-security',
      `max-age=${String(hstsMaxAgeSeconds)}; includeSubDomains`,
    ]);
  return headers;
}

/** Matches one `<script>` element and captures its attributes and body. */
const scriptElement = /<script([^>]*)>([\s\S]*?)<\/script\s*>/gi;

/** Whether a `<script>` attribute list names an external file. */
function hasSource(attributes: string): boolean {
  return /\ssrc\s*=/i.test(attributes);
}

/**
 * The CSP source expressions of the inline scripts of one HTML document.
 *
 * The hash is computed from the served bytes, so the policy follows the build
 * with no hard-coded value anywhere. A document whose inline scripts change
 * gets a new policy the moment its file changes.
 */
export function inlineScriptHashes(html: string): readonly string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(scriptElement)) {
    const attributes = match[1] ?? '';
    const body = match[2] ?? '';
    if (hasSource(attributes) || body.trim() === '') continue;
    const digest = createHash('sha256').update(body, 'utf8').digest('base64');
    const source = `sha256-${digest}`;
    if (!hashes.includes(source)) hashes.push(source);
  }
  return hashes;
}
