import assert from 'node:assert/strict';
import test from 'node:test';
import {
  drawerCalendarClassName,
  drawerClassName,
  drawerPanelClassName,
  drawerTreeClassName,
} from './drawer.ts';
import { defaultSidebarSize } from './sidebar-size.ts';

/** The classes of one drawer state, as a list. */
function classes(open: boolean, collapsed = false): readonly string[] {
  return drawerClassName(open, {
    ...defaultSidebarSize,
    collapsed,
  }).split(' ');
}

await test('a closed drawer is hidden below the medium width', () => {
  const closed = classes(false);
  assert.ok(closed.includes('max-md:invisible'));
  assert.ok(closed.includes('-translate-x-full'));
  // From the medium width up the drawer is a part of the frame.
  assert.ok(closed.includes('md:visible'));
  assert.ok(closed.includes('md:translate-x-0'));
});

await test('an open drawer is shown and hides nothing', () => {
  const open = classes(true);
  assert.ok(open.includes('translate-x-0'));
  assert.ok(!open.includes('max-md:invisible'));
});

await test('the phone drawer covers the header and the md drawer does not', () => {
  const open = classes(true);
  // On a phone the panel starts at the top edge of the screen, above the
  // header, so no band of the page shows over it.
  assert.ok(open.includes('top-0'));
  assert.ok(open.includes('z-50'));
  // From the medium width up it is a part of the frame below the header.
  assert.ok(open.includes('md:top-header'));
  assert.ok(open.includes('md:z-40'));
});

await test('a collapsed sidebar leaves the tab order of the wide frame', () => {
  // Moving the panel off the screen is not enough. A visible panel keeps
  // every link inside it reachable, so the person walks into a sidebar that
  // is not on the screen.
  const collapsed = classes(false, true);
  assert.ok(collapsed.includes('md:invisible'));
  assert.ok(collapsed.includes('md:-translate-x-full'));
  assert.ok(!collapsed.includes('md:visible'));
});

await test('the phone overlay opens whatever the wide frame collapsed', () => {
  // A phone has no second way to the tree, so the collapse choice of the
  // wide frame must never close the overlay.
  const open = classes(true, true);
  assert.ok(open.includes('translate-x-0'));
  assert.ok(!open.includes('max-md:invisible'));
});

await test('the panel carries the width of the chosen step', () => {
  assert.ok(
    drawerClassName(false, { step: 'widest', collapsed: false }).includes(
      'w-92',
    ),
  );
  assert.ok(
    drawerClassName(false, { step: 'narrow', collapsed: false }).includes(
      'w-68',
    ),
  );
});

await test('a short screen scrolls the drawer panel and keeps the tree', () => {
  // The defect this covers: on a phone held sideways the tree shrank to a few
  // pixels, the panel did not scroll, and no note could be reached.
  assert.equal(drawerPanelClassName, 'ui-sidebar-body ui-drawer-scroll');
  assert.equal(drawerTreeClassName, 'ui-sidebar-tree ui-drawer-scroll');
  // The month keeps its height, and the panel scrolls it.
  const calendar = drawerCalendarClassName.split(' ');
  assert.ok(!calendar.includes('min-h-0'));
  assert.ok(!calendar.some((name) => name.startsWith('overflow')));
});
