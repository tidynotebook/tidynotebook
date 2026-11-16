/**
 * The column that the note text and the note footer share.
 *
 * The name of the note is not here: it is the last part of the breadcrumb in
 * the frame header (decision 0069), so the note surface starts with the text.
 * The text and the footer stay one centred column of the note measure, and
 * the editor centres its own lines on the same measure in
 * `packages/editor/src/editor-theme.ts`. See
 * [decision 0055](../../../../docs/decisions/0055-the-note-is-one-centred-column.md).
 *
 * The row, the width of the side region and the measure are the ones of every
 * page (decision 0137), so this module reads them from `@notesapp/ui` and
 * adds only what the note needs: a side region that scrolls inside the note.
 *
 * The rules live here, outside JSX, so a unit test can read them.
 */

/**
 * The classes of the column that the text and the footer share.
 *
 * One measure, centred in the space the note screen owns. A frame that cannot
 * reach the editor adapter reads this constant, the way every page frame reads
 * `pageGutter` from `@notesapp/ui`.
 */
export { noteColumnClassName } from '@notesapp/ui';

/**
 * The classes of the note screen inside the content area of the frame.
 *
 * It takes the height that the frame notices leave, so its foot stays on the
 * screen (`./frame-content.ts`). The text scrolls inside it.
 */
export { noteScreenClassName } from '@notesapp/ui';

/**
 * The classes of the frame that holds the note text and the note footer.
 *
 * The frame draws no space above the text. The editor scrolls inside it, so
 * any padding here stays on the screen under the frame header while the text
 * moves behind it, and a person reads that strip as a second bar that says
 * nothing. The space above the first line belongs to `.cm-content` in
 * `packages/editor/src/editor-theme.ts`, where it scrolls with the text and a
 * click in it still places the caret.
 */
export { noteFrameClassName } from '@notesapp/ui';

/**
 * The row of the note screen: the note frame and the side region.
 *
 * It is the row of every page, so the note text and the column of any other
 * page share one centre. The row fills the height of the note screen.
 */
export { noteRowClassName } from '@notesapp/ui';

/** The side region limits its children to the height of the note screen. */
export { noteSideRegionClassName } from '@notesapp/ui';

/** The outline keeps its natural height until it needs to scroll. */
export { noteOutlineScrollClassName } from '@notesapp/ui';

/**
 * The classes of the footer row under the note text.
 *
 * The footer draws `edge-line` above itself. The note text is a region a
 * person scrolls, and the design guide draws a divider exactly there, so the
 * line states where the text stops and the count of the note starts. Without
 * it the sentence reads as one more line of the note.
 *
 * While a person types on a phone, the keyboard takes half of the screen, and
 * the count is not what they read then. The footer gives its row to the text
 * while the text has the focus on a narrow screen under a finger, and comes
 * back when the text lets the focus go. A desktop keeps it.
 */
export { noteFooterClassName } from '@notesapp/ui';

/** Hides a part of the note on a phone while the text has the focus. */
