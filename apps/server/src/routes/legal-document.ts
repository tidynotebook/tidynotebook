/**
 * The page of one legal document of the installation (record 0140).
 *
 * The operator writes the terms and the privacy notice in Markdown, and the
 * server renders each one with `renderMarkdown`, the one sanitized renderer.
 * This module writes the document around that output and nothing else. It
 * reads no file and no store, so a unit test drives every part of it.
 *
 * The page is a sibling of the published page of `published-document.ts`: one
 * server-built document with no script, the built application stylesheet, and
 * the same column and body typography. It takes those classes from that
 * module, so the two pages cannot drift apart and the build already emits
 * each utility (`apps/web/src/tailwind.css` registers that module).
 */
import type { LegalDocumentName } from '../config.ts';
import {
  bodyClasses,
  escapeAttribute,
  escapeText,
  footClasses,
  linkClasses,
  noteBodyClasses,
  pageClasses,
} from './published-document.ts';

/** The name of each document, as a person reads it on a link and a tab. */
export const legalDocumentTitles: Readonly<Record<LegalDocumentName, string>> =
  {
    terms: 'Terms',
    privacy: 'Privacy notice',
  };

/** What the page needs. */
export type LegalDocumentInput = {
  readonly name: LegalDocumentName;
  /** The sanitized HTML of the document. */
  readonly body: string;
  /** The stylesheets of the built application document, in order. */
  readonly stylesheets: readonly string[];
  /** The address of the page of the other document. */
  readonly otherHref: string;
  /**
   * The version that a person accepts, or `null` when the document has none
   * yet. The page states it, so the text never has to (record 0148).
   */
  readonly version: string | null;
};

/** The other legal document of one document. */
export function otherDocument(name: LegalDocumentName): LegalDocumentName {
  return name === 'terms' ? 'privacy' : 'terms';
}

/** Builds the whole page of one legal document. */
export function legalDocument(input: LegalDocumentInput): string {
  const styles = input.stylesheets
    .map(
      (href) => `<link rel="stylesheet" href="${escapeAttribute(href)}">\n    `,
    )
    .join('');
  const other = otherDocument(input.name);
  const foot = [
    ...(input.version === null
      ? []
      : [`<span>Version ${escapeText(input.version)}</span>`]),
    `<a class="${linkClasses}" href="${escapeAttribute(input.otherHref)}">${escapeText(legalDocumentTitles[other])}</a>`,
    `<a class="${linkClasses}" href="/login">Sign in</a>`,
  ].join(' &middot; ');
  return `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeText(legalDocumentTitles[input.name])}</title>
    ${styles}</head>
  <body class="${bodyClasses}">
    <main class="${pageClasses}">
<article class="${noteBodyClasses}">${input.body}</article>
<footer class="${footClasses}">${foot}</footer>
    </main>
  </body>
</html>
`;
}
