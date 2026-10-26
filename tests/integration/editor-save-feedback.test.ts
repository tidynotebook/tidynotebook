import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { Window } from 'happy-dom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
  act,
  Activity,
  createElement,
  Fragment,
  StrictMode,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { MemoryRouter } from 'react-router';
import { contentDigest, type AcceptedChangeset } from '@notesapp/core';
import { openLocalStore } from '@notesapp/storage-browser';
import { LocalStorageError } from '@notesapp/sync';
import {
  startDocument,
  readDocumentText,
  replaceDocumentText,
  applyDocumentUpdate,
  encodeDocumentDelta,
  documentStateVector,
} from '@notesapp/note-document';

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
  const { watchDeviceNote } =
    await import('../../apps/web/dist/features/editor/device-note.js');
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
  let fileId = crypto.randomUUID();
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
  async function openEditor(source = store, strict = false): Promise<void> {
    await act(async () =>
      root.render(
        createElement(
          strict ? StrictMode : Fragment,
          null,
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
    const output = (): string =>
      container.querySelector('output')?.textContent ?? '';
    // StrictMode replays the real editor's exit and mount. A no-op exit
    // must keep the proof of the accepted version, not make unsent work.
    await openEditor(store, true);
    await waitFor(
      () =>
        output() === 'Everything is saved to the server.' &&
        container.querySelector('.cm-editor') !== null,
    );
    assert.equal(
      (await store.readFileSaveSnapshot(accountId, workspaceId, fileId))
        .hasUncheckpointedDraft,
      false,
    );
    await act(async () => root.render(null));
    await act(settle);
    assert.equal(
      (await store.readFileSaveSnapshot(accountId, workspaceId, fileId))
        .hasUncheckpointedDraft,
      false,
    );
    assert.equal((await store.pending(accountId, workspaceId)).length, 0);
    await openEditor();
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
    // Two independent edits join on the server. Its accepted text differs
    // from the immutable local checkpoint kept for Review. The remote join
    // writes a fresh recovery draft after the feed dropped the submitted one.
    const forkBase = await store.readNoteDocument(
      accountId,
      workspaceId,
      fileId,
    );
    assert.ok(forkBase);
    const profileA = replaceDocumentText(
      forkBase.bytes,
      `${readDocumentText(forkBase.bytes)}Profile A accepted text.\n`,
    );
    assert.ok(profileA.ok);
    const submittedB = 'Profile B submitted text.\n';
    await act(async () => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: submittedB },
        userEvent: 'input.type',
      });
      await settle();
    });
    await checkpoint();
    const mergeEntry = (await store.pending(accountId, workspaceId))[0];
    assert.ok(mergeEntry);
    const submitted = mergeEntry.input.revisions[0];
    assert.ok(submitted);
    const profileB = await store.readNoteDocument(
      accountId,
      workspaceId,
      fileId,
    );
    assert.ok(profileB);
    const joined = applyDocumentUpdate(
      profileA.value.document,
      encodeDocumentDelta(
        profileB.bytes,
        documentStateVector(profileA.value.document),
      ),
    );
    assert.ok(joined.ok);
    const mergedDocument = joined.value.document;
    const mergedText = readDocumentText(mergedDocument);
    assert.ok(mergedText.includes('Profile A accepted text.'));
    assert.ok(mergedText.includes('Profile B submitted text.'));
    const mergedDigest = await contentDigest(mergedText);
    await act(async () => {
      await store.acknowledge(accountId, {
        mutationId: mergeEntry.input.mutationId,
        revisionIds: [submitted.id],
        cursor: 'merged-receipt',
        superseded: [],
        revisions: [
          {
            revisionId: submitted.id,
            fileId,
            parents: submitted.parents,
            path: submitted.path,
            deleted: false,
            digest: mergedDigest,
            size: new TextEncoder().encode(mergedText).length,
            actorAccountId: accountId,
            serverTime: '2026-10-26T12:14:14.935Z',
            message: null,
            epoch: 1,
            acceptedState: mergedDocument,
            merged: true,
          },
        ],
      });
      await store.applyRemoteChanges(
        accountId,
        workspaceId,
        [
          {
            file: {
              fileId,
              revisionId: submitted.id,
              path: submitted.path,
              fileKind: 'note',
              document: { kind: 'document', bytes: mergedDocument, epoch: 1 },
              deleted: false,
              digest: mergedDigest,
              text: mergedText,
            },
            purgedFileId: null,
          },
        ],
        'merged-feed',
      );
      await settle();
    });
    assert.equal(view.state.doc.toString(), mergedText);
    assert.equal((await store.pending(accountId, workspaceId)).length, 0);
    const mergedCheckpoint = (
      await store.listCheckpoints(accountId, workspaceId, fileId)
    ).find((entry) => entry.revisionId === submitted.id);
    assert.ok(mergedCheckpoint);
    assert.equal(mergedCheckpoint.digest, await contentDigest(submittedB));
    assert.equal(
      await store.readRevisionText(accountId, workspaceId, submitted.id),
      submittedB,
    );
    const mergedDraft = await store.readDraft(
      accountId,
      workspaceId,
      mergedCheckpoint.workingCopyId,
    );
    assert.equal(mergedDraft?.text, mergedText);
    const mergedSnapshot = await store.readFileSaveSnapshot(
      accountId,
      workspaceId,
      fileId,
    );
    assert.equal(mergedSnapshot.acceptedHeadRevisionId, submitted.id);
    assert.equal(mergedSnapshot.localHeadRevisionId, submitted.id);
    assert.equal(
      mergedSnapshot.hasUncheckpointedDraft,
      false,
      'A canonical merged draft already accepted by the server is not pending work.',
    );
    assert.ok(mergedDraft);
    assert.equal(
      await store.checkpoint(mergedDraft, null, { kind: 'document', epoch: 1 }),
      null,
    );
    assert.equal(
      (await store.readFileSaveSnapshot(accountId, workspaceId, fileId))
        .hasUncheckpointedDraft,
      false,
      'The retained unmerged checkpoint must not override canonical acceptance.',
    );
    await waitFor(() => output() === 'Everything is saved to the server.');
    // Newer local text must remain pending despite the prior merged receipt.
    await edit('New work after the merged receipt.');
    await act(async () => {
      await flushDraft();
      await settle();
    });
    assert.equal(
      (await store.readFileSaveSnapshot(accountId, workspaceId, fileId))
        .hasUncheckpointedDraft,
      true,
    );
    assert.equal(output(), 'Saving the open note to the server.');
    await checkpoint();
    await act(async () => {
      await acknowledge();
      await settle();
    });
    await waitFor(() => output() === 'Everything is saved to the server.');
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
    let recoveryAttempts = 0;
    let recoveryPoll: (() => void) | undefined;
    const setInterval = window.setInterval;
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
        recoveryAttempts += 1;
        if (recoveryAttempts === 1)
          throw new LocalStorageError(
            'aborted',
            'forced recovery checkpoint failure',
          );
        const result = await store.checkpoint(...args);
        recoveryCheckpoints += 1;
        return result;
      },
    };
    window.setInterval = new Proxy(setInterval, {
      apply(target, receiver, args: unknown[]) {
        const [handler, delay] = args;
        if (typeof handler === 'function' && delay === 30_000)
          recoveryPoll = () => {
            Reflect.apply(handler, receiver, args.slice(2));
          };
        return Reflect.apply(target, receiver, args);
      },
    });
    try {
      await openEditor(recoveryStore);
      await waitFor(() => container.querySelector('.cm-editor') !== null);
    } finally {
      window.setInterval = setInterval;
    }
    await waitFor(() => observedRecovery && recoveryFactsRead);
    await act(settle);
    assert.equal(output(), 'Saving the open note to the server.');
    await waitFor(() => recoveryAttempts === 1);
    await act(settle);
    assert.equal(recoveryCheckpoints, 0);
    assert.equal((await store.pending(accountId, workspaceId)).length, 0);
    const pollRecovery = recoveryPoll;
    assert.ok(pollRecovery);
    await act(async () => {
      pollRecovery();
      await settle();
    });
    await waitFor(() => recoveryCheckpoints > 0);
    assert.equal(recoveryAttempts, 2);
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
    await act(async () => {
      pollRecovery();
      await settle();
    });
    assert.equal(
      recoveryAttempts,
      2,
      'A successful claim must survive later polls.',
    );
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

    // A stale draft must not enter the editor and alter the accepted
    // document before its owner chooses to keep or discard it.
    async function openStaleDraft(
      source = store,
      covered = false,
    ): Promise<{
      copy: string;
      remote: string;
      remoteText: string;
      localText: string;
    }> {
      // Give each choice its own note, so older working copies from the
      // save lifecycle above cannot become another recovery candidate.
      fileId = crypto.randomUUID();
      const seedCopy = crypto.randomUUID();
      await store.checkpoint(
        {
          accountId,
          workspaceId,
          fileId,
          workingCopyId: seedCopy,
          baseRevisionId: null,
          path: `${fileId}.md`,
          text: 'First accepted text.\n',
          sequence: 1,
          deleted: false,
        },
        null,
        'text',
      );
      await acknowledge();
      await store.dropDraft(accountId, workspaceId, seedCopy);
      const before = await store.readCachedNote(accountId, workspaceId, fileId);
      assert.ok(before?.baseRevisionId);
      const copy = crypto.randomUUID();
      const localText = `Local draft ${copy}.\n`;
      await store.saveDraft({
        accountId,
        workspaceId,
        fileId,
        workingCopyId: copy,
        baseRevisionId: before.baseRevisionId,
        path: before.path,
        text: localText,
        documentVector: covered
          ? documentStateVector(startDocument(''))
          : undefined,
        sequence: 40,
        deleted: false,
      });
      const remote = crypto.randomUUID();
      const remoteText = `Accepted text ${remote}.\n`;
      await store.applyRemoteChanges(
        accountId,
        workspaceId,
        [
          {
            file: {
              fileId,
              revisionId: remote,
              path: before.path,
              fileKind: 'note',
              document: {
                kind: 'document',
                bytes: startDocument(remoteText),
                epoch: 1,
              },
              deleted: false,
              digest: await contentDigest(remoteText),
              text: remoteText,
            },
            purgedFileId: null,
          },
        ],
        'remote',
      );
      assert.equal(
        (await store.readCachedNote(accountId, workspaceId, fileId))?.stale,
        true,
      );
      await openEditor(source, true);
      await waitFor(
        () => container.textContent?.includes('Recover local draft') === true,
      );
      await act(settle);
      assert.equal(container.querySelector('.cm-editor'), null);
      assert.equal((await store.pending(accountId, workspaceId)).length, 0);
      assert.equal(
        (await store.readDraft(accountId, workspaceId, copy))?.text,
        localText,
      );
      const document = await store.readNoteDocument(
        accountId,
        workspaceId,
        fileId,
      );
      assert.ok(document);
      assert.equal(readDocumentText(document.bytes), remoteText);
      assert.equal(output(), 'Saving the open note to the server.');
      return { copy, remote, remoteText, localText };
    }
    let writeDuringDiscard: (() => Promise<void>) | undefined;
    const discardingStore = {
      ...store,
      dropDraft: async (...args: Parameters<typeof store.dropDraft>) => {
        const write = writeDuringDiscard;
        writeDuringDiscard = undefined;
        if (write) await write();
        return store.dropDraft(...args);
      },
    };
    const discarded = await openStaleDraft(discardingStore);
    const newerDuringDiscard = `${discarded.localText}Newer same-copy work.\n`;
    writeDuringDiscard = async () => {
      const current = await store.readDraft(
        accountId,
        workspaceId,
        discarded.copy,
      );
      assert.ok(current);
      await store.saveDraft({
        ...current,
        text: newerDuringDiscard,
        sequence: current.sequence + 1,
      });
    };
    const watchedHeads: (string | null)[] = [];
    const stopWatching = watchDeviceNote(
      store,
      { accountId, workspaceId, fileId },
      (note) => {
        watchedHeads.push(note?.baseRevisionId ?? null);
      },
      () => {},
    );
    await waitFor(() => watchedHeads.length > 0);
    assert.notEqual(watchedHeads.at(-1), discarded.remote);
    const discard = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Use saved version',
    );
    assert.ok(discard);
    await act(async () => {
      discard.click();
      await settle();
    });
    assert.equal(
      (await store.readDraft(accountId, workspaceId, discarded.copy))?.text,
      newerDuringDiscard,
      'An intervening same-working-copy write must survive the recovery decision.',
    );
    await waitFor(
      () => container.textContent?.includes(newerDuringDiscard.trim()) === true,
    );
    assert.equal(container.querySelector('.cm-editor'), null);
    assert.equal((await store.pending(accountId, workspaceId)).length, 0);
    const refreshedDiscard = Array.from(
      container.querySelectorAll('button'),
    ).find((button) => button.textContent === 'Use saved version');
    assert.ok(refreshedDiscard && !refreshedDiscard.disabled);
    assert.equal(
      (await store.recover(accountId, workspaceId)).filter(
        (entry) => entry.fileId === fileId,
      ).length,
      0,
    );
    // A writer can also refresh text at the same sequence before the next choice.
    const latestBeforeDecision = `${newerDuringDiscard}More work before the next decision.\n`;
    await act(async () => {
      const current = await store.readDraft(
        accountId,
        workspaceId,
        discarded.copy,
      );
      assert.ok(current);
      await store.saveDraft({
        ...current,
        text: latestBeforeDecision,
        sequence: current.sequence,
      });
      refreshedDiscard.click();
      await settle();
    });
    await waitFor(
      () =>
        container.textContent?.includes(latestBeforeDecision.trim()) === true,
    );
    assert.equal(
      (await store.readDraft(accountId, workspaceId, discarded.copy))?.text,
      latestBeforeDecision,
    );
    assert.equal(
      (await store.recover(accountId, workspaceId)).filter(
        (entry) => entry.fileId === fileId,
      ).length,
      0,
    );
    const finalDiscard = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Use saved version',
    );
    assert.ok(finalDiscard && !finalDiscard.disabled);
    await act(async () => {
      finalDiscard.click();
      await settle();
    });
    await waitFor(
      () =>
        container.querySelector('.cm-editor') !== null &&
        output() === 'Everything is saved to the server.',
    );
    assert.equal(
      await store.readDraft(accountId, workspaceId, discarded.copy),
      null,
    );
    await waitFor(() => watchedHeads.at(-1) === discarded.remote);
    stopWatching();
    const recovery = await store.recover(accountId, workspaceId);
    assert.ok(
      recovery.some(
        (entry) =>
          entry.reason === 'stale_draft' && entry.text === latestBeforeDecision,
      ),
    );
    assert.equal((await store.pending(accountId, workspaceId)).length, 0);
    assert.equal(
      (await store.readCachedNote(accountId, workspaceId, fileId))?.text,
      discarded.remoteText,
    );
    await act(async () => root.render(null));
    await act(settle);

    const coveredDraft = await openStaleDraft(store, true);
    const coveredRead = await store.readCachedNote(
      accountId,
      workspaceId,
      fileId,
    );
    assert.ok(coveredRead);
    assert.equal(coveredRead.text, coveredDraft.remoteText);
    assert.notEqual(coveredRead.text, coveredDraft.localText);
    const coveredChoice = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Use saved version',
    );
    assert.ok(coveredChoice);
    await act(async () => {
      coveredChoice.click();
      await settle();
    });
    assert.equal(
      await store.readDraft(accountId, workspaceId, coveredDraft.copy),
      null,
      'A covered document must not make an unchanged draft fail its choice.',
    );
    assert.ok(
      (await store.recover(accountId, workspaceId)).some(
        (entry) =>
          entry.fileId === fileId && entry.text === coveredDraft.remoteText,
      ),
    );
    await waitFor(() => container.querySelector('.cm-editor') !== null);
    await act(async () => root.render(null));
    await act(settle);

    let afterRebase: (() => Promise<void>) | undefined;
    const rebasingStore = {
      ...store,
      rebaseDraft: async (...args: Parameters<typeof store.rebaseDraft>) => {
        await store.rebaseDraft(...args);
        const next = afterRebase;
        afterRebase = undefined;
        if (next) await next();
      },
    };
    const keptDraft = await openStaleDraft(rebasingStore);
    const newer = crypto.randomUUID();
    const newerText = 'A newer remote version during recovery.\n';
    afterRebase = async () => {
      const draft = await store.readDraft(
        accountId,
        workspaceId,
        keptDraft.copy,
      );
      assert.ok(draft);
      await store.applyRemoteChanges(
        accountId,
        workspaceId,
        [
          {
            file: {
              fileId,
              revisionId: newer,
              path: draft.path,
              fileKind: 'note',
              document: {
                kind: 'document',
                bytes: startDocument(newerText),
                epoch: 1,
              },
              deleted: false,
              digest: await contentDigest(newerText),
              text: newerText,
            },
            purgedFileId: null,
          },
        ],
        'remote',
      );
    };
    const keep = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Keep local draft',
    );
    assert.ok(keep);
    await act(async () => {
      keep.click();
      await settle();
    });
    await waitFor(() => container.textContent?.includes(newerText) === true);
    assert.equal(container.querySelector('.cm-editor'), null);
    assert.equal((await store.pending(accountId, workspaceId)).length, 0);
    const renewedChoices = Array.from(
      container.querySelectorAll('button'),
    ).filter((button) =>
      ['Keep local draft', 'Use saved version'].includes(
        button.textContent ?? '',
      ),
    );
    assert.equal(renewedChoices.length, 2);
    assert.ok(
      renewedChoices.every((button) => !button.disabled),
      'A newer remote version must permit another recovery choice.',
    );
    const keepLatest = renewedChoices.find(
      (button) => button.textContent === 'Keep local draft',
    );
    assert.ok(keepLatest);
    await act(async () => {
      keepLatest.click();
      await settle();
    });
    await waitFor(() => container.querySelector('.cm-editor') !== null);
    await act(settle);
    const keptQueue = await store.pending(accountId, workspaceId);
    assert.equal(keptQueue.length, 1);
    assert.deepEqual(keptQueue[0]?.input.revisions[0]?.parents, [newer]);
    assert.deepEqual(keptQueue[0]?.input.expectedHeads, {
      [fileId]: newer,
    });
    assert.equal(output(), 'Saving the open note to the server.');
    await act(async () => {
      await acknowledge();
      await settle();
    });
    await waitFor(() => output() === 'Everything is saved to the server.');
    const keptState = await store.readFileSaveSnapshot(
      accountId,
      workspaceId,
      fileId,
    );
    assert.ok(keptState.acceptedHeadRevisionId);
    assert.equal(
      await store.readRevisionText(
        accountId,
        workspaceId,
        keptState.acceptedHeadRevisionId,
      ),
      keptDraft.localText,
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
    // Hide and show the actual hook without discarding its React state.
    // An old rejected checkpoint must not release the next effect's claim.
    const tokenBase = await store.readCachedNote(
      accountId,
      workspaceId,
      fileId,
    );
    assert.ok(tokenBase);
    await act(async () => {
      await store.saveDraft({
        accountId,
        workspaceId,
        fileId,
        workingCopyId: crypto.randomUUID(),
        baseRevisionId: tokenBase.baseRevisionId,
        path: tokenBase.path,
        text: `${tokenBase.text}Token recovery.\n`,
        sequence: 1,
        deleted: false,
      });
      await settle();
    });
    const tokenSnapshot = await store.readFileSaveSnapshot(
      accountId,
      workspaceId,
      fileId,
    );
    assert.equal(tokenSnapshot.hasUncheckpointedDraft, true);
    const oldCheckpoint = Promise.withResolvers<boolean>();
    const newCheckpoint = Promise.withResolvers<boolean>();
    let claimAttempts = 0;
    let claimFacts: ReturnType<typeof useNoteSaveFacts> | undefined;
    function RecoveryClaims(): ReactNode {
      const sequence = useRef(0);
      const facts = useNoteSaveFacts(sequence, 0, true);
      claimFacts = facts;
      useEffect(() => {
        facts.recoverDraft(tokenSnapshot, () => {
          claimAttempts += 1;
          return claimAttempts === 1
            ? oldCheckpoint.promise
            : newCheckpoint.promise;
        });
      }, []);
      return null;
    }
    async function showClaims(mode: 'visible' | 'hidden'): Promise<void> {
      await act(async () => {
        root.render(
          createElement(Activity, {
            mode,
            children: createElement(RecoveryClaims),
          }),
        );
        await settle();
      });
    }
    try {
      await showClaims('visible');
      assert.equal(claimAttempts, 1);
      const firstFacts = claimFacts;
      assert.ok(firstFacts);
      await showClaims('hidden');
      await showClaims('visible');
      assert.ok(claimFacts);
      assert.equal(
        firstFacts.rootRef,
        claimFacts.rootRef,
        'The hook state must survive the effect remount.',
      );
      assert.equal(claimAttempts, 2);
      await act(async () => {
        oldCheckpoint.reject(new Error('obsolete failure'));
        await settle();
      });
      const unexpected = (): Promise<boolean> => {
        claimAttempts += 1;
        return Promise.resolve(true);
      };
      claimFacts.retryRecoveredDraft();
      claimFacts.recoverDraft(tokenSnapshot, unexpected);
      await act(settle);
      assert.equal(
        claimAttempts,
        2,
        'An obsolete failure must not release an in-flight claim.',
      );
      await act(async () => {
        newCheckpoint.resolve(true);
        await settle();
      });
      claimFacts.retryRecoveredDraft();
      claimFacts.recoverDraft(tokenSnapshot, unexpected);
      await act(settle);
      assert.equal(
        claimAttempts,
        2,
        'A successful claim must not create another checkpoint.',
      );
      await showClaims('hidden');
      claimFacts.recoverDraft(tokenSnapshot, unexpected);
      await act(settle);
      assert.equal(
        claimAttempts,
        2,
        'A stopped effect cannot start recovery work.',
      );
    } finally {
      oldCheckpoint.resolve(false);
      newCheckpoint.resolve(false);
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
