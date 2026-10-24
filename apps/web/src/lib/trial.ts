import type { AccountControls } from '@notesapp/api-client';

/** The offer applies only to a newly created member account. */
export function trialOffer(seconds: number | null): string | null {
  if (seconds === null) return null;
  const days = seconds / 86400;
  const duration = Number.isInteger(days)
    ? `${String(days)} days`
    : `${String(seconds / 3600)} hours`;
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
  if (controls.trialState === 'expired' || end <= now)
    return 'Your free trial has ended. Upgrade to use your account again. There is no automatic charge.';
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
  return `Your free trial ends on ${new Date(end).toLocaleString()}. Time left: ${remaining}. There is no automatic charge.`;
}
