import assert from 'node:assert/strict';
import test from 'node:test';
import { newNoteTemplateText } from './new-note-draft.ts';
import {
  newNoteNameProblem,
  templateNoteName,
  templatePreviewText,
  templatePreviewHighlights,
} from './template-note.ts';

await test('a template note name is the template name and the date, made free', () => {
  const instant = new Date(2026, 9, 27, 9, 41);
  assert.equal(
    templateNoteName([], 'Projects', 'Weekly review', instant),
    'Weekly review 2026-10-27',
  );
  assert.equal(
    templateNoteName(
      ['Projects/weekly review 2026-10-27.md'],
      'Projects',
      'Weekly review',
      instant,
    ),
    'Weekly review 2026-10-27 2',
  );
  assert.equal(
    templateNoteName(
      ['Projects/Weekly review 2026-10-27.md'],
      'Daily',
      'Weekly review',
      instant,
    ),
    'Weekly review 2026-10-27',
  );
});

await test('a new note name is refused when empty, invalid or taken in the folder', () => {
  const taken = ['Projects/Plan.md'];
  assert.equal(
    newNoteNameProblem('  ', 'Projects', taken),
    'Type a note name.',
  );
  assert.match(
    newNoteNameProblem('a/b', 'Projects', taken) ?? '',
    /cannot contain a slash/,
  );
  assert.match(
    newNoteNameProblem('a\\b', 'Projects', taken) ?? '',
    /backslash/,
  );
  assert.match(
    newNoteNameProblem('plan', 'Projects', taken) ?? '',
    /already in this folder/,
  );
  assert.equal(newNoteNameProblem('Plan', 'Daily', taken), null);
  assert.equal(newNoteNameProblem(' Plan 2 ', 'Projects', taken), null);
});

await test('the preview fills the template with the typed name, date and time', () => {
  const instant = new Date(2026, 9, 27, 9, 41);
  const text = templatePreviewText(
    '# {{title}}\n\nOn {{date}} at {{time}}\n',
    ' Weekly review 2026-10-27 ',
    instant,
  );
  assert.equal(text, '# Weekly review 2026-10-27\n\nOn 2026-10-27 at 09:41\n');
  assert.doesNotMatch(text, /\{\{/);
  // Creation fills the same way from the path of the note.
  assert.equal(
    newNoteTemplateText(
      '# {{title}}\n\nOn {{date}} at {{time}}\n',
      'Projects/Weekly review 2026-10-27.md',
      instant,
    ),
    text,
  );
});

await test('preview marks cover known values and custom formats, without changing unknown placeholders', () => {
  assert.deepEqual(
    templatePreviewHighlights(
      '{{title}} {{date:YYYY}} {{time}} {{unknown}}',
      'Plan',
      new Date(2026, 9, 28, 9, 41),
    ),
    ['Plan', '2026', '09:41'],
  );
});
