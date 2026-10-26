import { syncStateMessage, type SyncState } from './sync-state.ts';

/** Status copy uses existing save facts and adds no telemetry. */
export function saveStatusWords(input: {
  readonly state: SyncState;
  readonly online: boolean;
  readonly pending: boolean;
  readonly failed: boolean;
  readonly noteName?: string | null;
}): {
  readonly pill: string;
  readonly line: string;
  readonly title: string;
  readonly detail: string;
} {
  if (input.failed)
    return {
      pill: 'Not saved',
      line: 'Not saved',
      title: 'Not saved',
      detail: 'Could not save on this device. Copy your text, then free space.',
    };
  const kind = input.state.kind;
  if (kind === 'signed-out' || kind === 'other-account')
    return {
      pill: 'Paused',
      line: 'Sign in to upload',
      title: 'Upload paused',
      detail:
        kind === 'signed-out'
          ? 'You are signed out. Changes stay on this device.'
          : 'Another account is signed in. Your changes wait on this device.',
    };
  if (kind === 'server-behind' || kind === 'update-required')
    return {
      pill: 'Paused',
      line: 'Waiting for server update',
      title: 'Upload paused',
      detail:
        kind === 'server-behind'
          ? 'The server must update first. Changes stay on this device.'
          : 'Update the app to upload. Changes stay on this device.',
    };
  if (
    kind === 'attention' ||
    kind === 'delete-refused' ||
    kind === 'stopped' ||
    kind === 'download-limit'
  )
    return {
      pill: 'Paused',
      line:
        kind === 'attention'
          ? 'Needs attention'
          : kind === 'download-limit'
            ? 'Download paused'
            : 'Upload paused',
      title: 'Upload paused',
      detail: syncStateMessage(input.state, input.noteName ?? null),
    };
  if (!input.online || kind === 'waiting')
    return {
      pill: 'Offline',
      line: 'Offline. Saved on this device.',
      title: 'Saved on this device',
      detail:
        'No connection. Your changes are safe here and upload when you are online.',
    };
  if (kind === 'in-step' && !input.pending)
    return {
      pill: 'Saved',
      line: 'All changes saved',
      title: 'Saved',
      detail: 'Saved to your account.',
    };
  if (kind === 'sending')
    return {
      pill: 'Saving',
      line: 'Uploading...',
      title: 'Saved on this device',
      detail: 'Saved on this device. Uploading now.',
    };
  return {
    pill: 'Saving',
    line: 'Saving...',
    title: 'Saving',
    detail: 'Saving on this device.',
  };
}
