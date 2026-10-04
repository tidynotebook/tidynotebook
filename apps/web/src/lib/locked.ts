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

/**
 * What a read of the account again does to the session (record 0201).
 *
 * The application reads the account again when the stream says that it
 * changed, when a save is refused for a locked account, and when a person
 * comes back to the locked screen. Each read names the session epoch at its
 * start, which a sign-in, a sign-out and a load of the session move on. A
 * read that finishes in a later epoch is dropped, so a sign-out never brings
 * the old account back. Otherwise an answer replaces the account, so the
 * screen follows a lock or an unlock with no reload. A 401 means that the
 * session ended or that the account is gone, for example after the removal
 * of a locked account, so the person goes to sign-in. Any other failure
 * keeps the account as it is, because it says nothing about the account.
 */
export function accountReadOutcome(read: {
  readonly status: number;
  readonly answered: boolean;
  /** The session epoch when the read started. */
  readonly startedIn: number;
  /** The session epoch when the read finished. */
  readonly finishedIn: number;
}): 'adopt' | 'signed-out' | 'keep' | 'drop' {
  if (read.startedIn !== read.finishedIn) return 'drop';
  if (read.answered) return 'adopt';
  return read.status === 401 ? 'signed-out' : 'keep';
}
