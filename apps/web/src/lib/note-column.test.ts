import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fixedRegionClasses,
  pageRowClassName,
  pageSideClassName,
} from '@notesapp/ui';
import {
  noteColumnClassName,
  noteFrameClassName,
  noteOutlineScrollClassName,
  noteRowClassName,
  noteSideRegionClassName,
} from './note-column.ts';

await test('the note text uses one centred column', () => {
  const column = noteColumnClassName().split(' ');
  // Decision 0055. The measure is the one in the central theme, and the
  // editor centres its own lines on the same value.
  assert.ok(column.includes('self-center'));
  assert.ok(column.includes('w-full'));
  assert.ok(column.includes('max-w-note'));
});

await test('the column holds no name of its own', () => {
  // Decision 0069. The name is the last part of the breadcrumb, so nothing
  // here sets a title step or a title weight.
  const column = noteColumnClassName();
  assert.ok(!column.includes('text-3xl'));
  assert.ok(!column.includes('font-semibold'));
});

await test('the frame of the note draws no space above the text', () => {
  // The editor scrolls inside this frame, so padding here would stay on the
  // screen under the frame header while the text moved behind it. The space
  // above the first line belongs to the editor content instead.
  const frame = noteFrameClassName().split(' ');
  assert.ok(!frame.some((name) => name.startsWith('pt-')));
  assert.ok(!frame.some((name) => name.startsWith('py-')));
  assert.ok(!frame.some((name) => name.startsWith('p-')));
});

await test('the bottom scroll edge stays outside the layout', () => {
  const edge = fixedRegionClasses('bottom').split(' ');
  assert.ok(edge.includes('before:bottom-0'));
  assert.ok(edge.includes('before:absolute'));
  assert.ok(edge.includes('data-scroll-overflow:before:opacity-100'));
  assert.ok(edge.includes('data-edge-bottom:before:shadow-edge-bottom'));
});

await test('the outline scrolls inside the note side region', () => {
  const side = noteSideRegionClassName().split(' ');
  const outline = noteOutlineScrollClassName().split(' ');
  assert.ok(side.includes('overflow-hidden'));
  assert.ok(side.includes('flex-col'));
  assert.ok(outline.includes('overflow-hidden'));
  assert.ok(outline.includes('overflow-y-auto'));
  assert.ok(outline.includes('overscroll-contain'));
});

await test('the note reads the row and the side region of every page', () => {
  // Decision 0137. The note and every other page share one row and one side
  // region, so the column does not move between a note and a page.
  const row = noteRowClassName().split(' ');
  const side = noteSideRegionClassName().split(' ');
  for (const name of pageRowClassName().split(' '))
    assert.ok(row.includes(name), `the note row lacks ${name}`);
  for (const name of pageSideClassName().split(' '))
    assert.ok(side.includes(name), `the note side region lacks ${name}`);
});
