import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';
import { Window } from 'happy-dom';
import { act, createElement, useState } from 'react';
import {
  reads,
  creations,
  templateId,
  templateNote,
} from './support/template-dialog-fixture.ts';

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
const originalAct = Object.getOwnPropertyDescriptor(
  globalThis,
  'IS_REACT_ACT_ENVIRONMENT',
);
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});
const fixtureUrl = new URL(
  './support/template-dialog-fixture.ts',
  import.meta.url,
).href;
const boundaries = new Set([
  '../../app.js',
  '../../shell/files.js',
  './templates.js',
  '../notes/new-note.js',
]);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (
      context.parentURL?.endsWith('/features/templates/new-from-template.js') &&
      boundaries.has(specifier)
    )
      return { url: fixtureUrl, shortCircuit: true };
    return next(specifier, context);
  },
});
const { createRoot } = await import('react-dom/client');
const { NewFromTemplateDialog } =
  await import('../../apps/web/dist/features/templates/new-from-template.js');
const container = document.createElement('div');
document.body.append(container);
const root = createRoot(container);
const originalFetch = globalThis.fetch;
let serverReads = 0;
globalThis.fetch = () => {
  serverReads += 1;
  return Promise.reject(new TypeError('The connection is unavailable.'));
};

function Dialog({ workspaceId }: { readonly workspaceId: string }) {
  const [open, setOpen] = useState(true);
  return createElement(NewFromTemplateDialog, {
    workspaceId,
    folder: 'Meetings',
    open,
    onClose: () => setOpen(false),
  });
}
async function show(workspaceId: string): Promise<void> {
  await act(async () => {
    // The shell keys this dialog by workspace, so navigation remounts it.
    root.render(createElement(Dialog, { key: workspaceId, workspaceId }));
  });
}
function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  );
  assert.ok(found, `Missing button: ${label}`);
  return found;
}
async function click(label: string): Promise<void> {
  await act(async () => button(label).click());
}

await test('a failed preview retries the same selection and guards creation until success', async () => {
  await show('workspace-a');
  assert.equal(button('Meeting').getAttribute('aria-pressed'), 'false');
  assert.equal(button('Create note').disabled, true);
  await click('Meeting');
  assert.equal(button('Meeting').getAttribute('aria-pressed'), 'true');
  const first = reads.shift();
  assert.ok(first);
  assert.equal(first.fileId, templateId);
  assert.equal(button('Create note').disabled, true);
  await act(async () => first.finish(null));
  assert.equal(serverReads, 1);
  assert.match(container.textContent ?? '', /Connect to the internet/);
  assert.equal(button('Create note').disabled, true);

  // No second click on the template. Retry must read the retained selection.
  await click('Retry preview');
  const retry = reads.shift();
  assert.ok(retry);
  assert.equal(retry.fileId, first.fileId);
  assert.equal(retry.workspaceId, first.workspaceId);
  assert.match(container.textContent ?? '', /The template preview is loading/);
  assert.equal(button('Create note').disabled, true);
  await click('Create note');
  assert.equal(creations.length, 0);
  await act(async () => retry.finish(templateNote('Recovered meeting text')));
  assert.match(container.textContent ?? '', /Recovered meeting text/);
  assert.ok(
    container.querySelector('section[aria-label="Preview of Meeting"]'),
  );
  assert.equal(button('Create note').disabled, false);
  await click('Create note');
  assert.deepEqual(creations, [
    { folder: 'Meetings', text: 'Recovered meeting text' },
  ]);
});

await test('a retry completion from the previous workspace cannot replace the new preview', async () => {
  await show('workspace-old');
  await click('Meeting');
  const first = reads.shift();
  assert.ok(first);
  await act(async () => first.finish(null));
  await click('Retry preview');
  const oldRetry = reads.shift();
  assert.ok(oldRetry);

  await show('workspace-new');
  assert.equal(button('Create note').disabled, true);
  await click('Meeting');
  const current = reads.shift();
  assert.ok(current);
  assert.equal(current.workspaceId, 'workspace-new');
  await act(async () => current.finish(templateNote('Current workspace text')));
  assert.equal(button('Create note').disabled, false);
  await act(async () => oldRetry.finish(templateNote('Stale workspace text')));
  assert.match(container.textContent ?? '', /Current workspace text/);
  assert.doesNotMatch(container.textContent ?? '', /Stale workspace text/);
  assert.equal(button('Create note').disabled, false);
});

after(async () => {
  await act(async () => root.unmount());
  hooks.deregister();
  globalThis.fetch = originalFetch;
  for (const name of globals) {
    const original = originals.get(name);
    if (original === undefined) Reflect.deleteProperty(globalThis, name);
    else Object.defineProperty(globalThis, name, original);
  }
  if (originalAct === undefined)
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  else
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', originalAct);
  await browser.happyDOM.close();
});
