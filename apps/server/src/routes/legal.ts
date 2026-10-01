/**
 * The pages of the legal documents of the installation (record 0140).
 *
 * The operator names the terms and the privacy notice by an external address
 * or by a Markdown file, or an administrator sets either one in the
 * application (record 0148). `installation-settings.ts` answers which text
 * applies, and this file serves it: the one sanitized renderer turns the text
 * into HTML the first time a person asks for it, and `legal-document.ts`
 * writes the page around it. A document at an external address, or no document,
 * answers not found here, because nothing of this server holds it.
 */
import { renderMarkdown } from '@notesapp/markdown';
import {
  legalDocumentPath,
  type LegalDocumentName,
  type LegalTexts,
} from '../config.ts';
import { NotFoundError } from '../plugins/problem.ts';
import { legalDocumentHeaders } from '../plugins/security-headers.ts';
import type { HandlerMap, HandlerResult } from '../plugins/register.ts';
import { legalDocument, otherDocument } from './legal-document.ts';
import { readText } from './files.ts';

/** What the legal pages need from the composition. */
export type LegalDependencies = {
  /**
   * The Markdown text and the version of each served document, as they apply
   * now (record 0148). One read answers both, so a page never shows the text
   * of one save with the version of another.
   */
  readonly read: () => Promise<{
    readonly texts: LegalTexts;
    readonly versions: Readonly<Record<LegalDocumentName, string | null>>;
  }>;
  /** The stylesheets of the built application document. */
  readonly stylesheets: () => readonly string[];
};

/** Whether a validated path value names one of the two documents. */
function isDocumentName(value: string): value is LegalDocumentName {
  return value === 'terms' || value === 'privacy';
}

/** The answer for a document that this server does not hold. */
function notServed(): NotFoundError {
  return new NotFoundError('This installation serves no such document.');
}

/** Builds the operation of the legal pages. */
export function createLegalHandlers(
  dependencies: LegalDependencies | undefined,
): HandlerMap {
  // The rendered page of the last text of each document. A changed text
  // renders once at its first read, and the old page goes.
  const rendered = new Map<
    LegalDocumentName,
    { readonly text: string; readonly body: Promise<string> }
  >();
  const bodyOf = (name: LegalDocumentName, text: string): Promise<string> => {
    const known = rendered.get(name);
    if (known?.text === text) return known.body;
    const body = renderMarkdown(text);
    rendered.set(name, { text, body });
    return body;
  };
  return {
    getLegalDocument: async (request): Promise<HandlerResult> => {
      const name = readText(request.params, 'document');
      if (dependencies === undefined || !isDocumentName(name))
        throw notServed();
      const legal = await dependencies.read();
      const text = legal.texts[name];
      if (text === null) throw notServed();
      return {
        status: 200,
        mediaType: 'text/html',
        body: legalDocument({
          name,
          body: await bodyOf(name, text),
          stylesheets: dependencies.stylesheets(),
          otherHref: legalDocumentPath(otherDocument(name)),
          version: legal.versions[name],
        }),
        headers: legalDocumentHeaders,
      };
    },
  };
}
