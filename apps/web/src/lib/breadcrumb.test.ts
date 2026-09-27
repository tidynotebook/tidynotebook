import assert from 'node:assert/strict';
import test from 'node:test';
import {
  breadcrumbKey,
  breadcrumbParts,
  framePageOf,
  framePages,
  leafOf,
  type BreadcrumbPart,
  type BreadcrumbRoute,
  type PageTitles,
} from './breadcrumb.ts';

/**
 * The identity of the part at one position.
 *
 * A guard and not an assertion: a position that no part fills is a defect in
 * the test, so it fails loudly here (decision 0019).
 */
function keyAt(parts: readonly BreadcrumbPart[], index: number): string {
  const part = parts[index];
  if (part === undefined)
    throw new Error(`no breadcrumb part at ${String(index)}`);
  return breadcrumbKey(part, index);
}

/** One route of the frame, with the parts a test wants to change. */
function route(over: Partial<BreadcrumbRoute> = {}): BreadcrumbRoute {
  return {
    workspaceId: 'w1',
    workspaceName: 'Personal',
    notePath: null,
    leaf: 'All notes',
    ...over,
  };
}

await test('a page yields the workspace and the page', () => {
  assert.deepEqual(breadcrumbParts(route({ leaf: 'Trash' })), [
    { label: 'Personal', to: '/w/w1', folder: '' },
    { label: 'Trash', to: null, folder: null },
  ]);
});

await test('the last part is where the person is, so it goes nowhere', () => {
  for (const leaf of ['All notes', 'Trash', 'Published links'])
    assert.equal(breadcrumbParts(route({ leaf })).at(-1)?.to, null);
});

await test('a note at the top of the workspace yields two parts', () => {
  const parts = breadcrumbParts(
    route({ notePath: 'Roadmap.md', leaf: 'Roadmap' }),
  );
  assert.deepEqual(
    parts.map((part) => part.label),
    ['Personal', 'Roadmap'],
  );
});

await test('a note in a folder yields one part for each folder above it', () => {
  const parts = breadcrumbParts(
    route({ notePath: 'Work/Plans/Roadmap.md', leaf: 'Roadmap' }),
  );
  assert.deepEqual(parts, [
    { label: 'Personal', to: '/w/w1', folder: '' },
    { label: 'Work', to: '/w/w1', folder: 'Work' },
    { label: 'Plans', to: '/w/w1', folder: 'Work/Plans' },
    { label: 'Roadmap', to: null, folder: null },
  ]);
});

await test('a folder part names the whole path of that folder', () => {
  // The defect this would cover: a part that names the segment alone selects
  // the wrong folder as soon as two folders share a name.
  const parts = breadcrumbParts(
    route({ notePath: 'Work/Plans/Work/Note.md', leaf: 'Note' }),
  );
  assert.deepEqual(
    parts.map((part) => part.folder),
    ['', 'Work', 'Work/Plans', 'Work/Plans/Work', null],
  );
});

await test('the workspace part opens the note list of that workspace', () => {
  const parts = breadcrumbParts(
    route({ workspaceId: 'w2', workspaceName: 'Work' }),
  );
  assert.deepEqual(parts[0], { label: 'Work', to: '/w/w2', folder: '' });
});

await test('the history of a note keeps the folders of that note', () => {
  const parts = breadcrumbParts(
    route({ notePath: 'Work/Roadmap.md', leaf: 'History of Roadmap' }),
  );
  assert.deepEqual(
    parts.map((part) => part.label),
    ['Personal', 'Work', 'History of Roadmap'],
  );
});

await test('a path with a repeated separator yields no empty part', () => {
  const parts = breadcrumbParts(
    route({ notePath: 'Work//Roadmap.md', leaf: 'Roadmap' }),
  );
  assert.deepEqual(
    parts.map((part) => part.label),
    ['Personal', 'Work', 'Roadmap'],
  );
});

await test('a workspace with no name yet yields no part of its own', () => {
  // The workspace list fills after the first paint, and a link with no word
  // is one that nobody can read and nobody can name.
  const parts = breadcrumbParts(route({ workspaceName: '' }));
  assert.deepEqual(parts, [{ label: 'All notes', to: null, folder: null }]);
  for (const part of breadcrumbParts(
    route({ workspaceName: '', notePath: 'Work/Note.md', leaf: 'Note' }),
  ))
    assert.notEqual(part.label, '');
});

await test('the last part keeps one identity while its word changes', () => {
  // The note route writes its name field into the last part (decision 0069).
  // A key that held the word changed on each keystroke, so React replaced the
  // element and the field was destroyed under the caret: one character, then
  // the keyboard of a phone closed.
  const open = route({ notePath: 'Notes/Draft.md', leaf: 'Draft' });
  const before = breadcrumbParts(open);
  const after = breadcrumbParts({ ...open, leaf: 'Drafts' });
  assert.equal(
    keyAt(before, before.length - 1),
    keyAt(after, after.length - 1),
  );
});

await test('two parts of one breadcrumb never share an identity', () => {
  // A folder of the same name at two depths stays two rows.
  const parts = breadcrumbParts(
    route({ notePath: 'Work/Work/Note.md', leaf: 'Note' }),
  );
  const keys = parts.map((part, index) => breadcrumbKey(part, index));
  assert.equal(new Set(keys).size, keys.length);
});

await test('a link part is identified by its place and its word', () => {
  const parts = breadcrumbParts(
    route({ notePath: 'Work/Note.md', leaf: 'Note' }),
  );
  assert.equal(keyAt(parts, 0), '0:Personal');
  assert.equal(keyAt(parts, 1), '1:Work');
});

/** The words of the pages, as the shell passes them in. */
const titles: PageTitles = {
  notes: 'All notes',
  trash: 'Trash',
  published: 'Published links',
  accounts: 'Accounts',
  attention: 'Needs attention',
  settings: 'Settings',
  'not-found': 'Page not found',
};

await test('the deepest route that names a page decides the page', () => {
  // The frame route names no page. Its child does, and it is the last match.
  assert.equal(framePageOf([undefined, { page: 'settings' }]), 'settings');
  assert.equal(
    framePageOf([{ page: 'notes' }, { page: 'history' }]),
    'history',
  );
});

await test('every page of the frame is read back from its handle', () => {
  for (const page of framePages) assert.equal(framePageOf([{ page }]), page);
});

await test('a handle that names no page of the frame is no page', () => {
  // The route table is the one list of pages. A route that names none must not
  // read as All notes, which is what an address the shell did not know read.
  for (const handle of [
    undefined,
    null,
    'settings',
    {},
    { page: 'Settings' },
    { page: 3 },
  ])
    assert.equal(framePageOf([handle]), null, JSON.stringify(handle));
  assert.equal(framePageOf([]), null);
});

await test('settings yields the workspace and Settings', () => {
  const leaf = leafOf('settings', null, titles);
  assert.deepEqual(breadcrumbParts(route({ leaf })), [
    { label: 'Personal', to: '/w/w1', folder: '' },
    { label: 'Settings', to: null, folder: null },
  ]);
});

await test('an address the frame does not know reads Page not found', () => {
  assert.equal(leafOf('not-found', null, titles), 'Page not found');
});

await test('a page that names no note takes its word from the titles', () => {
  assert.equal(leafOf('notes', null, titles), 'All notes');
  assert.equal(leafOf('trash', 'Roadmap', titles), 'Trash');
});

await test('the note pages take the name of the open note', () => {
  assert.equal(leafOf('note', 'Roadmap', titles), 'Roadmap');
  assert.equal(leafOf('history', 'Roadmap', titles), 'History of Roadmap');
  assert.equal(leafOf('review', 'Roadmap', titles), 'Review of Roadmap');
});

await test('a note page before the name arrives still names the page', () => {
  assert.equal(leafOf('note', null, titles), 'Note');
  assert.equal(leafOf('history', null, titles), 'History of this note');
  assert.equal(leafOf('review', null, titles), 'Review of this note');
});

await test('a route that names no page yields no last part', () => {
  // Better the workspace alone than a word that names some other page.
  const leaf = leafOf(null, null, titles);
  assert.equal(leaf, '');
  assert.deepEqual(breadcrumbParts(route({ leaf })), [
    { label: 'Personal', to: '/w/w1', folder: '' },
  ]);
});
