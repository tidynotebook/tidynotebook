import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { HistoryButton } from '@notesapp/ui';

await test('history tooltips permit hover transfer and Escape without moving editor focus', async (t) => {
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
    'PointerEvent',
    'KeyboardEvent',
    'getComputedStyle',
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
  const host = document.createElement('div');
  const editor = document.createElement('textarea');
  editor.setAttribute('aria-label', 'Editor');
  document.body.append(host, editor);
  const root = createRoot(host);
  t.after(async () => {
    await act(async () => root.unmount());
    await browser.happyDOM.close();
    for (const [name, original] of originals) {
      if (original === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, original);
    }
  });
  let runs = 0;
  await act(async () =>
    root.render(
      createElement(HistoryButton, {
        action: 'undo',
        available: true,
        apple: false,
        tabIndex: 0,
        onClick: () => {
          runs += 1;
          editor.focus();
        },
      }),
    ),
  );
  const trigger = host.querySelector('button');
  assert.ok(trigger);
  editor.focus();
  await act(async () =>
    trigger.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }),
    ),
  );
  const tooltip = document.querySelector('[role="tooltip"]');
  assert.ok(tooltip);
  assert.equal(tooltip.textContent, 'Undo (Ctrl+Z)');
  assert.equal(document.activeElement, editor);
  await act(async () => {
    trigger.dispatchEvent(
      new PointerEvent('pointerout', {
        bubbles: true,
        relatedTarget: tooltip,
        pointerType: 'mouse',
      }),
    );
    tooltip.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        relatedTarget: trigger,
        pointerType: 'mouse',
      }),
    );
    await delay(180);
  });
  assert.equal(
    document.querySelector('[role="tooltip"]'),
    tooltip,
    'Hovering the tooltip keeps it open.',
  );
  await act(async () =>
    editor.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  );
  assert.equal(document.querySelector('[role="tooltip"]'), null);
  assert.equal(document.activeElement, editor);
  assert.equal(runs, 0);
  // A repeated enter within the same hover/focus session must not reopen it.
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }),
    );
  });
  assert.equal(document.querySelector('[role="tooltip"]'), null);
  await act(async () => {
    trigger.dispatchEvent(
      new PointerEvent('pointerout', {
        bubbles: true,
        relatedTarget: editor,
        pointerType: 'mouse',
      }),
    );
    editor.focus();
    await delay(180);
  });
  await act(async () => trigger.focus());
  assert.ok(
    document.querySelector('[role="tooltip"]'),
    'A new focus session shows the shortcut.',
  );
  await act(async () =>
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  );
  assert.equal(document.activeElement, trigger);
  assert.equal(document.querySelector('[role="tooltip"]'), null);
  await act(async () => trigger.click());
  assert.equal(runs, 1);
  assert.equal(document.activeElement, editor);
});
