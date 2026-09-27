/**
 * The rules of a report of a published link (records 0119 and 0123).
 *
 * A reader who has no account reports a link from its report page. The
 * report names a reason from a fixed list and an optional note, so an
 * administrator can sort the reports and act on them. The reader path stores
 * the report through one narrow function, and an administrator reads it and
 * takes the link down through the installation use cases.
 */

/** Why a reader reports a published link. */
export type ReportReason =
  'phishing' | 'malware' | 'illegal' | 'harassment' | 'spam' | 'other';

/** Every reason, in the order that the report form shows them. */
export const reportReasons: readonly ReportReason[] = [
  'phishing',
  'malware',
  'illegal',
  'harassment',
  'spam',
  'other',
];

/** Whether a link of a report opens now, was taken down, or stopped. */
export type ReportedLinkState = 'live' | 'taken-down' | 'stopped';

/** Every state of a reported link, for a transport that narrows a text. */
export const reportedLinkStates: readonly ReportedLinkState[] = [
  'live',
  'taken-down',
  'stopped',
];

/** The longest note that a report keeps, in characters. */
export const maxReportNoteLength = 2000;

/** Whether a text names one reason of the fixed list. */
export function isReportReason(value: string): value is ReportReason {
  return reportReasons.some((reason) => reason === value);
}

/**
 * The note that a report keeps, or `null` for none.
 *
 * A form sends an empty field when the reader writes nothing, so a note of
 * only space is no note. A longer note than the bound keeps its start.
 */
export function reportNote(text: string | null): string | null {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return null;
  return Array.from(trimmed).slice(0, maxReportNoteLength).join('');
}
