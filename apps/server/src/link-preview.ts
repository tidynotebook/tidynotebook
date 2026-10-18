/**
 * The one link preview of every address of the installation (design 028).
 *
 * A chat service that reads a shared address shows the tags of its answer.
 * A private address of the application names a workspace and a note, and a
 * published address is itself a credential, so the preview must hold none of
 * them. The block below is therefore the same bytes for every request of one
 * configuration: the product, a fixed description, the root of the canonical
 * origin, and one fixed card. It reads no request, no note, no account and no
 * Host header, and it fetches nothing.
 *
 * The application shell and every view of the published page write this one
 * block, so the two cannot drift.
 *
 * The promise covers the metadata only. A crawler that holds the address of
 * an open published note gets the page, and the page holds the text of the
 * note.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { productName } from '@notesapp/core';
import { escapeAttribute } from './routes/published-document.ts';

/** The fixed description of the product, which every preview shows. */
export const linkPreviewDescription =
  'Markdown notes that work offline. Every saved version stays in history.';

/** The words of the card, for a reader that cannot see it. */
export const linkPreviewImageAlt = `${productName}: Markdown notes that work offline`;

/** The pixel size of the card that the build emits. */
export const linkPreviewImageSize = { width: 1200, height: 630 } as const;

/**
 * The name of the card that the build emits, with its hash.
 *
 * `apps/web/src/pwa/icons.ts` emits the file under a name that follows its
 * bytes (decision 0074), and `tests/integration/web-build.test.ts` holds the
 * two together.
 */
export const linkPreviewCardFile = /^social-card-[A-Za-z0-9_-]{8}\.png$/;

/**
 * The placeholder of the shell document that the block replaces at start.
 *
 * It is a comment, so a shell that a server never filled shows nothing.
 */
export const linkPreviewPlaceholder = '<!-- __NOTESAPP_LINK_PREVIEW__ -->';

/**
 * The address of the card of one build, from the root of the origin, or
 * `null` when the build holds none or holds two.
 *
 * @param webDirectory the built web directory, which holds `assets/`.
 */
export function linkPreviewCardHref(webDirectory: string): string | null {
  let names: readonly string[];
  try {
    names = readdirSync(join(webDirectory, 'assets'));
  } catch {
    return null;
  }
  const found = names.filter((name) => linkPreviewCardFile.test(name));
  // Two cards would leave the choice to chance, so a build that holds two
  // answers none.
  return found.length === 1 ? `/assets/${found[0] ?? ''}` : null;
}

/**
 * The tags of the preview, one per line.
 *
 * @param origin the canonical origin of the configuration, which
 *   `served-origins.ts` read as one origin with no path.
 * @param cardHref the address of the card from the root of that origin.
 */
export function linkPreviewBlock(origin: string, cardHref: string): string {
  const root = `${origin}/`;
  const tags: readonly (readonly [string, string, string])[] = [
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', productName],
    ['property', 'og:title', productName],
    ['property', 'og:description', linkPreviewDescription],
    ['property', 'og:url', root],
    ['property', 'og:image', `${origin}${cardHref}`],
    ['property', 'og:image:type', 'image/png'],
    ['property', 'og:image:width', String(linkPreviewImageSize.width)],
    ['property', 'og:image:height', String(linkPreviewImageSize.height)],
    ['property', 'og:image:alt', linkPreviewImageAlt],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'description', linkPreviewDescription],
  ];
  return tags
    .map(
      ([key, name, content]) =>
        `<meta ${key}="${name}" content="${escapeAttribute(content)}">`,
    )
    .join('\n    ');
}
