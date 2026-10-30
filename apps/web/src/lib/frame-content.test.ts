import assert from 'node:assert/strict';
import test from 'node:test';
import { pageRowClassName } from '@notesapp/ui';
import {
  frameContentClassName,
  frameNoticeRowClassName,
} from './frame-content.ts';
import { noteScreenClassName } from './note-column.ts';

await test('a frame notice leaves the note on the screen', () => {
  // The note screen took the full height of the area, so a notice above it
  // pushed the foot of the note under the screen by its own height.
  const area = frameContentClassName().split(' ');
  assert.ok(area.includes('flex'));
  assert.ok(area.includes('flex-col'));
  assert.ok(area.includes('overflow-y-auto'));
  assert.ok(frameNoticeRowClassName().split(' ').includes('shrink-0'));
  const note = noteScreenClassName().split(' ');
  assert.ok(note.includes('flex-1'));
  assert.ok(note.includes('overflow-hidden'));
  assert.ok(!note.includes('h-full'));
});

await test('the notices stand on the row of every page', () => {
  for (const name of pageRowClassName().split(' '))
    assert.ok(frameNoticeRowClassName().split(' ').includes(name));
});
