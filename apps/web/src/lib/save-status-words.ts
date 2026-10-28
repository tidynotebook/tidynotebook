import { syncStateMessage, type SyncState } from './sync-state.ts';

/**
 * The save facts of the open note, as the status words read them.
 *
 * Saving is quiet: a saved, saving, offline or uploaded note shows no status
 * at all. Words appear only when work can wait or be lost without a step from
 * the person. They read existing save facts and add no telemetry.
 */
export type SaveFacts = {
  readonly state: SyncState;
  readonly failed: boolean;
  readonly noteName?: string | null;
};

/** The one step that helps with a save problem of the open note. */
export type SaveProblemKind = 'not-saved' | 'sign-in' | 'attention';

/** A save problem of the open note, for the control in the note header. */
export type SaveProblem = {
  readonly kind: SaveProblemKind;
  readonly label: string;
  readonly title: string;
  readonly detail: string;
};

/**
 * The save problem of the open note, or `null` when there is none.
 *
 * A failed write to this device wins, because the typed text is then only in
 * this tab. A signed out or other account holds the changes on this device
 * until a person signs in, and parked saves wait in Needs attention.
 */
export function saveProblem(input: SaveFacts): SaveProblem | null {
  if (input.failed)
    return {
      kind: 'not-saved',
      label: 'Not saved',
      title: 'Not saved',
      detail: 'Could not save on this device. Copy your text, then free space.',
    };
  const kind = input.state.kind;
  if (kind === 'signed-out' || kind === 'other-account')
    return {
      kind: 'sign-in',
      label: 'Upload paused',
      title: 'Upload paused',
      detail:
        kind === 'signed-out'
          ? 'You are signed out. Changes stay on this device.'
          : 'Another account is signed in. Your changes wait on this device.',
    };
  if (kind === 'attention')
    return {
      kind: 'attention',
      label: 'Needs attention',
      title: 'Needs attention',
      detail: syncStateMessage(input.state, input.noteName ?? null),
    };
  return null;
}

/**
 * The line of the sidebar footer, or `null` when sync needs nothing.
 *
 * The footer states a problem or a pause that a person can act on or must
 * know about. A saved, saving, offline or uploading workspace shows no line.
 */
export function syncProblemLine(input: SaveFacts): string | null {
  if (input.failed) return 'Not saved';
  switch (input.state.kind) {
    case 'signed-out':
    case 'other-account':
      return 'Sign in to upload';
    case 'server-behind':
    case 'update-required':
      return 'Waiting for server update';
    case 'attention':
      return 'Needs attention';
    case 'download-limit':
      return 'Download paused';
    case 'delete-refused':
    case 'stopped':
      return 'Upload paused';
    default:
      return null;
  }
}
