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
 * The rule lives here so a unit test can hold it: a closed overlay must leave
 * the tab order and the accessibility tree, not only move off the screen.
 */
import { sidebarWidthClass, type SidebarSize } from './sidebar-size.ts';

/**
 * The classes of the navigation drawer.
 *
 * `open` is the overlay below `md`, which the header button controls.
 * `size.collapsed` is the choice a person made for the wide frame, which the
 * overlay ignores: a phone reaches the tree through the overlay alone.
 */
export function drawerClassName(open: boolean, size: SidebarSize): string {
  const base = `fixed bottom-0 left-0 top-0 z-50 flex ${sidebarWidthClass(size.step)} flex-col border-r border-edge-subtle bg-surface text-muted motion-safe:transition-transform md:top-header md:z-40`;
  // `invisible` and not only `-translate-x-full`: a panel that stays visible
  // keeps every link inside it reachable by keyboard and by a screen reader,
  // so the person would walk into a drawer that is not on the screen.
  const overlay = open ? 'translate-x-0' : '-translate-x-full max-md:invisible';
  const wide = size.collapsed
    ? 'md:invisible md:-translate-x-full'
    : 'md:visible md:translate-x-0';
  return `${base} ${overlay} ${wide}`;
}
