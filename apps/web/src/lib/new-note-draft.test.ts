import assert from 'node:assert/strict';
import test from 'node:test';
import {
  freeCopyPath,
  freeNotePath,
  newNoteDraft,
  newNoteTemplateText,
} from './new-note-draft.ts';

await test('a new note is empty', () => {
  const draft = newNoteDraft({
    accountId: 'account',
    workspaceId: 'workspace',
    path: 'New note.md',
    ids: { fileId: 'file', workingCopyId: 'copy' },
  });
  assert.equal(draft.text, '');
  assert.equal(draft.path, 'New note.md');
  assert.equal(draft.baseRevisionId, null);
  assert.equal(draft.deleted, false);
});

await test('a daily note starts with the text of its template', () => {
  const draft = newNoteDraft({
    accountId: 'account',
    workspaceId: 'workspace',
    path: 'Daily notes/2026-09-24.md',
    ids: { fileId: 'file', workingCopyId: 'copy' },
    text: '# Plan\n\n- [ ] \n',
  });
  assert.equal(draft.text, '# Plan\n\n- [ ] \n');
  assert.equal(draft.path, 'Daily notes/2026-09-24.md');
  // It is a new note all the same: no base, and the first sequence.
  assert.equal(draft.baseRevisionId, null);
  assert.equal(draft.sequence, 1);
});

await test('the first free name at the root is New note', () => {
  assert.equal(freeNotePath([], ''), 'New note.md');
  assert.equal(freeNotePath(['new note.md'], ''), 'New note 2.md');
  assert.equal(
    freeNotePath(['New note.md', 'New note 2.md'], ''),
    'New note 3.md',
  );
});

await test('a new note in a folder counts only that folder', () => {
  assert.equal(freeNotePath(['New note.md'], 'Work'), 'Work/New note.md');
  assert.equal(
    freeNotePath(['Work/new note.md'], 'Work'),
    'Work/New note 2.md',
  );
});

await test('the copy of a note takes the first free copy name beside it', () => {
  assert.equal(freeCopyPath([], 'Work', 'Plan'), 'Work/Plan copy.md');
  assert.equal(
    freeCopyPath(['Work/plan copy.md'], 'Work', 'Plan'),
    'Work/Plan copy 2.md',
  );
  assert.equal(
    freeCopyPath(['Plan copy.md', 'Plan copy 2.md'], '', 'Plan'),
    'Plan copy 3.md',
  );
  // A copy in another folder leaves the name free here.
  assert.equal(
    freeCopyPath(['Home/Plan copy.md'], 'Work', 'Plan'),
    'Work/Plan copy.md',
  );
});

await test('a chosen template fills the actual new name and keeps its heading', () => {
  const instant = new Date(2026, 9, 25, 14, 30, 0);
  assert.equal(
    newNoteTemplateText(undefined, 'Work/New note 2.md', instant),
    '',
  );
  assert.equal(
    newNoteTemplateText(
      '# Template heading\n{{title}} {{date}} {{time}}',
      'Work/New note 2.md',
      instant,
    ),
    '# Template heading\nNew note 2 2026-10-25 14:30',
  );
});
