/** Real Trash, router, loader, NoteEditor and CM; controlled service boundary. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { Window } from 'happy-dom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { act, createElement, StrictMode, Suspense } from 'react';
import { createMemoryRouter, RouterProvider, useParams } from 'react-router';
import { openLocalStore } from '@notesapp/storage-browser';
import type { LocalStore } from '@notesapp/sync';

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
  'MutationObserver',
  'ResizeObserver',
  'DOMRect',
  'Range',
  'getComputedStyle',
  'MouseEvent',
  'PointerEvent',
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
let networkCalls = 0;
async function refuseNetwork(): Promise<never> {
  networkCalls += 1;
  throw Error('Unexpected network in Restore focus fixture.');
}
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: refuseNetwork,
});
Object.defineProperty(browser, 'fetch', {
  configurable: true,
  value: refuseNetwork,
});
const matchMediaDescriptor = Object.getOwnPropertyDescriptor(
  browser,
  'matchMedia',
);
const matchMedia = browser.matchMedia.bind(browser);
let coarse = false;
Object.defineProperty(browser, 'matchMedia', {
  configurable: true,
  value(query: string) {
    const result = matchMedia(query);
    if (query === '(hover: none) and (pointer: coarse)')
      Object.defineProperty(result, 'matches', { value: coarse });
    return result;
  },
});
const fixtureUrl = new URL(
  './support/trash-restore-focus-fixture.ts',
  import.meta.url,
).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (
      context.parentURL?.includes('/apps/web/dist/') &&
      (specifier === '@notesapp/api-client' ||
        /^(\.\.\/)+app\.js$/.test(specifier))
    )
      return { url: fixtureUrl, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.css'))
      return { format: 'module', source: '', shortCircuit: true };
    return next(url, context);
  },
});
const fixture = await import('./support/trash-restore-focus-fixture.ts');
const { createRoot } = await import('react-dom/client');
const { EditorView } = await import('@codemirror/view');
const { TrashView } =
  await import('../../apps/web/dist/features/trash/trash-page.js');
const { NoteEditorLoader } =
  await import('../../apps/web/dist/features/editor/note-loader.js');
const { NoteEditor } =
  await import('../../apps/web/dist/features/editor/note-editor.js');
const { NoteSaveScope } =
  await import('../../apps/web/dist/features/editor/save-status.js');
const { HeaderSlotProvider, HeaderLeafSlot } =
  await import('../../apps/web/dist/shell/header-slot.js');
const text = 'Synthetic restored bytes.\n';
const notePath = 'Owned restored note.md';
class InheritedFocus {
  get focusNoteText() {
    return true;
  }
}
class InheritedNameIntent {
  readonly focusNoteText = true;
  get selectNoteName() {
    return false;
  }
}
const cases: readonly {
  readonly name: string;
  readonly restore?: 'inline' | 'menu' | 'failure';
  readonly coarse?: boolean;
  readonly state?: unknown;
  readonly direct?: boolean;
  readonly focus: boolean;
  readonly selectName: boolean;
}[] = [
  { name: 'inline Restore', restore: 'inline', focus: true, selectName: false },
  { name: 'menu Restore', restore: 'menu', focus: true, selectName: false },
  {
    name: 'coarse Restore',
    restore: 'inline',
    coarse: true,
    focus: false,
    selectName: false,
  },
  {
    name: 'failed Restore',
    restore: 'failure',
    focus: false,
    selectName: false,
  },
  { name: 'ordinary navigation', focus: false, selectName: false },
  {
    name: 'new-note navigation',
    state: { focusNoteText: true },
    focus: true,
    selectName: true,
  },
  {
    name: 'restored navigation',
    state: { focusNoteText: true, selectNoteName: false },
    focus: true,
    selectName: false,
  },
  {
    name: 'name intent alone',
    state: { selectNoteName: true },
    focus: false,
    selectName: false,
  },
  {
    name: 'non-boolean focus intent',
    state: { focusNoteText: 'true' },
    focus: false,
    selectName: false,
  },
  {
    name: 'inherited focus intent',
    state: new InheritedFocus(),
    focus: false,
    selectName: false,
  },
  {
    name: 'inherited name intent',
    state: new InheritedNameIntent(),
    focus: true,
    selectName: true,
  },
  {
    name: 'non-boolean name intent',
    state: { focusNoteText: true, selectNoteName: 'false' },
    focus: true,
    selectName: true,
  },
  {
    name: 'direct NoteEditor default',
    direct: true,
    focus: true,
    selectName: true,
  },
];

/** Observe actual async store/render conditions without a fixed delay. */
async function until(check: () => boolean) {
  const deadline = Date.now() + 10_000;
  while (!check()) {
    assert.ok(Date.now() < deadline, 'Restore fixture condition timed out');
    await act(async () => {
      await setImmediate();
    });
  }
}

await test('Trash Restore retains the note and sends separate focus intents', async (t) => {
  const container = document.createElement('div');
  document.body.append(container);
  try {
    for (const mode of cases) {
      await t.test(mode.name, async () => {
        coarse = mode.coarse ?? false;
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
        const fileId = crypto.randomUUID();
        await store.checkpoint(
          {
            accountId: fixture.accountId,
            workspaceId: fixture.workspaceId,
            fileId,
            workingCopyId: crypto.randomUUID(),
            baseRevisionId: null,
            path: notePath,
            text,
            sequence: 1,
            deleted: false,
          },
          null,
          'text',
        );
        // The remote tombstone can precede this device's invalidation. The
        // cached body stays real; only the generated server reply is held.
        fixture.reset(store, fileId, notePath);
        const base = `/w/${fixture.workspaceId}`;
        function Note() {
          const params = useParams();
          assert.ok(params.fileId);
          if (mode.direct)
            return createElement(NoteEditor, {
              store,
              accountId: fixture.accountId,
              workspaceId: fixture.workspaceId,
              fileId: params.fileId,
              baseRevisionId: null,
              initialText: text,
              initialPath: notePath,
              focusText: true,
            });
          return createElement(NoteEditorLoader, {
            store,
            accountId: fixture.accountId,
            workspaceId: fixture.workspaceId,
            fileId: params.fileId,
          });
        }
        const router = createMemoryRouter(
          [
            {
              path: '/w/:workspaceId/trash',
              element: createElement(TrashView),
            },
            {
              path: '/w/:workspaceId/notes/:fileId',
              element: createElement(Note),
            },
          ],
          {
            initialEntries: [
              {
                pathname: mode.restore
                  ? base + '/trash'
                  : base + '/notes/' + fileId,
                state: mode.state,
              },
            ],
          },
        );
        const root = createRoot(container);
        const previousTitle = 'Previous route - tidy notebook';
        document.title = previousTitle;
        const button = (label: string) => {
          const found = [...container.querySelectorAll('button')].find(
            (e) => e.getAttribute('aria-label') === label,
          );
          assert.ok(found, label);
          return found;
        };
        try {
          await act(async () => {
            root.render(
              createElement(
                StrictMode,
                null,
                createElement(
                  NoteSaveScope,
                  null,
                  createElement(
                    HeaderSlotProvider,
                    null,
                    createElement(HeaderLeafSlot),
                    createElement(
                      Suspense,
                      { fallback: null },
                      createElement(RouterProvider, { router }),
                    ),
                  ),
                ),
              ),
            );
          });
          if (mode.restore) {
            await until(
              () =>
                container.textContent?.includes('Owned restored note') === true,
            );
            await act(async () => {
              if (mode.restore === 'menu')
                button('Actions for Owned restored note').click();
              else button('Restore Owned restored note').click();
            });
            if (mode.restore === 'menu') {
              const restore = [
                ...document.querySelectorAll('[role=menuitem]'),
              ].find((e) => e.textContent === 'Restore');
              assert.ok(restore instanceof HTMLElement);
              await act(async () => restore.click());
            }
            await until(() => fixture.restores.length === 1);
            assert.equal(router.state.location.pathname, base + '/trash');
            assert.equal(container.querySelectorAll('.cm-editor').length, 0);
            assert.equal(button('Restore Owned restored note').disabled, true);
            assert.equal(fixture.syncs.length, 0);
            const request = fixture.restores[0];
            assert.ok(request);
            assert.equal(request.workspaceId, fixture.workspaceId);
            assert.equal(request.fileId, fileId);
            assert.equal(request.deviceId, store.deviceId);
            if (mode.restore === 'failure') {
              await act(async () =>
                request.reply.resolve({ error: {}, response: { status: 503 } }),
              );
              await until(
                () => container.querySelector('[role=alert]') !== null,
              );
              assert.equal(
                button('Restore Owned restored note').disabled,
                false,
              );
              assert.equal(router.state.location.pathname, base + '/trash');
              assert.equal(document.title, 'Trash - tidy notebook');
              assert.equal(container.querySelectorAll('.cm-editor').length, 0);
              assert.equal(fixture.syncs.length, 0);
              return;
            }
            await act(async () =>
              request.reply.resolve({ data: { revision: { path: notePath } } }),
            );
          }
          await until(() => container.querySelector('.cm-editor') !== null);
          assert.equal(
            router.state.location.pathname,
            base + '/notes/' + fileId,
          );
          assert.equal(
            document.title,
            mode.direct ? previousTitle : 'Owned restored note - tidy notebook',
          );
          assert.equal(container.querySelectorAll('.cm-editor').length, 1);
          const editor = container.querySelector('.cm-editor');
          assert.ok(editor instanceof HTMLElement);
          const view = EditorView.findFromDOM(editor);
          assert.ok(view);
          assert.equal(view.state.doc.toString(), text);
          assert.equal(fixture.syncs.length, mode.restore ? 1 : 0);
          const cached = await store.readCachedNote(
            fixture.accountId,
            fixture.workspaceId,
            fileId,
          );
          assert.ok(cached);
          assert.equal(cached.path, notePath);
          assert.equal(cached.text, text);
          assert.equal(view.hasFocus, mode.focus);
          if (mode.restore)
            assert.deepEqual(router.state.location.state, {
              focusNoteText: true,
              selectNoteName: false,
            });
          const name = container.querySelector('input[aria-label="Note name"]');
          assert.ok(name instanceof HTMLInputElement);
          await act(async () => name.focus());
          const { selectionStart, selectionEnd } = name;
          assert.ok(selectionStart !== null && selectionEnd !== null);
          assert.equal(
            selectionEnd - selectionStart === name.value.length,
            mode.selectName,
          );
          assert.equal(EditorView.findFromDOM(editor), view);
          if (mode.restore) {
            await act(async () => {
              void router.navigate(-1);
            });
            await until(
              () => router.state.location.pathname === base + '/trash',
            );
            assert.equal(container.querySelectorAll('.cm-editor').length, 0);
            assert.equal(document.title, 'Trash - tidy notebook');
          }
        } finally {
          await act(async () => root.unmount());
          router.dispose();
          do {
            await Promise.allSettled([...pending]);
            await setImmediate();
          } while (pending.size > 0);
          await local.close();
        }
      });
    }
  } finally {
    container.remove();
    hooks.deregister();
    if (matchMediaDescriptor)
      Object.defineProperty(browser, 'matchMedia', matchMediaDescriptor);
    else Reflect.deleteProperty(browser, 'matchMedia');
    if (browserFetch) Object.defineProperty(browser, 'fetch', browserFetch);
    else Reflect.deleteProperty(browser, 'fetch');
    for (const [name, original] of originals) {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
      assert.deepEqual(
        Object.getOwnPropertyDescriptor(globalThis, name),
        original,
      );
    }
    await browser.happyDOM.close();
    assert.equal(networkCalls, 0);
    assert.deepEqual(fixture.unexpected, []);
  }
});
