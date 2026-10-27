/**
 * The rule that keeps a dialog inside the screen.
 *
 * The defect this covers: the scrim scrolled and the panel did not, so the
 * dialog of keyboard shortcuts was taller than an 800 px screen and its title
 * scrolled away with the list.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dialogFooterClassName,
  dialogPanelClassName,
  dialogRootClassName,
  dialogTitleClassName,
  type DialogWidth,
} from './dialog-classes.ts';

/** Every width of a panel that a person reads. */
const panels: readonly DialogWidth[] = ['small', 'medium', 'large'];

await test('a panel is never taller than the screen and scrolls inside', () => {
  for (const width of panels) {
    const parts = dialogPanelClassName(width).split(' ');
    assert.ok(parts.includes('max-h-full'), width);
    assert.ok(parts.includes('overflow-y-auto'), width);
    assert.ok(!parts.includes('overflow-hidden'), width);
    assert.ok(parts.includes('rounded-xl'), width);
  }
});

await test('the scrim does not scroll, so the title cannot leave the screen', () => {
  for (const width of panels)
    for (const align of ['top', 'center'] as const) {
      const parts = dialogRootClassName(width, align).split(' ');
      assert.ok(!parts.some((part) => part.startsWith('overflow')), width);
      // The space the scrim keeps above and below the panel bounds it.
      assert.ok(
        parts.some((part) => /^(?:pb|py)-/.test(part)),
        `${width} ${align}`,
      );
    }
});

await test('the title and the action row stay in view on the card fill', () => {
  const title = dialogTitleClassName(false).split(' ');
  assert.ok(title.includes('sticky'));
  assert.ok(title.includes('top-0'));
  assert.ok(title.includes('bg-card'));
  const footer = dialogFooterClassName().split(' ');
  assert.ok(footer.includes('sticky'));
  assert.ok(footer.includes('bottom-0'));
  assert.ok(footer.includes('bg-card'));
  // No rule separates the parts of a dialog (decision 0063).
  for (const parts of [title, footer])
    assert.ok(!parts.some((part) => part.startsWith('border')));
});

await test('a hidden title is for assistive technology only', () => {
  assert.equal(dialogTitleClassName(true), 'sr-only');
});

await test('the Settings modal is a phone sheet and a fixed panel from the large width', () => {
  const panel = dialogPanelClassName('settings').split(' ');
  for (const part of ['h-full', 'w-full', 'overflow-hidden', 'lg:h-settings'])
    assert.ok(panel.includes(part), part);
  assert.ok(panel.includes('lg:max-w-settings'));
  assert.ok(!panel.includes('rounded-xl'));
  assert.ok(panel.includes('lg:rounded-xl'));
  const root = dialogRootClassName('settings', 'center').split(' ');
  assert.ok(root.includes('items-stretch'));
  assert.ok(root.includes('lg:items-center'));
  assert.ok(!root.some((part) => part.startsWith('overflow')));
});

await test('a picture on the scrim keeps the whole screen', () => {
  assert.equal(dialogRootClassName('screen', 'top'), 'bg-scrim/80');
  assert.ok(dialogPanelClassName('screen').includes('h-full w-full'));
});
