import assert from 'node:assert/strict';
import test from 'node:test';
import { moveToTrashLabel } from './note-menu.ts';
import { actionIconNames } from './palette-items.ts';
import { selectionLabel, treeMenu, treeRowControls } from './tree-actions.ts';

const noteTarget = {
  kind: 'note',
  fileId: 'n1',
  path: 'Work/Plan.md',
} as const;
const folderTarget = { kind: 'folder', path: 'Work/Reports' } as const;

await test('the menu of a note row holds more than one row', () => {
  // Issue 255: the menu of a note row had one item.
  const menu = treeMenu([noteTarget]);
  assert.equal(menu.label, 'Actions for the note Plan');
  assert.deepEqual(
    menu.rows.map((row) => row.label),
    [
      'Open',
      'Version history',
      'Publish',
      'Rename',
      'Move',
      'Make a copy',
      'Copy link',
      'Export as Markdown',
    ],
  );
  assert.deepEqual(
    menu.pinned.map((row) => row.label),
    [moveToTrashLabel],
  );
});

await test('the menu of a folder row names the folder and its actions', () => {
  const menu = treeMenu([folderTarget]);
  assert.equal(menu.label, 'Actions for the folder Reports');
  assert.deepEqual(
    menu.rows.map((row) => row.id),
    ['new-note', 'new-folder', 'rename', 'move', 'publish'],
  );
  assert.deepEqual(
    menu.pinned.map((row) => row.label),
    [moveToTrashLabel],
  );
});

await test('a selection of several rows offers the actions every row shares', () => {
  const menu = treeMenu([noteTarget, folderTarget]);
  assert.equal(menu.label, 'Actions for 2 items');
  assert.deepEqual(
    menu.rows.map((row) => row.label),
    ['Move to folder'],
  );
  assert.deepEqual(
    menu.pinned.map((row) => row.label),
    [moveToTrashLabel],
  );
});

await test('every row names a glyph and one term in sentence case', () => {
  for (const menu of [
    treeMenu([noteTarget]),
    treeMenu([folderTarget]),
    treeMenu([noteTarget, folderTarget]),
  ])
    for (const row of [...menu.rows, ...menu.pinned]) {
      assert.ok(actionIconNames.includes(row.icon), row.id);
      assert.match(row.label, /^[A-Z][a-z]/u);
      assert.ok(!row.label.startsWith('Delete'), row.label);
    }
});

await test('a selection names its count with the whole phrase', () => {
  assert.equal(selectionLabel(1), '1 item selected');
  assert.equal(selectionLabel(3), '3 items selected');
});

await test('a touch screen reader reaches the menu and the chevron of a row', () => {
  // The review of the merged branch: the action button and the chevron were
  // hidden from assistive software, so VoiceOver and TalkBack could not
  // rename, move or trash a folder, nor close one.
  const folder = treeRowControls({
    kind: 'folder',
    name: 'Work',
    expanded: true,
  });
  assert.deepEqual(folder, {
    label: 'Work',
    toggle: 'Collapse folder Work',
    actions: 'Actions for the folder Work',
  });
  assert.equal(
    treeRowControls({ kind: 'folder', name: 'Work' }).toggle,
    'Expand folder Work',
  );
  const note = treeRowControls({ kind: 'note', name: 'Plan', local: true });
  assert.equal(note.toggle, null);
  assert.equal(
    note.actions,
    treeMenu([{ kind: 'note', fileId: 'n', path: 'Plan.md' }]).label,
  );
  assert.equal(note.label, 'Plan, on this device only');
  assert.equal(
    folder.actions,
    treeMenu([{ kind: 'folder', path: 'Work' }]).label,
  );
});
