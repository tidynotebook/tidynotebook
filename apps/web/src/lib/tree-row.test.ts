import assert from 'node:assert/strict';
import test from 'node:test';
import {
  treeIndentStyle,
  treeIndentClassName,
  treeItemClassName,
  treeItemsClassName,
  treeListClassName,
  treeMessageClassName,
  treeRowClassName,
  treeRowLeadingClassName,
  treeRowNameClassName,
} from './tree-row.ts';

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
  assert.ok(open.includes('text-strong'));
  assert.ok(selected.includes('bg-hover'));
  assert.ok(!selected.includes('bg-active'));
});

await test('the open note keeps its mark while a folder is selected', () => {
  // A person can select a folder and open a note inside it at the same time.
  // The row of the note is then the stronger of the two marks.
  const both = classes({ open: true, selected: true });
  assert.ok(both.includes('bg-active'));
  assert.ok(!both.includes('bg-hover'));
});

await test('no row of the tree takes a ring, and none names the edge', () => {
  // Decision 0064. The open note took a ring, the selected folder took a
  // second one, and the tree read as a cage of boxes.
  for (const state of [{}, { open: true }, { selected: true }]) {
    const one = treeRowClassName(state);
    assert.ok(!one.includes('ring-'), one);
    assert.ok(!one.includes('edge'), one);
  }
});

await test('a drop target is marked over whatever the row already is', () => {
  // The drop target is the one ring of the tree: while a row is dragged over
  // a folder the edge is the whole message, and it carries no text.
  for (const state of [{}, { open: true }, { selected: true }]) {
    const one = classes({ ...state, dropTarget: true });
    assert.ok(one.includes('ring-focus'));
    assert.ok(one.includes('ring-2'));
    assert.ok(one.includes('ring-inset'));
  }
});

await test('a row is the group that its hover actions read', () => {
  assert.ok(classes({}).includes('group'));
});

await test('the disclosure and name share one tight leading group', () => {
  // The defect this covers: the row gap and the left padding of the name
  // both sat between the disclosure icon and the folder icon.
  assert.equal(treeRowLeadingClassName, 'ui-sidebar-leading');

  assert.ok(!treeRowLeadingClassName.includes('gap-'));
  assert.ok(!treeRowNameClassName.includes('pl-'));
  assert.ok(!treeRowNameClassName.includes('px-'));
});

await test('the name control inherits the colour of its row', () => {
  // The row states the text colour of every state, so the control inside it
  // states none: two answers to one colour is how a marked row kept a muted
  // name.
  assert.ok(treeRowNameClassName.includes('text-inherit'));
  assert.ok(!treeRowNameClassName.includes('text-muted'));
  assert.ok(!treeRowNameClassName.includes('text-strong'));
});

await test('a row shows the focus of its treeitem inside the row', () => {
  // The tree is a box that scrolls, and a box that scrolls clips an outline
  // drawn outside the control. The treeitem is the whole row with its
  // indent (record 0164), so the row inside it draws the outline, inward.
  const row = treeRowClassName();
  assert.ok(row.includes('group-focus-visible/item:outline-2'));
  assert.ok(row.includes('group-focus-visible/item:-outline-offset-2'));
  assert.ok(treeItemClassName.includes('group/item'));
  assert.ok(!treeRowNameClassName.includes('focus:'));
});

await test('each tree level reads the shared indent step', () => {
  for (const level of [1, 2, 4, 12])
    assert.equal(
      treeIndentStyle(level).paddingInlineStart,
      `calc(${String(level - 1)} * var(--ui-sidebar-indent))`,
    );
  assert.equal(
    treeIndentStyle(0).paddingInlineStart,
    'calc(0 * var(--ui-sidebar-indent))',
  );
});

await test('a row of a selection takes the fill of a chosen row', () => {
  // Record 0164: the fill names the rows that an action acts on.
  const picked = classes({ picked: true, selecting: true });
  assert.ok(picked.includes('bg-active'));
  assert.ok(picked.includes('text-strong'));
});

await test('while a selection exists the open note keeps its text and gives up its fill', () => {
  const open = classes({ open: true, selecting: true });
  assert.ok(!open.includes('bg-active'));
  assert.ok(open.includes('text-strong'));
  assert.ok(open.includes('text-label'));
  const openPicked = classes({ open: true, picked: true, selecting: true });
  assert.ok(openPicked.includes('bg-active'));
});

await test('the create parent keeps its quiet fill outside a selection', () => {
  const parent = classes({ selected: true, selecting: true });
  assert.ok(parent.includes('bg-hover'));
  const pickedParent = classes({ selected: true, picked: true });
  assert.ok(pickedParent.includes('bg-active'));
  assert.ok(!pickedParent.includes('bg-hover'));
});

await test('siblings use a small gap while each row keeps its target size', () => {
  assert.ok(treeItemsClassName.includes('ui-sidebar-tree-items'));
  assert.ok(treeRowClassName().includes('ui-sidebar-row'));
  assert.ok(treeRowClassName().includes('ui-sidebar-row'));
});

await test('no level of the tree draws a guide line', () => {
  // Decision 0064. A line down every branch is the mark of a file manager
  // and not of a note list; the step states the level.
  for (const level of [1, 3, 5, 12]) {
    const one = treeIndentClassName(level);
    assert.ok(!one.includes('border'), `level ${String(level)}`);
  }
});

await test('the top of the tree separates from the All notes row', () => {
  // The defect this covers: the All notes row sits outside the folder list,
  // so the spacing inside that list never reached it, and a marked All notes
  // row touched the marked folder below it as one band.
  assert.ok(treeListClassName.includes('ui-sidebar-tree-items'));
  assert.ok(!treeListClassName.includes('border'));
  assert.ok(!treeListClassName.includes('pl-'));
});

await test('the line under the tree stays in view at the foot of its box', () => {
  // The second review: a refused rename near the top of a long tree put its
  // reason below the last row, out of view.
  for (const tone of ['status', 'problem'] as const) {
    const line = treeMessageClassName(tone).split(' ');
    assert.ok(line.includes('sticky'));
    assert.ok(line.includes('bottom-0'));
    assert.ok(line.includes('bg-surface'));
  }
  assert.ok(treeMessageClassName('problem').split(' ').includes('text-danger'));
  assert.ok(treeMessageClassName('status').split(' ').includes('text-muted'));
});
