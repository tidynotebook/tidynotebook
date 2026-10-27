import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';
import { Window } from 'happy-dom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { openLocalStore } from '@notesapp/storage-browser';
import { act, createElement, useState } from 'react';
import {
  dailySaves,
  folderNotes,
  moves,
  templateSaves,
} from './support/folder-picker-fixture.ts';

const browser = new Window({ url: 'http://localhost/' });
const globals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'MutationObserver',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
] as const;
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const name of globals) {
  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  const value: unknown = browser[name];
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value:
      typeof value === 'function' && /^[a-z]/.test(name)
        ? value.bind(browser)
        : value,
  });
}
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});
const fixtureUrl = new URL(
  './support/folder-picker-fixture.ts',
  import.meta.url,
).href;
const boundaries = new Map([
  ['/features/folders/folders.js', new Set(['./apply-moves.js'])],
  [
    '/features/templates/template-settings.js',
    new Set(['../../shell/files.js', './templates.js']),
  ],
  [
    '/features/daily-notes/daily-note-settings.js',
    new Set(['../../shell/files.js', './daily-notes.js']),
  ],
]);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    for (const [parent, specifiers] of boundaries)
      if (context.parentURL?.endsWith(parent) && specifiers.has(specifier))
        return { url: fixtureUrl, shortCircuit: true };
    return next(specifier, context);
  },
});
const { createRoot } = await import('react-dom/client');
const { FolderTreePicker } =
  await import('../../apps/web/dist/features/folders/folder-tree-picker.js');
const { NewFolderDialog, MoveItemsDialog } =
  await import('../../apps/web/dist/features/folders/folders.js');
const { TemplateSettingsFields } =
  await import('../../apps/web/dist/features/templates/template-settings.js');
const { DailyNoteSettingsFields } =
  await import('../../apps/web/dist/features/daily-notes/daily-note-settings.js');
// The move write is replaced, so the store only has to exist.
const store = await openLocalStore('http://localhost', {
  indexedDB: new IDBFactory(),
  IDBKeyRange,
  databaseName: `folder-tree-picker-${crypto.randomUUID()}`,
});
const container = document.createElement('div');
document.body.append(container);
const root = createRoot(container);

const folders = [
  'Daily',
  'Projects',
  'Projects/Launch',
  'Projects/Research',
  'Templates',
];

let renders = 0;
/** Mount a fresh element, so no state carries over from a previous test. */
async function render(
  element: ReturnType<typeof createElement>,
): Promise<void> {
  renders += 1;
  await act(async () =>
    root.render(createElement('div', { key: String(renders) }, element)),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
function rows(): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')];
}
function row(name: string): HTMLElement {
  const found = rows().find((candidate) =>
    candidate.textContent?.startsWith(name),
  );
  assert.ok(found, `Missing row: ${name}`);
  return found;
}
function names(): string[] {
  return rows().map((candidate) => candidate.textContent ?? '');
}
function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (candidate) =>
      candidate.textContent === label ||
      candidate.getAttribute('aria-label') === label,
  );
  assert.ok(found, `Missing button: ${label}`);
  return found;
}
async function press(key: string): Promise<void> {
  const target = document.activeElement;
  assert.ok(target);
  await act(async () =>
    target.dispatchEvent(
      new window.KeyboardEvent('keydown', { key, bubbles: true }),
    ),
  );
}
async function type(id: string, value: string): Promise<void> {
  const input = document.getElementById(id);
  assert.ok(input, `Missing field: ${id}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set?.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
function fieldOf(label: string): HTMLInputElement {
  const found = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  );
  const input = found?.htmlFor ? document.getElementById(found.htmlFor) : null;
  assert.ok(
    input instanceof window.HTMLInputElement,
    `Missing field: ${label}`,
  );
  return input;
}

/** A host that keeps the chosen folder, as each caller does. */
function Picker(props: { readonly start: string }) {
  const [selected, setSelected] = useState(props.start);
  return createElement(
    'div',
    null,
    createElement('output', null, selected),
    createElement(FolderTreePicker, {
      folders,
      selected,
      onSelect: setSelected,
      label: 'Save in',
      autoFocus: true,
    }),
  );
}

await test('the tree opens at the chosen folder and has the ARIA of the sidebar tree', async () => {
  await render(createElement(Picker, { start: 'Projects/Research' }));
  const tree = container.querySelector('[role="tree"]');
  assert.equal(tree?.getAttribute('aria-label'), 'Save in');
  assert.deepEqual(names(), [
    'All notes',
    'Daily',
    'Projects',
    'Launch',
    'Research',
    'Templates',
  ]);
  const research = row('Research');
  assert.equal(research.getAttribute('aria-selected'), 'true');
  assert.equal(research.getAttribute('aria-level'), '2');
  assert.equal(research.tabIndex, 0);
  assert.equal(document.activeElement, research);
  assert.equal(row('Projects').getAttribute('aria-expanded'), 'true');
  assert.equal(row('Daily').getAttribute('aria-expanded'), null);
  assert.equal(row('Daily').tabIndex, -1);
  assert.equal(
    rows().filter((one) => one.getAttribute('aria-selected') === 'true').length,
    1,
  );
});

await test('arrow keys move, close and open, and Enter chooses a row', async () => {
  await render(createElement(Picker, { start: 'Projects/Research' }));
  await press('ArrowLeft');
  assert.equal(document.activeElement, row('Projects'));
  await press('ArrowLeft');
  assert.equal(row('Projects').getAttribute('aria-expanded'), 'false');
  assert.ok(!names().includes('Research'));
  await press('ArrowRight');
  assert.equal(row('Projects').getAttribute('aria-expanded'), 'true');
  await press('ArrowRight');
  assert.equal(document.activeElement, row('Launch'));
  await press('ArrowDown');
  await press('ArrowDown');
  assert.equal(document.activeElement, row('Templates'));
  await press('Home');
  assert.equal(document.activeElement, row('All notes'));
  await press('End');
  assert.equal(document.activeElement, row('Templates'));
  await press('ArrowUp');
  await press('ArrowUp');
  await press('Enter');
  assert.equal(
    container.querySelector('output')?.textContent,
    'Projects/Launch',
  );
  assert.equal(row('Launch').getAttribute('aria-selected'), 'true');
  await press('Home');
  await press(' ');
  assert.equal(container.querySelector('output')?.textContent, '');
});

await test('New folder here names a folder inside the chosen one and chooses it', async () => {
  await render(createElement(Picker, { start: 'Projects' }));
  await act(async () => button('New folder in Projects').click());
  await type(fieldOf('New folder in Projects').id, 'launch');
  await act(async () => button('Add folder').click());
  assert.match(
    container.textContent ?? '',
    /A folder named Projects\/launch already exists/,
  );
  await type(fieldOf('New folder in Projects').id, 'a\\b');
  await act(async () => button('Add folder').click());
  assert.match(container.textContent ?? '', /backslash/);
  await type(fieldOf('New folder in Projects').id, 'Archive');
  await act(async () => button('Add folder').click());
  assert.equal(
    container.querySelector('output')?.textContent,
    'Projects/Archive',
  );
  assert.equal(row('Archive').getAttribute('aria-selected'), 'true');
  assert.equal(row('Archive').getAttribute('aria-level'), '2');
});

await test('New folder chooses its parent in the tree field and creates inside it', async () => {
  const created: string[] = [];
  await render(
    createElement(NewFolderDialog, {
      open: true,
      onClose: () => {},
      folders,
      parent: 'Projects',
      onCreated: (folder: string) => created.push(folder),
    }),
  );
  assert.equal(container.querySelector('[role="tree"]'), null);
  const inside =
    container.querySelector<HTMLButtonElement>('#new-folder-inside');
  assert.ok(inside);
  assert.match(inside.textContent ?? '', /Projects/);
  await act(async () => inside.click());
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
  await act(async () => row('Research').click());
  assert.equal(container.querySelector('[role="tree"]'), null);
  assert.ok(!container.textContent?.includes('Done'));
  await type('new-folder-name', 'Q4');
  const form = container.querySelector('[role="dialog"] form');
  assert.ok(form);
  await act(async () =>
    form.dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    ),
  );
  assert.deepEqual(created, ['Projects/Research/Q4']);
});

await test('Move dims the moved folder and its children and moves into a chosen or new folder', async () => {
  let closed = 0;
  await render(
    createElement(MoveItemsDialog, {
      open: true,
      onClose: () => {
        closed += 1;
      },
      store,
      accountId: 'account',
      workspaceId: 'workspace',
      area: { notes: folderNotes, namesInUse: [] },
      folders,
      emptyFolders: [],
      items: [{ kind: 'folder', folder: 'Projects/Launch' }],
      onFolderMoved: () => {},
    }),
  );
  assert.equal(
    container.querySelector('[role="dialog"] h2')?.textContent,
    'Move Launch to',
  );
  assert.equal(
    row('All notes, at the top').getAttribute('aria-disabled'),
    null,
  );
  const launch = row('Launch');
  assert.equal(launch.getAttribute('aria-disabled'), 'true');
  assert.match(launch.textContent ?? '', /this folder/);
  assert.equal(row('Projects').getAttribute('aria-selected'), 'true');
  await act(async () => launch.click());
  assert.equal(row('Projects').getAttribute('aria-selected'), 'true');
  assert.ok(!names().some((name) => name === 'A new folder'));
  await act(async () => row('Research').click());
  await act(async () => button('Move').click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.deepEqual(moves.at(-1)?.moves, [
    { fileId: 'a', toPath: 'Projects/Research/Launch/Brief.md' },
  ]);
  assert.equal(closed, 1);
});

await test('Move into a folder that New folder here names', async () => {
  await render(
    createElement(MoveItemsDialog, {
      open: true,
      onClose: () => {},
      store,
      accountId: 'account',
      workspaceId: 'workspace',
      area: { notes: folderNotes, namesInUse: [] },
      folders,
      emptyFolders: [],
      items: [{ kind: 'note', fileId: 'e', path: 'Reading list.md' }],
      onFolderMoved: () => {},
    }),
  );
  assert.equal(
    row('All notes, at the top').getAttribute('aria-selected'),
    'true',
  );
  await act(async () => row('Daily').click());
  await act(async () => button('New folder in Daily').click());
  await type(fieldOf('New folder in Daily').id, 'Books');
  // Enter in the name field names the folder and does not move.
  const input = fieldOf('New folder in Daily');
  input.focus();
  const count = moves.length;
  await press('Enter');
  assert.equal(moves.length, count);
  assert.equal(row('Books').getAttribute('aria-selected'), 'true');
  await act(async () => button('Move').click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.deepEqual(moves.at(-1)?.moves, [
    { fileId: 'e', toPath: 'Daily/Books/Reading list.md' },
  ]);
});

await test('the Templates folder setting chooses its folder in the tree, with no root row', async () => {
  await render(createElement(TemplateSettingsFields));
  await act(async () => button('Change').click());
  assert.ok(container.querySelector('[role="tree"]'));
  assert.ok(!names().includes('All notes'));
  assert.equal(row('Templates').getAttribute('aria-selected'), 'true');
  await act(async () => row('Projects').click());
  await act(async () => button('Done').click());
  assert.deepEqual(templateSaves.at(-1), { folder: 'Projects' });
});

await test('the Daily notes folder setting chooses its folder in the tree', async () => {
  await render(createElement(DailyNoteSettingsFields));
  const change = [...container.querySelectorAll('button')].filter(
    (candidate) => candidate.textContent === 'Change',
  )[0];
  assert.ok(change);
  await act(async () => change.click());
  assert.ok(names().includes('All notes'));
  assert.equal(row('Daily').getAttribute('aria-selected'), 'true');
  await act(async () => button('Open Projects').click());
  await act(async () => row('Research').click());
  assert.equal(row('Research').getAttribute('aria-selected'), 'true');
  await act(async () => button('Done').click());
  assert.equal(dailySaves.at(-1)?.folder, 'Projects/Research');
});

after(async () => {
  await act(async () => root.unmount());
  hooks.deregister();
  for (const name of globals) {
    const original = originals.get(name);
    if (original === undefined) Reflect.deleteProperty(globalThis, name);
    else Object.defineProperty(globalThis, name, original);
  }
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  await store.close();
  await browser.happyDOM.close();
});
