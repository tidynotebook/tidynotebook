import assert from 'node:assert/strict';
import test from 'node:test';
import {
  backTarget,
  breadcrumbKey,
  breadcrumbParts,
  framePageOf,
  framePages,
  leafOf,
  pageParents,
  parentPartOf,
  type ParentContext,
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

/** What `parentPartOf` reads, with the parts a test wants to change. */
function context(over: Partial<ParentContext> = {}): ParentContext {
  return {
    workspaceId: 'w1',
    fileId: null,
    noteName: 'Roadmap',
    titles,
    ...over,
  };
}

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

await test('a page that is not the note has no last part', () => {
  // Record 0139. The heading of the page names it, so the breadcrumb does not
  // say the same word one line above it.
  for (const page of framePages)
    if (page !== 'note') assert.equal(leafOf(page, 'Roadmap'), '', page);
  assert.equal(leafOf(null, null), '');
});

await test('the note is the last part of its own breadcrumb', () => {
  assert.equal(leafOf('note', 'Roadmap'), 'Roadmap');
  assert.equal(leafOf('note', null), 'Note');
});

await test('Settings yields the workspace alone', () => {
  const leaf = leafOf('settings', null);
  const parent = parentPartOf('settings', context());
  assert.deepEqual(breadcrumbParts(route({ leaf, parent })), [
    { label: 'Personal', to: '/w/w1', folder: '' },
  ]);
});

await test('History and Review go back to their note in one part', () => {
  for (const page of ['history', 'review'] as const) {
    const parent = parentPartOf(page, context({ fileId: 'f1' }));
    assert.deepEqual(parent, { label: 'Roadmap', to: '/w/w1/notes/f1' });
    assert.deepEqual(
      breadcrumbParts(
        route({
          notePath: 'Work/Roadmap.md',
          leaf: leafOf(page, 'Roadmap'),
          parent,
        }),
      ),
      [
        { label: 'Personal', to: '/w/w1', folder: '' },
        { label: 'Work', to: '/w/w1', folder: 'Work' },
        { label: 'Roadmap', to: '/w/w1/notes/f1', folder: null },
      ],
    );
  }
});

await test('a page under a note with no note in its address adds no part', () => {
  assert.equal(parentPartOf('history', context()), null);
});

await test('a page under the note list adds no part of its own', () => {
  for (const page of [
    'notes',
    'note',
    'trash',
    'published',
    'attention',
    'settings',
    'not-found',
  ] as const)
    assert.equal(parentPartOf(page, context({ fileId: 'f1' })), null, page);
  assert.equal(parentPartOf(null, context()), null);
});

await test('every page but All notes names the page above it', () => {
  // Record 0138. One back control on every page, and none on the top.
  for (const page of framePages)
    assert.equal(pageParents[page] === null, page === 'notes', page);
  assert.equal(backTarget('notes', 'w1', null), null);
  assert.equal(backTarget(null, 'w1', null), null);
});

await test('a page goes back to the page above it', () => {
  assert.deepEqual(backTarget('trash', 'w1', null), {
    to: '/w/w1',
    label: 'Back to your notes',
  });
  assert.deepEqual(backTarget('settings', 'w1', null), {
    to: '/w/w1',
    label: 'Back to your notes',
  });
  assert.deepEqual(backTarget('accounts', 'w1', null), {
    to: '/w/w1?settings=account',
    label: 'Back to Settings',
  });
  assert.deepEqual(backTarget('history', 'w1', 'f1'), {
    to: '/w/w1/notes/f1',
    label: 'Back to the note',
  });
  assert.deepEqual(backTarget('note', 'w1', 'f1'), {
    to: '/w/w1',
    label: 'Back to your notes',
  });
});

await test('a page under a note with no note goes back to the note list', () => {
  assert.deepEqual(backTarget('review', 'w1', null), {
    to: '/w/w1',
    label: 'Back to your notes',
  });
});

await test('Accounts reads as a part of Settings in the breadcrumb', () => {
  const parent = parentPartOf('accounts', context());
  assert.deepEqual(parent, {
    label: 'Settings',
    to: '/w/w1?settings=account',
  });
  assert.deepEqual(
    breadcrumbParts(route({ leaf: leafOf('accounts', null), parent })),
    [
      { label: 'Personal', to: '/w/w1', folder: '' },
      { label: 'Settings', to: '/w/w1?settings=account', folder: null },
    ],
  );
});
