import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';
import { Window } from 'happy-dom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createElement, act, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { openLocalStore } from '@notesapp/storage-browser';
import type { Draft, LocalStore } from '@notesapp/sync';

// Install the DOM before loading React DOM and CodeMirror. Layout and OS
// handlers still need the separate checks in the real browser.
const hooks = registerHooks({
  load(url, context, next) {
    if (url.endsWith('.css'))
      return { format: 'module', source: '', shortCircuit: true };
    return next(url, context);
  },
});
const browser = new Window({ url: 'http://localhost/' });
const globals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'Text',
  'MutationObserver',
  'ResizeObserver',
  'DOMRect',
  'Range',
  'getComputedStyle',
  'MouseEvent',
  'KeyboardEvent',
  'Event',
  'HTMLInputElement',
  'localStorage',
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
const { createRoot } = await import('react-dom/client');
const { EditorView } = await import('@codemirror/view');
const { NoteEditor } =
  await import('../../apps/web/dist/features/editor/note-editor.js');
const { NoteEditorLoader } =
  await import('../../apps/web/dist/features/editor/note-loader.js');
const { default: VersionPreview } =
  await import('../../apps/web/dist/features/history/version-preview.js');
const { NoteSaveScope, useFlushNoteDraft, useFlushNoteDraftForHandoff } =
  await import('../../apps/web/dist/features/editor/save-status.js');
const { HeaderSlotProvider, HeaderLeafSlot } =
  await import('../../apps/web/dist/shell/header-slot.js');
const { closeForUpdate } = await import('../../apps/web/dist/pwa/update.js');

const accountId = crypto.randomUUID();
const workspaceId = crypto.randomUUID();
const fileId = crypto.randomUUID();
const attachmentId = crypto.randomUUID();
const text = `[Fragment](#intro)\n\n[Picture](./diagram.png)\n\n[Attachment](/attachments/${attachmentId})\n\n[Blocked](javascript:alert)\n\n[App](slack://channel)\n`;
const store = await openLocalStore('http://localhost', {
  indexedDB: new IDBFactory(),
  IDBKeyRange,
  databaseName: `link-surfaces-${crypto.randomUUID()}`,
});
let flush = () => Promise.resolve();
let handoff = () => Promise.resolve();
function FlushReader(): ReactNode {
  flush = useFlushNoteDraft();
  handoff = useFlushNoteDraftForHandoff();
  return null;
}
const container = document.createElement('div');
document.body.append(container);
const root = createRoot(container);

async function render(child: ReactNode): Promise<void> {
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        null,
        createElement(
          NoteSaveScope,
          null,
          createElement(FlushReader),
          createElement(
            HeaderSlotProvider,
            null,
            createElement(HeaderLeafSlot),
            child,
          ),
        ),
      ),
    );
  });
}
function view(): InstanceType<typeof EditorView> {
  const element = container.querySelector('.cm-editor');
  assert.ok(element instanceof HTMLElement);
  const found = EditorView.findFromDOM(element);
  assert.ok(found);
  return found;
}
async function clickLink(label: string): Promise<void> {
  const editor = view();
  const from = editor.state.doc.toString().indexOf(`[${label}]`);
  assert.ok(from >= 0);
  await act(async () => {
    editor.dispatch({ selection: { anchor: from + 2 } });
    // Alt+Enter uses the real editor navigation callback without requiring
    // the layout measurements that only the real-browser check can supply.
    editor.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'Enter',
        altKey: true,
      }),
    );
  });
}
async function dismiss(): Promise<void> {
  const button = [...container.querySelectorAll('button')].find(
    (node) => node.textContent === 'Dismiss',
  );
  assert.ok(button);
  await act(async () => button.click());
  assert.doesNotMatch(container.textContent ?? '', /This link is blocked/);
}
function editor(local: LocalStore = store): ReactNode {
  return createElement(NoteEditor, {
    store: local,
    accountId,
    workspaceId,
    fileId,
    baseRevisionId: null,
    initialText: text,
    initialPath: 'one.md',
    initialWorkingCopyId: 'one',
    initialSequence: 1,
  });
}

await test('loader and history keep valid inert links quiet and show a dismissible blocked notice', async () => {
  const draft: Draft = {
    accountId,
    workspaceId,
    fileId,
    workingCopyId: 'one',
    baseRevisionId: null,
    path: 'one.md',
    text,
    sequence: 1,
    deleted: false,
  };
  await store.checkpoint(draft, null, 'text');
  for (const surface of [
    createElement(NoteEditorLoader, { store, accountId, workspaceId, fileId }),
    createElement(VersionPreview, {
      store,
      accountId,
      workspaceId,
      path: 'one.md',
      text,
      label: 'Version',
    }),
  ]) {
    await render(surface);
    // Store reads finish outside the first React render.
    for (
      let count = 0;
      count < 20 && !container.querySelector('.cm-editor');
      count += 1
    )
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    for (const label of ['Fragment', 'Picture', 'Attachment']) {
      await clickLink(label);
      assert.doesNotMatch(container.textContent ?? '', /unsafe or invalid/);
    }
    await clickLink('Blocked');
    assert.match(
      container.textContent ?? '',
      /This link is blocked because its address is unsafe or invalid/,
    );
    await dismiss();
    await render(null);
  }
});

for (const change of ['input', 'rename', 'unmount'] as const) {
  await test(`real editor ${change} cancels only the handoff flush`, async () => {
    let finish = () => {};
    let entered = () => {};
    const saving = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const local: LocalStore = {
      ...store,
      saveDraft: async (draft) => {
        entered();
        await wait;
        await store.saveDraft(draft);
      },
    };
    await render(editor(local));
    const pending = handoff();
    const rejected = assert.rejects(pending, {
      constructor: (await import('../../apps/web/dist/lib/draft-flush.js'))
        .DraftFlushCancelled,
    });
    await saving;
    await act(async () => {
      if (change === 'input') {
        const current = view();
        current.dispatch({
          changes: { from: current.state.doc.length, insert: 'x' },
          userEvent: 'input.type',
        });
      } else if (change === 'rename') {
        const input = container.querySelector('input[aria-label="Note name"]');
        assert.ok(input);
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        assert.ok(setter);
        setter.call(input, 'Renamed');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else
        root.render(
          createElement(
            MemoryRouter,
            null,
            createElement(NoteSaveScope, null, createElement(FlushReader)),
          ),
        );
    });
    if (change === 'rename')
      await act(async () => {
        container
          .querySelector('input[aria-label="Note name"]')
          ?.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
          );
      });
    finish();
    await act(async () => rejected);
    await render(null);
  });
}

await test('PWA update uses the shared flush even when an edit arrives during its save', async () => {
  let finish = () => {};
  let entered = () => {};
  const saving = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await render(
    editor({
      ...store,
      saveDraft: async (draft) => {
        entered();
        await wait;
        await store.saveDraft(draft);
      },
    }),
  );
  const events: string[] = [];
  const update = closeForUpdate({
    flushDrafts: flush,
    stopQueue: async () => {
      events.push('stop');
    },
    closeStore: async () => {
      events.push('close');
    },
    leave: () => {
      events.push('leave');
    },
  });
  await saving;
  await act(async () => {
    const current = view();
    current.dispatch({
      changes: { from: current.state.doc.length, insert: 'new edit' },
      userEvent: 'input.type',
    });
  });
  await act(async () => {
    finish();
    assert.equal(await update, 'closed');
  });
  assert.deepEqual(events, ['stop', 'close', 'leave']);
  await render(null);
});

await test('a current editor can finish the guarded handoff flush', async () => {
  await render(editor());
  await act(async () => handoff());
  await render(null);
});

after(async () => {
  await act(async () => root.unmount());
  await new Promise((resolve) => setTimeout(resolve, 30));
  await store.close();
  await browser.happyDOM.close();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  hooks.deregister();
});
