import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';
import { act, createElement } from 'react';
import { Window } from 'happy-dom';
import { createMemoryRouter, RouterProvider } from 'react-router';
import {
  resetFolderOperation,
  finishFolderOperation,
  finishInitialFolderLoad,
  started,
  effects,
} from './support/folder-operation-fixture.ts';

const browser = new Window({ url: 'http://localhost/' });
browser.document.write(
  '<!doctype html><html><head></head><body></body></html>',
);
const names = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'Element',
  'Node',
  'MutationObserver',
  'ResizeObserver',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
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
const fixture = new URL(
  './support/folder-operation-fixture.ts',
  import.meta.url,
).href;
const notesBoundaries = new Set([
  '../../app.js',
  '../../shell/files.js',
  '../../shell/now.js',
  '../../shell/document-title.js',
  './writing-start.js',
  '../templates/new-from-template.js',
  './new-note.js',
]);
const folderBoundaries = new Set([
  '../../app.js',
  '../../shell/files.js',
  '../trash/trash.js',
]);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const parent = context.parentURL ?? '';
    if (
      (parent.endsWith('/features/notes/notes-home.js') &&
        notesBoundaries.has(specifier)) ||
      (parent.endsWith('/features/folders/folder-page-actions.js') &&
        folderBoundaries.has(specifier))
    )
      return { url: fixture, shortCircuit: true };
    return next(specifier, context);
  },
});
const { createRoot } = await import('react-dom/client');
const { NotesHomeView } =
  await import('../../apps/web/dist/features/notes/notes-home.js');
/** Find a button by its text or accessible label. */
function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (button) =>
      button.textContent === name || button.getAttribute('aria-label') === name,
  );
  assert.ok(found, `Missing button ${name}`);
  return found;
}
/** Click a button by its text or accessible label. */
async function click(name: string): Promise<void> {
  await act(async () => button(name).click());
}
/** Mount the real folder page, with an optional delayed first file list. */
async function setup(loading = false) {
  resetFolderOperation(loading);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const router = createMemoryRouter(
    [
      {
        path: '/w/:workspaceId/folders/*',
        element: createElement(NotesHomeView),
      },
      { path: '/w/:workspaceId', element: createElement(NotesHomeView) },
    ],
    { initialEntries: ['/w/work/folders/Projects'] },
  );
  await act(async () => root.render(createElement(RouterProvider, { router })));
  return {
    router,
    async close() {
      await act(async () => finishFolderOperation());
      await act(async () => root.unmount());
      router.dispose();
      host.remove();
    },
  };
}

await test('folder operations are unavailable until the initial file list arrives', async () => {
  const page = await setup(true);
  try {
    assert.equal(
      document.querySelector('button[aria-label="Folder actions"]'),
      null,
    );
    assert.equal(
      page.router.state.location.pathname,
      '/w/work/folders/Projects',
    );
    assert.equal(effects.sync, 0);
    assert.deepEqual(effects.removed, []);
    await act(async () => finishInitialFolderLoad());
    await click('Folder actions');
    await click('Delete folder');
    assert.match(document.body.textContent ?? '', /Delete/);
    assert.equal(effects.sync, 0);
    assert.equal(
      page.router.state.location.pathname,
      '/w/work/folders/Projects',
    );
  } finally {
    await page.close();
  }
});

await test(
  'a pending folder rename keeps its owner when its direct list becomes empty',
  { timeout: 5000 },
  async () => {
    const page = await setup();
    try {
      await click('Folder actions');
      await click('Rename');
      const input = document.querySelector('input');
      assert.ok(input instanceof HTMLInputElement);
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set?.call(input, 'Renamed');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await click('Rename');
      await act(async () => {
        await started.promise;
      });
      assert.match(document.body.textContent ?? '', /Renaming/);
      assert.equal(effects.sync, 0);
      await act(async () => finishFolderOperation());
      assert.equal(
        page.router.state.location.pathname,
        '/w/work/folders/Renamed',
      );
      assert.deepEqual(effects.moved, ['Projects:Renamed']);
      assert.equal(effects.sync, 1);
      assert.equal(document.querySelector('[role="dialog"]'), null);
    } finally {
      await page.close();
    }
  },
);

await test(
  'a pending folder deletion still announces, cleans folders and navigates after its list empties',
  { timeout: 5000 },
  async () => {
    const page = await setup();
    try {
      await click('Folder actions');
      await click('Delete folder');
      await click('Delete folder');
      await act(async () => {
        await started.promise;
      });
      assert.match(document.body.textContent ?? '', /Deleting/);
      await act(async () => finishFolderOperation());
      assert.equal(page.router.state.location.pathname, '/w/work');
      assert.deepEqual(effects.removed, ['Projects']);
      assert.equal(effects.announced, 1);
      assert.equal(effects.sync, 1);
    } finally {
      await page.close();
    }
  },
);

await test(
  'leaving the folder still blocks a late operation from taking over the new workspace',
  { timeout: 5000 },
  async () => {
    const page = await setup();
    try {
      await click('Folder actions');
      await click('Delete folder');
      await click('Delete folder');
      await act(async () => {
        await started.promise;
        await page.router.navigate('/w/other');
      });
      await act(async () => finishFolderOperation());
      assert.equal(page.router.state.location.pathname, '/w/other');
      assert.equal(effects.announced, 0);
      assert.equal(effects.sync, 0);
    } finally {
      await page.close();
    }
  },
);

after(async () => {
  hooks.deregister();
  for (const [name, original] of originals) {
    if (original === undefined) Reflect.deleteProperty(globalThis, name);
    else Object.defineProperty(globalThis, name, original);
  }
  await browser.happyDOM.close();
});
