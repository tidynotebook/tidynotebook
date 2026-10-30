/** Cold action loading keeps its frame and restores the original trigger. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, createElement, useState, type ComponentType } from 'react';

await test('an action preloads only on intent, keeps one loading frame, and returns focus', async () => {
  const browser = new Window({ url: 'http://localhost/' });
  const names = [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ] as const;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const name of names) {
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
  const { deferredDialog, Dialog, DialogBody, Button, TextField } =
    await import('../../packages/ui/dist/index.js');
  type Props = { readonly open: boolean; readonly onClose: () => void };
  let resolve: ((value: { default: ComponentType<Props> }) => void) | undefined;
  const gate = new Promise<{ default: ComponentType<Props> }>((done) => {
    resolve = done;
  });
  let loads = 0;
  const Deferred = deferredDialog(() => {
    loads += 1;
    return gate;
  }, 'Edit name');
  function Content({ open, onClose }: Props) {
    return createElement(Dialog, {
      open,
      onClose,
      title: 'Edit name',
      titleId: 'edit',
      children: createElement(DialogBody, {
        children: [
          createElement(TextField, {
            key: 'field',
            id: 'name',
            label: 'Name',
            value: 'Review',
            onChange: () => {},
            autoFocus: true,
          }),
          createElement(Button, {
            key: 'close',
            onClick: onClose,
            children: 'Close',
          }),
        ],
      }),
    });
  }
  function Host() {
    const [open, setOpen] = useState(false);
    return createElement(
      'div',
      null,
      createElement(
        'button',
        { id: 'trigger', onClick: () => setOpen(true) },
        'Edit',
      ),
      createElement(Deferred, { open, onClose: () => setOpen(false) }),
    );
  }
  const rootElement = document.createElement('div');
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  const settle = async () => {
    await act(async () => {
      await new Promise((done) => setTimeout(done, 30));
    });
  };
  try {
    await act(async () => root.render(createElement(Host)));
    assert.equal(
      loads,
      0,
      'closed actions do not request their implementation',
    );
    const intent = Deferred.preload();
    assert.equal(loads, 1);
    assert.ok(
      Deferred.preload() === intent,
      'intent reuses the module request',
    );
    const trigger = document.querySelector<HTMLButtonElement>('#trigger');
    assert.ok(trigger);
    trigger.focus();
    await act(async () => trigger.click());
    await settle();
    assert.equal(document.querySelectorAll('[role=dialog]').length, 1);
    assert.ok(document.querySelector('[role=dialog] [aria-busy=true]'));
    await act(async () => {
      resolve?.({ default: Content });
      await intent;
    });
    await settle();
    assert.equal(document.querySelectorAll('[role=dialog]').length, 1);
    assert.equal(document.activeElement?.id, 'name');
    const close = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Close',
    );
    assert.ok(close);
    await act(async () => close.click());
    await settle();
    assert.equal(document.querySelectorAll('[role=dialog]').length, 0);
    assert.ok(
      document.activeElement === trigger,
      'focus returns to the original trigger, not the removed loading frame',
    );
  } finally {
    await act(async () => root.unmount());
    await browser.happyDOM.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
