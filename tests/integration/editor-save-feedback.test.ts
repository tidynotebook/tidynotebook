import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { Window } from 'happy-dom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
  act,
  createElement,
  StrictMode,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { MemoryRouter } from 'react-router';
import { contentDigest, type AcceptedChangeset } from '@notesapp/core';
import { openLocalStore } from '@notesapp/storage-browser';

await test('the open note stays pending from first edit through draft and checkpoint until acknowledgement', async () => {
  const hooks = registerHooks({
    load(url, context, next) {
      if (url.endsWith('.css'))
        return { format: 'module', source: '', shortCircuit: true };
      return next(url, context);
    },
  });
  const browser = new Window({ url: 'http://localhost/' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const name of [
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
  ] as const) {
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
  const { NoteEditorLoader } =
    await import('../../apps/web/dist/features/editor/note-loader.js');
  const { NoteSaveScope, useNoteSaveFact, useFlushNoteDraft } =
    await import('../../apps/web/dist/features/editor/save-status.js');
  const { HeaderSlotProvider, HeaderLeafSlot } =
    await import('../../apps/web/dist/shell/header-slot.js');
  const { syncFooter } = await import('../../apps/web/dist/lib/sync-state.js');
  const { useNoteSaveFacts } =
    await import('../../apps/web/dist/features/editor/note-save-facts.js');
  const { createMountedRead } =
    await import('../../apps/web/dist/lib/coalesced-read.js');
  const local = await openLocalStore('http://localhost', {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    databaseName: crypto.randomUUID(),
  });
  const pending = new Set<Promise<unknown>>();
  const store = new Proxy(local, {
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
  async function settle(): Promise<void> {
    do {
      await Promise.allSettled([...pending]);
      await setImmediate();
    } while (pending.size > 0);
  }
  const accountId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const fileId = crypto.randomUUID();
  async function acknowledge(): Promise<void> {
    for (const entry of await store.pending(accountId, workspaceId)) {
      const revisions: AcceptedChangeset['revisions'] = await Promise.all(
        entry.input.revisions.map(async (revision) => {
          const text = await store.readRevisionText(
            accountId,
            workspaceId,
            revision.id,
          );
          assert.ok(text !== null);
          return {
            revisionId: revision.id,
            fileId: revision.fileId,
            parents: revision.parents,
            path: revision.path,
            deleted: revision.deleted,
            digest: await contentDigest(text),
            size: new TextEncoder().encode(text).length,
            actorAccountId: accountId,
            serverTime: '2026-10-25T12:00:00.000Z',
            message: revision.message,
            epoch: revision.content.kind === 'markdown' ? 1 : null,
            acceptedState: null,
            merged: false,
          };
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
  let flushDraft = () => Promise.resolve();
  const states: boolean[] = [];
  function Footer(): ReactNode {
    const openNotePending = useNoteSaveFact(
      (report) => report?.pendingSave ?? false,
    );
    const openNoteWriteFailed = useNoteSaveFact(
      (report) => report?.localWriteFailed ?? false,
    );
    flushDraft = useFlushNoteDraft();
    states.push(openNotePending);
    return createElement(
      'output',
      null,
      syncFooter({
        state: { kind: 'in-step' },
        online: true,
        noteName: null,
        openNotePending,
        openNoteWriteFailed,
      }).line,
    );
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  async function waitFor(condition: () => boolean): Promise<void> {
    const deadline = Date.now() + 5000;
    while (true) {
      let ready = false;
      await act(async () => {
        await settle();
        ready = condition();
      });
      if (ready) return;
      assert.ok(Date.now() < deadline, 'The save feedback did not settle.');
    }
  }
  async function openEditor(source = store): Promise<void> {
    await act(async () =>
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(
            NoteSaveScope,
            null,
            createElement(Footer),
            createElement(
              HeaderSlotProvider,
              null,
              createElement(HeaderLeafSlot),
              createElement(NoteEditorLoader, {
                store: source,
                accountId,
                workspaceId,
                fileId,
              }),
            ),
          ),
        ),
      ),
    );
  }
  try {
    await store.checkpoint(
      {
        accountId,
        workspaceId,
        fileId,
        workingCopyId: crypto.randomUUID(),
        baseRevisionId: null,
        path: 'Save feedback.md',
        text: 'Saved text.\n',
        sequence: 1,
        deleted: false,
      },
      null,
      'text',
    );
    await acknowledge();
    await openEditor();
    const output = (): string =>
      container.querySelector('output')?.textContent ?? '';
    await waitFor(
      () =>
        output() === 'Everything is saved to the server.' &&
        container.querySelector('.cm-editor') !== null,
    );
    const element = container.querySelector('.cm-editor');
    assert.ok(element instanceof HTMLElement);
    const view = EditorView.findFromDOM(element);
    assert.ok(view);
    const edit = async (insert: string): Promise<void> => {
      await act(async () =>
        view.dispatch({
          changes: { from: view.state.doc.length, insert },
          userEvent: 'input.type',
        }),
      );
    };
    await edit('First edit.');
    assert.equal(output(), 'Saving the open note to the server.');
    assert.equal((await store.pending(accountId, workspaceId)).length, 0);
    const renders = states.length;
    await edit(' More text.');
    assert.equal(
      states.length,
      renders,
      'Further keys must not render the footer.',
    );
    await act(async () => {
      await flushDraft();
      await settle();
    });
    assert.equal(
      (await store.readFileSaveSnapshot(accountId, workspaceId, fileId))
        .hasUncheckpointedDraft,
      true,
    );
    assert.equal((await store.pending(accountId, workspaceId)).length, 0);
    assert.equal(output(), 'Saving the open note to the server.');
    const checkpoint = async (): Promise<void> => {
      await act(async () => {
        view.contentDOM.dispatchEvent(
          new KeyboardEvent('keydown', {
            bubbles: true,
            key: 's',
            ctrlKey: true,
          }),
        );
        await settle();
      });
      assert.ok((await store.pending(accountId, workspaceId)).length > 0);
    };
    await checkpoint();
    assert.equal(output(), 'Saving the open note to the server.');
    // An acknowledgement for the first checkpoint must not claim that a later edit reached the server.
    await edit(' Later edit.');
    await act(async () => {
      await acknowledge();
      await settle();
    });
    assert.equal(output(), 'Saving the open note to the server.');
    await checkpoint();
    await act(async () => {
      await acknowledge();
      await settle();
    });
    await waitFor(() => output() === 'Everything is saved to the server.');
    await act(async () => {
      assert.equal(
        (await store.readCachedNote(accountId, workspaceId, fileId))?.text,
        view.state.doc.toString(),
      );
      await settle();
    });
    await act(async () => root.render(null));
    await act(settle);

    // A page can leave a durable draft before its old asynchronous checkpoint
    // commits. Reopening it must queue that work without another edit or exit.
    const accepted = await store.readCachedNote(accountId, workspaceId, fileId);
    assert.ok(accepted);
    assert.ok(accepted.baseRevisionId !== null);
    const recoveredText = `${accepted.text}Recovered before checkpoint.\n`;
    await store.saveDraft({
      accountId,
      workspaceId,
      fileId,
      workingCopyId: crypto.randomUUID(),
      baseRevisionId: accepted.baseRevisionId,
      path: accepted.path,
      text: recoveredText,
      sequence: 20,
      deleted: false,
    });
    assert.equal((await store.pending(accountId, workspaceId)).length, 0);
    let observedRecovery = false;
    let recoveryFactsRead = false;
    let recoveryCheckpoints = 0;
    const recoveryStore = {
      ...store,
      listCheckpoints: async (
        ...args: Parameters<typeof store.listCheckpoints>
      ) => {
        const checkpoints = await store.listCheckpoints(...args);
        recoveryFactsRead = true;
        return checkpoints;
      },
      readFileSaveSnapshot: async (
        ...args: Parameters<typeof store.readFileSaveSnapshot>
      ) => {
        const snapshot = await store.readFileSaveSnapshot(...args);
        if (snapshot.hasUncheckpointedDraft) observedRecovery = true;
        return snapshot;
      },
      checkpoint: async (...args: Parameters<typeof store.checkpoint>) => {
        const result = await store.checkpoint(...args);
        recoveryCheckpoints += 1;
        return result;
      },
    };
    await openEditor(recoveryStore);
    await waitFor(() => container.querySelector('.cm-editor') !== null);
    await waitFor(() => observedRecovery && recoveryFactsRead);
    await act(settle);
    assert.equal(output(), 'Saving the open note to the server.');
    await waitFor(() => recoveryCheckpoints > 0);
    const recoveredElement = container.querySelector('.cm-editor');
    assert.ok(recoveredElement instanceof HTMLElement);
    const recoveredView = EditorView.findFromDOM(recoveredElement);
    assert.ok(recoveredView);
    assert.equal(recoveredView.state.doc.toString(), recoveredText);
    assert.equal(
      (await store.readFileSaveSnapshot(accountId, workspaceId, fileId))
        .queueState,
      'pending',
    );
    assert.equal(output(), 'Saving the open note to the server.');
    assert.equal(
      (await store.readFileSaveSnapshot(accountId, workspaceId, fileId))
        .acceptedHeadRevisionId,
      accepted.baseRevisionId,
    );
    assert.equal(
      await store.readRevisionText(
        accountId,
        workspaceId,
        accepted.baseRevisionId,
      ),
      accepted.text,
    );
    await act(async () => {
      await acknowledge();
      await settle();
    });
    await waitFor(() => output() === 'Everything is saved to the server.');
    await act(async () => {
      const recoveredState = await store.readFileSaveSnapshot(
        accountId,
        workspaceId,
        fileId,
      );
      assert.equal(recoveredState.hasUncheckpointedDraft, false);
      assert.equal(
        recoveredState.acceptedHeadRevisionId,
        recoveredState.localHeadRevisionId,
      );
      assert.ok(recoveredState.acceptedHeadRevisionId !== null);
      assert.equal(
        await store.readRevisionText(
          accountId,
          workspaceId,
          recoveredState.acceptedHeadRevisionId,
        ),
        recoveredText,
      );
      assert.equal(
        (await store.readCachedNote(accountId, workspaceId, fileId))?.text,
        recoveredText,
      );
      await settle();
    });
    assert.equal(recoveryCheckpoints, 1);
    await act(async () => root.render(null));
    await act(settle);
    await openEditor(recoveryStore);
    await waitFor(
      () =>
        output() === 'Everything is saved to the server.' &&
        container.querySelector('.cm-editor') !== null,
    );
    assert.equal((await store.pending(accountId, workspaceId)).length, 0);
    assert.equal(
      recoveryCheckpoints,
      1,
      'An accepted recovered draft must not create another version on reopen.',
    );
    await act(async () => root.render(null));
    await act(settle);

    // Mount the actual save-facts reader under StrictMode. It stops and
    // restarts the effect scheduler while the first real cache read waits.
    // Match the loader's cached read before testing its clean save facts.
    await store.readCachedNote(accountId, workspaceId, fileId);
    assert.equal(
      (await store.readFileSaveSnapshot(accountId, workspaceId, fileId))
        .hasUncheckpointedDraft,
      false,
    );
    const staleReadStarted = Promise.withResolvers<void>();
    const finishStaleRead = Promise.withResolvers<void>();
    let firstSnapshot = true;
    const controlledStore = {
      ...store,
      readFileSaveSnapshot: async (
        ...args: Parameters<typeof store.readFileSaveSnapshot>
      ) => {
        const hold = firstSnapshot;
        firstSnapshot = false;
        const snapshot = await store.readFileSaveSnapshot(...args);
        if (hold) {
          staleReadStarted.resolve();
          await finishStaleRead.promise;
        }
        return snapshot;
      },
    };
    const readers: {
      sequence: { current: number };
      facts: ReturnType<typeof useNoteSaveFacts>;
      ask: () => void;
    }[] = [];
    function SnapshotReader(): ReactNode {
      const sequence = useRef(5);
      const facts = useNoteSaveFacts(sequence, 5);
      const factsRef = useRef(facts);
      factsRef.current = facts;
      const scheduler = useMemo(
        () =>
          createMountedRead(async () => {
            const current = factsRef.current;
            const snapshot = await current.readSnapshot({
              store: controlledStore,
              accountId,
              workspaceId,
              fileId,
            });
            if (snapshot !== null) current.showSaveFacts.current();
          }),
        [],
      );
      useEffect(() => {
        const stop = scheduler.mount();
        scheduler.ask();
        return stop;
      }, [scheduler]);
      readers.push({ sequence, facts, ask: scheduler.ask });
      return createElement('div', { ref: facts.rootRef });
    }
    try {
      await act(async () =>
        root.render(
          createElement(
            StrictMode,
            null,
            createElement(
              NoteSaveScope,
              null,
              createElement(Footer),
              createElement(SnapshotReader),
            ),
          ),
        ),
      );
      await staleReadStarted.promise;
      await waitFor(() => output() === 'Everything is saved to the server.');
      const reader = readers.at(-1);
      assert.ok(reader);
      const cached = await store.readCachedNote(accountId, workspaceId, fileId);
      assert.ok(cached);
      await act(async () => {
        reader.sequence.current = 6;
        reader.facts.writtenSequenceRef.current = 6;
        reader.facts.showSaveFacts.current();
        await store.checkpoint(
          {
            accountId,
            workspaceId,
            fileId,
            workingCopyId: crypto.randomUUID(),
            baseRevisionId: cached.baseRevisionId,
            path: 'Latest snapshot.md',
            text: `${cached.text}Latest snapshot.\n`,
            sequence: 6,
            deleted: false,
          },
          null,
          'text',
        );
        reader.facts.checkpointTaken(6);
        await acknowledge();
        reader.ask();
        await settle();
      });
      await waitFor(() => output() === 'Everything is saved to the server.');
      assert.equal(
        (await store.readFileSaveSnapshot(accountId, workspaceId, fileId))
          .queueState,
        null,
      );
      await act(async () => {
        finishStaleRead.resolve();
        await settle();
      });
      assert.equal(
        output(),
        'Everything is saved to the server.',
        'An obsolete read from the stopped effect must not replace newer saved facts.',
      );
    } finally {
      finishStaleRead.resolve();
      await act(settle);
    }
  } finally {
    await act(async () => root.unmount());
    await act(settle);
    await store.close();
    await browser.happyDOM.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    hooks.deregister();
  }
});
