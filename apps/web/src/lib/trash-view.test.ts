/** The visible Trash list is stable while a server change reaches the store. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { pageListClassName } from '@notesapp/ui';
import {
  mergeTrash,
  trashActionLayerClassName,
  trashActionSlotClassName,
  trashListClassName,
} from './trash-view.ts';

const first = '10000000-0000-4000-8000-000000000001';
const second = '10000000-0000-4000-8000-000000000002';

await test('the server statement wins over the local tombstone', () => {
  const items = mergeTrash(
    [
      {
        fileId: first,
        path: 'server-name.md',
        deletedAt: '2026-09-19T09:00:00.000Z',
      },
    ],
    [
      {
        fileId: first,
        path: 'local-name.md',
        deleted: true,
        updatedAt: '2026-09-19T08:00:00.000Z',
      },
      {
        fileId: second,
        path: 'local-only.md',
        deleted: true,
        updatedAt: '2026-09-19T10:00:00.000Z',
      },
    ],
  );

  assert.deepEqual(items, [
    {
      fileId: second,
      path: 'local-only.md',
      deletedAt: '2026-09-19T10:00:00.000Z',
      pending: true,
    },
    {
      fileId: first,
      path: 'server-name.md',
      deletedAt: '2026-09-19T09:00:00.000Z',
      pending: false,
    },
  ]);
});

await test('a removed note stays out while both sources still hold it', () => {
  const items = mergeTrash(
    [
      {
        fileId: first,
        path: 'gone.md',
        deletedAt: '2026-09-19T09:00:00.000Z',
      },
    ],
    [
      {
        fileId: first,
        path: 'gone.md',
        deleted: true,
        updatedAt: '2026-09-19T09:00:00.000Z',
      },
    ],
    new Set([first]),
  );

  assert.deepEqual(items, []);
});

await test('deleted note rows have one named space between them', () => {
  const classes = trashListClassName.split(' ');

  assert.ok(classes.includes('flex'));
  assert.ok(classes.includes('flex-col'));
  assert.ok(classes.includes('gap-1'));
});

await test('the deleted note list lines up with the page', () => {
  const classes = trashListClassName.split(' ');
  for (const name of pageListClassName().split(' '))
    assert.ok(classes.includes(name), `the list lacks ${name}`);
});

await test('the action slot takes the width of its wider state', () => {
  // The slot had a fixed width, and the Delete button with its word was
  // wider, so it reached over the Restore button beside it. The slot now has
  // no width of its own, and both layers share one grid cell.
  for (const place of ['row', 'header'] as const) {
    const slot = trashActionSlotClassName(place).split(' ');
    assert.ok(slot.includes('grid'));
    assert.ok(slot.includes('shrink-0'));
    assert.ok(!slot.some((name) => /^(md:)?w-/.test(name)));
  }
  for (const hidden of [false, true]) {
    const layer = trashActionLayerClassName(hidden).split(' ');
    assert.ok(layer.includes('col-start-1'));
    assert.ok(layer.includes('row-start-1'));
    assert.equal(layer.includes('invisible'), hidden);
  }
});

await test('a header slot follows the header, and a row slot holds its end', () => {
  // Below the small width the header actions wrap under the title and start
  // at its edge, so an action held at the end of a wider slot stood indented.
  const header = trashActionSlotClassName('header').split(' ');
  assert.ok(header.includes('justify-items-start'));
  assert.ok(header.includes('sm:justify-items-end'));
  assert.ok(
    trashActionSlotClassName('row').split(' ').includes('justify-items-end'),
  );
});
