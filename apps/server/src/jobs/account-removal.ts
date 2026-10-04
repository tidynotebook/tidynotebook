/**
 * The removal run of locked accounts (record 0201).
 *
 * It removes each locked account whose removal time has passed, through the
 * removal of record 0111, and sends the mail of `messages.ts` 30 days and 7
 * days before. The rule of each step is `runRemovals` of `@notesapp/core`, and
 * the database reads the standing and the time again before it removes, so
 * an active account is never removed.
 *
 * The job is daily, as the record names it. The hourly `runCleanup` of
 * `app.ts` asks it each hour under its advisory lock (record 0121), and the
 * job runs only when it claims the day in UTC, which one process of the
 * installation does once a day. A mail is claimed before it goes, so no mail
 * goes twice.
 */
import {
  runRemovals,
  type RemovalRun,
  type RemovalStore,
} from '@notesapp/core';
import type { Mailer } from '../auth/mail.ts';
import { removalNoticeMessage } from '../auth/messages.ts';

/** What the removal run needs from the composition. */
export type AccountRemovalDependencies = {
  readonly store: RemovalStore;
  /** The mail transport of the installation at the moment of a run. */
  readonly mailer: Mailer;
  /** The canonical origin, which a mail names. */
  readonly origin: string;
  /** Whether the installation names an account portal (record 0190). */
  readonly portal: boolean;
  /**
   * Claims the run of one day in UTC, as `YYYY-MM-DD`, and answers whether
   * this run claimed it.
   */
  readonly claimDay: (day: string) => Promise<boolean>;
};

/** What one call did: nothing on a day that ran already, or the run. */
export type AccountRemovalResult = RemovalRun | { readonly skipped: 'day' };

/** Builds the removal run. */
export function createAccountRemoval(
  dependencies: AccountRemovalDependencies,
): (now?: Date) => Promise<AccountRemovalResult> {
  return async (now = new Date()) => {
    if (!(await dependencies.claimDay(now.toISOString().slice(0, 10))))
      return { skipped: 'day' };
    // A run with no transport sends nothing and records nothing, so the
    // mail goes once a transport exists, and the removal still happens.
    const transport = await dependencies.mailer.current();
    return runRemovals(
      dependencies.store,
      transport === null
        ? null
        : (account, days) =>
            transport.send(
              removalNoticeMessage({
                to: account.email,
                origin: dependencies.origin,
                days,
                portal: dependencies.portal,
              }),
            ),
      now,
    );
  };
}
