/**
 * The live document of the note screen and its life over the mounts of the
 * screen (records 0081, 0082).
 *
 * The note is built once for the working copy. The editor binds to it, so
 * the text on the screen and the text of the note are one value. A stored
 * draft that the document does not hold yet becomes local work of this
 * device, so nothing is lost while a device moves from a text draft to a
 * document.
 *
 * The clean up of the effects of the screen releases the note. React mounts
 * the effects twice in development, so each mount takes the note through
 * `holdNote`, which opens it again with every change after a release
 * (record 0181).
 *
 * A render opens nothing. The note opens at the first use by a mount or an
 * effect, so a render that React throws away, and a later render after the
 * loader read the note again, leave no note that nothing releases. Each
 * mount holds one note, and its clean up releases that one note.
 */
import { useRef } from 'react';
import { openBoundNote, type BoundNote } from '@notesapp/editor';
import type { NoteDocument } from '@notesapp/sync';

/** What the life of the note of a screen needs of a note. */
export type ScreenBoundNote<Note> = {
  /** Ends the note. A second release changes nothing. */
  release(): void;
  /** A new note with every change after a release, or this note while open. */
  reopen(): Note;
};

/** One hold of the note by one effect of the screen. */
export type ScreenNoteHold<Note> = {
  /** The note that this hold keeps open. */
  readonly note: Note;
  /** Ends this hold. The note ends with its last hold. */
  readonly release: () => void;
};

/** The note that the mounted effects of one screen use. */
export type ScreenNote<Note = BoundNote> = {
  /** The note now, which opens at the first read. A render never reads it. */
  readonly noteRef: { readonly current: Note };
  /**
   * Holds the note of this mount, opened again after its last hold ended.
   *
   * The effect that makes the view and the effect that writes the work each
   * hold the note. React runs the set up of a layout effect before the clean
   * up of a passive effect, so a release by one effect alone ended the note
   * of a view that the other effect had just made. The undo of that view
   * was gone (issue 517). With holds, the note ends only when no effect
   * holds it, and a view never outlives its note.
   */
  readonly holdNote: () => ScreenNoteHold<Note>;
};

/**
 * The life of the note of one screen, from the function that opens it.
 *
 * Nothing opens until a mount or an effect asks for the note. `holdNote`
 * opens the note on the first mount and opens it again after the last hold
 * ended, so each mount holds exactly one open note.
 */
export function createScreenNote<Note extends ScreenBoundNote<Note>>(
  open: () => Note,
): ScreenNote<Note> {
  let note: Note | null = null;
  // The holds of the open note. Only an open note has a hold.
  let holds = 0;
  const current = (): Note => {
    note ??= open();
    return note;
  };
  return {
    noteRef: {
      get current(): Note {
        return current();
      },
    },
    holdNote: (): ScreenNoteHold<Note> => {
      // A note with a hold is open, so `reopen` gives the same note.
      const held = note === null ? open() : note.reopen();
      note = held;
      holds += 1;
      let ended = false;
      return {
        note: held,
        release: (): void => {
          if (ended) return;
          ended = true;
          holds -= 1;
          if (holds === 0) held.release();
        },
      };
    },
  };
}

/** Opens the note of one screen from the document and text the loader read. */
export function useScreenNote(
  document: NoteDocument | null,
  text: string,
): ScreenNote {
  // The first render of the screen fixes what the note opens from. A later
  // read of the loader with the same key opens nothing.
  const life = useRef<ScreenNote | null>(null);
  life.current ??= createScreenNote(() =>
    openBoundNote(document?.bytes ?? null, text),
  );
  return life.current;
}
