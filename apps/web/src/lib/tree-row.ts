/**
 * How one row of the folder tree states what it is.
 *
 * The tree shows two different things at the same time, and a person has to
 * tell them apart at a glance:
 *
 * - The **open note**, which is the note the screen next to the tree shows.
 * - The **selected folder**, which is the parent that New note and New folder
 *   use.
 *
 * Both were one quiet fill before, so a note directly under its folder read
 * as one band of colour with no edge between them. They now use two different
 * marks of the palette: the open note takes the strongest fill of the theme,
 * and the selected folder takes the quiet fill with an edge around it. An
 * outline next to a fill separates at every theme and at every zoom, which a
 * second shade of the same fill does not.
 *
 * Every token here is proved on every surface by `theme.test.ts` in
 * `packages/ui`: `border` meets the 3 to 1 non-text minimum and `textStrong`
 * meets 4.5 to 1, on the sidebar surface and on both fills.
 */

/** What one row of the tree is right now. */
export type TreeRowState = {
  /** The row is the note that the screen next to the tree shows. */
  readonly open?: boolean | undefined;
  /** The row is the folder that a create action uses as its parent. */
  readonly selected?: boolean | undefined;
  /** A dragged row is over this row and it accepts the drop. */
  readonly dropTarget?: boolean | undefined;
};

/** The classes of the container of one tree row. */
export function treeRowClassName(state: TreeRowState = {}): string {
  const mark = state.open
    ? 'bg-active ring-1 ring-inset ring-edge-subtle'
    : state.selected
      ? 'bg-hover ring-1 ring-inset ring-edge'
      : 'hover:bg-hover';
  const drop = state.dropTarget === true ? 'ring-2 ring-focus' : '';
  return ['flex items-center gap-1 rounded-lg', mark, drop]
    .filter((part) => part !== '')
    .join(' ');
}

/** The text colour of the label inside one tree row. */
export function treeRowTextClassName(state: TreeRowState = {}): string {
  return state.open === true || state.selected === true
    ? 'text-strong'
    : 'text-muted group-hover:text-strong';
}
