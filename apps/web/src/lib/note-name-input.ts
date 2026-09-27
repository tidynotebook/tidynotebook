/** Browser policy for the note name field. */
export type NoteNameInputPolicy = {
  readonly autoComplete: 'off';
};

/**
 * The note name is application content, not saved personal data.
 *
 * The explicit autocomplete value stops a keyboard from treating the field
 * as a contact name or another stored form value.
 */
export function noteNameInputPolicy(): NoteNameInputPolicy {
  return { autoComplete: 'off' };
}

/** A coarse touch screen needs the native tap to open its keyboard. */
export function shouldFocusNewNoteNameOnOpen(coarseTouch: boolean): boolean {
  return !coarseTouch;
}
