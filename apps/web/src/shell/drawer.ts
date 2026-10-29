/**
 * The presentation of the navigation drawer.
 *
 * Below `md` the drawer is an overlay that covers the whole height of the
 * screen, from the top edge and over the header, so no band of the page shows
 * above it. Its own close button sits at the top of the panel. From `md` up
 * the drawer is a fixed part of the frame and starts below the header.
 *
 * From `md` up the person also decides whether the drawer is there at all and
 * how wide it is. A collapsed drawer leaves the frame the way a closed
 * overlay does, so nothing inside it stays in the tab order. The widths come
 * from `./sidebar-size.ts`.
 *
 * The panel is the chrome plane, and its right edge is the hairline of a
 * group that already differs in fill (decision 0063). Its text is the ink of
 * the page, because every row inside it reads the one row recipe and states
 * its own colour.
 *
 * The rule lives here so a unit test can hold it: a closed overlay must leave
 * the tab order and the accessibility tree, not only move off the screen.
 */
import { transitionPanel } from '@notesapp/ui';
import { sidebarWidthClass, type SidebarSize } from './sidebar-size.ts';

/**
 * The classes of the navigation drawer.
 *
 * `open` is the overlay below `md`, which the header button controls.
 * `size.collapsed` is the choice a person made for the wide frame, which the
 * overlay ignores: a phone reaches the tree through the overlay alone.
 */
export function drawerClassName(open: boolean, size: SidebarSize): string {
  const base = `fixed bottom-0 left-0 top-0 z-50 flex ${sidebarWidthClass(size.step)} ui-phone-drawer flex-row border-r border-edge-subtle bg-surface text-strong ${transitionPanel} md:top-header md:z-40`;
  // `invisible` and not only `-translate-x-full`: a panel that stays visible
  // keeps every link inside it reachable by keyboard and by a screen reader,
  // so the person would walk into a drawer that is not on the screen.
  const overlay = open ? 'translate-x-0' : '-translate-x-full max-md:invisible';
  const wide = size.collapsed
    ? 'md:invisible md:-translate-x-full'
    : 'md:visible md:translate-x-0';
  return `${base} ${overlay} ${wide}`;
}

/**
 * The classes of the part of the drawer under its phone title bar.
 *
 * The tree is the one part that grows with the notes, so it scrolls on its
 * own and the footer rows stay in place on a tall screen. On a short screen,
 * a phone held sideways or a phone with its keyboard open, every other part
 * of the drawer kept its height and the tree shrank to nothing, so no row of
 * it could be reached. The tree now keeps a minimum height, and the part
 * around it scrolls as one when the screen cannot hold them all. The title
 * bar with the close button stays above it.
 */
export const drawerPanelClassName =
  'flex min-h-0 flex-1 flex-col overflow-y-auto';

/** The classes of the box that scrolls the tree inside the drawer panel. */
export const drawerTreeClassName = 'min-h-40 flex-1 overflow-y-auto px-2 pb-2';

/**
 * The classes of the calendar view inside the drawer panel.
 *
 * The month has a fixed height, so it keeps it and the panel scrolls when a
 * short screen needs it (record 0105).
 */
export const drawerCalendarClassName = 'flex-1 px-2 pb-2 pt-1';
