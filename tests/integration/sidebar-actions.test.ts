/**
 * The sidebar has one row of icon actions and no rows below it (issue 517).
 *
 * The row is New note, New folder, New note from template, Sort notes and
 * Expand or Collapse all folders. Each one is a compact ghost control, so it
 * keeps the 44 px touch target, a name and a tooltip. The Use template button
 * and the Today's note row are gone from the sidebar: the calendar view and
 * Search open today's note. The writing tips are gone with their code, so an
 * old stored dismissal is a key that nothing reads.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../../..');
const web = resolve(root, 'apps/web/src');
const shell = await readFile(resolve(web, 'shell/shell.tsx'), 'utf8');
const notesHome = await readFile(
  resolve(web, 'features/notes/notes-home.tsx'),
  'utf8',
);

/** The source of the icon row: from New note to the end of its flex row. */
function iconRow(): string {
  const start = shell.indexOf("? 'New note'");
  const end = shell.indexOf('</div>', start);
  assert.ok(start > 0 && end > start, 'The sidebar has its icon row.');
  return shell.slice(start, end);
}

await test('the template action is the third icon of the sidebar row', () => {
  const row = iconRow();
  const order = [
    'title="New note"',
    'label="New folder"',
    'label="New note from template"',
    'label="Sort notes"',
    'label={folderExpansionLabels[expansion]}',
  ].map((part) => row.indexOf(part));
  for (const at of order) assert.ok(at >= 0);
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  const template = row.slice(
    row.lastIndexOf('<Button', row.indexOf('New note from template')),
    row.indexOf('/>', row.indexOf('New note from template')),
  );
  for (const part of [
    'variant="ghost"',
    'compact',
    'title="New note from template"',
    "icon={actionIcon('template')}",
    'onClick={() => onFromTemplate(selectedFolder)}',
  ])
    assert.ok(template.includes(part), part);
});

await test('the sidebar has no Use template button and no Today note row', () => {
  assert.ok(!shell.includes('Use template'));
  assert.ok(!shell.includes("<span>Today's note</span>"));
});

await test('the writing tips are removed with their stored key', async () => {
  assert.ok(!notesHome.includes('WritingStart'));
  assert.ok(!notesHome.includes('writing-tips'));
  for (const path of [
    'features/notes/writing-start.tsx',
    'lib/writing-tips.ts',
  ])
    await assert.rejects(access(resolve(web, path)));
});
