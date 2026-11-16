import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { Window } from 'happy-dom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
  StrictMode,
  Suspense,
  createElement,
  act,
  type ReactNode,
} from 'react';
import { MemoryRouter } from 'react-router';
import { openLocalStore } from '@notesapp/storage-browser';
import type { LocalStore } from '@notesapp/sync';

// The toolbar Undo and Redo of the note screen, mounted as the app mounts
// it: in StrictMode, through the loader, with typing through the editor DOM
// and a mouse press on the buttons (issue 517, item 11).
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
const { NoteEditorLoader } =
  await import('../../apps/web/dist/features/editor/note-loader.js');
const { NoteEditor } =
  await import('../../apps/web/dist/features/editor/note-editor.js');
const { NoteSaveScope } =
  await import('../../apps/web/dist/features/editor/save-status.js');
const { HeaderSlotProvider, HeaderLeafSlot } =
  await import('../../apps/web/dist/shell/header-slot.js');

const accountId = crypto.randomUUID();
const workspaceId = crypto.randomUUID();
const localStore = await openLocalStore('http://localhost', {
  indexedDB: new IDBFactory(),
  IDBKeyRange,
  databaseName: `undo-redo-${crypto.randomUUID()}`,
});
// Unmount starts writes without returning their promises. Track them so
// each test waits for its writes.
const pendingStoreWork = new Set<Promise<unknown>>();
const store: LocalStore = new Proxy(localStore, {
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

async function finishStoreWork(): Promise<void> {
  do {
    await Promise.allSettled([...pendingStoreWork]);
    await setImmediate();
  } while (pendingStoreWork.size > 0);
}

const container = document.createElement('div');
document.body.append(container);
const root = createRoot(container);

async function render(child: ReactNode): Promise<void> {
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(
          MemoryRouter,
          null,
          createElement(
            NoteSaveScope,
            null,
            createElement(
              HeaderSlotProvider,
              null,
              createElement(HeaderLeafSlot),
              // The note route holds the loader in Suspense, as here.
              createElement(Suspense, { fallback: null }, child),
            ),
          ),
        ),
      ),
    );
  });
}

/** Lets React, the store and the editor observers finish their work. */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1)
    await act(async () => {
      await setImmediate();
    });
}

async function waitForEditor(noteText?: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  const shows = (): boolean => {
    const element = container.querySelector('.cm-editor');
    if (!(element instanceof HTMLElement)) return false;
    return (
      noteText === undefined ||
      EditorView.findFromDOM(element)?.state.doc.toString() === noteText
    );
  };
  while (!shows()) {
    if (Date.now() > deadline)
      throw new Error('The note editor did not mount within 10 seconds.');
    await act(async () => {
      await setImmediate();
    });
  }
  await settle();
}

async function createNote(noteText: string, path: string): Promise<string> {
  const fileId = crypto.randomUUID();
  await store.checkpoint(
    {
      accountId,
      workspaceId,
      fileId,
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
  return fileId;
}

function openNote(fileId: string): ReactNode {
  return createElement(NoteEditorLoader, {
    store,
    accountId,
    workspaceId,
    fileId,
  });
}

function view(): InstanceType<typeof EditorView> {
  const element = container.querySelector('.cm-editor');
  assert.ok(element instanceof HTMLElement);
  const found = EditorView.findFromDOM(element);
  assert.ok(found);
  return found;
}

function historyButton(label: 'Undo' | 'Redo'): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (node) => node.getAttribute('aria-label') === label,
  );
  assert.ok(button);
  return button;
}

function available(label: 'Undo' | 'Redo'): boolean {
  return historyButton(label).getAttribute('aria-disabled') === 'false';
}

/** Types at the end of the first line through the editor DOM. */
async function type(characters: string): Promise<void> {
  const editor = view();
  await act(async () => {
    editor.focus();
    const lines = editor.contentDOM.querySelectorAll('.cm-line');
    const line = lines[0];
    assert.ok(line);
    let node: Node | null = line.lastChild;
    if (!(node instanceof Text)) {
      node = document.createTextNode('');
      line.append(node);
    }
    assert.ok(node instanceof Text);
    node.data += characters;
    await setImmediate();
  });
  await settle();
}

/** A mouse press and click, as a person gives with a pointer. */
async function press(button: HTMLButtonElement): Promise<boolean> {
  let keptFocus = false;
  await act(async () => {
    const options = { bubbles: true, cancelable: true, button: 0 };
    const pointerDown = new PointerEvent('pointerdown', {
      ...options,
      pointerType: 'mouse',
    });
    button.dispatchEvent(pointerDown);
    const mouseDown = new MouseEvent('mousedown', options);
    // A browser moves focus to the button unless the press is cancelled.
    keptFocus = !button.dispatchEvent(mouseDown);
    if (!keptFocus) button.focus();
    button.dispatchEvent(
      new PointerEvent('pointerup', { ...options, pointerType: 'mouse' }),
    );
    button.dispatchEvent(new MouseEvent('mouseup', options));
    button.dispatchEvent(new MouseEvent('click', options));
  });
  await settle();
  return keptFocus;
}

async function key(keyName: string, shift = false): Promise<void> {
  const editor = view();
  await act(async () => {
    editor.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', {
        // A browser reports the shifted letter.
        key: shift ? keyName.toUpperCase() : keyName,
        code: `Key${keyName.toUpperCase()}`,
        keyCode: keyName.toUpperCase().charCodeAt(0),
        ctrlKey: true,
        shiftKey: shift,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await settle();
}

await test('typed text enables Undo, and a mouse press undoes and keeps focus', async () => {
  const fileId = await createNote('Start\n', 'Undo press.md');
  await render(openNote(fileId));
  await waitForEditor();
  assert.equal(available('Undo'), false);
  assert.equal(available('Redo'), false);
  await type(' typed');
  assert.equal(view().state.doc.toString(), 'Start typed\n');
  assert.equal(available('Undo'), true);
  assert.equal(available('Redo'), false);
  // The mouse down keeps the focus in the text, so the button never takes it.
  assert.equal(await press(historyButton('Undo')), true);
  assert.equal(view().state.doc.toString(), 'Start\n');
  assert.equal(view().hasFocus, true);
  assert.equal(available('Redo'), true);
  assert.equal(await press(historyButton('Redo')), true);
  assert.equal(view().state.doc.toString(), 'Start typed\n');
  assert.equal(view().hasFocus, true);
  assert.equal(available('Undo'), true);
  assert.equal(available('Redo'), false);
  await render(null);
  await act(finishStoreWork);
});

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
  await act(finishStoreWork);
  await settle();
}

await test('Undo stays available after an autosave and a version', async () => {
  const fileId = await createNote('Kept\n', 'Undo kept.md');
  await render(openNote(fileId));
  await waitForEditor();
  const first = view();
  await type(' work');
  // The draft follows a short pause and the version follows 2.5 seconds.
  await wait(3200);
  assert.equal(view(), first, 'the editor stays mounted');
  assert.equal(available('Undo'), true);
  await press(historyButton('Undo'));
  assert.equal(view().state.doc.toString(), 'Kept\n');
  await render(null);
  await act(finishStoreWork);
});

await test('Ctrl+Z and Ctrl+Shift+Z share the stack of the buttons', async () => {
  const fileId = await createNote('Keys\n', 'Undo keys.md');
  await render(openNote(fileId));
  await waitForEditor();
  await type(' typed');
  await key('z');
  assert.equal(view().state.doc.toString(), 'Keys\n');
  assert.equal(available('Undo'), false);
  assert.equal(available('Redo'), true);
  await press(historyButton('Redo'));
  assert.equal(view().state.doc.toString(), 'Keys typed\n');
  await key('z', true);
  assert.equal(available('Redo'), false);
  await press(historyButton('Undo'));
  assert.equal(view().state.doc.toString(), 'Keys\n');
  await key('z', true);
  assert.equal(view().state.doc.toString(), 'Keys typed\n');
  assert.equal(available('Undo'), true);
  await render(null);
  await act(finishStoreWork);
});

await test('a note switch shows the history of the new note', async () => {
  const one = await createNote('One\n', 'Switch one.md');
  const two = await createNote('Two\n', 'Switch two.md');
  await render(openNote(one));
  await waitForEditor();
  await type(' edit');
  assert.equal(available('Undo'), true);
  await render(openNote(two));
  await waitForEditor('Two\n');
  assert.equal(view().state.doc.toString(), 'Two\n');
  assert.equal(available('Undo'), false);
  assert.equal(available('Redo'), false);
  await type(' next');
  assert.equal(available('Undo'), true);
  await press(historyButton('Undo'));
  assert.equal(view().state.doc.toString(), 'Two\n');
  await render(null);
  await act(finishStoreWork);
});

await test('a new working copy of the open editor keeps one live undo stack', async () => {
  // A note that only this editor holds, so its document is the one store
  // document of the note.
  const fileId = crypto.randomUUID();
  const editor = (workingCopyId: string | undefined): ReactNode =>
    createElement(NoteEditor, {
      key: fileId,
      store,
      accountId,
      workspaceId,
      fileId,
      baseRevisionId: null,
      initialText: 'Copy\n',
      initialPath: 'Undo copy.md',
      initialWorkingCopyId: workingCopyId,
      initialSequence: 0,
    });
  await render(editor(undefined));
  await waitForEditor();
  await type(' one');
  assert.equal(available('Undo'), true);
  // The loader reads the note again and names the working copy that the
  // first draft wrote, with the same key.
  await render(editor('copy-1'));
  await settle();
  await type(' two');
  assert.equal(view().state.doc.toString(), 'Copy one two\n');
  assert.equal(available('Undo'), true);
  assert.equal(await press(historyButton('Undo')), true);
  assert.notEqual(view().state.doc.toString(), 'Copy one two\n');
  assert.equal(available('Redo'), true);
  await render(null);
  await act(finishStoreWork);
});

after(async () => {
  await act(async () => root.unmount());
  await act(finishStoreWork);
  await localStore.close();
  await browser.happyDOM.close();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  hooks.deregister();
});
