import type { NoteDocument } from '@notesapp/sync';

/** The identity of the note that one loader result describes. */
export type NoteLoadIdentity = {
  readonly accountId: string;
  readonly workspaceId: string;
  readonly fileId: string;
};

/** The loading states of one note before its editor mounts. */
export type NoteLoadStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'purged' }
  | { readonly kind: 'deleted'; readonly path: string }
  | { readonly kind: 'unavailable'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly path: string;
      readonly text: string;
      readonly headRevisionId: string | null;
      readonly workingCopyId?: string | undefined;
      readonly sequence: number;
      /** An older local draft needs a choice before an editor can save it. */
      readonly recovery?:
        | { readonly workingCopyId: string; readonly acceptedText: string }
        | undefined;
      /**
       * The document of the note on this device with its generation, or
       * `null` when this device holds none yet (record 0081). The editor
       * binds to it, and each of its writes names the generation (record
       * 0181).
       */
      readonly document?: NoteDocument | null | undefined;
    };

/** A loader result and the note that owns it. */
export type NoteLoadState = {
  readonly identity: NoteLoadIdentity;
  readonly status: NoteLoadStatus;
};

/** Whether two loader identities name the same note in the same scope. */
export function isSameNote(
  first: NoteLoadIdentity,
  second: NoteLoadIdentity,
): boolean {
  return (
    first.accountId === second.accountId &&
    first.workspaceId === second.workspaceId &&
    first.fileId === second.fileId
  );
}

/**
 * What the open read of this device answered for a note.
 *
 * A status is a note that the device can show. `server` is a note that only
 * the server read can open, and `slow` is a read that outlasted the hold.
 */
export type DeviceOpen = NoteLoadStatus | 'server' | 'slow';

/**
 * How long a navigation holds the screen a person left while the next note
 * is read from this device.
 *
 * A read of the device ends well inside it, so the next note replaces the
 * last one with no placeholder between them. A read that lasts longer shows
 * the placeholder, so a click never waits without an answer. The value is
 * the common bound below which a wait needs no indicator.
 */
export const noteHoldMs = 300;

/**
 * Gives a loader result only to the note that owns it.
 *
 * The first render of a note has no loader result yet. It shows what the open
 * read of this device answered, so a note that this device holds opens with
 * its content and never as loading. A note that only the server can open, or
 * a read that outlasted the hold, shows the loading state.
 */
export function noteLoadStatusFor(
  state: NoteLoadState,
  identity: NoteLoadIdentity,
  opened: DeviceOpen | null,
): NoteLoadStatus {
  if (isSameNote(state.identity, identity)) return state.status;
  if (opened === null || opened === 'server' || opened === 'slow')
    return { kind: 'loading' };
  return opened;
}

/**
 * Whether a note that this device holds can open from the device alone.
 *
 * The editor binds to the document of the note. A note that the server holds
 * and whose document this device lacks opens from the server read instead,
 * which brings the document, because an editor bound to a document of its own
 * would start that note from Markdown on this device (records 0084, 0088). A
 * note with no accepted head is one that only this device holds, even when it
 * has a local version, and it starts its own document.
 */
export function opensFromDevice(
  document: Uint8Array | null,
  acceptedHeadRevisionId: string | null,
): boolean {
  return document !== null || acceptedHeadRevisionId === null;
}
