/**
 * The templates of a workspace on this device (record 0149).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultTemplateSettings, fillTemplate } from '@notesapp/core';
import { memberSettingsKey } from './member-settings.ts';
import {
  formatCachedTemplateSettings,
  parseCachedTemplateSettings,
  templateChoices,
  templateDestinationFor,
  templateContextAt,
  templateCountLine,
  templateFolderSentences,
  templateFolderToStore,
  templatePalettePick,
  templateProblems,
  templateSettingsName,
  templateSettingsProblem,
  timeOfInstant,
} from './templates.ts';

const notes = [
  { fileId: 'g', path: 'Templates/Groceries.md' },
  { fileId: 'w', path: 'Templates/Home/Weekly groceries.md' },
  { fileId: 'm', path: 'Templates/Work/Meeting.md' },
  { fileId: 'b', path: 'Templates/Book.md' },
  { fileId: 'd', path: 'Templates/Home/Book.md' },
  { fileId: 'x', path: 'Groceries.md' },
  { fileId: 'y', path: 'Templates old/Day.md' },
  { fileId: 'z', path: 'Work/Templates/Day.md' },
];

await test('the palette lists the notes below the folder, by name', () => {
  assert.deepEqual(templateChoices(notes, 'Templates', null), [
    { id: 'b', label: 'Book', detail: null },
    { id: 'd', label: 'Book', detail: 'Home' },
    { id: 'g', label: 'Groceries', detail: null },
    { id: 'm', label: 'Meeting', detail: 'Work' },
    { id: 'w', label: 'Weekly groceries', detail: 'Home' },
  ]);
  // A folder deeper in the workspace holds its own templates.
  assert.deepEqual(templateChoices(notes, 'Work/Templates', null), [
    { id: 'z', label: 'Day', detail: null },
  ]);
});

await test('the open note is never a template of itself', () => {
  assert.deepEqual(
    templateChoices(notes, 'Templates', 'g').map((choice) => choice.id),
    ['b', 'd', 'm', 'w'],
  );
});

await test('a folder with no note lists no template', () => {
  assert.deepEqual(templateChoices(notes, 'Recipes', null), []);
  assert.deepEqual(templateChoices([], 'Templates', null), []);
});

await test('a fill reads the date and the time of the device', () => {
  const instant = new Date(2026, 9, 1, 18, 4, 30);
  assert.deepEqual(timeOfInstant(instant), {
    hour: 18,
    minute: 4,
    second: 30,
  });
  const context = templateContextAt(instant, 'October list');
  assert.deepEqual(context, {
    date: { year: 2026, month: 10, day: 1 },
    time: { hour: 18, minute: 4, second: 30 },
    title: 'October list',
  });
  // The case of issue 220: the month and the year of the day of the insert.
  assert.equal(
    fillTemplate('# Groceries, {{date:MMMM YYYY}} ({{time}})', context),
    '# Groceries, October 2026 (18:04)',
  );
});

await test('a daily note keeps the date of its day and takes the time of the fill', () => {
  const instant = new Date(2026, 9, 1, 7, 15, 0);
  const day = { year: 2026, month: 9, day: 3 };
  assert.deepEqual(templateContextAt(instant, '2026-09-03', day), {
    date: day,
    time: { hour: 7, minute: 15, second: 0 },
    title: '2026-09-03',
  });
});

await test('a cached copy reads back as the settings it stored', () => {
  for (const settings of [defaultTemplateSettings, { folder: 'A/B' }])
    assert.deepEqual(
      parseCachedTemplateSettings(formatCachedTemplateSettings(settings)),
      settings,
    );
  assert.equal(
    memberSettingsKey(templateSettingsName, 'account', 'workspace'),
    'notesapp.templates:account:workspace',
  );
});

await test('a copy of another shape is no copy at all', () => {
  for (const source of [
    null,
    '',
    'not json',
    'null',
    '[]',
    '{}',
    '{"folder":3}',
    '{"folder":""}',
    '{"folder":"/Templates"}',
  ])
    assert.equal(parseCachedTemplateSettings(source), null, String(source));
});

await test('a typed folder is stored cleaned, and only when it is new', () => {
  const stored = { folder: 'Templates' };
  assert.equal(templateFolderToStore(' Recipes/ ', stored), 'Recipes');
  assert.equal(
    templateFolderToStore('/Work/Templates', stored),
    'Work/Templates',
  );
  // The folder that the server holds already, and a folder that cannot hold
  // templates, are not stored.
  assert.equal(templateFolderToStore('Templates/', stored), null);
  assert.equal(templateFolderToStore('  ', stored), null);
  assert.equal(templateFolderToStore('A//B', stored), null);
});

await test('a refused folder has its own sentence and every other failure keeps its own', () => {
  assert.equal(
    templateSettingsProblem(422, 'general'),
    templateFolderSentences.folder,
  );
  assert.equal(templateSettingsProblem(500, 'server'), 'server');
});

await test('every sentence of a template problem names no code', () => {
  for (const sentence of [
    ...Object.values(templateProblems),
    ...Object.values(templateFolderSentences),
  ]) {
    assert.match(sentence, /^[A-Z]/);
    assert.match(sentence, /\.$/);
    assert.doesNotMatch(sentence, /invalid_path|not_found|\d{3}/);
  }
});

await test('the count of templates is a count and a whole phrase', () => {
  assert.equal(templateCountLine(0, true), 'This folder has no templates yet.');
  assert.equal(templateCountLine(1, true), 'This folder has 1 template.');
  assert.equal(templateCountLine(3, true), 'This folder has 3 templates.');
  // A list that is not complete gives no count that could be false.
  assert.equal(templateCountLine(0, false), templateProblems.partial);
  assert.equal(templateCountLine(3, false), templateProblems.partial);
});

/** The note list of the frame, complete and answered. */
const list = { notes, loading: false, complete: true };

await test('the step of Insert from template lists the templates of the member', () => {
  const chosen: string[] = [];
  const made: string[] = [];
  const pick = templatePalettePick({
    settings: { status: 'ready', settings: { folder: 'Templates' } },
    list,
    openFileId: 'm',
    choose: (id) => chosen.push(id),
    newTemplate: (folder) => made.push(folder),
  });
  assert.equal(pick.placeholder, 'Search templates');
  const choices = pick.choices();
  assert.deepEqual(
    choices.status === 'ready'
      ? choices.choices.map((choice) => choice.id)
      : null,
    ['b', 'd', 'g', 'w'],
  );
  assert.equal(choices.status === 'ready' ? choices.notice : 'none', null);
  pick.choose('g');
  assert.deepEqual(chosen, ['g']);
  // The one action of the empty state makes a note in the folder.
  pick.empty.action?.run();
  assert.deepEqual(made, ['Templates']);
  assert.match(pick.empty.description, /Templates/);
});

await test('the step says that it waits, or why it cannot list', () => {
  const input = {
    list,
    openFileId: null,
    choose: (): void => {},
    newTemplate: (): void => {},
  };
  const ready = { status: 'ready' as const, settings: { folder: 'Templates' } };
  assert.equal(
    templatePalettePick({ ...input, settings: { status: 'loading' } }).choices()
      .status,
    'loading',
  );
  // A note list that has not answered is no empty folder (record 0038).
  assert.equal(
    templatePalettePick({
      ...input,
      settings: ready,
      list: { notes: [], loading: true, complete: true },
    }).choices().status,
    'loading',
  );
  assert.deepEqual(
    templatePalettePick({
      ...input,
      settings: { status: 'unavailable' },
    }).choices(),
    { status: 'unavailable', message: templateProblems.settings },
  );
  // A folder with no note is an empty list, which the empty state names.
  assert.deepEqual(
    templatePalettePick({
      ...input,
      settings: { status: 'ready', settings: { folder: 'Recipes' } },
    }).choices(),
    { status: 'ready', choices: [], notice: null },
  );
  // A list that is not complete can miss a template, and says so.
  assert.deepEqual(
    templatePalettePick({
      ...input,
      settings: { status: 'ready', settings: { folder: 'Recipes' } },
      list: { notes, loading: false, complete: false },
    }).choices(),
    { status: 'ready', choices: [], notice: templateProblems.partial },
  );
});

await test('workspace navigation cannot reuse the previous template destination before effects run', () => {
  const chosen = { workspaceId: 'first', folder: 'Work/Projects' };
  assert.equal(templateDestinationFor('first', chosen), 'Work/Projects');
  // The first render in another workspace must already close the dialog.
  assert.equal(templateDestinationFor('second', chosen), null);
  assert.equal(templateDestinationFor('first', null), null);
  assert.equal(
    templateDestinationFor('second', { workspaceId: 'second', folder: '' }),
    '',
  );
  assert.equal(
    templateDestinationFor('second', {
      workspaceId: 'second',
      folder: 'Work/Projects',
    }),
    'Work/Projects',
  );
});
