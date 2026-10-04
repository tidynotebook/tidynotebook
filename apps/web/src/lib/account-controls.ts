/**
 * The form of the limits and the access of one account (record 0189).
 *
 * An administrator sets the controls of an account on the accounts page: the
 * standing, the removal time of a locked account, the storage limit, the text
 * limit, the limits of a month, and the feature switches. The form shows each
 * value as a person types it, gigabytes and days, and this module turns the
 * form back into the change that the server takes, with the revision that the
 * page read. An empty limit is no limit.
 */
import type {
  AccountControls,
  AccountControlsInput,
} from '@notesapp/api-client';
import { bytesOfGigabytes, gigabytesOf } from './accounts.ts';

/** The fields of the form, as text where a person types. */
export type ControlsForm = {
  readonly standing: 'active' | 'locked';
  /** Days until the removal of a locked account, or empty for none. */
  readonly removeInDays: string;
  readonly storageGigabytes: string;
  readonly textGigabytes: string;
  readonly transferGigabytes: string;
  readonly downloadGigabytes: string;
  readonly teams: boolean;
  readonly collaboration: boolean;
};

/** One field of the form that a change refuses, and why. */
export type ControlsProblem = {
  readonly field: keyof ControlsForm;
  readonly message: string;
};

/** One day, in milliseconds. */
const dayMs = 24 * 60 * 60 * 1000;

/** The longest wait before a removal that the form takes, in days. */
const maxRemovalDays = 3650;

/** A limit as the form shows it, or empty for no limit. */
function limitText(bytes: number | null): string {
  return bytes === null ? '' : gigabytesOf(bytes);
}

/** The form of the stored controls of one account, at one instant. */
export function controlsFormOf(
  controls: AccountControls,
  now: number,
): ControlsForm {
  const removal =
    controls.removalAt === null ? Number.NaN : Date.parse(controls.removalAt);
  return {
    standing: controls.standing,
    removeInDays: Number.isFinite(removal)
      ? String(Math.max(1, Math.ceil((removal - now) / dayMs)))
      : '',
    storageGigabytes: gigabytesOf(controls.limitBytes),
    textGigabytes: limitText(controls.textLimitBytes),
    transferGigabytes: limitText(controls.publishedTransferLimitBytes),
    downloadGigabytes: limitText(controls.downloadLimitBytes),
    teams: controls.features.teams,
    collaboration: controls.features.collaboration,
  };
}

/** A typed limit as bytes, `null` for empty, or `undefined` when invalid. */
function limitOf(text: string): number | null | undefined {
  if (text.trim() === '') return null;
  return bytesOfGigabytes(text) ?? undefined;
}

/**
 * The change of the controls that a form states, or the first field that a
 * person must correct.
 *
 * The change names the revision that the page read, so a change that was
 * made from an old state is refused and changes nothing. The removal time is
 * sent only when its field changed, so a save that keeps it does not move it.
 * A limit field that a person did not change sends the stored bytes, because
 * two decimals of a gigabyte cannot show every limit exactly: a save of one
 * control must not round another, and a limit that shows as 0 must not block
 * the save.
 */
export function controlsChangeOf(
  form: ControlsForm,
  read: AccountControls,
  now: number,
):
  | { readonly ok: true; readonly change: AccountControlsInput }
  | { readonly ok: false; readonly problem: ControlsProblem } {
  const shown = controlsFormOf(read, now);
  const storage =
    form.storageGigabytes === shown.storageGigabytes
      ? read.limitBytes
      : bytesOfGigabytes(form.storageGigabytes);
  if (storage === null)
    return {
      ok: false,
      problem: {
        field: 'storageGigabytes',
        message: 'Enter a number of gigabytes above zero.',
      },
    };
  const text =
    form.textGigabytes === shown.textGigabytes
      ? read.textLimitBytes
      : limitOf(form.textGigabytes);
  const transfer =
    form.transferGigabytes === shown.transferGigabytes
      ? read.publishedTransferLimitBytes
      : limitOf(form.transferGigabytes);
  const download =
    form.downloadGigabytes === shown.downloadGigabytes
      ? read.downloadLimitBytes
      : limitOf(form.downloadGigabytes);
  const limits: readonly (readonly [keyof ControlsForm, unknown])[] = [
    ['textGigabytes', text],
    ['transferGigabytes', transfer],
    ['downloadGigabytes', download],
  ];
  for (const [field, value] of limits)
    if (value === undefined)
      return {
        ok: false,
        problem: {
          field,
          message: 'Enter a number of gigabytes above zero, or leave it empty.',
        },
      };
  let removalAt: string | null | undefined;
  if (form.standing === 'active') removalAt = undefined;
  else if (form.removeInDays === shown.removeInDays)
    removalAt = read.standing === 'locked' ? undefined : null;
  else if (form.removeInDays.trim() === '') removalAt = null;
  else {
    const days = /^\d+$/.test(form.removeInDays.trim())
      ? Number(form.removeInDays.trim())
      : Number.NaN;
    if (!Number.isSafeInteger(days) || days < 1 || days > maxRemovalDays)
      return {
        ok: false,
        problem: {
          field: 'removeInDays',
          message: `Enter a number of days from 1 to ${String(maxRemovalDays)}, or leave it empty.`,
        },
      };
    removalAt = new Date(now + days * dayMs).toISOString();
  }
  return {
    ok: true,
    change: {
      revision: read.revision,
      standing: form.standing,
      ...(removalAt === undefined ? {} : { removalAt }),
      limitBytes: storage,
      textLimitBytes: text ?? null,
      publishedTransferLimitBytes: transfer ?? null,
      downloadLimitBytes: download ?? null,
      features: { teams: form.teams, collaboration: form.collaboration },
    },
  };
}
