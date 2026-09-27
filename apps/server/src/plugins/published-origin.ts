/**
 * What the published origin serves, and where a reader address goes.
 *
 * Record 0118 gives a public installation a second origin for published
 * pages, so a block list that names a page of a stranger never blocks the
 * application. That origin serves the reader path of a link, its attachments
 * and its report page (record 0119), and the stylesheet and font files that
 * the page names (record 0123). It serves no other operation, no cookie, and
 * no application shell. The application origin answers a reader address with
 * a temporary redirect, because a browser keeps a permanent one forever and
 * an operator can move the published origin later.
 *
 * `app.ts` runs these rules in one request hook. They are pure, so a unit
 * test states every case.
 */

/** The operations of the reader path, which the published origin serves. */
export const publishedOriginOperations: ReadonlySet<string> = new Set([
  'getPublishedPage',
  'openPublishedPage',
  'unlockPublishedLink',
  'getPublishedAttachment',
  'getReportPage',
  'reportPublishedLink',
]);

/** One built stylesheet or font file, by the name that the build gives it. */
const pageFile = /^\/assets\/[A-Za-z0-9._-]+\.(?:css|woff2)$/;

/**
 * Whether the published origin serves the built file at one path.
 *
 * Only a stylesheet or a font under `/assets/` qualifies, because the page of
 * a link names those and nothing else of the build. A script never does.
 */
export function publishedOriginServesFile(path: string): boolean {
  return pageFile.test(path) && !path.includes('..');
}

/** What the gate does with one request. */
export type PublishedOriginDecision =
  | { readonly kind: 'serve' }
  | { readonly kind: 'refuse' }
  | { readonly kind: 'redirect'; readonly location: string };

/**
 * Decides one request by the role of the origin that it names.
 *
 * @param role the role of the requested host.
 * @param published the published origin, or `null` when there is none.
 * @param request the operation of the route, if any, the method and the
 *   address of the request, with its query.
 */
export function publishedOriginDecision(
  role: 'application' | 'published' | null,
  published: string | null,
  request: {
    readonly operationId: string | undefined;
    readonly method: string;
    readonly url: string;
  },
): PublishedOriginDecision {
  const reader =
    request.operationId !== undefined &&
    publishedOriginOperations.has(request.operationId);
  if (role === 'published') {
    if (reader) return { kind: 'serve' };
    const path = request.url.split('?')[0] ?? '';
    const read = request.method === 'GET' || request.method === 'HEAD';
    if (
      read &&
      request.operationId === undefined &&
      publishedOriginServesFile(path)
    )
      return { kind: 'serve' };
    return { kind: 'refuse' };
  }
  if (reader && published !== null)
    return { kind: 'redirect', location: `${published}${request.url}` };
  return { kind: 'serve' };
}
