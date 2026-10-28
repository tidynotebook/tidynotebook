/** The real template renderer, including sanitization and preview-only marks. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
const hooks = registerHooks({
  load(url, context, next) {
    if (url.endsWith('.css'))
      return { format: 'module', source: '', shortCircuit: true };
    return next(url, context);
  },
});
import { setImmediate } from 'node:timers/promises';
import { Window } from 'happy-dom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { act, createElement } from 'react';
import { openLocalStore } from '@notesapp/storage-browser';

const browser = new Window({ url: 'http://localhost/' });
const globals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'NodeFilter',
  'Text',
  'DOMParser',
  'MutationObserver',
] as const;
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const name of globals) {
  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: browser[name],
  });
}
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});
const { createRoot } = await import('react-dom/client');
const { default: TemplatePreview } =
  await import('../../apps/web/dist/features/templates/template-preview.js');
const container = document.createElement('div');
document.body.append(container);
const root = createRoot(container);
const store = await openLocalStore('http://localhost', {
  indexedDB: new IDBFactory(),
  IDBKeyRange,
  databaseName: `preview-${crypto.randomUUID()}`,
});

test.after(async () => {
  await act(async () => root.unmount());
  store.close();
  hooks.deregister();
  await browser.happyDOM.close();
  for (const [name, descriptor] of originals) {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
    else Object.defineProperty(globalThis, name, descriptor);
  }
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

await test('the preview renders headings and tables, marks values, and refuses executable content', async () => {
  await act(async () => {
    root.render(
      createElement(TemplatePreview, {
        store,
        accountId: crypto.randomUUID(),
        workspaceId: crypto.randomUUID(),
        path: 'Projects/Plan.md',
        label: 'The new note',
        text: '# Plan\n\nDate: 2026-10-28\n\n| Item | State |\n| --- | --- |\n| Task | Ready |\n\n<script>alert(1)</script>\n\n[Unsafe](javascript:alert(1))\n',
        highlights: ['Plan', '2026-10-28'],
      }),
    );
  });
  for (
    let turn = 0;
    turn < 100 && container.querySelector('[aria-busy="false"]') === null;
    turn += 1
  ) {
    await act(async () => {
      await setImmediate();
    });
  }
  assert.ok(container.querySelector('[aria-busy="false"]'));
  assert.equal(container.querySelector('h1')?.textContent, 'Plan');
  assert.equal(container.querySelectorAll('table').length, 1);
  assert.deepEqual(
    [...container.querySelectorAll('mark')].map((mark) => mark.textContent),
    ['Plan', '2026-10-28'],
  );
  assert.equal(container.querySelector('script'), null);
  assert.equal(container.querySelector('[href^="javascript:"]'), null);
  assert.ok(container.textContent?.includes('<script>'));
  assert.equal(container.querySelector('[onclick], [onerror]'), null);
});
