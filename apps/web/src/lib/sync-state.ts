/**
 * The typed sync state of the open notes area.
 *
 * The sync engine announces events for engineers. This module turns each of
 * them into one typed state, and a second function turns a state into one
 * plain sentence. Nothing in the interface reads engine prose, so a copy
 * change can never break a condition, and no identifier, code, or count of
 * internal objects reaches the person.
 *
 * The sidebar footer states the same fact twice: as one short sentence and as
 * one dot of three colours, so a person reads where the work stands before
 * they read a word. Both readings come from this module, so they cannot
 * disagree.
 */
import { transportFailedCode, type SyncNotice } from '@notesapp/sync';

/** Where sync stands right now. */
export type SyncState =
  /** The engine has not reported anything yet. */
  | { readonly kind: 'starting' }
  /** Everything on this device reached the server. */
  | { readonly kind: 'in-step' }
  /** A save is on its way to the server. */
  | { readonly kind: 'sending' }
  /** The device has no connection, so saves wait here. */
  | { readonly kind: 'waiting' }
  /** A save was refused and waits in the Needs attention list. */
  | { readonly kind: 'attention'; readonly fileId: string | undefined }
  /** A later save replaced text that another device had saved. */
  | { readonly kind: 'superseded'; readonly path: string }
  /** A delete did not run because the note changed elsewhere. */
  | { readonly kind: 'delete-refused'; readonly path: string }
  /** The session ended, so sync stopped until the person signs in. */
  | { readonly kind: 'signed-out' }
  /** Another tab of this browser drives sync. */
  | { readonly kind: 'other-tab' }
  /** The server needs a newer application before this tab syncs again. */
  | { readonly kind: 'update-required' }
  /** The server runs an earlier version, so sync waits for it. */
  | { readonly kind: 'server-behind' }
  /** Sync stopped for a reason the person cannot act on directly. */
  | { readonly kind: 'stopped' };

/** The first state of a session, before the engine reports anything. */
export const startingSyncState: SyncState = { kind: 'starting' };

/**
 * Selects the state for one engine notice.
 *
 * Returns `null` for a notice that does not change what the person sees,
 * such as an internal snapshot restart, so the previous state stays.
 */
export function syncStateOfNotice(notice: SyncNotice): SyncState | null {
  if (notice.kind === 'pushed') return { kind: 'in-step' };
  if (notice.kind === 'preserved')
    return { kind: 'attention', fileId: notice.fileIds[0] };
  if (notice.kind === 'superseded')
    return { kind: 'superseded', path: notice.path };
  if (notice.kind === 'delete-refused')
    return { kind: 'delete-refused', path: notice.path };
  if (notice.kind === 'retry') return { kind: 'waiting' };
  if (notice.kind === 'snapshot-activated' || notice.kind === 'changes-applied')
    return { kind: 'in-step' };
  if (notice.kind === 'paused') return { kind: 'signed-out' };
  if (notice.kind === 'lease-held') return { kind: 'other-tab' };
  if (notice.kind === 'lease-lost') return { kind: 'waiting' };
  if (notice.kind === 'access-lost') return { kind: 'stopped' };
  // A fit after a misfit proves only that sync can run again, so the state
  // starts over and the next queue read or send states where work stands.
  if (notice.kind === 'protocol')
    return notice.fit === 'client-behind'
      ? { kind: 'update-required' }
      : notice.fit === 'server-behind'
        ? { kind: 'server-behind' }
        : startingSyncState;
  // A cycle that failed on the way out never reached the server, so it is a
  // lost connection and not a refusal. A browser reports that it is online
  // long after the connection died, and the person read that saving had
  // stopped when all that happened was that the network went away.
  if (notice.kind === 'cycle-error')
    return notice.code === transportFailedCode
      ? { kind: 'waiting' }
      : { kind: 'stopped' };
  return null;
}

/**
 * One plain sentence for a sync state.
 *
 * `noteName` is the name of the note the state refers to, when the caller
 * could read it. The sentence never shows a path with its `.md` suffix and
 * never shows an identifier.
 */
export function syncStateMessage(
  state: SyncState,
  noteName: string | null = null,
): string {
  const named = noteName === null || noteName === '' ? 'A note' : noteName;
  if (state.kind === 'starting') return 'Connecting to the server.';
  if (state.kind === 'in-step') return 'Everything is saved to the server.';
  if (state.kind === 'sending') return 'Sending your save to the server.';
  if (state.kind === 'waiting')
    return 'No connection. Your saves are on this device and go up when the connection returns.';
  if (state.kind === 'attention')
    return `${named} could not be saved to the server. Open Needs attention to keep the text.`;
  if (state.kind === 'superseded')
    return `Your save of ${named} is now the latest version. The text from the other device is in History.`;
  if (state.kind === 'delete-refused')
    return `${named} changed on another device, so it was not deleted.`;
  if (state.kind === 'signed-out')
    return 'The session ended. Sign in again to save to the server.';
  if (state.kind === 'other-tab')
    return 'Another tab of this browser is saving to the server.';
  if (state.kind === 'update-required')
    return 'Saving to the server waits for an update of Notesapp. Your work stays on this device.';
  if (state.kind === 'server-behind')
    return 'The server runs an earlier version of Notesapp, so saving waits. Your work stays on this device.';
  return 'Saving to the server stopped. Your work stays on this device.';
}

/**
 * Whether a state only reports how far the queue got.
 *
 * `starting`, `in-step`, and `sending` say nothing more than that. A count
 * of the queue can replace one of them without hiding anything. Every other
 * state reports an event the person has to know about, so a queue count
 * must never overwrite it.
 */
export function syncStateIsQuiet(state: SyncState): boolean {
  return (
    state.kind === 'starting' ||
    state.kind === 'in-step' ||
    state.kind === 'sending'
  );
}

/**
 * Selects the state that the queue of this device implies.
 *
 * The engine only announces what it did, so a device with an empty queue
 * gets no announcement at all. Without this rule the first state of a
 * session stays "sending" for as long as the tab is open, even though
 * nothing waits to go up. A queued save means a send is in progress; an
 * empty queue means everything reached the server.
 */
export function syncStateOfQueue(
  current: SyncState,
  pendingCount: number,
): SyncState {
  if (!syncStateIsQuiet(current)) return current;
  return pendingCount > 0 ? { kind: 'sending' } : { kind: 'in-step' };
}

/** Whether a state asks the person to do something. */
export function syncNeedsAttention(state: SyncState): boolean {
  return (
    state.kind === 'attention' ||
    state.kind === 'signed-out' ||
    state.kind === 'stopped' ||
    state.kind === 'delete-refused' ||
    state.kind === 'update-required'
  );
}

/** The note a state speaks about, when it names one. */
export function syncStateFileId(state: SyncState): string | null {
  if (state.kind === 'attention') return state.fileId ?? null;
  return null;
}

/** What the dot of the sidebar footer states. */
export type SyncDot =
  /** Everything a person wrote is on the server. */
  | 'saved'
  /** Something is on its way, or it waits for a connection. */
  | 'pending'
  /** The person has to act before the work reaches the server. */
  | 'attention';

/**
 * Which dot one state shows.
 *
 * A device with no connection is pending and not a failure: the saves are on
 * the device and they go up when the connection returns. A save that another
 * device superseded is saved, because the text of this device is the latest
 * version and the other one is in History.
 */
export function syncDot(state: SyncState, online: boolean): SyncDot {
  if (syncNeedsAttention(state)) return 'attention';
  if (!online) return 'pending';
  return state.kind === 'in-step' || state.kind === 'superseded'
    ? 'saved'
    : 'pending';
}

/**
 * The classes of that dot.
 *
 * Six pixels of the tone, and no text of its own: the sentence beside it
 * carries the meaning, so a person who does not separate the hues loses
 * nothing. Every tone is a token of the palette that `theme.test.ts` holds.
 */
export function syncDotClassName(dot: SyncDot): string {
  const fill =
    dot === 'saved'
      ? 'bg-success'
      : dot === 'attention'
        ? 'bg-danger'
        : 'bg-muted';
  return `size-1.5 shrink-0 rounded-full ${fill}`;
}
