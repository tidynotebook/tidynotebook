/** Real note controls with controlled geometry; native layout is checked separately. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';

const browser = new Window({ url: 'http://localhost/' });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'MutationObserver',
  'ResizeObserver',
  'getComputedStyle',
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
originals.set(
  'IS_REACT_ACT_ENVIRONMENT',
  Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'),
);
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});
const { createRoot } = await import('react-dom/client');
const { EditorState } = await import('@codemirror/state');
const { EditorView, plainTextContext } = await import('@notesapp/editor');
const { ActiveNoteScope, revealInNote } =
  await import('../../apps/web/dist/features/editor/active-note.js');
const { NoteFooter, wordCount } =
  await import('../../apps/web/dist/features/editor/note-footer.js');
const { FormatToolbar } =
  await import('../../apps/web/dist/features/editor/format-toolbar.js');

try {
  await test('footer counts content and handles the parser refusal without losing the screen', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          createElement(ActiveNoteScope, {
            children: createElement(NoteFooter, {
              initialText: '# Title\n\nTwo words',
            }),
          }),
        ),
      );
      assert.equal(container.textContent, '3 words');
      assert.equal(wordCount('# One'), 1);
      await act(async () =>
        root.render(
          createElement(ActiveNoteScope, {
            children: createElement(NoteFooter, {
              initialText: 'x'.repeat(1024 * 1024 + 1),
            }),
          }),
        ),
      );
      assert.equal(container.textContent, 'Word count unavailable');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  await test('outline selects the target and requests native top alignment on the same document', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const requests: { y: string; x: string; head: number }[] = [];
    const view = new EditorView({
      parent,
      state: EditorState.create({ doc: '# First\n\nBody\n\n## Last\n\nEnd' }),
      dispatchTransactions(transactions, current) {
        for (const transaction of transactions)
          for (const effect of transaction.effects) {
            const value: unknown = effect.value;
            if (
              value &&
              typeof value === 'object' &&
              'y' in value &&
              'x' in value &&
              'range' in value &&
              typeof value.y === 'string' &&
              typeof value.x === 'string' &&
              value.range &&
              typeof value.range === 'object' &&
              'head' in value.range &&
              typeof value.range.head === 'number'
            )
              requests.push({ y: value.y, x: value.x, head: value.range.head });
          }
        current.update(transactions);
      },
    });
    try {
      const doc = view.state.doc;
      const position = doc.toString().indexOf('## Last');
      revealInNote(view, position);
      assert.equal(view.state.selection.main.head, position);
      assert.equal(view.state.doc, doc);
      assert.equal(view.hasFocus, true);
      assert.deepEqual(requests, [
        { y: 'start', x: 'nearest', head: position },
      ]);
      revealInNote(view, Number.MAX_SAFE_INTEGER);
      assert.equal(view.state.selection.main.head, doc.length);
      revealInNote(view, -3);
      assert.equal(view.state.selection.main.head, 0);
      assert.equal(view.state.doc, doc);
    } finally {
      view.destroy();
      parent.remove();
    }
  });

  await test('toolbar cues follow hidden content, resize and cleanup without adding focus targets', async () => {
    let resize: (() => void) | undefined;
    let released = false;
    class Observer implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resize = () => callback([], this);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {
        released = true;
      }
    }
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: Observer,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    let calls = 0;
    try {
      await act(async () =>
        root.render(
          createElement(FormatToolbar, {
            context: plainTextContext,
            history: { undo: false, redo: false },
            onFormat: () => {
              calls += 1;
            },
            onHistory: () => {
              calls += 1;
            },
          }),
        ),
      );
      const row = container.querySelector('[role="toolbar"]');
      assert.ok(row instanceof HTMLElement && row.parentElement);
      let width = 320;
      let content = 540;
      let offset = 0;
      Object.defineProperty(row.parentElement, 'clientWidth', {
        configurable: true,
        get: () => width,
      });
      Object.defineProperty(row, 'scrollWidth', {
        configurable: true,
        get: () => content,
      });
      Object.defineProperty(row, 'clientWidth', {
        configurable: true,
        get: () => width - 32,
      });
      Object.defineProperty(row, 'scrollLeft', {
        configurable: true,
        get: () => offset,
      });
      const update = async () =>
        act(async () => {
          resize?.();
        });
      const cue = (side: string) =>
        container.querySelector(`[data-toolbar-cue="${side}"]`);
      await update();
      assert.ok(cue('start')?.classList.contains('invisible'));
      assert.ok(!cue('end')?.classList.contains('invisible'));
      offset = 100;
      await act(async () => row.dispatchEvent(new Event('scroll')));
      assert.ok(!cue('start')?.classList.contains('invisible'));
      assert.ok(!cue('end')?.classList.contains('invisible'));
      offset = content - (width - 32);
      await update();
      assert.ok(cue('end')?.classList.contains('invisible'));
      for (const element of container.querySelectorAll('[data-toolbar-cue]')) {
        assert.equal(element.getAttribute('aria-hidden'), 'true');
        assert.equal(element.querySelector('button, [tabindex]'), null);
      }
      assert.equal(
        container.querySelectorAll('button[tabindex="0"]').length,
        1,
      );
      assert.equal(calls, 0);
      width = 560;
      offset = 0;
      await update();
      assert.equal(cue('start'), null);
      assert.equal(cue('end'), null);
      // Content smaller than the full frame must not stay clipped just to show cues.
      width = 540;
      content = 539;
      await update();
      assert.equal(cue('end'), null);
      await act(async () => root.unmount());
      assert.equal(released, true);
      await act(async () => row.dispatchEvent(new Event('scroll')));
      assert.equal(container.childElementCount, 0);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
} finally {
  for (const [name, descriptor] of originals)
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  await browser.happyDOM.close();
}
