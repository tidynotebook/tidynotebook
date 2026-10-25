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
import {
  downloadLimitCode,
  transportFailedCode,
  type QueueState,
  type SyncNotice,
} from '@notesapp/sync';
import { productName } from '@notesapp/core';

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
  /**
   * The first sync of this device waits for the next month, because the
   * download limit of the month is used (record 0193). Saves wait here.
   */
  | { readonly kind: 'download-limit' }
  /**
   * The server refused saves for good, so they are parked and wait in the
   * Needs attention list. Nothing sends them until the person acts.
   */
  | { readonly kind: 'attention'; readonly parked: number }
  /** A delete did not run because the note changed elsewhere. */
  | { readonly kind: 'delete-refused'; readonly path: string }
  /** The session ended, so sync stopped until the person signs in. */
  | { readonly kind: 'signed-out' }
  /**
   * Another account signed in on this browser, so the work of this account
   * waits on the device until this account signs in again (record 0113).
   */
  | { readonly kind: 'other-account' }
  /** The server needs a newer application before this tab syncs again. */
  | { readonly kind: 'update-required' }
  /** The server runs an earlier version, so sync waits for it. */
  | { readonly kind: 'server-behind' }
  /** Sync stopped for a reason the person cannot act on directly. */
  | { readonly kind: 'stopped' };

/** The first state of a session, before the engine reports anything. */
export const startingSyncState: SyncState = { kind: 'starting' };

/**
 * Whether one notice proves only that sync can run again.
 *
 * A connection proof, a fit after a misfit, and a session that serves the
 * engine again after a pause say nothing about the queue. The state starts
 * over, and the caller reads the queue at once, because nothing else may
 * announce for a while.
 */
export function noticeStartsOver(notice: SyncNotice): boolean {
  return (
    notice.kind === 'connected' ||
    notice.kind === 'resumed' ||
    (notice.kind === 'protocol' && notice.fit === 'compatible')
  );
}

/**
 * Whether the queue of the device states where the work stands after one
 * notice.
 *
 * A send, a refusal, and a pull each change what the queue holds or prove
 * that the connection works, so the caller reads the queue after them. A
 * refused save is parked in the queue, so the queue and not the notice
 * states how many saves wait for the person.
 */
export function noticeReadsQueue(notice: SyncNotice): boolean {
  return (
    noticeStartsOver(notice) ||
    notice.kind === 'pushed' ||
    notice.kind === 'preserved' ||
    notice.kind === 'snapshot-activated' ||
    notice.kind === 'changes-applied'
  );
}

/**
 * A connection proof also clears an account read kept from an offline start.
 * Ordinary feed notices cost no account read. A locked refusal still reads
 * the account at once, so the locked screen keeps its existing rule.
 */
export function noticeRechecksAccount(notice: SyncNotice): boolean {
  return notice.kind === 'account-locked' || notice.kind === 'connected';
}

/**
 * Selects the state for one engine notice.
 *
 * Returns `null` for a notice that does not change what the person sees,
 * such as an internal snapshot restart, so the previous state stays.
 */
export function syncStateOfNotice(notice: SyncNotice): SyncState | null {
  if (notice.kind === 'pushed') return { kind: 'in-step' };
  // A refused save is parked in the queue, and a refusal that kept the text
  // as a new note parks nothing. The queue read that follows the notice
  // states which one happened and how many saves wait (`syncStateOfQueue`).
  if (notice.kind === 'preserved') return null;
  // A save that passed a newer head joins the work of that head, so nothing
  // of the other device went to History alone. When the save joined work
  // that this device had not seen, the note offers Review, and that is the
  // one message of the cause (record 0087).
  if (notice.kind === 'superseded') return null;
  if (notice.kind === 'delete-refused')
    return { kind: 'delete-refused', path: notice.path };
  if (notice.kind === 'retry') return { kind: 'waiting' };
  if (notice.kind === 'snapshot-activated' || notice.kind === 'changes-applied')
    return { kind: 'in-step' };
  if (notice.kind === 'paused')
    return notice.reason === 'other-account'
      ? { kind: 'other-account' }
      : { kind: 'signed-out' };
  // The lease only names the tab that sends. Every tab of the browser shares
  // one queue, and the lease tab sends it for all of them, so the queue
  // states where the work stands. A sentence about another tab gave the
  // person nothing to do, and it stayed after the tab took the lease.
  if (notice.kind === 'lease-held' || notice.kind === 'lease-lost') return null;
  if (notice.kind === 'access-lost') return { kind: 'stopped' };
  if (noticeStartsOver(notice)) return startingSyncState;
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
      : notice.code === downloadLimitCode
        ? { kind: 'download-limit' }
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
    return 'No connection. Saves wait on this device.';
  if (state.kind === 'download-limit')
    return 'Sync waits for the next month. Saves wait here.';
  // The status only states the fact. The Needs attention link below it is
  // the way to the saves, so the cause has one message and one action.
  if (state.kind === 'attention')
    return state.parked === 1
      ? '1 save needs attention.'
      : `${String(state.parked)} saves need attention.`;
  if (state.kind === 'delete-refused')
    return `${named} changed on another device. It is kept.`;
  if (state.kind === 'signed-out') return 'The session ended. Sign in to save.';
  if (state.kind === 'other-account')
    return 'Another account signed in. Your work waits.';
  if (state.kind === 'update-required')
    return `Update ${productName} to save to the server.`;
  if (state.kind === 'server-behind') return 'Saves wait for a server update.';
  return 'Saving stopped. Your work is on this device.';
}

/**
 * The longest sentence the footer may say, in characters.
 *
 * The narrowest sidebar leaves about 178 px for the sentence beside the dot,
 * which holds about 24 characters of `text-control`. Every sentence fits in
 * two lines of it, with a note name of a usual length, and the line wraps
 * and is never cut, so a longer name still reads in full.
 */
export const syncLineBudget = 48;

/**
 * The classes of the footer status, inside its container row.
 *
 * The sentence wraps and is never cut: the status that matters most is the
 * one a person cannot afford to lose to an ellipsis. The dot sits in a frame
 * of one line of `text-control`, so it stays beside the first line when the
 * sentence takes two.
 */
export const syncStatusClassNames = {
  status: 'flex min-w-0 flex-1 items-start gap-2 py-1',
  dotFrame: 'flex h-5 shrink-0 items-center',
  line: 'min-w-0 flex-1 text-muted',
} as const;

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

/** What the queue of one workspace holds, as the footer states it. */
export type SyncQueue = {
  /** Saves that wait to go to the server, or go now. */
  readonly unsent: number;
  /** Saves the server refused for good. Nothing sends them again. */
  readonly parked: number;
};

/**
 * Counts the queue entries of one workspace by what happens to them.
 *
 * A parked entry stays in the queue with its state `conflict`, and the
 * engine never sends it again. It is not a send in progress.
 */
export function syncQueueOf(
  entries: readonly { readonly state: QueueState }[],
): SyncQueue {
  const parked = entries.filter((entry) => entry.state === 'conflict').length;
  return { unsent: entries.length - parked, parked };
}

/**
 * Selects the state that the queue of this device implies.
 *
 * The engine only announces what it did, so a device with an empty queue
 * gets no announcement at all. Without this rule the first state of a
 * session stays "sending" for as long as the tab is open, even though
 * nothing waits to go up.
 *
 * A parked save outranks a send: the send ends on its own, and the parked
 * save waits for the person for as long as the tab is open. A parked save is
 * never a send in progress, so a queue that holds only parked saves never
 * reads as sending. The attention state is the queue too, so it ends when
 * the person retries, discards, or keeps the last parked save as a new note.
 * An empty queue means everything reached the server.
 */
export function syncStateOfQueue(
  current: SyncState,
  queue: SyncQueue,
): SyncState {
  if (!syncStateIsQuiet(current) && current.kind !== 'attention')
    return current;
  if (queue.parked > 0) return { kind: 'attention', parked: queue.parked };
  return queue.unsent > 0 ? { kind: 'sending' } : { kind: 'in-step' };
}

/**
 * The state when the browser reports a connection again.
 *
 * A lost connection is the one state that the queue does not replace, so
 * the state starts over and the queue read that follows states where the
 * work stands. Without this, a device with nothing to send kept the line of
 * a lost connection after the connection returned, because no engine notice
 * came. When the connection is still down, the engine reports it again.
 */
export function syncStateOnline(current: SyncState): SyncState {
  return current.kind === 'waiting' ? startingSyncState : current;
}

/** Whether a state asks the person to do something. */
export function syncNeedsAttention(state: SyncState): boolean {
  return (
    state.kind === 'attention' ||
    state.kind === 'signed-out' ||
    state.kind === 'other-account' ||
    state.kind === 'stopped' ||
    state.kind === 'delete-refused' ||
    state.kind === 'update-required'
  );
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
 * the device and they go up when the connection returns.
 */
export function syncDot(state: SyncState, online: boolean): SyncDot {
  if (syncNeedsAttention(state)) return 'attention';
  if (!online) return 'pending';
  return state.kind === 'in-step' ? 'saved' : 'pending';
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

/** What the sidebar footer shows: one sentence and one dot. */
export type SyncFooter = {
  readonly line: string;
  readonly dot: SyncDot;
};

/**
 * The sentence and the dot of the sidebar footer.
 *
 * The open note reports pending work before a checkpoint enters the queue.
 * That fact prevents a server-saved claim while the queue is still empty.
 * Sync only knows about work that reached local storage. When a write of the
 * open note to local storage fails, the typed text is only in this tab, so a
 * line that reads that everything is saved would be false. That failure then
 * takes the footer, and the note itself states the cause and the step that
 * helps, so the footer only points at it.
 */
export function syncFooter(input: {
  readonly state: SyncState;
  readonly online: boolean;
  readonly noteName: string | null;
  readonly openNoteWriteFailed: boolean;
  readonly openNotePending?: boolean;
}): SyncFooter {
  if (input.openNoteWriteFailed)
    return {
      line: 'The open note is not saved.',
      dot: 'attention',
    };
  if (input.online && input.state.kind === 'in-step' && input.openNotePending)
    return { line: 'Saving the open note to the server.', dot: 'pending' };
  return {
    line: input.online
      ? syncStateMessage(input.state, input.noteName)
      : 'No connection. Notes stay on this device.',
    dot: syncDot(input.state, input.online),
  };
}
