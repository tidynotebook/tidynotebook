import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';
import { Window } from 'happy-dom';
import { act, createElement, useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
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
  './template-preview.js',
]);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (
      (context.parentURL?.endsWith(
        '/features/templates/new-from-template.js',
      ) ||
        context.parentURL?.endsWith(
          '/features/templates/template-choices.js',
        )) &&
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

/** The address that the router shows now. */
let address = '';
function LocationProbe() {
  const location = useLocation();
  address = `${location.pathname}${location.search}`;
  return null;
}

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
/** Mount the template dialog for a workspace. */
async function show(workspaceId: string, frameNotices = false): Promise<void> {
  await act(async () => {
    // The shell keys this dialog by workspace, so navigation remounts it.
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/w/one/notes/n1'] },
        createElement(LocationProbe),
        createElement(Dialog, { key: workspaceId, workspaceId, frameNotices }),
      ),
    );
  });
  await settle();
}
/** Let the lazy preview module and deferred values settle. */
async function settle(): Promise<void> {
  for (let round = 0; round < 3; round += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
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
/** Click a button. */
async function click(label: string): Promise<void> {
  await act(async () => button(label).click());
}
/** The input of a labelled field. */
function field(id: string): HTMLInputElement {
  const found = container.querySelector(`#${id}`);
  assert.ok(found instanceof window.HTMLInputElement, `Missing field: ${id}`);
  return found;
}
/** Type a value into a React field. */
async function type(id: string, value: string): Promise<void> {
  const input = field(id);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set?.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
/** The Save in field, a button named by its label and its value. */
function saveIn(): HTMLButtonElement {
  const found = container.querySelector('#template-note-folder');
  assert.ok(
    found instanceof window.HTMLButtonElement,
    'Missing field: Save in',
  );
  return found;
}
/** Submit the dialog form, as Enter in a field does. */
async function submit(): Promise<void> {
  const form = container.querySelector('[role="dialog"] form');
  assert.ok(form);
  await act(async () =>
    form.dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    ),
  );
}
/** Today in the written form of a date, as the name default uses it. */
function todayText(): string {
  const now = new Date();
  return [
    String(now.getFullYear()).padStart(4, '0'),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}
/** Choose the Meeting template and finish its read with this text. */
async function chooseMeeting(text: string): Promise<void> {
  await click('Meeting');
  const read = reads.shift();
  assert.ok(read);
  await act(async () => read.finish(templateNote(text)));
  await settle();
}

await test('a failed preview retries the same selection and guards creation until success', async () => {
  await show('workspace-a');
  assert.equal(reads.length, 0, 'The list reads no template text.');
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
  await settle();
  assert.match(container.textContent ?? '', /Recovered meeting text/);
  assert.ok(
    container.querySelector('section[aria-label="Preview of Meeting"]'),
  );
  assert.equal(button('Create note').disabled, false);
  await click('Create note');
  assert.deepEqual(creations.at(-1), {
    folder: 'Meetings',
    text: 'Recovered meeting text',
    name: `Meeting ${todayText()}`,
  });
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
  await settle();
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
  await chooseMeeting('Create error test');
  await click('Create note');
  const notices = container.querySelector(
    'section[aria-label="Frame notices"]',
  );
  assert.equal(notices?.textContent, message);
  assert.equal(container.querySelectorAll('[role="alert"]').length, 0);
  assert.equal(container.querySelector('[role="dialog"]'), null);
  setCreationError(null);
  await click('Open template dialog');
  await settle();
  assert.equal(notices?.textContent, message);
  await chooseMeeting('Create success test');
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
  await settle();
  assert.equal(button('Create note').disabled, false);
  await click('Meeting');
  assert.equal(reads.length, 0, 'The ready selection needs no new read.');
  assert.match(container.textContent ?? '', /Meeting preview text/);
});

await test('the preview shows the rendered note with the date, the time and the typed name', async () => {
  await show('workspace-render');
  await chooseMeeting('# {{title}}\n\nOn {{date}} at {{time}}\n');
  const region = (): string =>
    container.querySelector('[role="region"][aria-label="The new note"]')
      ?.textContent ?? '';
  assert.match(
    region(),
    new RegExp(
      `^# Meeting ${todayText()}\n\nOn ${todayText()} at \\d\\d:\\d\\d\n$`,
    ),
  );
  assert.doesNotMatch(region(), /\{\{/);
  assert.equal(field('template-note-name').value, `Meeting ${todayText()}`);
  await type('template-note-name', 'Kickoff');
  await settle();
  assert.match(region(), /^# Kickoff\n/);
  assert.equal(
    container
      .querySelector('[role="region"][aria-label="The new note"]')
      ?.getAttribute('data-path'),
    'Meetings/Kickoff.md',
  );
  await submit();
  assert.deepEqual(creations.at(-1), {
    folder: 'Meetings',
    text: '# {{title}}\n\nOn {{date}} at {{time}}\n',
    name: 'Kickoff',
  });
});

await test('the name is checked for empty, invalid characters and a clash in the folder', async () => {
  await show('workspace-names');
  await chooseMeeting('Body');
  const count = creations.length;
  const problem = (): string =>
    container.querySelector('#template-note-name-error')?.textContent ?? '';
  await type('template-note-name', '   ');
  await submit();
  assert.equal(creations.length, count);
  assert.match(problem(), /Type a note name/);
  await type('template-note-name', 'a/b');
  assert.match(problem(), /cannot contain a slash/);
  await type('template-note-name', 'plan');
  assert.match(problem(), /A note named plan is already in this folder/);
  await submit();
  assert.equal(creations.length, count);
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
  await type('template-note-name', 'Plan 2');
  assert.equal(problem(), '');
  await submit();
  assert.deepEqual(creations.at(-1), {
    folder: 'Meetings',
    text: 'Body',
    name: 'Plan 2',
  });
});

await test('Save in opens the folder tree in the same dialog and creates the note there', async () => {
  await show('workspace-folder');
  await chooseMeeting('Body');
  assert.equal(saveIn().getAttribute('aria-expanded'), 'false');
  assert.equal(
    saveIn().getAttribute('aria-labelledby'),
    'template-note-folder-label template-note-folder',
  );
  await act(async () => saveIn().click());
  const tree = container.querySelector('[role="tree"]');
  assert.ok(tree);
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
  assert.ok(tree.closest('[role="dialog"]'));
  // The details stay: the folder choice does not replace the dialog body.
  assert.ok(field('template-note-name'));
  const chosen = tree.querySelector('[aria-selected="true"]');
  assert.match(chosen?.textContent ?? '', /Meetings/);
  // Escape closes the tree only.
  await act(async () =>
    tree.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  );
  assert.equal(container.querySelector('[role="tree"]'), null);
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
  await act(async () => saveIn().click());
  await click('Open Projects');
  const launch = [
    ...container.querySelectorAll<HTMLElement>('[role="treeitem"]'),
  ].find((row) => row.textContent === 'Launch');
  assert.ok(launch);
  await act(async () => launch.click());
  assert.equal(container.querySelector('[role="tree"]'), null);
  assert.match(saveIn().textContent ?? '', /Launch/);
  assert.equal(field('template-note-name').value, `Meeting ${todayText()}`);
  await click('Create note');
  assert.deepEqual(creations.at(-1), {
    folder: 'Projects/Launch',
    text: 'Body',
    name: `Meeting ${todayText()}`,
  });
});

await test('Back restores list focus and Manage templates sits in the header', async () => {
  await show('workspace-back');
  const row = button('Meeting');
  await chooseMeeting('Back preview');
  let focusedWhileHidden = true;
  row.addEventListener('focus', () => {
    focusedWhileHidden = row.closest('.hidden') !== null;
  });
  await click('Back');
  assert.equal(document.activeElement, row);
  assert.equal(focusedWhileHidden, false);
  const manage = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Manage templates"]',
  );
  assert.ok(manage);
  // The control is in the title row, before the list, and it is no link to
  // a Settings route.
  assert.ok(manage.parentElement?.querySelector('h2'));
  assert.equal(container.querySelector('a[href*="settings"]'), null);
  // It closes the dialog and opens Settings at Templates over the same page.
  await act(async () => manage.click());
  await settle();
  assert.equal(container.querySelector('[role="dialog"]'), null);
  assert.equal(address, '/w/one/notes/n1?settings=templates');
});

await test('an incomplete list with no available templates does not claim a search miss', async () => {
  setTemplateAvailability({ empty: true, partial: true });
  try {
    await show('workspace-partial');
    assert.match(container.textContent ?? '', /Some templates may be missing/);
    assert.doesNotMatch(
      container.textContent ?? '',
      /No template matches|No templates yet/,
    );
  } finally {
    setTemplateAvailability({ empty: false, partial: false });
  }
});

await test('rows show only the name, and the subfolder only for a repeated name', async () => {
  setDuplicateTemplates(true);
  try {
    await show('workspace-duplicates');
    assert.equal(reads.length, 0);
    const choices = [...container.querySelectorAll('button[aria-pressed]')];
    assert.equal(choices.length, 2);
    assert.equal(choices[0]?.textContent, 'MeetingFirst');
    assert.equal(choices[1]?.textContent, 'MeetingSecond');
  } finally {
    setDuplicateTemplates(false);
  }
  await show('workspace-single');
  assert.equal(button('Meeting').textContent, 'Meeting');
  assert.doesNotMatch(
    container.textContent ?? '',
    /From the "Templates" folder/,
  );
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
