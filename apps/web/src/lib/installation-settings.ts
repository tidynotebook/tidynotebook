/**
 * The words and the rules of the mail and the legal documents sections of
 * the accounts page (record 0148).
 *
 * The server decides what applies, and this module decides only what a
 * person reads and what a form starts with. A group that the server
 * environment sets is locked, and the page then offers no change.
 */
import type {
  LegalDocumentSummary,
  LegalSettings,
  MailSecurity,
  MailSettings,
} from '@notesapp/api-client';
import { blankLabel, fillBlanks, templateBlanks } from '@notesapp/core';

/** The two legal documents, in the order of the page. */
export const legalDocumentRows = [
  { name: 'terms', title: 'Terms' },
  { name: 'privacy', title: 'Privacy notice' },
] as const;

/** One legal document by the name that its page takes. */
export type LegalDocumentRowName = (typeof legalDocumentRows)[number]['name'];

/** The security modes, as the select of the mail form lists them. */
export const mailSecurityOptions: readonly {
  readonly value: MailSecurity;
  readonly label: string;
}[] = [
  { value: 'starttls', label: 'STARTTLS' },
  { value: 'tls', label: 'TLS' },
  { value: 'none', label: 'None' },
];

/** The usual port of each security mode. */
export const defaultMailPort: Readonly<Record<MailSecurity, number>> = {
  tls: 465,
  starttls: 587,
  none: 25,
};

/** The narrowed security mode of a select, or `null`. */
export function mailSecurityOf(value: string): MailSecurity | null {
  return (
    mailSecurityOptions.find((option) => option.value === value)?.value ?? null
  );
}

/**
 * The port after the person changes the security mode. A port that is still
 * the usual one of the old mode follows the new mode, and a port that the
 * person typed stays.
 */
export function portAfterSecurity(
  port: string,
  from: MailSecurity,
  to: MailSecurity,
): string {
  return port === '' || port === String(defaultMailPort[from])
    ? String(defaultMailPort[to])
    : port;
}

/** A port that the person typed, or `null` when it is not one. */
export function mailPortOf(text: string): number | null {
  if (!/^[0-9]{1,5}$/.test(text.trim())) return null;
  const port = Number(text.trim());
  return port >= 1 && port <= 65535 ? port : null;
}

/** The sentence under the heading of the mail section. */
export function mailDescription(mail: MailSettings): string {
  switch (mail.source) {
    case 'none':
      return 'This installation sends no mail. An invitation shows its link once, and nobody can reset a password alone.';
    case 'environment':
      return 'The server environment sets the mail server, so it changes there and not on this page.';
    case 'application':
      return 'Invitations, sign-up links and password resets go through this mail server.';
  }
}

/** The facts of the mail server that applies, one short phrase each. */
export function mailFacts(mail: MailSettings): string[] {
  const facts: string[] = [];
  if (mail.host !== null)
    facts.push(
      mail.port === null
        ? mail.host
        : `${mail.host}, port ${String(mail.port)}`,
    );
  if (mail.sender !== null) facts.push(`From ${mail.sender}`);
  if (
    mail.source === 'application' &&
    mail.username !== null &&
    !mail.passwordStored
  )
    facts.push('The password must be entered again');
  return facts;
}

/** The sentence of a test message that did not go, by its kind. */
export function mailFailureText(reason: string | null): string {
  switch (reason) {
    case 'unavailable':
      return 'This installation has no mail server. Set one up first.';
    case 'connection':
      return 'The mail server did not answer. Check the server and the port.';
    case 'authentication':
      return 'The mail server refused the user name or the password.';
    case 'security':
      return 'The secure connection failed. Check the security setting and the port.';
    case 'sender':
      return 'The mail server refused the sender. Use an address that the mail server lets you send from.';
    default:
      return 'The mail server did not take the message. Check the settings and try again.';
  }
}

/** The kind of a failed test message that a refusal names, or `null`. */
export function mailFailureReasonOf(error: unknown): string | null {
  if (error === null || typeof error !== 'object') return null;
  const reason: unknown = Object.fromEntries(Object.entries(error))['reason'];
  return typeof reason === 'string' ? reason : null;
}

/** The sentence under the heading of the legal documents section. */
export function legalDescription(legal: LegalSettings): string {
  switch (legal.source) {
    case 'environment':
      return 'The server environment sets the terms and the privacy notice, so they change there and not on this page.';
    case 'none':
      return 'Add the terms and the privacy notice. They apply when both exist, and each person accepts them before the notes open.';
    case 'application':
      return legal.terms !== null && legal.privacy !== null
        ? 'Each person accepts both documents before the notes open. A new version asks each person again.'
        : 'Add the other document too. The documents apply when both exist.';
  }
}

/** The one fact of a document row (a row shows one name and one fact). */
export function legalDocumentFact(
  document: LegalDocumentSummary | null,
): string {
  if (document === null) return 'Not added';
  return document.kind === 'text'
    ? `Version ${document.version}, shown by this server`
    : `Version ${document.version}, at ${hostOf(document.url)}`;
}

/** The host of an address, or the address when it names none. */
function hostOf(url: string): string {
  const host = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url)?.[1];
  return host ?? url;
}

/** One blank of a text, as a field of the form. */
export type BlankField = {
  /** The blank with its braces, which the text holds. */
  readonly blank: string;
  /** The label of the field, in sentence case. */
  readonly label: string;
};

/**
 * The blank of the version in a template. The Version field of the form
 * fills it, so it is no field of its own.
 */
const versionBlank = '{{version}}';

/** The fields of the blanks that a text still holds. */
export function blankFields(text: string): BlankField[] {
  return templateBlanks(text)
    .filter((blank) => blank !== versionBlank)
    .map((blank) => {
      const words = blankLabel(blank);
      return {
        blank,
        label:
          words === ''
            ? 'Blank'
            : `${words.charAt(0).toUpperCase()}${words.slice(1)}`,
      };
    });
}

/** The text that a save sends: the version fills its blank. */
export function textToSave(text: string, version: string): string {
  return fillBlanks(text, { [versionBlank]: version });
}

/** The blanks that a refusal of a legal text names. */
export function blanksOf(error: unknown): string[] {
  if (error === null || typeof error !== 'object') return [];
  const blanks: unknown = Object.fromEntries(Object.entries(error))['blanks'];
  return Array.isArray(blanks)
    ? blanks.filter((blank): blank is string => typeof blank === 'string')
    : [];
}

/** The sentence of a text that still holds blanks. */
export function unfinishedText(blanks: readonly string[]): string {
  const count = blanks.length;
  return count === 1
    ? 'Fill the last blank of the template before you save.'
    : `Fill the ${String(count)} blanks of the template before you save.`;
}
