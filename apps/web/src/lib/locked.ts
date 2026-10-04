/**
 * What the one screen of a locked account says (record 0201).
 *
 * A locked account signs in to one screen. It keeps the way to unlock the
 * account, to take the notes out and to remove the account, and nothing else.
 * When the installation names an account portal, the screen links it as the
 * one action that unlocks the account. Every word of the screen is decided
 * here, so the screen holds no rule.
 */
import type { Account } from '@notesapp/api-client';

/** The path of the account portal that the screen opens. */
export const portalPath = '/';

/** Whether the account opens the one screen of a locked account. */
export function isLocked(account: Pick<Account, 'controls'>): boolean {
  return account.controls.standing === 'locked';
}

/** One day, in milliseconds. */
const dayMs = 24 * 60 * 60 * 1000;

/**
 * How long until an instant, as whole days of a phrase: `today`, `in 1 day`
 * or `in 3 days`. An instant that the browser cannot read answers `null`.
 */
export function daysUntil(instant: string, now: number): string | null {
  const at = Date.parse(instant);
  if (!Number.isFinite(at)) return null;
  const days = Math.ceil((at - now) / dayMs);
  if (days <= 0) return 'today';
  return days === 1 ? 'in 1 day' : `in ${String(days)} days`;
}

/** The sentences of the locked screen, in the order a person reads them. */
export function lockedSentences(
  account: Pick<Account, 'controls' | 'accountPortal'>,
  now: number,
): readonly string[] {
  const sentences = [
    'Your notes are safe, but you cannot change them now.',
    account.accountPortal
      ? 'Open the account portal to unlock the account.'
      : 'Ask the administrator of this installation to unlock the account.',
  ];
  const removal =
    account.controls.removalAt === null
      ? null
      : daysUntil(account.controls.removalAt, now);
  if (removal !== null)
    sentences.push(
      `If the account stays locked, it and its notes are removed ${removal}.`,
    );
  return sentences;
}
