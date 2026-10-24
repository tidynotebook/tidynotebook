/**
 * The controls of an account from the columns of one row (record 0189).
 *
 * Every query that answers the controls names the same columns, so one
 * reader turns them into the domain shape. The standing is a text column of
 * an enum, and a row that names another value is a defect of a writer, so the
 * reader throws `OperationalError` and no undeclared value reaches the
 * domain. A null limit is no limit.
 */
import {
  controlStandings,
  OperationalError,
  type AccountControls,
  type ControlStanding,
} from '@notesapp/core';

/** The columns of the controls, as the driver answers them. */
export type AccountControlsRow = {
  readonly standing: string;
  readonly removal_at: Date | string | null;
  readonly trial_ends_at: Date | string | null;
  readonly trial_ended_at: Date | string | null;
  readonly trial_state: string;
  readonly limit_bytes: string;
  readonly text_limit_bytes: string | null;
  readonly published_transfer_limit_bytes: string | null;
  readonly download_limit_bytes: string | null;
  readonly teams: boolean;
  readonly collaboration: boolean;
  readonly controls_revision: string;
};

/** The SQL list of those columns of the table `accounts` named `a`. */
export const accountControlsColumns = `public.notesapp_effective_standing(a)::text as standing,
  CASE WHEN public.notesapp_effective_standing(a) = 'locked' AND a.trial_ended_at IS NULL AND a.trial_ends_at IS NOT NULL THEN coalesce(a.removal_at, a.trial_removal_at) ELSE a.removal_at END as removal_at,
  a.trial_ends_at, a.trial_ended_at, public.notesapp_trial_state(a) as trial_state, a.limit_bytes::text as limit_bytes,
  a.text_limit_bytes::text as text_limit_bytes,
  a.published_transfer_limit_bytes::text as published_transfer_limit_bytes,
  a.download_limit_bytes::text as download_limit_bytes,
  a.teams, a.collaboration, a.controls_revision::text as controls_revision`;

/** Narrows a stored standing. An unexpected value is a defect. */
export function storedStanding(value: string): ControlStanding {
  const known = controlStandings.find((standing) => standing === value);
  if (known === undefined)
    throw new OperationalError(
      'unexpected',
      'notesapp: an account row holds an unknown standing.',
    );
  return known;
}

/** A stored limit, or `null` for no limit. */
function limitOf(value: string | null): bigint | null {
  return value === null ? null : BigInt(value);
}

/** The controls of one row. */
export function accountControlsOf(row: AccountControlsRow): AccountControls {
  const revision = Number(row.controls_revision);
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw new OperationalError(
      'unexpected',
      'notesapp: an account row holds a revision that no answer can carry.',
    );
  return {
    revision,
    trialEndsAt:
      row.trial_ends_at === null
        ? null
        : new Date(row.trial_ends_at).toISOString(),
    trialState: trialStateOf(row.trial_state),
    standing: storedStanding(row.standing),
    removalAt:
      row.removal_at === null
        ? null
        : (row.removal_at instanceof Date
            ? row.removal_at
            : new Date(row.removal_at)
          ).toISOString(),
    limitBytes: BigInt(row.limit_bytes),
    textLimitBytes: limitOf(row.text_limit_bytes),
    publishedTransferLimitBytes: limitOf(row.published_transfer_limit_bytes),
    downloadLimitBytes: limitOf(row.download_limit_bytes),
    features: { teams: row.teams, collaboration: row.collaboration },
  };
}

/** The parameters of `notesapp_set_account_controls` after its account. */
export function controlsParameters(
  revision: number,
  controls: AccountControls,
): readonly (string | boolean | null)[] {
  const limit = (value: bigint | null): string | null =>
    value === null ? null : value.toString();
  return [
    String(revision),
    controls.standing,
    controls.removalAt,
    controls.limitBytes.toString(),
    limit(controls.textLimitBytes),
    limit(controls.publishedTransferLimitBytes),
    limit(controls.downloadLimitBytes),
    controls.features.teams,
    controls.features.collaboration,
  ];
}

/** The database decides trial state with the same clock as authorization. */
function trialStateOf(value: string): AccountControls['trialState'] {
  if (
    value === 'none' ||
    value === 'active' ||
    value === 'expired' ||
    value === 'ended'
  )
    return value;
  throw new OperationalError('unexpected', 'notesapp: unknown trial state.');
}
