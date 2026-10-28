import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { Window } from 'happy-dom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createElement, act, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import type { WorkspaceFile } from '@notesapp/api-client';
import { contentDigest, type AcceptedChangeset } from '@notesapp/core';
import { createDatabase, openLocalStore } from '@notesapp/storage-browser';
import type { Draft, LocalStore, LocalChange } from '@notesapp/sync';

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
  'PointerEvent',
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
const { forceParsing } = await import('@codemirror/language');
const { setEditorReadOnly } = await import('@notesapp/editor');
const { NoteEditor } =
  await import('../../apps/web/dist/features/editor/note-editor.js');
const { DeletedNotePage } =
  await import('../../apps/web/dist/features/editor/note-state-pages.js');
const { NoteEditorLoader } =
  await import('../../apps/web/dist/features/editor/note-loader.js');
const { duplicateNote } =
  await import('../../apps/web/dist/features/notes/duplicate-note.js');
const { deleteNotes } =
  await import('../../apps/web/dist/features/editor/note-delete.js');
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
const storageOptions = {
  indexedDB: new IDBFactory(),
  IDBKeyRange,
  databaseName: `link-surfaces-${crypto.randomUUID()}`,
};
const localStore = await openLocalStore('http://localhost', storageOptions);
// Unmount starts writes without returning their promises. Track the real
// store operations so cleanup waits for append, draft, and checkpoint work.
const pendingStoreWork = new Set<Promise<unknown>>();
function trackStoreWork(local: LocalStore): LocalStore {
  return new Proxy(local, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]): unknown => {
        const result: unknown = Reflect.apply(value, target, args);
        if (result instanceof Promise) {
          pendingStoreWork.add(result);
          void result.then(
            () => pendingStoreWork.delete(result),
            () => pendingStoreWork.delete(result),
          );
        }
        return result;
      };
    },
  });
}
const store = trackStoreWork(localStore);

/** Waits for writes and their queued continuations, without a timed delay. */
async function finishStoreWork(): Promise<void> {
  do {
    await Promise.allSettled([...pendingStoreWork]);
    await setImmediate();
  } while (pendingStoreWork.size > 0);
}

/** Observes the asynchronous loader only while React can finish its work. */
async function waitForEditor(container: ParentNode): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (true) {
    let mounted = false;
    await act(async () => {
      mounted = container.querySelector('.cm-editor') !== null;
      if (!mounted) await setImmediate();
    });
    if (mounted) return;
    if (Date.now() > deadline)
      throw new Error('The note editor did not mount within 10 seconds.');
  }
}

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

for (const outcome of ['deleted', 'unknown', 'failed', 'left'] as const) {
  await test(`a cold deleted-note lookup handles ${outcome} without a cached document`, async () => {
    const coldId = crypto.randomUUID();
    const requests: string[] = [];
    const lookup = Promise.withResolvers<Response>();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input) => {
      const url = String(input instanceof Request ? input.url : input);
      requests.push(url);
      return Promise.resolve(
        requests.length === 1
          ? Response.json({ code: 'not_found' }, { status: 404 })
          : lookup.promise,
      );
    };
    const coldStore: LocalStore = {
      ...store,
      readCachedNote: () => Promise.resolve(null),
    };
    try {
      await render(
        createElement(NoteEditorLoader, {
          store: coldStore,
          accountId,
          workspaceId,
          fileId: coldId,
        }),
      );
      assert.equal(requests.length, 2);
      assert.ok(requests.every((url) => url.includes(workspaceId)));
      if (outcome === 'left')
        await render(createElement('p', null, 'Another workspace'));
      await act(async () => {
        lookup.resolve(
          outcome === 'failed'
            ? Response.json({}, { status: 503 })
            : Response.json({
                files:
                  outcome === 'unknown'
                    ? []
                    : [
                        {
                          fileId: coldId,
                          path: 'Cold deleted.md',
                          kind: 'note',
                          headRevisionId: crypto.randomUUID(),
                          createdAt: '2026-10-27T00:00:00Z',
                          deletedAt: '2026-10-27T00:00:00Z',
                        },
                      ],
              }),
        );
      });
      const content = container.textContent ?? '';
      if (outcome === 'deleted') {
        assert.match(content, /Cold deleted is in Trash/);
        assert.ok(
          [...container.querySelectorAll('button')].some(
            (button) => button.textContent === 'Restore note',
          ),
        );
      } else if (outcome === 'unknown') assert.match(content, /Note not found/);
      else if (outcome === 'failed')
        assert.match(content, /Can't open this note/);
      else assert.equal(content, 'Another workspace');
      assert.equal(container.querySelectorAll('.cm-editor').length, 0);
    } finally {
      await render(null);
      globalThis.fetch = originalFetch;
    }
  });
}

for (const outcome of [
  'found',
  'exhausted',
  'error',
  'left',
  'purged',
  'restored',
] as const) {
  await test(`a later Trash page handles ${outcome} with current scope guards`, async () => {
    const id = crypto.randomUUID();
    await store.checkpoint(
      {
        accountId,
        workspaceId,
        fileId: id,
        workingCopyId: crypto.randomUUID(),
        baseRevisionId: null,
        path: 'Restored page.md',
        text: 'Restored during page two',
        sequence: 1,
        deleted: false,
      },
      null,
      'text',
    );
    const saved = await store.readCachedNote(accountId, workspaceId, id);
    assert.ok(saved);
    let restored = false;
    let retried = false;
    const listeners = new Set<(change: LocalChange) => void>();
    const local: LocalStore = {
      ...store,
      readCachedNote: () => Promise.resolve(restored ? saved : null),
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    const page = Promise.withResolvers<Response>();
    const originalFetch = globalThis.fetch;
    const requests: URL[] = [];
    globalThis.fetch = (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      if (!url.pathname.endsWith('/trash'))
        return Promise.resolve(Response.json({}, { status: 404 }));
      if (url.searchParams.get('cursor') === 'later') return page.promise;
      return Promise.resolve(
        Response.json(
          retried ? { files: [] } : { files: [], nextCursor: 'later' },
        ),
      );
    };
    try {
      await render(
        createElement(NoteEditorLoader, {
          store: local,
          accountId,
          workspaceId,
          fileId: id,
        }),
      );
      assert.equal(requests.length, 3);
      assert.equal(requests[2]?.searchParams.get('cursor'), 'later');
      if (outcome === 'left')
        await render(createElement('p', null, 'Another account and workspace'));
      if (outcome === 'purged')
        await act(async () => {
          for (const listener of [...listeners])
            listener({ kind: 'purge', accountId, workspaceId, fileId: id });
        });
      if (outcome === 'restored')
        await act(async () => {
          restored = true;
          for (const listener of [...listeners])
            listener({ kind: 'file', accountId, workspaceId, fileId: id });
        });
      await act(async () => {
        page.resolve(
          outcome === 'error' || outcome === 'restored'
            ? Response.json({}, { status: 503 })
            : Response.json({
                files:
                  outcome === 'exhausted'
                    ? []
                    : [{ fileId: id, kind: 'note', path: 'Later deleted.md' }],
                nextCursor: null,
              }),
        );
      });
      if (outcome === 'found')
        assert.match(container.textContent ?? '', /Later deleted is in Trash/);
      else if (outcome === 'exhausted')
        assert.match(container.textContent ?? '', /Note not found/);
      else if (outcome === 'left')
        assert.equal(container.textContent, 'Another account and workspace');
      else if (outcome === 'purged')
        assert.match(container.textContent ?? '', /This note was deleted/);
      else if (outcome === 'restored') {
        await waitForEditor(container);
        assert.equal(view().state.doc.toString(), 'Restored during page two');
      } else {
        assert.match(container.textContent ?? '', /Can't open this note/);
        const retry = [...container.querySelectorAll('button')].find(
          (button) => button.textContent === 'Try again',
        );
        assert.ok(retry);
        retried = true;
        await act(async () => retry.click());
        assert.match(container.textContent ?? '', /Note not found/);
        assert.equal(requests.at(-1)?.searchParams.get('cursor'), null);
      }
    } finally {
      await render(null);
      await act(finishStoreWork);
      globalThis.fetch = originalFetch;
    }
  });
}

for (const responseStatus of [200, 503]) {
  await test(`review: restored device text wins while cold Trash lookup returns ${responseStatus}`, async () => {
    const id = crypto.randomUUID();
    await store.checkpoint(
      {
        accountId,
        workspaceId,
        fileId: id,
        workingCopyId: crypto.randomUUID(),
        baseRevisionId: null,
        path: 'Restored.md',
        text: 'Restored device text',
        sequence: 1,
        deleted: false,
      },
      null,
      'text',
    );
    const saved = await store.readCachedNote(accountId, workspaceId, id);
    assert.ok(saved);
    let restored = false;
    const listeners = new Set<(change: LocalChange) => void>();
    const local: LocalStore = {
      ...store,
      readCachedNote: () => Promise.resolve(restored ? saved : null),
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    const lookup = Promise.withResolvers<Response>();
    const originalFetch = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = () =>
      Promise.resolve(
        ++requests === 1 ? Response.json({}, { status: 404 }) : lookup.promise,
      );
    try {
      await render(
        createElement(NoteEditorLoader, {
          store: local,
          accountId,
          workspaceId,
          fileId: id,
        }),
      );
      assert.equal(requests, 2);
      await act(async () => {
        restored = true;
        for (const listener of [...listeners])
          listener({ kind: 'file', accountId, workspaceId, fileId: id });
      });
      await act(async () => {
        lookup.resolve(
          responseStatus === 503
            ? Response.json({}, { status: 503 })
            : Response.json({
                files: [{ fileId: id, path: 'Stale deleted.md', kind: 'note' }],
              }),
        );
        await setImmediate();
      });
      await act(finishStoreWork);
      await waitForEditor(container);
      assert.ok(
        container.querySelector('.cm-editor'),
        `Expected restored editor; received: ${container.textContent}`,
      );
      assert.equal(view().state.doc.toString(), 'Restored device text');
    } finally {
      await render(null);
      await act(finishStoreWork);
      globalThis.fetch = originalFetch;
    }
  });
}

for (const outcome of ['purged', 'retry'] as const) {
  await test(`review: cold lookup ${outcome} guard`, async () => {
    const id = crypto.randomUUID();
    const listeners = new Set<(change: LocalChange) => void>();
    const local: LocalStore = {
      ...store,
      readCachedNote: () => Promise.resolve(null),
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    const originalFetch = globalThis.fetch;
    const lookup = Promise.withResolvers<Response>();
    let requests = 0;
    globalThis.fetch = () => {
      requests++;
      return Promise.resolve(
        requests === 1 || requests === 3
          ? Response.json({}, { status: 404 })
          : requests === 2
            ? lookup.promise
            : Response.json({ files: [] }),
      );
    };
    try {
      await render(
        createElement(NoteEditorLoader, {
          store: local,
          accountId,
          workspaceId,
          fileId: id,
        }),
      );
      assert.equal(requests, 2);
      if (outcome === 'purged')
        await act(async () => {
          for (const listener of [...listeners])
            listener({ kind: 'purge', accountId, workspaceId, fileId: id });
        });
      await act(async () => {
        lookup.resolve(
          outcome === 'retry'
            ? Response.json({}, { status: 503 })
            : Response.json({
                files: [{ fileId: id, kind: 'note', path: 'Stale.md' }],
              }),
        );
      });
      if (outcome === 'purged') {
        assert.match(container.textContent ?? '', /This note was deleted/);
        assert.equal(container.querySelector('.cm-editor'), null);
      } else {
        const retry = [...container.querySelectorAll('button')].find(
          (b) => b.textContent === 'Try again',
        );
        assert.ok(retry);
        await act(async () => retry.click());
        assert.equal(requests, 4);
        assert.match(container.textContent ?? '', /Note not found/);
      }
    } finally {
      await render(null);
      globalThis.fetch = originalFetch;
    }
  });
}

await test('Restore gives offline guidance and retains retry after reconnect', async () => {
  const connection = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let restored = 0;
  globalThis.fetch = () => {
    requests += 1;
    return Promise.resolve(
      requests === 1
        ? Response.json({ message: 'Restore failed.' }, { status: 503 })
        : Response.json({ revision: { path: 'one.md' } }),
    );
  };
  /** Find the Restore note button. */
  const restoreButton = (): HTMLButtonElement => {
    const found = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Restore note',
    );
    assert.ok(found);
    return found;
  };
  try {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    await render(
      createElement(DeletedNotePage, {
        store,
        workspaceId,
        fileId,
        path: 'one.md',
        onRestored: () => {
          restored += 1;
        },
      }),
    );
    assert.match(
      container.textContent ?? '',
      /You are offline. Connect to restore this note./,
    );
    assert.equal(restoreButton().disabled, true);
    await act(async () => restoreButton().click());
    assert.equal(requests, 0);
    assert.equal(restored, 0);
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    await act(async () => window.dispatchEvent(new Event('online')));
    assert.equal(restoreButton().disabled, false);
    await act(async () => restoreButton().click());
    assert.equal(requests, 1);
    assert.equal(restored, 0);
    assert.ok(container.querySelector('[role="alert"]'));
    assert.equal(restoreButton().disabled, false);
    await act(async () => restoreButton().click());
    assert.equal(requests, 2);
    assert.equal(restored, 1);
  } finally {
    await render(null);
    globalThis.fetch = originalFetch;
    if (connection === undefined) Reflect.deleteProperty(navigator, 'onLine');
    else Object.defineProperty(navigator, 'onLine', connection);
  }
});

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
    await waitForEditor(container);
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
        const descriptor = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        );
        assert.ok(descriptor);
        descriptor.set?.call(input, 'Renamed');
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

await test('a restored note opens editable content even when its first read still says deleted', async () => {
  const restoredId = crypto.randomUUID();
  const restoredText = '# Recovered note\n\nKeep this text.\n';
  await store.checkpoint(
    {
      accountId,
      workspaceId,
      fileId: restoredId,
      workingCopyId: crypto.randomUUID(),
      baseRevisionId: null,
      path: 'Recovered.md',
      text: restoredText,
      sequence: 1,
      deleted: false,
    },
    null,
    'text',
  );
  for (let cycle = 0; cycle < 2; cycle += 1) {
    let reads = 0;
    const restoredStore: LocalStore = {
      ...store,
      readCachedNote: async (...args) => {
        const cached = await store.readCachedNote(...args);
        // Restore reached the store after this read began, before the loader
        // subscribed. No later file event is needed to recover the editor.
        return ++reads === 1 && cached !== null
          ? { ...cached, deleted: true }
          : cached;
      },
    };
    await render(
      createElement(NoteEditorLoader, {
        store: restoredStore,
        accountId,
        workspaceId,
        fileId: restoredId,
      }),
    );
    await waitForEditor(container);
    assert.equal(view().state.doc.toString(), restoredText);
    assert.equal(view().state.readOnly, false);
    assert.doesNotMatch(container.textContent ?? '', /is in Trash/);
    await render(null);
    await act(finishStoreWork);
  }
});

await test('a delayed restore reread shows pending feedback before editable recovery', async () => {
  const restoredId = crypto.randomUUID();
  const restoredText = '# Delayed recovery\n';
  await store.checkpoint(
    {
      accountId,
      workspaceId,
      fileId: restoredId,
      workingCopyId: crypto.randomUUID(),
      baseRevisionId: null,
      path: 'Delayed recovery.md',
      text: restoredText,
      sequence: 1,
      deleted: false,
    },
    null,
    'text',
  );
  const saved = await store.readCachedNote(accountId, workspaceId, restoredId);
  assert.ok(saved !== null);
  let restored = false;
  let restoreReads = 0;
  const rereadStarted = Promise.withResolvers<void>();
  const delayed = Promise.withResolvers<typeof saved>();
  const listeners = new Set<(change: LocalChange) => void>();
  const restoredStore: LocalStore = {
    ...store,
    readCachedNote: () => {
      if (!restored) return Promise.resolve({ ...saved, deleted: true });
      // The watch sees the restore first. Hold the loader's subsequent read,
      // rather than the initial load, to inspect the visible recovery state.
      if (++restoreReads === 2) {
        rereadStarted.resolve();
        return delayed.promise;
      }
      return Promise.resolve(saved);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  await render(
    createElement(NoteEditorLoader, {
      store: restoredStore,
      accountId,
      workspaceId,
      fileId: restoredId,
    }),
  );
  assert.match(container.textContent ?? '', /is in Trash/);
  await act(async () => {
    restored = true;
    for (const listener of [...listeners])
      listener({ kind: 'file', accountId, workspaceId, fileId: restoredId });
  });
  await rereadStarted.promise;
  assert.equal(container.querySelector('.cm-editor'), null);
  assert.doesNotMatch(container.textContent ?? '', /is in Trash/);
  const pending = container.querySelector('[role="status"][aria-busy="true"]');
  assert.ok(pending);
  assert.match(pending.textContent ?? '', /The note is loading\./);
  await act(async () => {
    delayed.resolve(saved);
    await delayed.promise;
  });
  await waitForEditor(container);
  assert.equal(view().state.doc.toString(), restoredText);
  assert.equal(view().state.readOnly, false);
  await act(async () => {
    const current = view();
    current.dispatch({
      changes: {
        from: current.state.doc.length,
        insert: 'Edit after recovery\n',
      },
      userEvent: 'input.type',
    });
    await flush();
  });
  assert.equal(
    view().state.doc.toString(),
    `${restoredText}Edit after recovery\n`,
  );
  await render(null);
  await act(finishStoreWork);
});

/** Accept only this test's queued writes, as the sync transport does. */
async function acceptNoteWrites(noteId: string): Promise<void> {
  for (const entry of await store.pending(accountId, workspaceId)) {
    if (!entry.input.revisions.some((revision) => revision.fileId === noteId))
      continue;
    const revisions: AcceptedChangeset['revisions'] = entry.input.revisions.map(
      (revision) => ({
        revisionId: revision.id,
        fileId: revision.fileId,
        parents: revision.parents,
        path: revision.path,
        deleted: revision.deleted,
        digest:
          revision.content.kind === 'attachment'
            ? revision.content.digest
            : 'a'.repeat(64),
        size: 0,
        actorAccountId: accountId,
        serverTime: '2026-10-25T12:00:00.000Z',
        message: revision.message,
        epoch: revision.content.kind === 'markdown' ? 1 : null,
        acceptedState: null,
        merged: false,
      }),
    );
    await store.acknowledge(accountId, {
      mutationId: entry.input.mutationId,
      revisionIds: revisions.map((revision) => revision.revisionId),
      cursor: crypto.randomUUID(),
      revisions,
      superseded: [],
    });
  }
}

await test('duplicate, Trash and restore allow immediate editing through a second cycle', async () => {
  const sourceId = crypto.randomUUID();
  const sourceText = '# Recovery test\n\nKeep this text.\n';
  await store.checkpoint(
    {
      accountId,
      workspaceId,
      fileId: sourceId,
      workingCopyId: crypto.randomUUID(),
      baseRevisionId: null,
      path: 'Recovery test.md',
      text: sourceText,
      sequence: 1,
      deleted: false,
    },
    null,
    'text',
  );
  await acceptNoteWrites(sourceId);
  const restoredId = await duplicateNote(store, {
    accountId,
    workspaceId,
    path: 'Recovery test.md',
    text: sourceText,
    takenPaths: ['Recovery test.md'],
  });
  await acceptNoteWrites(restoredId);
  let expected = sourceText;
  for (let cycle = 0; cycle < 2; cycle += 1) {
    const saved = await store.readCachedNote(
      accountId,
      workspaceId,
      restoredId,
    );
    assert.ok(saved !== null && saved.document !== null);
    const savedDocument = saved.document;
    assert.equal(saved.text, expected);
    assert.equal(
      (
        await deleteNotes(store, accountId, workspaceId, [
          { fileId: restoredId, name: 'Recovery test copy' },
        ])
      ).ok,
      true,
    );
    await acceptNoteWrites(restoredId);
    assert.equal(
      (await store.readCachedNote(accountId, workspaceId, restoredId))?.deleted,
      true,
    );
    const restored = Promise.withResolvers<void>();
    const restoreStarted = Promise.withResolvers<void>();
    const continueRestore = Promise.withResolvers<void>();
    let reads = 0;
    const restoredStore: LocalStore = {
      ...store,
      readCachedNote: async (...args) => {
        const initial = ++reads === 1;
        const cached = await store.readCachedNote(...args);
        if (initial) {
          restoreStarted.resolve();
          await continueRestore.promise;
          // Apply the accepted restore feed after the deleted read starts,
          // before its watcher can receive events. Keep that old read delayed.
          await store.applyRemoteChanges(
            accountId,
            workspaceId,
            [
              {
                file: {
                  fileId: restoredId,
                  revisionId: crypto.randomUUID(),
                  path: saved.path,
                  fileKind: 'note',
                  document: {
                    kind: 'document',
                    bytes: savedDocument.bytes,
                    epoch: savedDocument.epoch,
                  },
                  deleted: false,
                  digest: await contentDigest(expected),
                  text: expected,
                },
                purgedFileId: null,
              },
            ],
            crypto.randomUUID(),
          );
          restored.resolve();
        }
        return cached;
      },
      subscribe: (listener) => {
        let stopped = false;
        let unsubscribe = (): void => {};
        void restored.promise.then(() => {
          if (!stopped) unsubscribe = store.subscribe(listener);
        });
        return () => {
          stopped = true;
          unsubscribe();
        };
      },
    };
    await render(
      createElement(NoteEditorLoader, {
        store: restoredStore,
        accountId,
        workspaceId,
        fileId: restoredId,
      }),
    );
    await restoreStarted.promise;
    assert.equal(container.querySelector('.cm-editor'), null);
    assert.doesNotMatch(container.textContent ?? '', /is in Trash/);
    assert.equal(
      (await store.listLocalFiles(accountId, workspaceId)).find(
        (file) => file.fileId === restoredId,
      )?.deleted,
      true,
    );
    await act(async () => {
      continueRestore.resolve();
      await restored.promise;
    });
    await waitForEditor(container);
    assert.equal(
      (await store.listLocalFiles(accountId, workspaceId)).find(
        (file) => file.fileId === restoredId,
      )?.deleted,
      false,
    );
    assert.equal(view().state.doc.toString(), expected);
    assert.equal(view().state.readOnly, false);
    assert.doesNotMatch(container.textContent ?? '', /is in Trash/);
    const added = `Recovered edit ${String(cycle + 1)}\n`;
    await act(async () => {
      const current = view();
      current.dispatch({
        changes: { from: current.state.doc.length, insert: added },
        userEvent: 'input.type',
      });
      await flush();
    });
    expected += added;
    assert.equal(view().state.doc.toString(), expected);
    await render(null);
    await act(finishStoreWork);
    await acceptNoteWrites(restoredId);
    assert.equal(
      (await store.readCachedNote(accountId, workspaceId, restoredId))?.text,
      expected,
    );
    const savedState = await store.readFileSaveSnapshot(
      accountId,
      workspaceId,
      restoredId,
    );
    assert.equal(savedState.queueState, null);
    assert.equal(savedState.hasUncheckpointedDraft, false);
  }
  assert.equal(
    (await store.readCachedNote(accountId, workspaceId, sourceId))?.text,
    sourceText,
  );
});

await test('a purge keeps its visible state when the initial loader read finishes late', async () => {
  const purgedId = crypto.randomUUID();
  await store.checkpoint(
    {
      accountId,
      workspaceId,
      fileId: purgedId,
      workingCopyId: crypto.randomUUID(),
      baseRevisionId: null,
      path: 'Purged.md',
      text: '# Purged\n',
      sequence: 1,
      deleted: false,
    },
    null,
    'text',
  );
  const cached = await store.readCachedNote(accountId, workspaceId, purgedId);
  assert.ok(cached !== null);
  const delayed = Promise.withResolvers<typeof cached | null>();
  const listeners = new Set<(change: LocalChange) => void>();
  let reads = 0;
  const purgedStore: LocalStore = {
    ...store,
    readCachedNote: () =>
      ++reads === 1 ? delayed.promise : Promise.resolve(null),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  await render(
    createElement(NoteEditorLoader, {
      store: purgedStore,
      accountId,
      workspaceId,
      fileId: purgedId,
    }),
  );
  await act(async () => {
    for (const listener of [...listeners])
      listener({ kind: 'purge', accountId, workspaceId, fileId: purgedId });
  });
  assert.match(container.textContent ?? '', /This note was deleted/);
  await act(async () => {
    delayed.resolve(cached);
    await delayed.promise;
  });
  assert.match(container.textContent ?? '', /This note was deleted/);
  assert.equal(container.querySelector('.cm-editor'), null);
  await render(null);
});

async function renderFreshNote(noteText: string, path: string): Promise<void> {
  const freshId = crypto.randomUUID();
  await store.checkpoint(
    {
      accountId,
      workspaceId,
      fileId: freshId,
      workingCopyId: crypto.randomUUID(),
      baseRevisionId: null,
      path,
      text: noteText,
      sequence: 1,
      deleted: false,
    },
    null,
    'text',
  );
  await render(
    createElement(NoteEditorLoader, {
      store,
      accountId,
      workspaceId,
      fileId: freshId,
    }),
  );
  await waitForEditor(container);
}

await test('visible toolbar controls undo and redo the open editor text', async () => {
  await renderFreshNote(text, 'Toolbar.md');
  const current = view();
  const undoButton = [...container.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === 'Undo',
  );
  const redoButton = [...container.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === 'Redo',
  );
  assert.ok(undoButton);
  assert.ok(redoButton);
  assert.equal(undoButton.disabled, false);
  assert.equal(undoButton.getAttribute('aria-disabled'), 'true');
  assert.equal(redoButton.disabled, false);
  assert.equal(redoButton.getAttribute('aria-disabled'), 'true');
  assert.equal(undoButton.textContent, '');
  assert.equal(redoButton.textContent, '');
  assert.equal(
    undoButton.querySelector('svg')?.getAttribute('aria-hidden'),
    'true',
  );
  assert.equal(undoButton.tabIndex, 0);
  await act(async () => {
    undoButton.focus();
    undoButton.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
  });
  assert.equal(document.activeElement, redoButton);
  assert.equal(redoButton.tabIndex, 0);
  await act(async () => redoButton.click());
  assert.equal(current.state.doc.toString(), text);

  await act(async () => {
    current.dispatch({
      changes: { from: current.state.doc.length, insert: 'Toolbar edit' },
      userEvent: 'input.type',
    });
  });
  assert.equal(undoButton.getAttribute('aria-disabled'), 'false');
  await act(async () => setEditorReadOnly(current, true));
  assert.equal(undoButton.disabled, false);
  assert.equal(undoButton.getAttribute('aria-disabled'), 'true');
  assert.equal(redoButton.disabled, false);
  assert.equal(redoButton.getAttribute('aria-disabled'), 'true');
  await act(async () => setEditorReadOnly(current, false));
  assert.equal(undoButton.getAttribute('aria-disabled'), 'false');
  await act(async () => undoButton.click());
  assert.equal(current.state.doc.toString(), text);
  assert.equal(redoButton.getAttribute('aria-disabled'), 'false');
  await act(async () => setEditorReadOnly(current, true));
  assert.equal(undoButton.disabled, false);
  assert.equal(undoButton.getAttribute('aria-disabled'), 'true');
  assert.equal(redoButton.disabled, false);
  assert.equal(redoButton.getAttribute('aria-disabled'), 'true');
  await act(async () => setEditorReadOnly(current, false));
  assert.equal(redoButton.getAttribute('aria-disabled'), 'false');
  await act(async () => redoButton.click());
  assert.equal(current.state.doc.toString(), `${text}Toolbar edit`);
  assert.equal(current.hasFocus, true);
  await act(async () => {
    undoButton.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }),
    );
  });
  assert.ok(document.querySelector('[role="tooltip"]'));
  assert.equal(current.hasFocus, true);
  await act(async () =>
    current.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  );
  assert.equal(document.querySelector('[role="tooltip"]'), null);
  assert.equal(current.hasFocus, true);
  await render(null);
  await act(finishStoreWork);
});

await test('the image viewer removes only the selected occurrence and toolbar Undo restores it', async () => {
  const source = '![Map](https://example.invalid/map.png)';
  const imageText = `${source}\n\n${source}\n\nEnd.\n`;
  await renderFreshNote(imageText, 'Images.md');
  const current = view();
  await act(async () => {
    assert.equal(forceParsing(current, current.state.doc.length), true);
    current.dispatch({ selection: { anchor: current.state.doc.length } });
  });
  const imageButtons = container.querySelectorAll(
    'button[aria-label="Open image: Map"]',
  );
  const open = imageButtons[imageButtons.length - 1];
  assert.ok(open instanceof HTMLElement);
  await act(async () => open.click());
  const remove = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === 'Remove',
  );
  assert.ok(remove);
  assert.equal(remove.getAttribute('title'), null);
  await act(async () => remove.click());
  assert.equal(current.state.doc.toString(), `${source}\n\n\n\nEnd.\n`);
  assert.ok(document.body.textContent?.includes('Image removed from note.'));
  assert.equal(current.hasFocus, true);
  const undoButton = [...container.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === 'Undo',
  );
  assert.ok(undoButton);
  await act(async () => undoButton.click());
  assert.equal(current.state.doc.toString(), imageText);
  await render(null);
  await act(finishStoreWork);
});

await test('purge blocks a restore reload queued in the same React batch even when the server returns the note', async () => {
  const purgedId = crypto.randomUUID();
  const noteText = '# Stale server note\n';
  await store.checkpoint(
    {
      accountId,
      workspaceId,
      fileId: purgedId,
      workingCopyId: crypto.randomUUID(),
      baseRevisionId: null,
      path: 'Stale server note.md',
      text: noteText,
      sequence: 1,
      deleted: false,
    },
    null,
    'text',
  );
  const saved = await store.readCachedNote(accountId, workspaceId, purgedId);
  assert.ok(saved !== null && saved.document !== null);
  const revisionId = crypto.randomUUID();
  const instant = '2026-10-25T12:00:00.000Z';
  const served: WorkspaceFile = {
    fileId: purgedId,
    path: saved.path,
    kind: 'note',
    headRevisionId: revisionId,
    createdAt: instant,
    updatedAt: instant,
    head: {
      revisionId,
      fileId: purgedId,
      path: saved.path,
      kind: 'note',
      deleted: false,
      parents: [],
      digest: await contentDigest(noteText),
      size: new TextEncoder().encode(noteText).length,
      text: noteText,
      attachmentObjectId: null,
      message: null,
      restoredFrom: null,
      clientTime: instant,
      serverTime: instant,
      document: Buffer.from(saved.document.bytes).toString('base64'),
      epoch: saved.document.epoch,
      merged: false,
    },
  };
  let restored = false;
  let purged = false;
  const listeners = new Set<(change: LocalChange) => void>();
  const local: LocalStore = {
    ...store,
    readCachedNote: () =>
      Promise.resolve(
        purged ? null : restored ? saved : { ...saved, deleted: true },
      ),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const originalFetch = globalThis.fetch;
  let serverReads = 0;
  globalThis.fetch = () => {
    serverReads += 1;
    return Promise.resolve(Response.json(served));
  };
  try {
    await render(
      createElement(NoteEditorLoader, {
        store: local,
        accountId,
        workspaceId,
        fileId: purgedId,
      }),
    );
    assert.match(container.textContent ?? '', /is in Trash/);
    await act(async () => {
      restored = true;
      for (const listener of [...listeners])
        listener({ kind: 'file', accountId, workspaceId, fileId: purgedId });
      // Let the watch queue readAgain, but keep both callbacks in this batch.
      await Promise.resolve();
      purged = true;
      for (const listener of [...listeners])
        listener({ kind: 'purge', accountId, workspaceId, fileId: purgedId });
    });
    await act(async () => {
      await setImmediate();
    });
    // If the queued request starts, let the successful stale response finish
    // so the assertion observes its effect, rather than cancelling it early.
    if (serverReads > 0) await waitForEditor(container);
    assert.match(container.textContent ?? '', /This note was deleted/);
    assert.equal(container.querySelector('.cm-editor'), null);
    assert.equal(serverReads, 0);
  } finally {
    await render(null);
    await act(finishStoreWork);
    globalThis.fetch = originalFetch;
  }
});

await test('returning to a purged note reaches a terminal state after another note opens', async () => {
  const purgedId = crypto.randomUUID();
  const otherId = crypto.randomUUID();
  let purged = false;
  const listeners = new Set<(change: LocalChange) => void>();
  const local: LocalStore = {
    ...store,
    readCachedNote: (_a, _w, id) =>
      Promise.resolve(
        id === purgedId && purged
          ? null
          : {
              fileId: id,
              path: 'Review.md',
              text: '',
              deleted: true,
              workingCopyId: crypto.randomUUID(),
              sequence: 0,
              baseRevisionId: null,
              stale: false,
              acceptedText: null,
              acceptedPath: null,
              acceptedRevisionId: null,
              document: null,
            },
      ),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(null, { status: 410 }));
  const show = (id: string) =>
    render(
      createElement(NoteEditorLoader, {
        store: local,
        accountId,
        workspaceId,
        fileId: id,
      }),
    );
  try {
    await show(purgedId);
    assert.match(container.textContent ?? '', /is in Trash/);
    await act(async () => {
      purged = true;
      for (const listener of [...listeners])
        listener({ kind: 'purge', accountId, workspaceId, fileId: purgedId });
    });
    assert.match(container.textContent ?? '', /This note was deleted/);
    await show(otherId);
    await act(async () => {
      await setImmediate();
    });
    assert.match(container.textContent ?? '', /is in Trash/);
    await show(purgedId);
    await act(async () => {
      await setImmediate();
    });
    assert.match(container.textContent ?? '', /This note was deleted/);
  } finally {
    await render(null);
    globalThis.fetch = originalFetch;
  }
});

/** Abort real IndexedDB reads on one test connection, after it has opened. */
async function readerWithAborts(control: {
  remaining: number;
  aborted: number;
}): Promise<LocalStore> {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    storageOptions.indexedDB,
    'open',
  );
  const originalOpen = storageOptions.indexedDB.open.bind(
    storageOptions.indexedDB,
  );
  storageOptions.indexedDB.open = (...args: Parameters<IDBFactory['open']>) => {
    const request = originalOpen(...args);
    request.addEventListener('success', () => {
      const database = request.result;
      const originalTransaction = database.transaction.bind(database);
      database.transaction = (
        ...parameters: Parameters<IDBDatabase['transaction']>
      ) => {
        const transaction = originalTransaction(...parameters);
        if (
          control.remaining > 0 &&
          parameters[1] === 'readonly' &&
          transaction.objectStoreNames.contains('documents') &&
          transaction.objectStoreNames.contains('drafts')
        ) {
          control.remaining -= 1;
          control.aborted += 1;
          queueMicrotask(() => transaction.abort());
        }
        return transaction;
      };
    });
    return request;
  };
  try {
    return await openLocalStore('http://localhost', storageOptions);
  } finally {
    if (originalDescriptor === undefined)
      Reflect.deleteProperty(storageOptions.indexedDB, 'open');
    else
      Object.defineProperty(
        storageOptions.indexedDB,
        'open',
        originalDescriptor,
      );
  }
}

for (const missing of [
  'absent',
  'null',
  'present',
  'read abort',
  'repeated read abort',
] as const) {
  const label =
    missing === 'read abort'
      ? 'a restored note retries an aborted cached read'
      : missing === 'repeated read abort'
        ? 'a restored note falls back to the server after repeated cached read aborts'
        : `a restored note recovers when cached text is ${missing}`;
  await test(label, async () => {
    const restoredText = `# Cache recovery ${missing}\n`;
    const restoredId = await duplicateNote(store, {
      accountId,
      workspaceId,
      path: 'Cache recovery.md',
      text: restoredText,
      takenPaths: ['Cache recovery.md'],
    });
    const saved = await store.readCachedNote(
      accountId,
      workspaceId,
      restoredId,
    );
    assert.ok(saved !== null && saved.document !== null);
    await acceptNoteWrites(restoredId);
    assert.equal(
      (
        await deleteNotes(store, accountId, workspaceId, [
          { fileId: restoredId, name: 'Cache recovery copy' },
        ])
      ).ok,
      true,
    );
    await acceptNoteWrites(restoredId);
    const aborts = { remaining: 0, aborted: 0 };
    const reader = trackStoreWork(await readerWithAborts(aborts));
    const { db, tables } = createDatabase(
      storageOptions.databaseName,
      storageOptions,
    );
    await db.open();
    const digest = await contentDigest(restoredText);
    const revisionId = crypto.randomUUID();
    const instant = '2026-10-25T20:41:11.610Z';
    const served: WorkspaceFile = {
      fileId: restoredId,
      path: saved.path,
      kind: 'note',
      headRevisionId: revisionId,
      createdAt: instant,
      updatedAt: instant,
      head: {
        revisionId,
        fileId: restoredId,
        path: saved.path,
        kind: 'note',
        deleted: false,
        parents: [],
        digest,
        size: new TextEncoder().encode(restoredText).length,
        text: restoredText,
        attachmentObjectId: null,
        message: null,
        restoredFrom: null,
        clientTime: instant,
        serverTime: instant,
        document: Buffer.from(saved.document.bytes).toString('base64'),
        epoch: saved.document.epoch,
        merged: false,
      },
    };
    const originalFetch = globalThis.fetch;
    let serverReads = 0;
    globalThis.fetch = () => {
      serverReads += 1;
      return Promise.resolve(Response.json(served));
    };
    const received = Promise.withResolvers<void>();
    const stop = reader.subscribe((change) => {
      if (change.fileId === restoredId && change.kind === 'file')
        received.resolve();
    });
    try {
      await render(
        createElement(NoteEditorLoader, {
          store: reader,
          accountId,
          workspaceId,
          fileId: restoredId,
        }),
      );
      const deadline = Date.now() + 10_000;
      while (!(container.textContent ?? '').includes('is in Trash')) {
        if (Date.now() > deadline)
          assert.fail('The deleted note did not finish loading.');
        await act(async () => {
          await setImmediate();
        });
      }
      assert.match(container.textContent ?? '', /is in Trash/);
      const key: [string, string, string, string] = [
        'http://localhost',
        accountId,
        workspaceId,
        digest,
      ];
      if (missing === 'absent') await tables.contents.delete(key);
      else if (missing === 'null') {
        const content = await tables.contents.get(key);
        assert.ok(content);
        await tables.contents.put({
          ...content,
          text: null,
          bytes: new Blob([restoredText]),
        });
      }
      aborts.remaining =
        missing === 'read abort'
          ? 1
          : missing === 'repeated read abort'
            ? 2
            : 0;
      await act(async () => {
        // This is the real LocalStore transaction and cross-instance channel,
        // not a manually delivered watcher callback. The metadata-only restore
        // retains the complete document but supplies no cached Markdown body.
        await store.applyRemoteChanges(
          accountId,
          workspaceId,
          [
            {
              file: {
                fileId: restoredId,
                revisionId,
                path: saved.path,
                fileKind: 'note',
                document: null,
                deleted: false,
                digest,
                text: null,
              },
              purgedFileId: null,
            },
          ],
          crypto.randomUUID(),
        );
        await received.promise;
        if (
          missing === 'present' ||
          missing === 'absent' ||
          missing === 'null'
        ) {
          const cached = await reader.readCachedNote(
            accountId,
            workspaceId,
            restoredId,
          );
          if (missing === 'present') assert.equal(cached?.deleted, false);
          else assert.equal(cached, null);
        }
      });
      await act(async () => {
        assert.equal(
          (await reader.listLocalFiles(accountId, workspaceId)).find(
            (row) => row.fileId === restoredId,
          )?.deleted,
          false,
        );
        assert.deepEqual(
          await reader.readNoteDocument(accountId, workspaceId, restoredId),
          saved.document,
        );
      });
      try {
        await waitForEditor(container);
      } catch {
        assert.fail(
          `Restore stalled: variant=${missing}; UI=${container.textContent}; serverReads=${String(serverReads)}`,
        );
      }
      if (missing === 'present' || missing === 'read abort')
        assert.equal(serverReads, 0);
      else assert.ok(serverReads > 0);
      assert.equal(
        aborts.aborted,
        missing === 'read abort'
          ? 1
          : missing === 'repeated read abort'
            ? 2
            : 0,
      );
      assert.equal(view().state.doc.toString(), restoredText);
      assert.equal(view().state.readOnly, false);
      const edited = `${restoredText}Edited after restore\n`;
      await act(async () => {
        const current = view();
        current.dispatch({
          changes: {
            from: current.state.doc.length,
            insert: 'Edited after restore\n',
          },
          userEvent: 'input.type',
        });
        await flush();
      });
      assert.equal(view().state.doc.toString(), edited);
      await act(async () => {
        assert.equal(
          (await reader.readCachedNote(accountId, workspaceId, restoredId))
            ?.text,
          edited,
        );
      });
    } finally {
      stop();
      await render(null);
      await act(finishStoreWork);
      globalThis.fetch = originalFetch;
      await reader.close();
      db.close();
    }
  });
}

after(async () => {
  await act(async () => root.unmount());
  await act(finishStoreWork);
  await store.close();
  await browser.happyDOM.close();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  hooks.deregister();
});
