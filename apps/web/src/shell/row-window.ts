/** Shared browser types and scroll-container lookup for content-sized lists. */
/** How many rows a window keeps on each side of the visible ones. */
export const defaultOverscan = 8;

/**
 * What a list reads from its window.
 *
 * A list renders the rows of `indexes` and no other range, so the row that it
 * keeps for the focus is always among the rows it renders.
 */
export type RowWindowControl = {
  /**
   * The indexes of the rendered rows in document order: the window, and the
   * kept row next to it when that row is outside the window.
   */
  readonly indexes: readonly number[];
  /** The list element. Its direct children are the rendered rows. */
  readonly listRef: (element: HTMLElement | null) => void;
  /** Scrolls the box that holds the list, so the row is in view. */
  readonly reveal: (index: number) => void;
};

/** The nearest ancestor that scrolls, which is where a list sits. */
export function scrollerOf(element: HTMLElement): HTMLElement | null {
  for (
    let parent = element.parentElement;
    parent !== null;
    parent = parent.parentElement
  ) {
    const overflow = getComputedStyle(parent).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return parent;
  }
  return null;
}
