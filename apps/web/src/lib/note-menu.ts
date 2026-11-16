/**
 * The rows of the note menu, in the order a person reads them.
 *
 * The note route puts one control in the frame header, and that control is
 * this menu (decision 0069). History and Publish are rows of it, so the
 * header never spends a button of its own on either one and a phone keeps
 * that width for the name of the note.
 *
 * The order groups the rows by what they act on. History and Publish read and
 * share the note as it stands. Rename, Move to folder and Duplicate change
 * the note as a file. Attach an image and Export as Markdown carry content in
 * and out. Move to Trash destroys, so it is not in this list: it is the
 * pinned row under the separator, away from the row a person reaches for by
 * mistake.
 *
 * Each row names a glyph of `lib/palette-items.ts`, so the menu, the palette
 * and the sidebar cannot show three marks for one action (decision 0065).
 *
 * The move to Trash has one name on every surface: the note menu, a row of
 * the tree, a folder row, a selection and the command palette (issue 245).
 * In Trash, Delete removes a note for good, so a move to Trash never reads
 * Delete. This module is the one place that writes those words, and
 * `note-menu.test.ts` refuses any other source that draws the glyph of the
 * move or writes a Delete label for it.
 *
 * This module is pure, so a unit test holds the order and the rows.
 */
import type { ActionIconName } from './palette-items.ts';

/**
 * What one row of the note menu can run.
 *
 * `move-to-trash` is in the list because it is a row of the menu, and it is
 * not in {@link noteMenuRows} because it is the pinned row below the
 * separator.
 */
export type NoteMenuAction =
  | 'open'
  | 'history'
  | 'publish'
  | 'rename'
  | 'move'
  | 'duplicate'
  | 'copy-link'
  | 'attach-image'
  | 'export'
  | 'move-to-trash';

/** One row of the note menu, before a screen gives it a glyph and a handler. */
export type NoteMenuRow = {
  readonly id: NoteMenuAction;
  readonly label: string;
  readonly icon: ActionIconName;
};

/**
 * Where a note menu stands.
 *
 * `header` is the menu of the open note in the frame header (record 0069).
 * `tree` is the menu of a note row of the tree, which the action button, a
 * right click and the keys open (record 0164). The tree menu acts on a note
 * that may not be open, so it offers Open and Copy link and not Attach an
 * image, which needs the editor of the note.
 */
export type NoteMenuSurface = 'header' | 'tree';

/** Which of the rows the open note offers right now. */
export type NoteMenuOffer = {
  /** False when the screen holds no Move to folder dialog. */
  readonly canMove: boolean;
  /** False when the screen holds no Publish dialog. */
  readonly canPublish: boolean;
  /** The menu the rows are for. The header is the default. */
  readonly surface?: NoteMenuSurface | undefined;
};

/** Every row of the note menu, in order, with the menus that show it. */
const allRows: readonly (NoteMenuRow & {
  readonly surfaces: readonly NoteMenuSurface[];
})[] = [
  { id: 'open', label: 'Open', icon: 'open', surfaces: ['tree'] },
  {
    id: 'history',
    label: 'Version history',
    icon: 'history',
    surfaces: ['header', 'tree'],
  },
  {
    id: 'publish',
    label: 'Publish',
    icon: 'publish',
    surfaces: ['header', 'tree'],
  },
  {
    id: 'rename',
    label: 'Rename',
    icon: 'rename',
    surfaces: ['header', 'tree'],
  },
  {
    id: 'move',
    label: 'Move',
    icon: 'move',
    surfaces: ['header', 'tree'],
  },
  {
    id: 'duplicate',
    label: 'Make a copy',
    icon: 'duplicate',
    surfaces: ['header', 'tree'],
  },
  {
    id: 'copy-link',
    label: 'Copy link',
    icon: 'copy-link',
    surfaces: ['tree'],
  },
  {
    id: 'attach-image',
    label: 'Attach an image',
    icon: 'image',
    surfaces: ['header'],
  },
  {
    id: 'export',
    label: 'Export as Markdown',
    icon: 'export',
    surfaces: ['header', 'tree'],
  },
];

/** The one name of the action that moves a note or a folder to Trash. */
export const moveToTrashLabel = 'Move to Trash';

/** The same action as a row of the command palette, which names its object. */
export const moveNoteToTrashPaletteLabel = 'Move this note to Trash';

/** The pinned row that moves the note to Trash. */
export const noteTrashRow: NoteMenuRow = {
  id: 'move-to-trash',
  label: moveToTrashLabel,
  icon: 'move-to-trash',
};

/**
 * The rows the note menu shows for one note.
 *
 * A row whose dialog the screen does not hold is absent, because a row that
 * does nothing is worse than no row at all.
 */
export function noteMenuRows(offer: NoteMenuOffer): readonly NoteMenuRow[] {
  const surface = offer.surface ?? 'header';
  return allRows
    .filter(
      (row) =>
        row.surfaces.includes(surface) &&
        (row.id !== 'move' || offer.canMove) &&
        (row.id !== 'publish' || offer.canPublish),
    )
    .map(({ id, label, icon }) => ({ id, label, icon }));
}
