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
  const nested = {
    id: 'nested',
    label: 'More options',
    submenu: [{ id: 'leaf', label: 'Nested action' }],
  };
  function pinned(
    submenu: readonly MenuItem[] = [nested],
  ): readonly MenuItem[] {
    return [
      {
        id: 'pinned',
        label: 'Pinned options',
        submenu,
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
  async function press(key: string) {
    await act(async () => {
      browser.document.activeElement?.dispatchEvent(
        new browser.KeyboardEvent('keydown', { key, bubbles: true }),
      );
    });
  }
  try {
    await render(pinned());
    const trigger = host.querySelector('button');
    assert.ok(trigger);
    trigger.focus();
    await press('ArrowUp');
    focused('Pinned options');
    await click('Pinned options');
    focused('More options');
    await render(pinned([{ id: 'inserted', label: 'Fresh action' }, nested]));
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

    const early = { id: 'early', label: 'Early action' };
    const selected = { id: 'selected', label: 'Chosen action' };
    const earlier = { id: 'earlier', label: 'Earlier action' };
    const disabled = { id: 'disabled', label: 'Unavailable', disabled: true };
    const last = { id: 'last', label: 'Last action' };
    await render(pinned([early, selected, disabled, earlier]));
    await click('Pinned options');
    await press('ArrowDown');
    focused('Chosen action');
    await render(pinned([earlier, early, selected, disabled, last]));
    focused('Chosen action');
    await render(pinned([earlier, early, disabled, last]));
    focused('Last action');
    await render(pinned([earlier, early, disabled]));
    focused('Early action');
    await press('ArrowUp');
    focused('Earlier action');
  } finally {
    await act(async () => root.unmount());
    await browser.happyDOM.close();
    for (const [name, descriptor] of original) {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
  }
});
