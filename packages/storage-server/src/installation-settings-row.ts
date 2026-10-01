/**
 * The row of `notesapp_installation_settings()` as the core reads it
 * (record 0148).
 *
 * The checks of the table hold each group whole or absent, so a row that
 * breaks one is a defect of the database, and the parser stops loudly
 * instead of serving half a transport or half a document.
 */
import type {
  StoredInstallationSettings,
  StoredLegalDocument,
  StoredMailSettings,
} from '@notesapp/core';
import { mailSecurities, OperationalError } from '@notesapp/core';

/** One row of the settings function, as the driver answers it. */
export type InstallationSettingsRow = {
  readonly mail_host: string | null;
  readonly mail_port: number | null;
  readonly mail_security: string | null;
  readonly mail_username: string | null;
  readonly mail_password_sealed: string | null;
  readonly mail_sender: string | null;
  readonly terms_kind: string | null;
  readonly terms_text: string | null;
  readonly terms_url: string | null;
  readonly terms_version: string | null;
  readonly privacy_kind: string | null;
  readonly privacy_text: string | null;
  readonly privacy_url: string | null;
  readonly privacy_version: string | null;
};

/** The failure of a row that the checks should have refused. */
function malformed(part: string): OperationalError {
  return new OperationalError(
    'unexpected',
    `notesapp: the installation settings hold a malformed ${part}.`,
  );
}

/** The mail transport of a row, or `null` when it holds none. */
function mailOf(row: InstallationSettingsRow): StoredMailSettings | null {
  if (row.mail_host === null) return null;
  const security = mailSecurities.find((entry) => entry === row.mail_security);
  if (
    row.mail_port === null ||
    row.mail_sender === null ||
    security === undefined
  )
    throw malformed('mail transport');
  return {
    host: row.mail_host,
    port: row.mail_port,
    security,
    username: row.mail_username,
    passwordSealed: row.mail_password_sealed,
    sender: row.mail_sender,
  };
}

/** One legal document of a row, or `null` when it holds none. */
function documentOf(
  kind: string | null,
  text: string | null,
  url: string | null,
  version: string | null,
): StoredLegalDocument | null {
  if (kind === null) return null;
  if (version === null) throw malformed('legal document');
  if (kind === 'text' && text !== null) return { kind, text, version };
  if (kind === 'address' && url !== null) return { kind, url, version };
  throw malformed('legal document');
}

/** The settings of one row. */
export function installationSettingsOf(
  row: InstallationSettingsRow,
): StoredInstallationSettings {
  return {
    mail: mailOf(row),
    terms: documentOf(
      row.terms_kind,
      row.terms_text,
      row.terms_url,
      row.terms_version,
    ),
    privacy: documentOf(
      row.privacy_kind,
      row.privacy_text,
      row.privacy_url,
      row.privacy_version,
    ),
  };
}
