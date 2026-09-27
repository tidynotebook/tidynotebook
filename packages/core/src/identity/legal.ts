/**
 * The legal documents that an account accepts (record 0120).
 *
 * The operator names the address and the version of the terms and of the
 * privacy notice. An installation with no documents asks for nothing. An
 * account stores the version of each that it accepted and the time. When the
 * operator raises a version, the account needs consent again before the
 * application opens.
 */
import { fail, ok, type Result } from '../files/model.ts';
import type { Actor } from './actor.ts';
import type { WorkspaceAdminStore } from '../workspaces/ports.ts';

/** One document: where a person reads it and its current version. */
export type LegalDocument = {
  readonly url: string;
  readonly version: string;
};

/** The two documents of an installation. */
export type LegalDocuments = {
  readonly terms: LegalDocument;
  readonly privacy: LegalDocument;
};

/** The versions that a person accepts, or accepted. */
export type ConsentVersions = {
  readonly termsVersion: string;
  readonly privacyVersion: string;
};

/** What an account accepted and when. */
export type ConsentRecord = ConsentVersions & {
  readonly acceptedAt: string;
};

/** The longest version text that the configuration accepts. */
export const maxLegalVersionLength = 64;

/** Whether a person gave consent to exactly the current versions. */
export function consentMatches(
  documents: LegalDocuments,
  given: ConsentVersions | null,
): boolean {
  return (
    given !== null &&
    given.termsVersion === documents.terms.version &&
    given.privacyVersion === documents.privacy.version
  );
}

/**
 * Whether an account needs to give consent before the application opens.
 *
 * An installation with no documents asks for nothing. Otherwise an account
 * that accepted nothing, or an older version of either document, needs to.
 */
export function consentRequired(
  documents: LegalDocuments | null,
  accepted: ConsentVersions | null,
): boolean {
  if (documents === null) return false;
  return !consentMatches(documents, accepted);
}

/** The versions that an account accepted, or `null` when none. */
export function readConsent(
  store: WorkspaceAdminStore,
  actor: Actor,
): Promise<Result<ConsentRecord | null>> {
  return store.account(actor, async (tx) => ok(await tx.consent()));
}

/**
 * Stores the consent of an account to the current documents.
 *
 * The versions that the person saw must be the current ones, so a page that
 * showed an older version cannot record consent to a newer one.
 */
export function acceptLegalDocuments(
  store: WorkspaceAdminStore,
  actor: Actor,
  documents: LegalDocuments | null,
  given: ConsentVersions,
): Promise<Result<void>> {
  if (documents === null || !consentMatches(documents, given))
    return Promise.resolve(fail('consent_required'));
  return store.account(actor, async (tx) => {
    await tx.recordConsent(given);
    return ok(undefined);
  });
}
