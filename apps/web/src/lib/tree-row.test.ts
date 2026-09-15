import assert from 'node:assert/strict';
import test from 'node:test';
import { treeRowClassName, treeRowTextClassName } from './tree-row.ts';

/** The classes of one row state, as a list. */
function classes(state: Parameters<typeof treeRowClassName>[0]): string[] {
  return treeRowClassName(state).split(' ');
}

await test('a quiet row marks nothing and answers the pointer', () => {
  const quiet = classes({});
  assert.ok(quiet.includes('hover:bg-hover'));
  assert.ok(!quiet.includes('bg-active'));
  assert.ok(!quiet.includes('bg-hover'));
});

await test('the open note and the selected folder do not look the same', () => {
  // The defect this covers: both states were one fill, so a note directly
  // under its own folder read as one band with no edge between the two.
  const open = treeRowClassName({ open: true });
  const selected = treeRowClassName({ selected: true });
  assert.notEqual(open, selected);
  assert.ok(open.includes('bg-active'));
  assert.ok(selected.includes('bg-hover'));
  assert.ok(selected.includes('ring-edge'));
});

await test('a marked row keeps an edge of its own', () => {
  // Two marked rows can sit next to each other, so each states where it
  // ends. The edge carries that, not the fill.
  for (const state of [{ open: true }, { selected: true }])
    assert.ok(classes(state).includes('ring-inset'));
});

await test('a drop target is marked over whatever the row already is', () => {
  for (const state of [{}, { open: true }, { selected: true }])
    assert.ok(classes({ ...state, dropTarget: true }).includes('ring-focus'));
});

await test('a marked row reads in the strong text colour', () => {
  assert.equal(treeRowTextClassName({ open: true }), 'text-strong');
  assert.equal(treeRowTextClassName({ selected: true }), 'text-strong');
  assert.ok(treeRowTextClassName({}).startsWith('text-muted'));
});
