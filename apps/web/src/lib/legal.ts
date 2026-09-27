/**
 * The legal documents of the installation, as the screens read them
 * (record 0120).
 *
 * The server names the terms and the privacy notice with their current
 * versions, or nothing. A consent names exactly those versions, so a page
 * that showed an older version cannot accept a newer one.
 */
import type { Account, LegalDocuments } from '@notesapp/api-client';

/** The consent to the documents that a page showed. */
export function consentTo(documents: LegalDocuments): {
  termsVersion: string;
  privacyVersion: string;
} {
  return {
    termsVersion: documents.terms.version,
    privacyVersion: documents.privacy.version,
  };
}

/**
 * Whether the application waits for consent before it opens.
 *
 * An account that a browser kept from before this rule has no member for it,
 * and the next read of the account answers it.
 */
export function waitsForConsent(
  account: Pick<Account, 'consentRequired'>,
): boolean {
  return account.consentRequired === true;
}
