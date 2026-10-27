import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';
import { act, createElement } from 'react';
import { Window } from 'happy-dom';
import { setDirectNote } from './support/notes-folder-fixture.ts';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MemoryRouter,
  Routes,
  Route,
  createMemoryRouter,
  RouterProvider,
} from 'react-router';

const fixture = new URL('./support/notes-folder-fixture.ts', import.meta.url)
  .href;
const boundaries = new Set([
  '../../app.js',
  '../../shell/files.js',
  '../../shell/now.js',
  '../../shell/document-title.js',
  './writing-start.js',
  '../templates/new-from-template.js',
  './new-note.js',
  '../folders/folder-page-actions.js',
]);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (
      context.parentURL?.endsWith('/features/notes/notes-home.js') &&
      boundaries.has(specifier)
    )
      return { url: fixture, shortCircuit: true };
    return next(specifier, context);
  },
});
const { NotesHomeView } =
  await import('../../apps/web/dist/features/notes/notes-home.js');

after(() => hooks.deregister());

await test('a folder with only subfolders keeps its creation actions', () => {
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: ['/w/work/folders/Projects'],
      },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/w/:workspaceId/folders/*',
          element: createElement(NotesHomeView),
        }),
      ),
    ),
  );
  assert.match(html, /Archive/);
  assert.match(html, /New note/);
  assert.match(html, /Use template/);
  assert.match(html, /Folder actions/);
});

await test('folder counts use the singular label', () => {
  setDirectNote(true);
  try {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        {
          initialEntries: ['/w/work/folders/Projects'],
        },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/w/:workspaceId/folders/*',
            element: createElement(NotesHomeView),
          }),
        ),
      ),
    );
    assert.match(html, /1 folder, 1 note/);
  } finally {
    setDirectNote(false);
  }
});

await test('root and folder routes restore separate offsets and reset new destinations', async () => {
  const browser = new Window({ url: 'http://localhost/' });
  const names = [
    'window',
    'document',
    'HTMLElement',
    'Element',
    'Node',
    'MutationObserver',
    'ResizeObserver',
    'Event',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ] as const;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const name of names) {
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
  originals.set(
    'IS_REACT_ACT_ENVIRONMENT',
    Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'),
  );
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  const { createRoot } = await import('react-dom/client');
  const box = document.createElement('div');
  box.style.overflowY = 'auto';
  document.body.append(box);
  const root = createRoot(box);
  const router = createMemoryRouter(
    [
      { path: '/w/:workspaceId', element: createElement(NotesHomeView) },
      {
        path: '/w/:workspaceId/folders/*',
        element: createElement(NotesHomeView),
      },
    ],
    { initialEntries: ['/w/scroll/folders/Projects'] },
  );
  /** Navigate the mounted router to a path. */
  const open = async (path: string): Promise<void> => {
    await act(async () => {
      await router.navigate(path);
    });
  };
  /** Scroll the notes list to an offset and notify its listener. */
  const scroll = async (offset: number): Promise<void> => {
    await act(async () => {
      box.scrollTop = offset;
      box.dispatchEvent(new Event('scroll'));
    });
  };
  try {
    await act(async () =>
      root.render(createElement(RouterProvider, { router })),
    );
    await scroll(64);
    await open('/w/scroll/folders/Projects/Archive');
    assert.equal(box.scrollTop, 0);
    await scroll(24);
    await open('/w/scroll/folders/Projects');
    assert.equal(box.scrollTop, 64);
    await open('/w/scroll');
    assert.equal(box.scrollTop, 0);
    await scroll(120);
    await open('/w/scroll/folders/Projects/Archive');
    assert.equal(box.scrollTop, 24);
    await open('/w/another/folders/Projects');
    assert.equal(box.scrollTop, 0);
  } finally {
    await act(async () => root.unmount());
    router.dispose();
    for (const [name, original] of originals) {
      if (original === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, original);
    }
    await browser.happyDOM.close();
  }
});
