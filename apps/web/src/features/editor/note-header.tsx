/**
 * The name of the open note, in the frame header.
 *
 * The name is the last part of the breadcrumb, and it is the field a person
 * types the name into (decision 0069). The note route claims that part with
 * `HeaderLeaf`, so the frame draws no word of its own and the note surface
 * below keeps its whole height for the text.
 *
 * A keystroke changes the words in the field and nothing else. Enter or a
 * move out of the field keeps the name, and Enter then moves the caret into
 * the note. Escape gives up the typed words (`lib/note-name-commit.ts`).
 *
 * The reason a name cannot be kept is not here. The header row is 44 px and
 * it holds no second line, so the note screen states the reason as one
 * message on the note and this field points at it.
 */
import { useRef, type ReactNode } from 'react';
import {
  noteNameFieldClassName,
  noteNameFieldSize,
} from '../../lib/note-name-field.ts';
import { noteNameInputPolicy } from '../../lib/note-name-input.ts';
import { noteNameKey } from '../../lib/note-name-commit.ts';
import { HeaderLeaf } from '../../shell/header-slot.tsx';

/** The id of the message that states why a name cannot be kept. */
export function noteNameErrorId(fileId: string): string {
  return `notes-path-error-${fileId}`;
}

/** The editable name of one open note. */
export function NoteHeader({
  fileId,
  name,
  nameError,
  onNameChange,
  onNameCommit,
  onNameRevert,
  onNameDone,
  nameInputRef,
  selectOnFirstFocus = false,
}: {
  readonly fileId: string;
  readonly name: string;
  readonly nameError: string;
  /** Runs on each keystroke. It changes the words in the field only. */
  readonly onNameChange: (name: string) => void;
  /**
   * Runs when the field loses focus or the person presses Enter. It returns
   * whether the note kept the name.
   */
  readonly onNameCommit: () => boolean;
  /** Runs on Escape, and gives the field back the name of the note. */
  readonly onNameRevert: () => void;
  /** Moves the caret into the note after Enter or Escape. */
  readonly onNameDone: () => void;
  readonly nameInputRef?: React.Ref<HTMLInputElement> | undefined;
  /** Selects the initial name when a new note first takes native focus. */
  readonly selectOnFirstFocus?: boolean | undefined;
}): ReactNode {
  const fallbackRef = useRef<HTMLInputElement | null>(null);
  const selectOnFocus = useRef(selectOnFirstFocus);

  return (
    <HeaderLeaf>
      <input
        ref={nameInputRef ?? fallbackRef}
        id={`notes-path-${fileId}`}
        className={noteNameFieldClassName()}
        type="text"
        // The field follows the name, so the hover fill covers the words and
        // not the free width of the header.
        size={noteNameFieldSize(name)}
        value={name}
        {...noteNameInputPolicy()}
        aria-label="Note name"
        aria-invalid={nameError !== ''}
        aria-describedby={
          nameError === '' ? undefined : noteNameErrorId(fileId)
        }
        placeholder="Note name"
        onChange={(event): void => onNameChange(event.target.value)}
        onFocus={(event): void => {
          if (!selectOnFocus.current) return;
          selectOnFocus.current = false;
          event.currentTarget.select();
        }}
        onBlur={(): void => {
          onNameCommit();
        }}
        onKeyDown={(event): void => {
          const action = noteNameKey(event.key, event.nativeEvent.isComposing);
          if (action === null) return;
          event.preventDefault();
          if (action === 'revert') onNameRevert();
          // A refused name keeps the caret here, beside its reason.
          else if (!onNameCommit()) return;
          onNameDone();
        }}
      />
    </HeaderLeaf>
  );
}
