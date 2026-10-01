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
 * row, which reads as a control and not as a name. The native `size`
 * attribute states the width in characters, so the browser measures the face
 * and no script measures anything, and `max-w-full` holds the field inside
 * the room the breadcrumb leaves it.
 *
 * The field has no inline padding, so the name starts on the same pixel as
 * the folder part before it and the whole path reads as one line.
 *
 * Under touch the name takes the touch step of every field, so Safari on iOS
 * does not zoom the page into the header on a tap.
 *
 * The rules live here, outside JSX, so a unit test can read them.
 */
import { focusOutline, touchFieldText, transitionSurface } from '@notesapp/ui';

/** The fewest characters the field is wide, which is its placeholder. */
export const noteNameFieldMinimum = 9;

/** The most characters the field is wide before the header holds it. */
export const noteNameFieldMaximum = 80;

/**
 * How many characters wide the field is for one name.
 *
 * The browser turns this into a width from the face it renders, which is
 * why the field follows the name with no measurement of its own.
 */
export function noteNameFieldSize(name: string): number {
  return Math.min(
    Math.max(name.length, noteNameFieldMinimum),
    noteNameFieldMaximum,
  );
}

/** The classes of the inline editable note name in the frame header. */
export function noteNameFieldClassName(): string {
  return `w-auto min-w-0 max-w-full truncate rounded-md border-0 bg-transparent py-1 text-ui ${touchFieldText} font-medium text-strong outline-none ${transitionSurface} hover:bg-hover ${focusOutline}`;
}
