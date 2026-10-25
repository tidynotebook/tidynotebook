/**
 * The save state of one note.
 *
 * `resolveSaveState` reads durable facts about one file only. The note saves
 * itself, so no control shows this state. The note screen states it on its
 * root for automation, and the frame reads only `NoteSaveReport`.
 */
import type { LocalStorageErrorKind, QueueState } from '@notesapp/sync';
import { localWriteFailed } from './local-write.ts';

export type SaveState =
  'saved-local' | 'syncing' | 'saved-server' | 'storage-full' | 'save-failed';

/**
 * The durable facts of one file. A local write that runs is not one of them:
 * a key would change it, and the reload guard of the note screen covers the
 * text that no write took yet (record 0175).
 */
export type SaveStateInput = {
  readonly queueState: QueueState | null;
  readonly storageError: LocalStorageErrorKind | null;
  readonly hasUncheckpointedDraft: boolean;
  readonly acceptedHeadRevisionId: string | null;
  readonly localHeadRevisionId: string | null;
};

/** Selects a label from durable facts about one file only. */
export function resolveSaveState(input: SaveStateInput): SaveState {
  if (input.storageError === 'quota') return 'storage-full';
  if (input.storageError !== null) return 'save-failed';
  if (input.queueState === 'conflict') return 'save-failed';
  if (input.hasUncheckpointedDraft) return 'saved-local';
  if (input.queueState === 'sending') return 'syncing';
  if (input.queueState === 'pending') return 'saved-local';
  if (
    input.acceptedHeadRevisionId !== null &&
    input.localHeadRevisionId === input.acceptedHeadRevisionId
  )
    return 'saved-server';
  return 'saved-local';
}

/**
 * What the note screen publishes to the frame about the open note.
 *
 * Only the facts the frame shows. The first edit marks a pending save;
 * further keys leave that fact unchanged (record 0175).
 */
export type NoteSaveReport = {
  /** The current editor work has not reached the server. */
  readonly pendingSave: boolean;
  /**
   * A write to local storage failed, so the typed text is only in this tab.
   * `lib/local-write.ts` decides it.
   */
  readonly localWriteFailed: boolean;
  /** When the last version of this note was created, as an ISO instant. */
  readonly lastSavedAt: string | null;
};

/** The pending work, write failure, and last checkpoint of the open note. */
export function noteSaveReport(input: {
  readonly pendingSave?: boolean;
  readonly storageError: LocalStorageErrorKind | null;
  readonly lastSavedAt: string | null;
}): NoteSaveReport {
  return {
    pendingSave: input.pendingSave ?? false,
    localWriteFailed: localWriteFailed(input.storageError),
    lastSavedAt: input.lastSavedAt,
  };
}
