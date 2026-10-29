/**
 * The links to the terms and the privacy notice of the installation (record
 * 0120), and the one read of them that a screen makes.
 *
 * Sign in, the consent step and Settings show the two links on a line of
 * their own. The sign-up form and the invitation form put them in the
 * sentence of the consent box. Every screen reads them from this module, so
 * each names the documents with the same words in the same order.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { getSetupStatus, type LegalDocuments } from '@notesapp/api-client';
import { consentParts, legalLinks } from '../../lib/legal.ts';

/**
 * The terms and the privacy notice of the installation, or `null` while they
 * load and when the installation names none (record 0120).
 */
export function useLegalDocuments(
  supplied?: LegalDocuments | null,
): LegalDocuments | null {
  const [documents, setDocuments] = useState<LegalDocuments | null>(null);
  useEffect(() => {
    if (supplied !== undefined) return;
    let cancelled = false;
    void getSetupStatus().then((result) => {
      if (!cancelled) setDocuments(result.data?.legalDocuments ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [supplied]);
  return supplied === undefined ? documents : supplied;
}

/** The class of a link to a document. */
const linkClassName = 'text-accent underline';

/**
 * The links to the terms and the privacy notice (record 0120).
 *
 * Each opens in a new tab, so a form that a person fills in keeps its values.
 */
export function LegalLinks({
  documents,
  className,
}: {
  readonly documents: LegalDocuments;
  readonly className?: string;
}): ReactNode {
  return (
    <p
      className={`mt-0 flex flex-wrap gap-cluster text-body ${className ?? 'mb-0'}`}
    >
      {legalLinks(documents).map((link) => (
        <a
          key={link.label}
          className={linkClassName}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {link.label}
        </a>
      ))}
    </p>
  );
}

/**
 * The words of the consent box, with a link to each document in them.
 *
 * Each link opens in a new tab, and a click on it does not change the box.
 */
export function ConsentLabel({
  documents,
}: {
  readonly documents: LegalDocuments;
}): ReactNode {
  return (
    <>
      {consentParts(documents).map((part) =>
        part.kind === 'text' ? (
          part.text
        ) : (
          <a
            key={part.text}
            className={linkClassName}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {part.text}
          </a>
        ),
      )}
    </>
  );
}
