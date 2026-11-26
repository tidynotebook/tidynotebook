/**
 * The actions the open note screen offers to the rest of the shell.
 *
 * The command palette lives in the shell and the note screen lives under
 * it, so the note screen registers what it can do and the palette offers
 * only those actions. This replaces the window event bus that connected
 * the old header search to the editor: the channel is typed, it is scoped
 * to the React tree, and an action that no screen registered is not
 * offered at all.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { FormatActionId } from '@notesapp/editor';
import type { FormatPaletteRow } from '../../lib/format-toolbar.ts';

/** What the open note screen can do on request. */
export type NoteScreenActions = {
  readonly fileId: string;
  /** Deletes the open note, tells the person, and leaves for the note list. */
  readonly deleteAndLeave: (() => void) | null;
  /** Opens the Move to folder dialog of the open note. */
  readonly moveToFolder: (() => void) | null;
  /** Copies the open note into a new note beside it. */
  readonly duplicate: (() => void) | null;
  /** Opens the image chooser of the open editor. */
  readonly attachImage: (() => void) | null;
  /** Saves the open note as one Markdown file on this device. */
  readonly exportMarkdown: (() => void) | null;
  /** Copies the whole Markdown text of the open editor to the clipboard. */
  readonly copyMarkdown: (() => void) | null;
  /** Opens the dialog that publishes the open note as a read-only link. */
  readonly publish: (() => void) | null;
  /**
   * Runs one format action on the open editor, as a tool of the row does
   * (record 0094).
   */
  readonly format: ((id: FormatActionId) => void) | null;
  /**
   * The formatting rows of the palette for where the caret stands now. The
   * open note gives them, so the frame loads no editor code (record 0177).
   */
  readonly formatRows: () => readonly FormatPaletteRow[];
  /**
   * Fills one template note and writes it over the selection of the open
   * editor (record 0149).
   */
  readonly insertTemplate: ((templateFileId: string) => void) | null;
};

type NoteActionsChannel = {
  readonly actions: NoteScreenActions | null;
  readonly register: (actions: NoteScreenActions | null) => void;
};

const NoteActionsContext = createContext<NoteActionsChannel>({
  actions: null,
  register: () => {},
});

/** Holds what the open note screen registered. */
export function NoteActionsScope({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const [actions, setActions] = useState<NoteScreenActions | null>(null);
  const value = useMemo<NoteActionsChannel>(
    () => ({ actions, register: setActions }),
    [actions],
  );
  return (
    <NoteActionsContext.Provider value={value}>
      {children}
    </NoteActionsContext.Provider>
  );
}

/** Reads what the open note screen can do, or `null` on another screen. */
export function useNoteActions(): NoteScreenActions | null {
  return useContext(NoteActionsContext).actions;
}

/**
 * Registers the actions of the open note screen while it is mounted.
 *
 * The note screen passes one stable object, so a keystroke that only changes
 * the buffer does not re-register. The shell reads the object and offers each
 * action in the command palette.
 */
export function useRegisterNoteActions(actions: NoteScreenActions): void {
  const { register } = useContext(NoteActionsContext);
  useEffect(() => {
    register(actions);
    return () => {
      register(null);
    };
  }, [register, actions]);
}

export function useNoteActionsForRole(
  actions: NoteScreenActions,
  readOnly: boolean,
): NoteScreenActions {
  return useMemo(
    () =>
      readOnly
        ? {
            ...actions,
            deleteAndLeave: null,
            moveToFolder: null,
            duplicate: null,
            attachImage: null,
            publish: null,
            format: null,
            formatRows: () => [],
            insertTemplate: null,
          }
        : actions,
    [actions, readOnly],
  );
}
