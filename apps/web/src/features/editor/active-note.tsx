/**
 * The editor of the open note, for the panels around it.
 *
 * The outline needs the live buffer, not the last saved text, and it needs a
 * way to move the caret. The note screen owns the one editor view of the open
 * working copy, so it registers that view here and the panels read it.
 *
 * The scope wraps one open note. It mounts with that note and it goes when the
 * note closes, so a panel of the next screen can never reach the editor of the
 * screen before it. Nothing here renders a note, fetches, or changes a
 * document.
 *
 * Two contexts carry the channel. The value changes on each keystroke batch.
 * The control never changes while the scope is mounted, so the note screen can
 * build its editor once and a change of the text can never rebuild it.
 */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { EditorView } from '@notesapp/editor';
import {
  activeNoteAnchor,
  emptyActiveNote,
  withActiveNoteChange,
  withActiveNoteView,
  type ActiveNote,
} from '../../lib/active-note.ts';

export type { ActiveNote } from '../../lib/active-note.ts';

/** How the open note screen tells the panels about its editor. */
export type ActiveNoteControl = {
  /** Registers the view of the open note. Pass null when it closes. */
  readonly register: (view: EditorView | null) => void;
  /** Reports that the text of the open note changed. */
  readonly announce: () => void;
};

const ActiveNoteContext = createContext<ActiveNote<EditorView> | null>(null);
const ActiveNoteControlContext = createContext<ActiveNoteControl | null>(null);

/** Holds the editor of one open note while that note is on the screen. */
export function ActiveNoteScope({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const [note, setNote] = useState(() => emptyActiveNote<EditorView>());
  const control = useMemo<ActiveNoteControl>(
    () => ({
      register: (view: EditorView | null): void => {
        setNote((current) => withActiveNoteView(current, view));
      },
      announce: (): void => {
        setNote(withActiveNoteChange);
      },
    }),
    [],
  );
  return (
    <ActiveNoteControlContext.Provider value={control}>
      <ActiveNoteContext.Provider value={note}>
        {children}
      </ActiveNoteContext.Provider>
    </ActiveNoteControlContext.Provider>
  );
}

/** Reads the editor of the open note. A panel outside the scope fails here. */
export function useActiveNote(): ActiveNote<EditorView> {
  const note = useContext(ActiveNoteContext);
  if (note === null)
    throw new Error('A panel of the open note needs an active note scope.');
  return note;
}

/** Takes the channel of the open note. A screen outside the scope fails here. */
export function useActiveNoteControl(): ActiveNoteControl {
  const control = useContext(ActiveNoteControlContext);
  if (control === null)
    throw new Error('The note screen needs an active note scope.');
  return control;
}

/** The Outline puts its heading at the top, within the editor scroll margins. */
export function revealInNote(view: EditorView, position: number): void {
  const anchor = activeNoteAnchor(position, view.state.doc.length);
  view.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(anchor, { y: 'start' }),
  });
  view.focus();
}
