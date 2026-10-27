import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultSidebarSize,
  formatSidebarSize,
  parseSidebarSize,
  sidebarInsetClass,
  sidebarSteps,
  sidebarWidthClass,
  sidebarWidthPx,
  stepAfterKey,
  stepForWidth,
} from './sidebar-size.ts';

await test('every step has a width, a panel class, and a content inset', () => {
  const widths = new Set<number>();
  const classes = new Set<string>();
  const insets = new Set<string>();
  for (const step of sidebarSteps) {
    widths.add(sidebarWidthPx(step));
    classes.add(sidebarWidthClass(step));
    insets.add(sidebarInsetClass({ step, collapsed: false }));
  }
  assert.equal(widths.size, sidebarSteps.length);
  assert.equal(classes.size, sidebarSteps.length);
  assert.equal(insets.size, sidebarSteps.length);
});

await test('the steps grow from the narrowest to the widest', () => {
  const widths = sidebarSteps.map(sidebarWidthPx);
  const sorted = [...widths].sort((left, right) => left - right);
  assert.deepEqual(widths, sorted);
});

await test('a drag lands on the nearest step', () => {
  assert.equal(stepForWidth(0), 'narrow');
  assert.equal(stepForWidth(274), 'narrow');
  assert.equal(stepForWidth(300), 'medium');
  assert.equal(stepForWidth(330), 'wide');
  assert.equal(stepForWidth(5000), 'widest');
});

await test('an arrow key moves one step and stops at each end', () => {
  assert.equal(stepAfterKey('narrow', -1), 'narrow');
  assert.equal(stepAfterKey('narrow', 1), 'medium');
  assert.equal(stepAfterKey('widest', 1), 'widest');
  assert.equal(stepAfterKey('widest', -1), 'wide');
});

await test('a collapsed sidebar leaves the content the whole frame', () => {
  assert.equal(
    sidebarInsetClass({ step: 'widest', collapsed: true }),
    'md:pl-0',
  );
});

await test('a stored size comes back, and a broken one falls back', () => {
  const size = { step: 'wide', collapsed: true } as const;
  assert.deepEqual(parseSidebarSize(formatSidebarSize(size)), size);
  for (const broken of ['', 'not json', '[]', '{"step":"huge"}', null, 7])
    assert.deepEqual(parseSidebarSize(broken), {
      step: defaultSidebarSize.step,
      collapsed: false,
    });
});
