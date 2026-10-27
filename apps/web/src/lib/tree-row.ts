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
 * Both marks are fills now, and neither is an edge (decision 0064). The open
 * note takes the mark of `rowClassName`, the one recipe of a row: the active
 * surface, the strong text and the medium weight. The selected folder takes
 * the hover surface, which is the quieter of the two fills, so a note sitting
 * directly under its own folder still reads as two rows. Nothing in the tree
 * takes a ring except a drop target, where the edge is the whole message and
 * there is no text to carry it (decision 0063).
 *
 * A level of the tree indents by one fixed step and draws no guide line. The
 * steps stop at `deepestSteppedBranch`, so the column that holds a name has a
 * floor: every level used to add a step and nothing stopped it, so a folder
 * ten levels down in a narrow sidebar showed a chevron, a folder mark and no
 * name at all.
 *
 * A person can also build a selection of many rows (record 0164). A row of
 * it takes the fill of a chosen row, and while it exists the open note keeps
 * its strong text and gives up its fill, so the fill names the rows that an
 * action acts on.
 *
 * Every token here is proved on every surface by `theme.test.ts` in
 * `packages/ui`: `textStrong` meets 4.5 to 1 on the sidebar surface and on
 * both fills, and `focus` meets the 3 to 1 non-text minimum.
 */
import { buttonClassName, rowClassName } from '@notesapp/ui';

/** What one row of the tree is right now. */
export type TreeRowState = {
  /** The row is the note that the screen next to the tree shows. */
  readonly open?: boolean | undefined;
  /** The row is the folder that a create action uses as its parent. */
  readonly selected?: boolean | undefined;
  /** The row is in a selection that a person built (record 0164). */
  readonly picked?: boolean | undefined;
  /** Some row of the tree is in such a selection. */
  readonly selecting?: boolean | undefined;
  /** A dragged row is over this row and it accepts the drop. */
  readonly dropTarget?: boolean | undefined;
};

/**
 * The classes of the container of one tree row.
 *
 * The container is the row: it carries the fill, the hover and the mark, and
 * the name control and the two icon actions sit inside it, so the pointer
 * answer covers the same box a person aims at. It is the `group` of the row,
 * which is what an action that appears on hover reads.
 */
export function treeRowClassName(state: TreeRowState = {}): string {
  // While a person builds a selection, the fill of a chosen row is the mark
  // of the rows an action acts on, and the open note keeps its strong text
  // alone, so a person reads one answer to "which rows will this act on".
  const filled =
    state.picked === true || (state.open === true && state.selecting !== true);
  const openUnfilled =
    !filled && state.open === true ? 'text-strong font-medium' : '';
  const chosen =
    !filled && state.open !== true && state.selected === true
      ? 'bg-hover text-strong'
      : '';
  const drop = state.dropTarget === true ? 'ring-2 ring-inset ring-focus' : '';
  return rowClassName({
    selected: filled,
    className: ['group pl-0 pr-1', treeItemFocus, openUnfilled, chosen, drop]
      .filter((part) => part !== '')
      .join(' '),
  });
}

/**
 * The classes of a treeitem: the element of one row that takes the focus.
 *
 * The treeitem is the whole row with its indent (record 0164), so its own
 * box covers the indent as well. It draws no outline of its own, and the row
 * inside it draws the one focus treatment instead, inward, so the outline
 * sits on the fill a person sees.
 */
export const treeItemClassName = 'group/item outline-none';

/** The one focus treatment of a row, shown while its treeitem has the focus. */
const treeItemFocus =
  'group-focus-visible/item:outline-2 group-focus-visible/item:-outline-offset-2 group-focus-visible/item:outline-focus';

/**
 * The disclosure column and the name control of one row.
 *
 * They share one group with no gap. The disclosure control keeps its full
 * pointer target, and the two icons use the free space inside that target as
 * their separation instead of adding the row gap as well.
 */
export const treeRowLeadingClassName = 'flex min-w-0 flex-1 items-center';

/**
 * The classes of the name control inside one tree row.
 *
 * The row decides the colour of the text, so the control inherits it and
 * states no colour of its own: a link in a browser paints itself until
 * something says otherwise. The control takes the inward focus outline,
 * because the tree is a box that scrolls and clips. It has no left padding,
 * so the disclosure target and the name do not add two spacing steps between
 * their icons.
 */
export const treeRowNameClassName =
  'flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 truncate rounded-md border-0 bg-transparent pr-1 text-left text-inherit no-underline';

/** The deepest branch that still steps in. */
export const deepestSteppedBranch = 4;

/** The indent of each level, from the top of the tree to the deepest step. */
const indentSteps = ['', 'pl-2', 'pl-4', 'pl-6'] as const;

/**
 * The indent of one row of the tree, at `level`.
 *
 * `level` is 1 for a row at the top of the tree. The tree is one list of rows
 * (record 0164), so the level of a row is a class of the row and not the
 * nesting of the document. One step for each level is enough to read the
 * shape of the tree, because folder and note rows reserve the same disclosure
 * column, and the steps stop at {@link deepestSteppedBranch}.
 */
export function treeIndentClassName(level: number): string {
  const step = Math.min(Math.max(level - 1, 0), deepestSteppedBranch - 1);
  return indentSteps[step] ?? '';
}

/** Small gaps keep sibling rows distinct without using extra list height. */
export const treeItemsClassName = 'm-0 list-none space-y-0.5 p-0';

/**
 * The separation between the All notes row and the top of the folder tree.
 *
 * The All notes row sits outside the list that holds every folder, so the
 * spacing inside that list never reaches it. One step of the numeric scale
 * separates the two, which is the same step that separates an open folder
 * from its first row. It is space and not a divider: two rows separate by
 * space and by fill and never by a rule.
 */
export const treeListClassName = 'mt-0.5';

/**
 * The one line under the tree: a result, or the reason an action stopped,
 * such as a name that a rename refused.
 *
 * The line follows the last row, and a tree of many rows is longer than its
 * box, so the line stays at the foot of the box while the tree scrolls. A
 * person who renamed a row near the top of a long tree sees the reason, which
 * the second review of the merged branch found below the fold. It takes the
 * fill of the sidebar, so the rows that scroll under it do not show through,
 * and it sticks one step below the padding of the box, which is the foot of
 * the box itself, so no row shows under it either.
 */
export function treeMessageClassName(tone: 'status' | 'problem'): string {
  return `sticky -bottom-2 z-10 bg-surface px-2 py-2 text-control ${tone === 'problem' ? 'text-danger' : 'text-muted'}`;
}

/**
 * One icon action that sits on a row: the chevron and the row menu.
 *
 * A ghost control of the one recipe, square, and as small as a row allows on
 * a desktop while it keeps the 44 px touch target under the medium width.
 */
export const rowActionClassName = buttonClassName({
  variant: 'ghost',
  size: 'sm',
  className: 'size-11 shrink-0 px-0 md:size-7',
});

/** The column that a row with no chevron keeps for one, so names line up. */
export const rowSpacerClassName = 'size-11 shrink-0 md:size-7';
