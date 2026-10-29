/** The pure layout choices of shared page furniture. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentPageSection,
  pageColumnClassName,
  pageGroupLabelClassName,
  pageListClassName,
  pageHeaderActionsClassName,
  pageRowClassName,
  pageSectionLine,
  pageSectionsShown,
  pageSideClassName,
  sectionScrollTop,
} from './layout-classes.ts';

await test('split page actions occupy the row and keep its two ends', () => {
  const classes = pageHeaderActionsClassName('split').split(' ');

  assert.ok(classes.includes('w-full'));
  assert.ok(classes.includes('justify-between'));
  assert.ok(classes.includes('gap-group'));
  assert.ok(!classes.includes('shrink-0'));
});

await test('clustered page actions keep their compact default', () => {
  const classes = pageHeaderActionsClassName('cluster').split(' ');

  assert.ok(classes.includes('shrink-0'));
  assert.ok(classes.includes('gap-cluster'));
  assert.ok(!classes.includes('w-full'));
});

await test('every page column is the note measure, centred in its row', () => {
  // Decision 0137. One measure and one centre on every page, so a move
  // between two pages does not move the column.
  const column = pageColumnClassName().split(' ');
  assert.ok(column.includes('max-w-note'));
  assert.ok(column.includes('mx-auto'));
  assert.ok(column.includes('flex-1'));
  assert.ok(column.includes('min-w-0'));
  assert.ok(!column.some((name) => /^max-w-(?!note$)/.test(name)));
});

await test('the side region has one width and shows from the extra large width', () => {
  const side = pageSideClassName().split(' ');
  assert.ok(side.includes('w-56'));
  assert.ok(side.includes('shrink-0'));
  assert.ok(side.includes('hidden'));
  assert.ok(side.includes('xl:flex'));
});

await test('the row puts the column and the side region side by side', () => {
  const row = pageRowClassName().split(' ');
  assert.ok(row.includes('flex'));
  assert.ok(row.includes('gap-6'));
});

await test('a page lists its sections only when it has two or more', () => {
  assert.equal(pageSectionsShown([]), false);
  assert.equal(pageSectionsShown([{ id: 'a', title: 'A' }]), false);
  assert.equal(
    pageSectionsShown([
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ]),
    true,
  );
});

await test('the current section is the last one that passed the line', () => {
  const tops = [
    { id: 'a', top: -400 },
    { id: 'b', top: pageSectionLine },
    { id: 'c', top: pageSectionLine + 1 },
  ];
  assert.equal(currentPageSection(tops, false), 'b');
});

await test('the first section is current before any passes the line', () => {
  const tops = [
    { id: 'a', top: 100 },
    { id: 'b', top: 600 },
  ];
  assert.equal(currentPageSection(tops, false), 'a');
});

await test('the last section is current at the end of the scroll', () => {
  // A short last section never reaches the line, so without this rule its
  // row could never be current.
  const tops = [
    { id: 'a', top: -400 },
    { id: 'b', top: 10 },
    { id: 'c', top: 300 },
  ];
  assert.equal(currentPageSection(tops, true), 'c');
});

await test('a page with no section has no current section', () => {
  assert.equal(currentPageSection([], false), null);
  assert.equal(currentPageSection([], true), null);
});

await test('a chosen row stays current while the scroller stays at its jump', () => {
  // A section near the end cannot reach the line, and the end rule would
  // mark the last section instead of the one the person chose.
  const tops = [
    { id: 'a', top: -900 },
    { id: 'b', top: 200 },
    { id: 'c', top: 500 },
  ];
  const chosen = { id: 'b', scrollTop: 1200 };
  assert.equal(currentPageSection(tops, true, chosen, 1200), 'b');
  assert.equal(currentPageSection(tops, true, chosen, 1200.4), 'b');
});

await test('a scroll of the person after a jump decides the section again', () => {
  const tops = [
    { id: 'a', top: -900 },
    { id: 'b', top: 10 },
    { id: 'c', top: 500 },
  ];
  const chosen = { id: 'c', scrollTop: 1200 };
  assert.equal(currentPageSection(tops, false, chosen, 1100), 'b');
});

await test('a jump scrolls the scroller by the distance to the section', () => {
  assert.equal(sectionScrollTop(300, 544, 44), 800);
  assert.equal(sectionScrollTop(300, -56, 44), 200);
  assert.equal(sectionScrollTop(0, 0, 44), 0);
});

await test('a list takes back the inset of its rows', () => {
  // Record 0138. A row carries px-2, so the list pulls by the same step and
  // the row text lines up with the page title.
  const list = pageListClassName().split(' ');
  assert.ok(list.includes('-mx-2'));
  assert.ok(list.includes('list-none'));
  assert.ok(list.includes('p-0'));
  assert.ok(!list.some((name) => /^(m|mx)-/.test(name)));
});

await test('the rows of a list keep their controls apart', () => {
  // Under touch a row and a button are both 44 px, and the Sign out buttons
  // of two sessions touched. The rows stand the close-group distance apart.
  const list = pageListClassName().split(' ');
  assert.ok(list.includes('flex'));
  assert.ok(list.includes('flex-col'));
  assert.ok(list.includes('gap-cluster'));
  assert.ok(list.includes('md:gap-1'));
});

await test('a group label has no inset of its own', () => {
  const label = pageGroupLabelClassName().split(' ');
  assert.ok(!label.some((name) => /^(p|px|pl|ps)-/.test(name)));
  assert.ok(label.includes('text-group'));
  assert.ok(label.includes('text-muted'));
});
