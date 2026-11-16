import assert from 'node:assert/strict';
import test from 'node:test';
import {
  folderAncestors,
  folderTreeKeyAction,
  folderTreeRows,
  initiallyExpanded,
} from './folder-tree.ts';
import { isInsideFolder } from './folder-selection.ts';

const folders = [
  'Projects',
  'Projects/Launch',
  'Projects/Launch/Assets',
  'Projects/Research',
  'Daily',
  'Travel/2026 Japan',
];

/** The visible rows as `level:path` strings. */
function shown(rows: ReturnType<typeof folderTreeRows>): string[] {
  return rows.map((row) => `${String(row.level)}:${row.path}`);
}

await test('the tree opens at the chosen folder with its parents open', () => {
  assert.deepEqual(folderAncestors('Projects/Launch/Assets'), [
    'Projects',
    'Projects/Launch',
  ]);
  const rows = folderTreeRows({
    folders,
    expanded: initiallyExpanded('Projects/Launch/Assets'),
    rootName: 'All notes',
  });
  assert.deepEqual(shown(rows), [
    '1:',
    '1:Daily',
    '1:Projects',
    '2:Projects/Launch',
    '3:Projects/Launch/Assets',
    '2:Projects/Research',
    '1:Travel',
  ]);
  assert.deepEqual([...initiallyExpanded('Projects')], ['Projects']);
  assert.deepEqual([...initiallyExpanded('')], []);
  assert.equal(rows[0]?.name, 'All notes');
  assert.equal(rows.find((row) => row.path === 'Travel')?.hasChildren, true);
  assert.equal(rows.find((row) => row.path === 'Travel')?.expanded, false);
});

await test('a parent that no list names is still a row', () => {
  const rows = folderTreeRows({
    folders: ['Travel/2026 Japan'],
    expanded: new Set(['Travel']),
    rootName: 'All notes',
    includeRoot: false,
  });
  assert.deepEqual(shown(rows), ['1:Travel', '2:Travel/2026 Japan']);
});

await test('a filter keeps the parents of each match visible and open', () => {
  const rows = folderTreeRows({
    folders,
    expanded: new Set(),
    filter: 'assets',
    rootName: 'All notes',
  });
  assert.deepEqual(shown(rows), [
    '1:',
    '1:Projects',
    '2:Projects/Launch',
    '3:Projects/Launch/Assets',
  ]);
});

await test('a folder that moves and its children are disabled', () => {
  const rows = folderTreeRows({
    folders,
    expanded: new Set(['Projects', 'Projects/Launch']),
    rootName: 'All notes, at the top',
    isDisabled: (path) => isInsideFolder(path, 'Projects/Launch'),
  });
  const disabled = rows.filter((row) => row.disabled).map((row) => row.path);
  assert.deepEqual(disabled, ['Projects/Launch', 'Projects/Launch/Assets']);
  assert.equal(isInsideFolder('Projects/Launcher', 'Projects/Launch'), false);
});

await test('the keys move, open, close and choose like the sidebar tree', () => {
  const rows = folderTreeRows({
    folders,
    expanded: new Set(['Projects']),
    rootName: 'All notes',
  });
  assert.deepEqual(folderTreeKeyAction('ArrowDown', rows, ''), {
    kind: 'focus',
    path: 'Daily',
  });
  assert.deepEqual(folderTreeKeyAction('ArrowUp', rows, 'Daily'), {
    kind: 'focus',
    path: '',
  });
  assert.deepEqual(folderTreeKeyAction('ArrowUp', rows, ''), { kind: 'none' });
  assert.deepEqual(folderTreeKeyAction('End', rows, ''), {
    kind: 'focus',
    path: 'Travel',
  });
  assert.deepEqual(folderTreeKeyAction('Home', rows, 'Travel'), {
    kind: 'focus',
    path: '',
  });
  assert.deepEqual(folderTreeKeyAction('ArrowRight', rows, 'Travel'), {
    kind: 'expand',
    path: 'Travel',
  });
  assert.deepEqual(folderTreeKeyAction('ArrowRight', rows, 'Projects'), {
    kind: 'focus',
    path: 'Projects/Launch',
  });
  assert.deepEqual(folderTreeKeyAction('ArrowLeft', rows, 'Projects'), {
    kind: 'collapse',
    path: 'Projects',
  });
  assert.deepEqual(
    folderTreeKeyAction('ArrowLeft', rows, 'Projects/Research'),
    {
      kind: 'focus',
      path: 'Projects',
    },
  );
  assert.deepEqual(folderTreeKeyAction('ArrowRight', rows, 'Daily'), {
    kind: 'none',
  });
  assert.deepEqual(folderTreeKeyAction('Enter', rows, 'Daily'), {
    kind: 'choose',
    path: 'Daily',
  });
  assert.deepEqual(folderTreeKeyAction(' ', rows, ''), {
    kind: 'choose',
    path: '',
  });
});

await test('a disabled row cannot be chosen with a key', () => {
  const rows = folderTreeRows({
    folders,
    expanded: new Set(),
    rootName: 'All notes',
    isDisabled: (path) => path === 'Daily',
  });
  assert.deepEqual(folderTreeKeyAction('Enter', rows, 'Daily'), {
    kind: 'none',
  });
});
