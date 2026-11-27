import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Menu, type MenuItem } from '@notesapp/ui';

await test('menus keep focus across item refreshes and resolve nested pinned actions', async () => {
  const browser = new Window();
  const globals = {
    window: browser,
    document: browser.document,
    Node: browser.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const original = Object.keys(globals).map(
    (name) =>
      [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  for (const [name, value] of Object.entries(globals))
    Object.defineProperty(globalThis, name, { configurable: true, value });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const items = [
    { id: 'disabled', label: 'Unavailable', disabled: true },
    { id: 'first', label: 'First action' },
  ];
  function pinned(prefix: readonly MenuItem[] = []): readonly MenuItem[] {
    return [
      {
        id: 'pinned',
        label: 'Pinned options',
        submenu: [
          ...prefix,
          {
            id: 'nested',
            label: 'More options',
            submenu: [{ id: 'leaf', label: 'Nested action' }],
          },
        ],
      },
    ];
  }
  const render = (pinned: readonly MenuItem[]) =>
    act(async () =>
      root.render(createElement(Menu, { label: 'Actions', items, pinned })),
    );
  const nextFrame = () =>
    new Promise<void>((resolve) =>
      browser.requestAnimationFrame(() => resolve()),
    );
  async function click(label: string) {
    const row = [...browser.document.querySelectorAll('button')].find(
      (button) =>
        (button.getAttribute('aria-label') ?? button.textContent) === label,
    );
    assert.ok(row, label);
    await act(async () => row.click());
    await nextFrame();
  }
  function focused(label: string) {
    assert.equal(browser.document.activeElement?.textContent, label);
  }
  try {
    await render(pinned());
    await click('Actions');
    await click('Pinned options');
    focused('More options');
    await render(pinned([{ id: 'inserted', label: 'Fresh action' }]));
    await nextFrame();
    focused('More options');
    await click('More options');
    focused('Nested action');
    await click('Back');
    focused('More options');
    await click('More options');
    await render([]);
    await nextFrame();
    focused('First action');
    await render(pinned());
    await nextFrame();
    focused('First action');
  } finally {
    await act(async () => root.unmount());
    await browser.happyDOM.close();
    for (const [name, descriptor] of original) {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
  }
});
