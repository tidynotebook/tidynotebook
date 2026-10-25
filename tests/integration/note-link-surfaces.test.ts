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
import { openLocalStore } from '@notesapp/storage-browser';
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
const { NoteEditor } =
  await import('../../apps/web/dist/features/editor/note-editor.js');
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
const localStore = await openLocalStore('http://localhost', {
  indexedDB: new IDBFactory(),
  IDBKeyRange,
  databaseName: `link-surfaces-${crypto.randomUUID()}`,
});
// Unmount starts writes without returning their promises. Track the real
// store operations so cleanup waits for append, draft, and checkpoint work.
const pendingStoreWork = new Set<Promise<unknown>>();
const store = new Proxy(localStore, {
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
    assert.doesNotMatch(
      container.textContent ?? '',
      /Note deleted on this device/,
    );
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
  assert.match(container.textContent ?? '', /Note deleted on this device/);
  await act(async () => {
    restored = true;
    for (const listener of [...listeners])
      listener({ kind: 'file', accountId, workspaceId, fileId: restoredId });
  });
  await rereadStarted.promise;
  assert.equal(container.querySelector('.cm-editor'), null);
  assert.doesNotMatch(
    container.textContent ?? '',
    /Note deleted on this device/,
  );
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
    assert.doesNotMatch(
      container.textContent ?? '',
      /Note deleted on this device/,
    );
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
    assert.doesNotMatch(
      container.textContent ?? '',
      /Note deleted on this device/,
    );
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
  assert.match(container.textContent ?? '', /Note deleted permanently/);
  await act(async () => {
    delayed.resolve(cached);
    await delayed.promise;
  });
  assert.match(container.textContent ?? '', /Note deleted permanently/);
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
    (button) => button.textContent === 'Undo',
  );
  const redoButton = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Redo',
  );
  assert.ok(undoButton);
  assert.ok(redoButton);
  assert.equal(undoButton.disabled, true);
  assert.equal(redoButton.disabled, true);
  await act(async () => {
    current.dispatch({
      changes: { from: current.state.doc.length, insert: 'Toolbar edit' },
      userEvent: 'input.type',
    });
  });
  assert.equal(undoButton.disabled, false);
  await act(async () => undoButton.click());
  assert.equal(current.state.doc.toString(), text);
  assert.equal(redoButton.disabled, false);
  await act(async () => redoButton.click());
  assert.equal(current.state.doc.toString(), `${text}Toolbar edit`);
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
    (button) => button.textContent === 'Remove image',
  );
  assert.ok(remove);
  assert.match(
    document.body.textContent ?? '',
    /removes this reference from this note/,
  );
  await act(async () => remove.click());
  assert.equal(current.state.doc.toString(), `${source}\n\n\n\nEnd.\n`);
  assert.equal(current.hasFocus, true);
  const undoButton = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Undo',
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
    assert.match(container.textContent ?? '', /Note deleted on this device/);
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
    assert.match(container.textContent ?? '', /Note deleted permanently/);
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
    assert.match(container.textContent ?? '', /Note deleted on this device/);
    await act(async () => {
      purged = true;
      for (const listener of [...listeners])
        listener({ kind: 'purge', accountId, workspaceId, fileId: purgedId });
    });
    assert.match(container.textContent ?? '', /Note deleted permanently/);
    await show(otherId);
    await act(async () => {
      await setImmediate();
    });
    assert.match(container.textContent ?? '', /Note deleted on this device/);
    await show(purgedId);
    await act(async () => {
      await setImmediate();
    });
    assert.match(container.textContent ?? '', /Note deleted permanently/);
  } finally {
    await render(null);
    globalThis.fetch = originalFetch;
  }
});

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
