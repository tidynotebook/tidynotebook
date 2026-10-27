import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';
import { Window } from 'happy-dom';
import { act, createElement, useState } from 'react';
import { MemoryRouter } from 'react-router';
import {
  reads,
  creations,
  templateId,
  templateNote,
  setCreationError,
  setTemplateAvailability,
  setDuplicateTemplates,
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

function Dialog({
  workspaceId,
  frameNotices = false,
}: {
  readonly workspaceId: string;
  readonly frameNotices?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { onClick: () => setOpen(true) },
      'Open template dialog',
    ),
    createElement('section', { 'aria-label': 'Frame notices' }, problem),
    createElement(NewFromTemplateDialog, {
      workspaceId,
      folder: 'Meetings',
      open,
      onClose: () => setOpen(false),
      onCreationStart: frameNotices ? () => setProblem : undefined,
    }),
  );
}
/** Mount the template dialog for a workspace and finish its row summary read. */
async function show(
  workspaceId: string,
  frameNotices = false,
  hasTemplates = true,
): Promise<void> {
  await act(async () => {
    // The shell keys this dialog by workspace, so navigation remounts it.
    root.render(
      createElement(
        MemoryRouter,
        null,
        createElement(Dialog, { key: workspaceId, workspaceId, frameNotices }),
      ),
    );
  });
  if (hasTemplates) await finishRowSummary();
}
/** Complete the pending first-line read for the template row. */
async function finishRowSummary(): Promise<void> {
  const summary = reads.shift();
  assert.ok(summary, 'The row reads only device text for its first line.');
  assert.equal(summary.fileId, templateId);
  await act(async () => summary.finish(null));
}
/** Find a button by its text or accessible label. */
function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (candidate) =>
      candidate.textContent === label ||
      candidate.getAttribute('aria-label') === label ||
      candidate.textContent?.startsWith(label),
  );
  assert.ok(found, `Missing button: ${label}`);
  return found;
}
/** Click a button, then finish the row read that opening the dialog starts. */
async function click(label: string): Promise<void> {
  await act(async () => button(label).click());
  if (label === 'Open template dialog') await finishRowSummary();
}

await test('a failed preview retries the same selection and guards creation until success', async () => {
  await show('workspace-a');
  assert.equal(button('Meeting').getAttribute('aria-pressed'), 'false');
  assert.ok(
    ![...container.querySelectorAll('button')].some(
      (control) => control.textContent === 'Create note',
    ),
  );
  await click('Meeting');
  assert.equal(button('Meeting').getAttribute('aria-pressed'), 'true');
  const first = reads.shift();
  assert.ok(first);
  assert.equal(first.fileId, templateId);
  assert.equal(button('Create note').disabled, true);
  await act(async () => first.finish(null));
  assert.equal(serverReads, 1);
  assert.match(
    container.textContent ?? '',
    /Can't load this template. It is not on this device./,
  );
  assert.equal(button('Create note').disabled, true);

  // No second click on the template. Retry must read the retained selection.
  await click('Try again');
  const retry = reads.shift();
  assert.ok(retry);
  assert.equal(retry.fileId, first.fileId);
  assert.equal(retry.workspaceId, first.workspaceId);
  assert.match(container.textContent ?? '', /Loading preview/);
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
  await click('Try again');
  const oldRetry = reads.shift();
  assert.ok(oldRetry);

  await show('workspace-new');
  assert.ok(
    ![...container.querySelectorAll('button')].some(
      (control) => control.textContent === 'Create note',
    ),
  );
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

await test('creation errors reach the frame and remain after the dialog closes until success clears them', async () => {
  const message = 'The note could not be made on this device.';
  setCreationError(message);
  await show('workspace-error', true);
  await click('Meeting');
  const first = reads.shift();
  assert.ok(first);
  await act(async () => first.finish(templateNote('Create error test')));
  await click('Create note');
  const notices = container.querySelector(
    'section[aria-label="Frame notices"]',
  );
  assert.equal(notices?.textContent, message);
  assert.doesNotMatch(
    container.querySelector('[role="dialog"]')?.textContent ?? '',
    /The note could not be made/,
  );
  assert.equal(container.querySelectorAll('[role="alert"]').length, 0);
  assert.equal(container.querySelector('[role="dialog"]'), null);
  assert.equal(notices?.textContent, message);
  setCreationError(null);
  await click('Open template dialog');
  assert.equal(notices?.textContent, message);
  await click('Meeting');
  const retry = reads.shift();
  assert.ok(retry);
  await act(async () => retry.finish(templateNote('Create success test')));
  await click('Create note');
  assert.equal(notices?.textContent, '');
});

await test('selecting the same template keeps its pending read and ready preview', async () => {
  await show('workspace-repeat');
  await click('Meeting');
  const preview = reads.shift();
  assert.ok(preview);
  await click('Meeting');
  assert.equal(reads.length, 0, 'The pending selection must keep its read.');
  await act(async () => preview.finish(templateNote('Meeting preview text')));
  assert.equal(button('Create note').disabled, false);
  await click('Meeting');
  assert.equal(reads.length, 0, 'The ready selection needs no new read.');
  assert.match(container.textContent ?? '', /Meeting preview text/);
  assert.equal(button('Create note').disabled, false);
  await click('Create note');
  assert.deepEqual(creations.at(-1), {
    folder: 'Meetings',
    text: 'Meeting preview text',
  });
});

await test('Back restores list focus only after the phone list is visible', async () => {
  await show('workspace-back');
  const row = button('Meeting');
  await click('Meeting');
  const preview = reads.shift();
  assert.ok(preview);
  await act(async () => preview.finish(templateNote('Back preview')));
  let focusedWhileHidden = true;
  row.addEventListener('focus', () => {
    focusedWhileHidden = row.closest('.hidden') !== null;
  });
  await click('Back');
  assert.equal(document.activeElement, row);
  assert.equal(focusedWhileHidden, false);
  assert.match(
    container
      .querySelector('a[href$="settings#templates-heading"]')
      ?.getAttribute('href') ?? '',
    /settings#templates-heading$/,
  );
});

await test('an incomplete list with no available templates does not claim a search miss', async () => {
  setTemplateAvailability({ empty: true, partial: true });
  try {
    await show('workspace-partial', false, false);
    assert.match(container.textContent ?? '', /Some templates may be missing/);
    assert.doesNotMatch(
      container.textContent ?? '',
      /No template matches|No templates yet/,
    );
  } finally {
    setTemplateAvailability({ empty: false, partial: false });
  }
});

await test('duplicate template names retain their first lines as accessible button text', async () => {
  setDuplicateTemplates(true);
  try {
    await show('workspace-duplicates', false, false);
    const summaries = reads.splice(0);
    assert.equal(summaries.length, 2);
    await act(async () => {
      for (const [index, summary] of summaries.entries())
        summary.finish({
          ...templateNote(`Team ${index + 1} notes`),
          fileId: summary.fileId,
        });
    });
    const choices = [...container.querySelectorAll('button[aria-pressed]')];
    assert.equal(choices.length, 2);
    assert.match(choices[0]?.textContent ?? '', /MeetingTeam 1 notes/);
    assert.match(choices[1]?.textContent ?? '', /MeetingTeam 2 notes/);
    assert.ok(choices.every((choice) => !choice.hasAttribute('aria-label')));
  } finally {
    setDuplicateTemplates(false);
  }
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
