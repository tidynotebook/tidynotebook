/** Real Shell creation hook, NewFolderDialog, NoteTree and measured row window.
 * Node boxes and RAF are controlled geometry, not browser paint evidence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { Window } from 'happy-dom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { openLocalStore } from '@notesapp/storage-browser';
import type { LocalStore } from '@notesapp/sync';
import type { ReactNode } from 'react';
import {
  act,
  createElement,
  StrictMode,
  Suspense,
  useMemo,
  useState,
} from 'react';
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
  useParams,
} from 'react-router';
import type { NoteSummary } from '../../apps/web/src/lib/note-list.ts';
import type { SidebarView } from '../../apps/web/src/lib/sidebar-view.ts';

const browser = new Window({ url: 'http://localhost/' });
browser.document.write('<!doctype html><html><body></body></html>');
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'Element',
  'Node',
  'Text',
  'Range',
  'MutationObserver',
  'ResizeObserver',
  'DOMRect',
  'getComputedStyle',
  'KeyboardEvent',
  'Event',
  'localStorage',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'fetch',
  'IS_REACT_ACT_ENVIRONMENT',
] as const) {
  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  if (name === 'fetch' || name === 'IS_REACT_ACT_ENVIRONMENT') continue;
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
const browserFetch = Object.getOwnPropertyDescriptor(browser, 'fetch');
async function refuseNetwork(): Promise<never> {
  refused.push('Unexpected network');
  throw Error('Unexpected folder fixture network');
}
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: refuseNetwork,
});
Object.defineProperty(browser, 'fetch', {
  configurable: true,
  value: refuseNetwork,
});
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
Object.defineProperty(globalThis, 'requestAnimationFrame', {
  configurable: true,
  value: (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  },
});
Object.defineProperty(globalThis, 'cancelAnimationFrame', {
  configurable: true,
  value: (id: number) => frames.delete(id),
});
const fixtureUrl = new URL(
  './support/created-folder-fixture.ts',
  import.meta.url,
).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const parent = context.parentURL ?? '';
    if (parent.includes('/apps/web/dist/')) {
      if (
        /^(\.\.\/)+app\.js$/.test(specifier) ||
        specifier === '@notesapp/api-client'
      )
        return { url: fixtureUrl, shortCircuit: true };
      if (parent.endsWith('/tree.js') && specifier === './files.js')
        return { url: fixtureUrl, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.css'))
      return { format: 'module', source: '', shortCircuit: true };
    const result = next(url, context);
    if (
      url.endsWith('/apps/web/dist/shell/shell.js') ||
      url.endsWith('/apps/web/dist/shell/files.js')
    )
      return {
        ...result,
        source:
          (typeof result.source === 'string'
            ? result.source
            : new TextDecoder().decode(result.source ?? undefined)) +
          (url.endsWith('/shell.js')
            ? '\nexport { useFolderCreation };'
            : '\nexport { useEmptyFolders };'),
      };
    return result;
  },
});
const { Files, setAccount, refused, useSession, setStore } =
  await import('./support/created-folder-fixture.ts');
const { createRoot } = await import('react-dom/client');
const { useFolderCreation } =
  await import('../../apps/web/dist/shell/shell.js');
const { useEmptyFolders, useOpenFolders } =
  await import('../../apps/web/dist/shell/files.js');
const { NoteEditorLoader } =
  await import('../../apps/web/dist/features/editor/note-loader.js');
const { EditorView } = await import('@codemirror/view');
const { HeaderSlotProvider } =
  await import('../../apps/web/dist/shell/header-slot.js');
const { NoteSaveScope } =
  await import('../../apps/web/dist/features/editor/save-status.js');
const { NoteTree } = await import('../../apps/web/dist/shell/tree.js');
const { useTreeDrag } = await import('../../apps/web/dist/shell/tree-drag.js');
const { createFolderReveal } =
  await import('../../apps/web/dist/features/folders/created-folder-reveal.js');
const { NewFolderDialog } =
  await import('../../apps/web/dist/features/folders/folder-dialogs.js');
const { buildNoteTree } = await import('../../apps/web/dist/lib/note-list.js');
const { visibleTreeRows, folderRowKey } =
  await import('../../apps/web/dist/lib/tree-rows.js');

const notes: readonly NoteSummary[] = Array.from(
  { length: 80 },
  (_, index) => ({
    fileId: `note-${index}`,
    path: `Note ${String(index).padStart(2, '0')}.md`,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    localOnly: false,
    unsent: false,
  }),
);
let heights = new Map<string, number>();
let rowKeys: readonly string[] = [];
let height = 180;
let width = 256;
let scroll = 0;
const writes: number[] = [];
let box: HTMLDivElement | null = null;
const rectangleDescriptor = Object.getOwnPropertyDescriptor(
  browser.HTMLElement.prototype,
  'getBoundingClientRect',
);
function offset(index: number): number {
  return rowKeys
    .slice(0, index)
    .reduce((sum, key) => sum + (heights.get(key) ?? 28), 0);
}
Object.defineProperty(browser.HTMLElement.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: function (this: HTMLElement) {
    if (this === box) return new browser.DOMRect(0, 0, 256, height);
    if (this.getAttribute('role') === 'tree')
      return new browser.DOMRect(0, -scroll, width, offset(rowKeys.length));
    const row = this.closest<HTMLElement>('[data-row-key]');
    if (row) {
      const key = row.dataset.rowKey ?? '';
      const index = rowKeys.indexOf(key);
      if (index >= 0)
        return new browser.DOMRect(
          0,
          offset(index) - scroll,
          256,
          heights.get(key) ?? 28,
        );
    }
    return new browser.DOMRect();
  },
});
function attach(element: HTMLDivElement | null): void {
  box = element;
  if (!element) return;
  element.style.overflowY = 'auto';
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => height,
  });
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scroll,
    set: (value: number) => {
      scroll = Math.max(
        0,
        Math.min(value, Math.max(0, offset(rowKeys.length) - height)),
      );
      writes.push(scroll);
      element.dispatchEvent(new Event('scroll'));
    },
  });
}
type Control = ReturnType<typeof useFolderCreation>;
let control: Control | null = null;
let selected = '';
let expanded: ReadonlySet<string> = new Set();
let showTree = true;
let delayed = false;
let hidden = false;
let view: SidebarView = 'notes';
let editorNode: ReactNode = null;
let refresh: (() => void) | null = null;
function Harness() {
  const [, setRefresh] = useState(0);
  refresh = () => setRefresh((value) => value + 1);
  const location = useLocation();
  const { workspaceId = 'workspace', fileId = 'note-65' } = useParams();
  const session = useSession();
  const empty = useEmptyFolders(
    workspaceId,
    notes.map((note) => note.path),
  );
  const folders = useOpenFolders(workspaceId);
  const [selectedFolder, setSelected] = useState('');
  const [dialog, setDialog] = useState(false);
  const owner = useMemo(
    () => ({
      accountId: session.account?.accountId ?? null,
      workspaceId,
      routeKey: location.key,
      view,
    }),
    [session.account?.accountId, workspaceId, location.key],
  );
  // View is a controlled caller input; the memo must follow it as Shell does.
  const scopedOwner = useMemo(() => ({ ...owner, view }), [owner, view]);
  const creation = useFolderCreation(
    scopedOwner,
    empty.addEmptyFolder,
    folders.openFolder,
    setSelected,
  );
  control = creation;
  selected = selectedFolder;
  expanded = folders.openFolders;
  const shown = delayed ? [] : empty.emptyFolders;
  const nodes = useMemo(
    () => buildNoteTree(notes, shown, 'name-ascending'),
    [shown],
  );
  rowKeys = visibleTreeRows(nodes, folders.openFolders).map((row) => row.key);
  const value = {
    notes,
    namesInUse: notes,
    loading: false,
    folders: shown,
    ...empty,
    emptyFolders: shown,
    limitNotice: null,
    reload: () => {},
  };
  const drag = useTreeDrag({
    store: null,
    accountId: session.account?.accountId ?? null,
    workspaceId,
    area: value,
    emptyFolders: shown,
    moveEmptyFolders: empty.moveEmptyFolders,
    openFolder: folders.openFolder,
  });
  return createElement(
    Files,
    { value },
    createElement(
      'button',
      { id: 'opener', onClick: () => setDialog(true) },
      'New folder',
    ),
    editorNode ??
      createElement('textarea', {
        id: 'draft',
        defaultValue: 'Synthetic unsaved draft',
      }),
    showTree
      ? createElement(
          'div',
          { ref: attach },
          createElement(
            'div',
            { hidden },
            createElement(NoteTree, {
              workspaceId,
              nodes,
              knownFolders: shown,
              activeFileId: fileId,
              selectedFolder,
              folderReveal: creation,
              folders,
              drag,
              onSelectFolder: setSelected,
              onNavigate: () => {},
              onNewNoteIn: () => {},
              onNewFolderIn: () => setDialog(true),
              onPublish: () => {},
              onMove: () => {},
            }),
          ),
        )
      : null,
    createElement(NewFolderDialog, {
      open: dialog,
      parent: '',
      folders: shown,
      onClose: () => setDialog(false),
      onCreated: creation.onCreated,
    }),
  );
}
const container = document.createElement('div');
document.body.append(container);
container.style.visibility = 'visible';
let root = createRoot(container);
let router = createMemoryRouter(
  [{ path: '/w/:workspaceId/f/:fileId', Component: Harness }],
  { initialEntries: ['/w/workspace/f/note-65'] },
);
async function settle(): Promise<void> {
  for (let pass = 0; pass < 30; pass++) {
    await act(async () => {
      const ready = [...frames];
      frames.clear();
      for (const [, callback] of ready) callback(performance.now());
      await setImmediate();
    });
    if (frames.size === 0) return;
  }
  assert.fail('The controlled tree did not settle in 30 observed frame turns.');
}
async function render(): Promise<void> {
  await act(async () => {
    refresh?.();
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(
          HeaderSlotProvider,
          null,
          createElement(
            NoteSaveScope,
            null,
            createElement(RouterProvider, { router }),
          ),
        ),
      ),
    );
  });
  await settle();
}
async function start(): Promise<void> {
  await act(async () => root.unmount());
  root = createRoot(container);
  editorNode = null;
  setStore(null);
  refresh = null;
  frames.clear();
  browser.localStorage.clear();
  heights = new Map();
  rowKeys = [];
  height = 180;
  width = 256;
  scroll = 0;
  writes.length = 0;
  showTree = true;
  delayed = false;
  hidden = false;
  view = 'notes';
  setAccount('folder-account');
  router = createMemoryRouter(
    [{ path: '/w/:workspaceId/f/:fileId', Component: Harness }],
    { initialEntries: ['/w/workspace/f/note-65'] },
  );
  await render();
  writes.length = 0;
}
function current(): Control {
  assert.ok(control);
  return control;
}
async function create(path: string): Promise<void> {
  await act(async () => current().onCreated(path, createFolderReveal));
  await settle();
}
async function pan(value: number): Promise<void> {
  assert.ok(box);
  const target = box;
  await act(async () => {
    target.scrollTop = value;
  });
  await settle();
  writes.length = 0;
}
function folder(path: string): HTMLElement | null {
  return (
    [...container.querySelectorAll<HTMLElement>('[data-row-key]')].find(
      (row) => row.dataset.rowKey === folderRowKey(path),
    ) ?? null
  );
}
function fullyVisible(path: string): void {
  const row = folder(path);
  assert.ok(row, `Folder ${path} must render`);
  const rect = row.getBoundingClientRect();
  assert.ok(
    rect.top >= 0 && rect.bottom <= height,
    JSON.stringify({ top: rect.top, bottom: rect.bottom, height, scroll }),
  );
}
async function rerender(): Promise<void> {
  await render();
}

await test('real dialog closes, stores and reveals an offscreen root folder without draft/focus/navigation changes', async () => {
  await start();
  await pan(1800);
  const draft = container.querySelector<HTMLTextAreaElement>('#draft');
  assert.ok(draft);
  draft.setSelectionRange(3, 7);
  const originalRoute = router.state.location;
  const opener = container.querySelector<HTMLButtonElement>('#opener');
  assert.ok(opener);
  await act(async () => {
    opener.focus();
    opener.click();
  });
  const input = document.querySelector<HTMLInputElement>('#new-folder-name');
  assert.ok(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set?.call(input, '000 Owned root');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const form = input.closest('form');
  assert.ok(form);
  await act(async () =>
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    ),
  );
  await settle();
  assert.ok(
    !document.querySelector('[role="dialog"]'),
    'Creation closes the real dialog',
  );
  fullyVisible('000 Owned root');
  assert.equal(current().request, null);
  assert.equal(selected, '000 Owned root');
  assert.ok(expanded.has('000 Owned root'));
  assert.deepEqual(
    JSON.parse(
      browser.localStorage.getItem('notesapp.empty-folders:workspace') ??
        'null',
    ),
    ['000 Owned root'],
  );
  assert.ok(container.querySelector('#draft') === draft);
  assert.equal(draft.value, 'Synthetic unsaved draft');
  assert.equal(draft.selectionStart, 3);
  assert.equal(draft.selectionEnd, 7);
  assert.equal(router.state.location, originalRoute);
  assert.ok(
    document.activeElement === opener,
    'Dialog returns focus to its opener',
  );
  assert.ok(writes.length <= 2);
});
await test('already visible creation consumes without scroll', async () => {
  await start();
  await pan(0);
  await create('000 Visible');
  fullyVisible('000 Visible');
  assert.equal(writes.length, 0);
  assert.equal(current().request, null);
});
await test('nested creation opens ancestors and reveals the inserted child', async () => {
  await start();
  await pan(1800);
  await create('000 Parent/Child');
  fullyVisible('000 Parent/Child');
  assert.ok(expanded.has('000 Parent'));
  assert.ok(expanded.has('000 Parent/Child'));
  assert.ok(writes.length <= 2);
});
await test('wrapped measured row fits with at most two owned scroll writes', async () => {
  await start();
  heights.set(folderRowKey('Middle wrapped'), 100);
  await pan(1800);
  await create('Middle wrapped');
  fullyVisible('Middle wrapped');
  assert.ok(writes.length <= 2, JSON.stringify(writes));
});
await test('a row taller than the viewport aligns its leading edge', async () => {
  await start();
  heights.set(folderRowKey('Middle tall'), 400);
  await pan(1800);
  await create('Middle tall');
  assert.equal(folder('Middle tall')?.getBoundingClientRect().top, 0);
  assert.ok(writes.length <= 2, JSON.stringify(writes));
});
await test('waits for insertion and consumes only after the real row arrives', async () => {
  await start();
  delayed = true;
  await rerender();
  await pan(1800);
  await create('000 Delayed');
  assert.ok(current().request);
  assert.equal(writes.length, 0);
  delayed = false;
  await rerender();
  fullyVisible('000 Delayed');
  assert.equal(current().request, null);
});
for (const name of ['wheel', 'pointerdown', 'touchstart', 'keydown'] as const)
  await test(`manual ${name} before request commit cancels the synchronous latest request`, async () => {
    await start();
    await pan(1800);
    assert.ok(box);
    const target = box;
    await act(async () => {
      current().onCreated('000 Cancel', createFolderReveal);
      target.dispatchEvent(
        name === 'keydown'
          ? new KeyboardEvent(name, { key: 'PageDown', bubbles: true })
          : new Event(name, { bubbles: true }),
      );
    });
    await settle();
    assert.equal(current().request, null);
    assert.equal(writes.length, 0);
  });
await test('automatic scroll does not cancel a delayed creation', async () => {
  await start();
  delayed = true;
  await rerender();
  await pan(1800);
  await create('000 Automatic');
  assert.ok(box);
  await act(async () => box?.dispatchEvent(new Event('scroll')));
  assert.ok(current().request);
  delayed = false;
  await rerender();
  fullyVisible('000 Automatic');
});
await test('newer request survives an older completion', async () => {
  await start();
  delayed = true;
  await rerender();
  await create('000 First');
  const old = current().request;
  assert.ok(old);
  await create('000 Second');
  const next = current().request;
  assert.ok(next);
  await act(async () => current().finish(old));
  assert.equal(current().request, next);
  delayed = false;
  await rerender();
  fullyVisible('000 Second');
  assert.equal(current().request, null);
});
await test('real tree removal cancels and detached listeners cannot cancel a newer request', async () => {
  await start();
  delayed = true;
  await rerender();
  await create('000 Removed');
  const previousBox = box;
  assert.ok(previousBox);
  showTree = false;
  await rerender();
  assert.equal(current().request, null);
  await create('000 New');
  const next = current().request;
  assert.ok(next);
  await act(async () => previousBox.dispatchEvent(new Event('wheel')));
  assert.equal(current().request, next);
  showTree = true;
  delayed = false;
  await rerender();
  fullyVisible('000 New');
});
for (const change of [
  'account',
  'workspace',
  'route',
  'view',
  'signed out',
] as const)
  await test(`owner change ${change} cancels pending creation`, async () => {
    await start();
    delayed = true;
    await rerender();
    await create('000 Stale');
    if (change === 'account') setAccount('other');
    else if (change === 'signed out') setAccount(null);
    else if (change === 'view') view = 'calendar';
    if (change === 'workspace' || change === 'route')
      await act(async () =>
        router.navigate(
          change === 'workspace'
            ? '/w/other/f/note-65'
            : '/w/workspace/f/note-66',
        ),
      );
    else await rerender();
    await settle();
    assert.equal(current().request, null);
    delayed = false;
    await rerender();
    assert.equal(current().request, null);
  });
await test('equal account object and viewport refresh retain intent, later manual pan does not rebound', async () => {
  await start();
  delayed = true;
  await rerender();
  await pan(1800);
  await create('000 Kept');
  height = 200;
  await rerender();
  assert.ok(current().request);
  delayed = false;
  await rerender();
  fullyVisible('000 Kept');
  await pan(1800);
  await rerender();
  assert.equal(scroll, 1800);
  assert.equal(writes.length, 0);
});
await test('Strict Mode initial tree mount honors creation before the unchanged active note reveal', async () => {
  await start();
  showTree = false;
  await rerender();
  await create('000 Strict');
  assert.ok(current().request);
  showTree = true;
  await rerender();
  fullyVisible('000 Strict');
  assert.equal(current().request, null);
  assert.ok(writes.length <= 2);
  await pan(1800);
  await act(async () => router.navigate('/w/workspace/f/note-0'));
  await settle();
  const active = container.querySelector<HTMLElement>(
    '[data-row-key="note:note-0"]',
  );
  assert.ok(active);
  const rect = active.getBoundingClientRect();
  assert.ok(
    rect.top >= 0 && rect.bottom <= height,
    'Later actual navigation still reveals its active note',
  );
});

await test('manual intent after the initial estimate cancels its measured correction', async () => {
  await start();
  heights.set(folderRowKey('Middle cancelled'), 400);
  await pan(1800);
  await act(async () =>
    current().onCreated('Middle cancelled', createFolderReveal),
  );
  assert.ok(box);
  const target = box;
  await act(async () =>
    target.dispatchEvent(new Event('pointerdown', { bubbles: true })),
  );
  const atCancel = scroll;
  await settle();
  assert.equal(current().request, null);
  assert.equal(scroll, atCancel);
});
await test('a zero-height viewport before the measured frame keeps the reveal pending', async () => {
  await start();
  await pan(10);
  await act(async () =>
    current().onCreated('000 Collapsed frame', createFolderReveal),
  );
  assert.ok(folder('000 Collapsed frame'));
  assert.ok(current().request);
  height = 0;
  await settle();
  assert.ok(current().request, 'A collapsed viewport cannot finish the reveal');
  height = 180;
  await rerender();
  fullyVisible('000 Collapsed frame');
  assert.equal(current().request, null);
});
await test('a zero-width list before the measured frame keeps the reveal pending', async () => {
  await start();
  await pan(10);
  await act(async () =>
    current().onCreated('000 Collapsed width', createFolderReveal),
  );
  assert.ok(folder('000 Collapsed width'));
  assert.ok(current().request);
  width = 0;
  await settle();
  assert.ok(current().request, 'A collapsed list cannot finish the reveal');
  width = 256;
  await rerender();
  fullyVisible('000 Collapsed width');
  assert.equal(current().request, null);
});
await test('hidden tree waits for normal visibility without forcing a drawer open', async () => {
  await start();
  assert.ok(box);
  const target = box;
  target.style.visibility = 'hidden';
  await pan(1800);
  await create('000 Hidden');
  assert.ok(current().request);
  assert.equal(writes.length, 0);
  target.style.visibility = 'visible';
  await rerender();
  fullyVisible('000 Hidden');
  assert.equal(current().request, null);
});
await test('rapid creations reveal only the latest identity and never focus a row', async () => {
  await start();
  await pan(1800);
  const opener = container.querySelector<HTMLButtonElement>('#opener');
  assert.ok(opener);
  opener.focus();
  await act(async () => {
    current().onCreated('000 Older', createFolderReveal);
    current().onCreated('Middle Latest', createFolderReveal);
  });
  await settle();
  fullyVisible('Middle Latest');
  assert.equal(selected, 'Middle Latest');
  assert.equal(current().request, null);
  assert.ok(document.activeElement === opener);
  assert.ok(writes.length <= 2);
});
await test('a disconnected measurement callback is harmless after real tree removal', async () => {
  await start();
  await pan(1800);
  await act(async () =>
    current().onCreated('000 Departed', createFolderReveal),
  );
  const callbacks = [...frames.values()];
  showTree = false;
  await rerender();
  const atRemoval = scroll;
  await act(async () => {
    for (const callback of callbacks) callback(performance.now());
  });
  await settle();
  assert.equal(current().request, null);
  assert.equal(scroll, atRemoval);
});

await test('creation retains the actual cached loader editor view, source, selection, title and focus', async () => {
  await start();
  const local = await openLocalStore('http://localhost', {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    databaseName: crypto.randomUUID(),
  });
  const pending = new Set<Promise<unknown>>();
  const store: LocalStore = new Proxy(local, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]): unknown => {
        const result: unknown = Reflect.apply(value, target, args);
        if (result instanceof Promise) {
          pending.add(result);
          void result.then(
            () => pending.delete(result),
            () => pending.delete(result),
          );
        }
        return result;
      };
    },
  });
  const text = 'Synthetic cached editor content.\n';
  await store.checkpoint(
    {
      accountId: 'folder-account',
      workspaceId: 'workspace',
      fileId: 'note-65',
      workingCopyId: crypto.randomUUID(),
      baseRevisionId: null,
      path: 'Note 65.md',
      text,
      sequence: 1,
      deleted: false,
    },
    null,
    'text',
  );
  setStore(store);
  editorNode = createElement(
    Suspense,
    { fallback: createElement('p', null, 'Reading cached note') },
    createElement(NoteEditorLoader, {
      store,
      accountId: 'folder-account',
      workspaceId: 'workspace',
      fileId: 'note-65',
    }),
  );
  try {
    await rerender();
    for (
      let attempt = 0;
      !container.querySelector('.cm-editor') && attempt < 100;
      attempt++
    )
      await settle();
    const dom = container.querySelector<HTMLElement>('.cm-editor');
    assert.ok(dom, 'Actual cached editor must be ready');
    const cm = EditorView.findFromDOM(dom);
    assert.ok(cm);
    await act(async () => {
      cm.dispatch({ selection: { anchor: 2, head: 8 } });
      cm.focus();
    });
    const selection = cm.state.selection;
    const title = document.title;
    const route = router.state.location;
    await pan(1800);
    await create('000 CM retained');
    fullyVisible('000 CM retained');
    assert.ok(EditorView.findFromDOM(dom) === cm);
    assert.equal(container.querySelectorAll('.cm-editor').length, 1);
    assert.equal(cm.state.doc.toString(), text);
    assert.ok(cm.state.selection.eq(selection));
    assert.ok(cm.hasFocus);
    assert.equal(document.title, title);
    assert.equal(router.state.location, route);
  } finally {
    await act(async () => root.unmount());
    await setImmediate();
    setStore(null);
    editorNode = null;
    while (pending.size > 0) await Promise.allSettled([...pending]);
    await local.close();
    root = createRoot(container);
  }
});

test.after(async () => {
  await act(async () => root.unmount());
  assert.equal(frames.size, 0);
  hooks.deregister();
  if (rectangleDescriptor)
    Object.defineProperty(
      browser.HTMLElement.prototype,
      'getBoundingClientRect',
      rectangleDescriptor,
    );
  else
    Reflect.deleteProperty(
      browser.HTMLElement.prototype,
      'getBoundingClientRect',
    );
  if (browserFetch) Object.defineProperty(browser, 'fetch', browserFetch);
  else Reflect.deleteProperty(browser, 'fetch');
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(globalThis, name),
      descriptor,
    );
  }
  await browser.happyDOM.close();
  assert.deepEqual(refused, []);
});
