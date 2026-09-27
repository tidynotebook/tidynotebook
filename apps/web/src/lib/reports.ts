/**
 * What the Reports section of the accounts page says (records 0119, 0123).
 *
 * A reader reports a published link with a reason of a fixed list and an
 * optional note. An administrator reads the reason, the time and the state of
 * the link, opens the link as any reader does, and takes it down or closes
 * the report. No row names a note or a workspace, because the administrator
 * reads neither.
 */
import type { LinkReport } from '@notesapp/api-client';
import { relativeTime } from './relative-time.ts';

/** The words of each reason, as a row names it. */
const reasonWords: Readonly<Record<LinkReport['reason'], string>> = {
  phishing: 'Phishing or fraud',
  malware: 'Harmful file',
  illegal: 'Illegal content',
  harassment: 'Harassment or threats',
  spam: 'Spam',
  other: 'Other reason',
};

/** The name of a report row, which is its reason. */
export function reportReasonWord(reason: LinkReport['reason']): string {
  return reasonWords[reason];
}

/** The facts of one report row, in the order that a person reads them. */
export function reportFacts(report: LinkReport, now: number): string[] {
  const facts: string[] = [];
  const when = relativeTime(report.createdAt, now);
  if (when !== '') facts.push(`Reported ${when}`);
  if (report.linkState === 'taken-down') facts.push('Taken down');
  if (report.linkState === 'stopped') facts.push('The link stopped');
  if (report.address === null) facts.push('The address cannot be opened');
  return facts;
}

/** Whether a report offers Take down, which only a live link needs. */
export function canTakeDown(report: LinkReport): boolean {
  return report.linkState === 'live';
}

/** The notice after a change of a report. */
export function reportNotice(action: 'take-down' | 'close'): string {
  return action === 'take-down'
    ? 'The link is taken down. It opens nothing now, and its owner sees why.'
    : 'The report is closed. The link stays as it is.';
}
