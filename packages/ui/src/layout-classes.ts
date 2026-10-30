/** Pure layout choices shared by the page primitives. */

/** How the actions below a page title use their row. */
export type PageHeaderActionLayout = 'cluster' | 'split' | 'inline';

/** The layout of the action area of a page header. */
export function pageHeaderActionsClassName(
  layout: PageHeaderActionLayout,
): string {
  if (layout === 'inline') return 'flex shrink-0 items-center gap-2';
  return layout === 'split'
    ? 'flex w-full items-center justify-between gap-4'
    : 'flex shrink-0 items-center gap-2';
}

/**
 * The row of every page: the column and the side region to its right.
 *
 * `Page`, `PageRegion`, the frame notices and the note screen read this row,
 * the column and the region below, so the column has one place and one width
 * on every page and a move between two pages does not move it. See
 * [decision 0137](../../../docs/decisions/0137-every-page-shares-the-note-column-and-its-side-region.md).
 */
export function pageRowClassName(): string {
  return 'flex min-w-0 justify-center gap-6';
}

/**
 * The column of a page: the note measure, centred in the space it owns.
 *
 * The parent centers the column, so the page and the note share one centre
 * (0055).
 */
export function pageColumnClassName(): string {
  return 'ui-page-column w-full min-w-0 max-w-page flex-1';
}

/**
 * The side region to the right of the column.
 *
 * One width on every page, and only from the extra large width up, which is
 * the first width where the note measure and the region both fit (0055). A
 * page that shows nothing in it keeps the space.
 */
export function pageSideClassName(): string {
  return 'hidden w-56 shrink-0 flex-col xl:flex';
}

/** One section that the side region of a page lists. */
export type PageSection = {
  /** The identifier of the heading of the section. */
  readonly id: string;
  /** The title of the section, as its heading reads. */
  readonly title: string;
};

/**
 * Whether a page lists its sections in the side region.
 *
 * A list of one row does not help a person move, so a page lists its sections
 * only when it has two or more.
 */
export function pageSectionsShown(sections: readonly PageSection[]): boolean {
  return sections.length >= 2;
}

/** How far below the top of the scroller a section counts as in view. */
export const pageSectionLine = 32;

/** A row that a person chose, and the scroll offset its jump ended at. */
export type ChosenPageSection = {
  readonly id: string;
  readonly scrollTop: number;
};

/**
 * The section that a person reads now.
 *
 * `tops` are the tops of the sections in page order, in pixels from the top
 * of the scroller. The current section is the last one whose top has passed
 * the line, and the first one before any has. At the end of the scroll the
 * last section is current, because a short last section never reaches the
 * line.
 *
 * A row that a person chose stays current while the scroller stays where the
 * jump left it, because a section near the end cannot reach the line. The
 * next scroll of the person decides again.
 */
export function currentPageSection(
  tops: readonly { readonly id: string; readonly top: number }[],
  atEnd: boolean,
  chosen: ChosenPageSection | null = null,
  scrollTop = 0,
): string | null {
  if (chosen !== null && Math.abs(scrollTop - chosen.scrollTop) < 1)
    return chosen.id;
  if (tops.length === 0) return null;
  if (atEnd) return tops[tops.length - 1]?.id ?? null;
  let current = tops[0]?.id ?? null;
  for (const section of tops)
    if (section.top <= pageSectionLine) current = section.id;
  return current;
}

/**
 * The scroll offset that puts a section at the top of its scroller.
 *
 * The page scrolls its own scroller and nothing around it. A jump that asks
 * the browser to bring an element into view also moves every ancestor that
 * clips, the frame among them, when the scroller reaches its end.
 */
export function sectionScrollTop(
  scrollTop: number,
  targetTop: number,
  scrollerTop: number,
): number {
  return Math.max(0, scrollTop + targetTop - scrollerTop);
}

/**
 * A list of rows on a page.
 *
 * A row keeps its own inset, so its text sits inside its fill. The list takes
 * that inset back, so the text of a row, its buttons and the label of its
 * group line up with the page title and the page actions, and the fill of a
 * hovered row reaches into the gutter (record 0138).
 *
 * Rows separate by space and never by a rule. Under touch a row and a button
 * are both 44 px, so the buttons of two rows would touch: the rows stand the
 * named close-group distance apart there, the one distance between two
 * controls. From the medium width up a control is 28 px and a row is no
 * shorter, so a step of the numeric scale keeps two fills apart.
 */
export function pageListClassName(): string {
  return 'flex list-none flex-col gap-1 p-0';
}

/**
 * The quiet label above one group of rows on a page.
 *
 * It has no inset, because the list below it already lines up with the page.
 */
export function pageGroupLabelClassName(): string {
  return 'ui-group-heading text-group text-muted';
}
