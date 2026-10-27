/**
 * The one name and the one glyph of a removal for good.
 *
 * Delete removes a thing that nothing brings back: a note and its versions in
 * Trash, an imported theme, a workspace, a kept text of Needs attention, an
 * account. A move to Trash is not one of them, and it is named Move to Trash
 * from `note-menu.ts` (issue 245). Both words draw the glyph of a bin, so the
 * glyph reaches a screen only through these two modules, and the
 * `trash-label` rule of `tools/check-design-rules.mjs` refuses a Delete word
 * and the glyph anywhere else.
 */
import type { ActionIconName } from './palette-items.ts';

/** The word of an action that removes something for good. */
export const deleteForGoodLabel = 'Delete';

/** The glyph of an action that removes something for good. */
export const deleteGlyph: ActionIconName = 'delete';

/** The glyph of the Trash page, where a person restores and deletes notes. */
export const trashPageGlyph: ActionIconName = 'trash';

/** A folder is removed while its notes go to Trash. */
export const deleteFolderLabel = 'Delete folder';
