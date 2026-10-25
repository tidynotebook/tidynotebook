import type { AccountControls } from '@notesapp/api-client';

/** The offer applies only to a newly created member account. */
export function trialOffer(seconds: number | null): string | null {
  if (seconds === null) return null;
  const [count, unit] =
    seconds % 86400 === 0
      ? ([seconds / 86400, 'day'] as const)
      : seconds % 3600 === 0
        ? ([seconds / 3600, 'hour'] as const)
        : seconds % 60 === 0
          ? ([seconds / 60, 'minute'] as const)
          : ([seconds, 'second'] as const);
  const duration = `${String(count)} ${unit}${count === 1 ? '' : 's'}`;
  return `New accounts get a free trial for ${duration} from account creation. No card is required. There is no automatic charge. Upgrade to keep access after the trial.`;
}

/** The server state and fixed deadline decide the account notice. */
export function trialStatus(
  controls: Pick<AccountControls, 'trialEndsAt' | 'trialState'>,
  now: number,
): string | null {
  if (
    controls.trialEndsAt === null ||
    controls.trialState === 'none' ||
    controls.trialState === 'ended'
  )
    return null;
  const end = Date.parse(controls.trialEndsAt);
  if (controls.trialState === 'expired')
    return 'Your free trial has ended. Upgrade to use your account again. There is no automatic charge.';
  if (end <= now)
    return 'Checking your trial access. Your account will update shortly.';
  const remainingMs = end - now;
  const hours = Math.ceil(remainingMs / 3600000);
  const minutes = Math.ceil(remainingMs / 60000);
  const remaining =
    remainingMs < 60000
      ? 'less than 1 minute'
      : remainingMs < 3600000
        ? minutes === 1
          ? '1 minute'
          : `${String(minutes)} minutes`
        : hours > 24
          ? `${String(Math.ceil(hours / 24))} days`
          : hours === 1
            ? '1 hour'
            : `${String(hours)} hours`;
  return `Free trial ends on ${new Date(end).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}. Time left: ${remaining}.`;
}

const trialRecheckIntervalMs = 30000;

/** Bound retries with monotonic time across account adoption and focus. */
export function createTrialRecheck(read: () => void): (now: number) => number {
  let lastRequestAt: number | null = null;
  return (now) => {
    if (lastRequestAt !== null && now - lastRequestAt < trialRecheckIntervalMs)
      return Math.min(
        trialRecheckIntervalMs,
        trialRecheckIntervalMs - (now - lastRequestAt),
      );
    lastRequestAt = now;
    read();
    return trialRecheckIntervalMs;
  };
}
