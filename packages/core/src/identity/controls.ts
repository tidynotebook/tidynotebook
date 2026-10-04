/**
 * The controls of an account (record 0189).
 *
 * An account carries a storage limit, a text limit, a published transfer
 * limit and a download limit, a standing that is `active` or `locked`, a
 * removal time while it is locked, and a switch for each feature that a later
 * design makes switchable. A null limit is no limit.
 *
 * The controls carry a revision that the database raises on each change, and
 * a write names the revision that it read. The database refuses a write whose
 * revision differs, so a write that was made from an old state cannot replace
 * a newer one. The rule of a change lives here, so the accounts page of an
 * administrator and the operator API decide one change the same way.
 *
 * With no setting of the operator, every account is active, has every
 * feature, and has no text, transfer or download limit, so a self-hosted
 * installation needs no action.
 */
import { fail, ok, type Result } from '../files/model.ts';

/**
 * The largest byte limit, which is the largest integer that a JSON number
 * carries without loss.
 */
export const maxAccountLimitBytes = BigInt(Number.MAX_SAFE_INTEGER);

/** Whether an account uses every operation or a fixed list (record 0201). */
export type ControlStanding = 'active' | 'locked';

/** Every standing, for a transport that narrows a stored text. */
export const controlStandings: readonly ControlStanding[] = [
  'active',
  'locked',
];

/** The switch of each switchable feature. Every switch is on by default. */
export type AccountFeatures = {
  readonly teams: boolean;
  readonly collaboration: boolean;
};

/** The controls of one account and their revision. */
export type AccountControls = {
  readonly revision: number;
  readonly standing: ControlStanding;
  /** The removal time of a locked account, as ISO 8601, or `null`. */
  readonly removalAt: string | null;
  readonly limitBytes: bigint;
  readonly textLimitBytes: bigint | null;
  readonly publishedTransferLimitBytes: bigint | null;
  readonly downloadLimitBytes: bigint | null;
  readonly features: AccountFeatures;
};

/**
 * One change of the controls, as a transport read it.
 *
 * The standing reaches this package from a request body, so it is a text that
 * the change narrows. A member that is absent keeps its value.
 */
export type ControlsChange = {
  /** The revision of the controls that the writer read. */
  readonly revision: number;
  readonly standing?: string | undefined;
  readonly removalAt?: string | null | undefined;
  readonly limitBytes?: bigint | undefined;
  readonly textLimitBytes?: bigint | null | undefined;
  readonly publishedTransferLimitBytes?: bigint | null | undefined;
  readonly downloadLimitBytes?: bigint | null | undefined;
  readonly features?:
    | {
        readonly teams?: boolean | undefined;
        readonly collaboration?: boolean | undefined;
      }
    | undefined;
};

/** What a store answers to a write of the controls. */
export type ControlsWrite = 'written' | 'changed' | 'missing';

/** Whether a limit is one that the controls can hold. */
function holdsLimit(value: bigint | null): boolean {
  return value === null || (value >= 1n && value <= maxAccountLimitBytes);
}

/** Whether a text is an instant that ISO 8601 states. */
function isInstant(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * The controls after one change, or the refusal of it.
 *
 * - A revision that is not the one that the writer read answers
 *   `controls_changed`. The database checks the same revision again, so two
 *   writers that read one revision write one change.
 * - Setting the standing to `active` clears the removal time, and only a
 *   locked account can have one. A change that names a removal time for an
 *   account that ends active is refused with `forbidden`.
 * - A limit outside the bounds of a JSON number, an unknown standing and a
 *   removal time that is not an instant are refused with `forbidden`.
 */
export function applyControlsChange(
  current: AccountControls,
  change: ControlsChange,
): Result<AccountControls> {
  if (change.revision !== current.revision) return fail('controls_changed');
  const standing =
    change.standing === undefined
      ? current.standing
      : controlStandings.find((known) => known === change.standing);
  if (standing === undefined) return fail('forbidden');
  const namedRemoval =
    change.removalAt !== undefined && change.removalAt !== null;
  if (namedRemoval && !isInstant(change.removalAt)) return fail('forbidden');
  if (standing === 'active' && namedRemoval) return fail('forbidden');
  const removalAt =
    standing === 'active'
      ? null
      : change.removalAt === undefined
        ? current.removalAt
        : change.removalAt === null
          ? null
          : new Date(change.removalAt).toISOString();
  const next: AccountControls = {
    revision: current.revision,
    standing,
    removalAt,
    limitBytes: change.limitBytes ?? current.limitBytes,
    textLimitBytes:
      change.textLimitBytes === undefined
        ? current.textLimitBytes
        : change.textLimitBytes,
    publishedTransferLimitBytes:
      change.publishedTransferLimitBytes === undefined
        ? current.publishedTransferLimitBytes
        : change.publishedTransferLimitBytes,
    downloadLimitBytes:
      change.downloadLimitBytes === undefined
        ? current.downloadLimitBytes
        : change.downloadLimitBytes,
    features: {
      teams: change.features?.teams ?? current.features.teams,
      collaboration:
        change.features?.collaboration ?? current.features.collaboration,
    },
  };
  if (
    !holdsLimit(next.limitBytes) ||
    !holdsLimit(next.textLimitBytes) ||
    !holdsLimit(next.publishedTransferLimitBytes) ||
    !holdsLimit(next.downloadLimitBytes)
  )
    return fail('forbidden');
  return ok(next);
}

/** The controls that a new account starts with (record 0189). */
export type NewAccountSettings = {
  readonly limitBytes: bigint;
  readonly standing: ControlStanding;
  /**
   * How many seconds a new locked account lives before the daily run removes
   * it, or `null` for no removal time. Only a locked account has one.
   */
  readonly removeAfterSeconds: number | null;
};

/** The longest life of a new locked account that the configuration takes. */
export const maxRemoveAfterDays = 3650;

/** Whether the settings of a new account are ones that the store can hold. */
export function newAccountSettingsHold(settings: NewAccountSettings): boolean {
  if (settings.limitBytes < 1n || settings.limitBytes > maxAccountLimitBytes)
    return false;
  if (settings.removeAfterSeconds === null) return true;
  return (
    settings.standing === 'locked' &&
    Number.isSafeInteger(settings.removeAfterSeconds) &&
    settings.removeAfterSeconds > 0 &&
    settings.removeAfterSeconds <= maxRemoveAfterDays * 24 * 60 * 60
  );
}
