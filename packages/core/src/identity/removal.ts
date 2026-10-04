/**
 * The removal of a locked account after its time (record 0201).
 *
 * A locked account can carry a removal time. A mail goes out 30 days and 7
 * days before it, and a daily run removes the account once the time has
 * passed, through the removal of record 0111. Setting the standing to active
 * clears the removal time, so an active account is never a candidate, and
 * the database reads the standing and the time again before it removes.
 *
 * The rule of each run is pure here, so a test states the instant and the
 * account and reads the step.
 */
/** The days before a removal at which a mail goes out, largest first. */
export const removalNoticeDays = [30, 7] as const;

/** The longest wait before a removal that a mail names, in days. */
export const removalHorizonDays = removalNoticeDays[0];

/** One locked account whose removal time is near or past. */
export type RemovalCandidate = {
  readonly accountId: string;
  readonly email: string | null;
  /** The removal time, as ISO 8601. */
  readonly removalAt: string;
  /** How many mails before the removal already went: 0, 1 or 2. */
  readonly notices: number;
};

/** What a run does with one candidate. */
export type RemovalStep =
  | { readonly kind: 'remove' }
  | {
      readonly kind: 'notice';
      /** The count of mails once this one went. */
      readonly notices: number;
      /** The whole days until the removal, as the mail names them. */
      readonly days: number;
    }
  | { readonly kind: 'wait' };

/** One day, in milliseconds. */
const dayMs = 24 * 60 * 60 * 1000;

/**
 * The step of one candidate at one instant.
 *
 * A passed time removes the account. Otherwise the nearest notice that did
 * not go yet goes, so an account that was locked 5 days before its removal
 * gets the 7 day mail alone, and a run that comes again sends nothing twice.
 */
export function removalStep(
  candidate: RemovalCandidate,
  now: Date,
): RemovalStep {
  const left = Date.parse(candidate.removalAt) - now.getTime();
  if (!Number.isFinite(left)) return { kind: 'wait' };
  if (left <= 0) return { kind: 'remove' };
  const days = Math.ceil(left / dayMs);
  for (let index = removalNoticeDays.length - 1; index >= 0; index -= 1) {
    const within = removalNoticeDays[index] ?? 0;
    if (days <= within && candidate.notices < index + 1)
      return { kind: 'notice', notices: index + 1, days };
  }
  return { kind: 'wait' };
}

/** The reads and writes of the daily removal run. */
export type RemovalStore = {
  /** The locked accounts whose removal time comes before the horizon. */
  removalCandidates(horizon: Date): Promise<readonly RemovalCandidate[]>;
  /**
   * Removes one account whose time has passed, after the database reads its
   * standing and its time again. Answers whether it went.
   */
  removeDueAccount(accountId: string): Promise<boolean>;
  /**
   * Records that one mail before the removal went, while the removal time
   * is still the one that the mail named. Answers whether it did.
   */
  markRemovalNotice(
    accountId: string,
    notices: number,
    removalAt: string,
  ): Promise<boolean>;
};

/** What one run did, for the operator log. It names no account. */
export type RemovalRun = {
  readonly removed: number;
  readonly noticed: number;
  readonly failed: number;
};

/** Sends the mail of one notice. A failure throws and is counted. */
export type RemovalNotifier = (
  candidate: RemovalCandidate & { readonly email: string },
  days: number,
) => Promise<void>;

/**
 * One run of the removal (record 0201).
 *
 * Each candidate takes its step. A mail that cannot go now is not recorded,
 * so the next run tries it again, and an account with no address or with no
 * mail transport gets no mail and is still removed at its time. A failure of
 * one account does not stop the others.
 */
export async function runRemovals(
  store: RemovalStore,
  notify: RemovalNotifier | null,
  now: Date,
): Promise<RemovalRun> {
  const horizon = new Date(now.getTime() + removalHorizonDays * dayMs);
  let removed = 0;
  let noticed = 0;
  let failed = 0;
  for (const candidate of await store.removalCandidates(horizon)) {
    const step = removalStep(candidate, now);
    try {
      if (step.kind === 'remove') {
        if (await store.removeDueAccount(candidate.accountId)) removed += 1;
      } else if (
        step.kind === 'notice' &&
        notify !== null &&
        candidate.email !== null
      ) {
        await notify({ ...candidate, email: candidate.email }, step.days);
        if (
          await store.markRemovalNotice(
            candidate.accountId,
            step.notices,
            candidate.removalAt,
          )
        )
          noticed += 1;
      }
    } catch {
      // A mail server or a database that failed for one account fails that
      // account alone, and the next run tries it again.
      failed += 1;
    }
  }
  return { removed, noticed, failed };
}
