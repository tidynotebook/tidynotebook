/**
 * The field that holds the name of the open note.
 *
 * The name is the last part of the breadcrumb, so the field stands where the
 * word of the route stands and reads exactly like it: the body step of the
 * chrome, the medium weight and the strong ink (decision 0069). It is a name
 * a person writes, not a form field, so it carries no box and no line at
 * rest, under the pointer, or while a person types. The pointer gets the
 * hover fill of the palette, which says the words can be changed and moves
 * nothing on the screen, and the keyboard gets the one focus treatment of the
 * product (record 0065).
 *
 * The field is as wide as the name and no wider. A field that took the free
 * width of the header drew its hover fill across a thousand pixels of empty
 * row, which reads as a control and not as a name. A hidden text span sets
 * the width from the same font and text as the input, plus 1 px for the caret.
 * This works without native content sizing in older browsers. `max-w-full`
 * holds the field inside the room that the breadcrumb leaves it. An empty
 * field follows its placeholder.
 *
 * The field has 4 px of padding on each side, so the hover fill has space
 * around the name. The text stays on the breadcrumb baseline.
 *
 * Under touch the name takes the touch step of every field, so Safari on iOS
 * does not zoom the page into the header on a tap.
 *
 * The rules live here, outside JSX, so a unit test can read them.
 */
import { focusOutline, touchFieldText, transitionSurface } from '@notesapp/ui';

/** The text shown when the note has no name. */
export const noteNameFieldPlaceholder = 'Note name';

/** Both the input and its width span must use the same text metrics. */
export const noteNameFieldText = `px-1 py-1 text-ui ${touchFieldText} font-medium`;

/** The span sets the width without a character minimum or script measurement. */
export const noteNameFieldContainer = 'relative inline-grid min-w-0 max-w-full';

/** Keep the width span out of sight and leave 1 px for the input caret. */
export const noteNameFieldMeasure = `invisible overflow-hidden whitespace-pre border-r border-transparent ${noteNameFieldText}`;

/** The classes of the inline editable note name in the frame header. */
export function noteNameFieldClassName(): string {
  return `absolute inset-0 w-full min-w-0 max-w-full truncate rounded-md border-0 bg-transparent ${noteNameFieldText} text-strong outline-none ${transitionSurface} hover:bg-hover ${focusOutline}`;
}
