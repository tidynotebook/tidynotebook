import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, createElement, useState } from 'react';
import { useNavigationDrawer } from '../../apps/web/dist/shell/use-navigation-drawer.js';

await test('desktop drawer Escape restores its visible opener, keyboard and palette fallback across resize', async () => {
  const browser = new Window();
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: browser,
    document: browser.document,
    HTMLElement: browser.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  const { createRoot } = await import('react-dom/client');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let desktop = true;
  function App() {
    const [open, setOpen] = useState(false);
    const drawer = useNavigationDrawer(open, setOpen);
    return createElement(
      'div',
      null,
      createElement(
        'button',
        {
          ref: drawer.phoneButton,
          onClick: () => {
            drawer.rememberOpener(drawer.phoneButton.current);
            setOpen(true);
          },
        },
        'Phone',
      ),
      createElement(
        'button',
        {
          ref: drawer.desktopButton,
          onClick: () => {
            drawer.rememberOpener(drawer.desktopButton.current);
            setOpen(true);
          },
        },
        'Desktop',
      ),
      createElement(
        'button',
        {
          onClick: () => {
            drawer.rememberOpener();
            setOpen(true);
          },
        },
        'Keyboard',
      ),
      open
        ? null
        : createElement(
            'button',
            {
              onClick: () => {
                drawer.rememberOpener();
                setOpen(true);
              },
            },
            'Palette',
          ),
      createElement(
        'aside',
        { ref: drawer.panel, hidden: !open },
        createElement('button', null, 'Inside'),
      ),
    );
  }
  function button(label: string) {
    const element = [...container.querySelectorAll('button')].find(
      (node) => node.textContent === label,
    );
    assert.ok(element);
    return element;
  }
  async function escape() {
    button('Inside').focus();
    await act(async () => {
      browser.dispatchEvent(
        new browser.KeyboardEvent('keydown', {
          key: 'Escape',
          cancelable: true,
        }),
      );
    });
  }
  try {
    await act(async () => root.render(createElement(App)));
    // The DOM runner has no CSS layout. Supply only the viewport-dependent
    // rectangles; the real hook, refs, events and focus remain in use.
    for (const label of ['Phone', 'Desktop', 'Keyboard'])
      Object.defineProperty(button(label), 'getClientRects', {
        value: () =>
          (label === 'Phone' ? !desktop : label === 'Desktop' ? desktop : true)
            ? [new browser.DOMRect(0, 0, 44, 44)]
            : [],
      });
    button('Desktop').focus();
    await act(async () => button('Desktop').click());
    await escape();
    assert.equal(document.activeElement, button('Desktop'));
    button('Keyboard').focus();
    await act(async () => button('Keyboard').click());
    await escape();
    assert.equal(document.activeElement, button('Keyboard'));
    button('Palette').focus();
    await act(async () => button('Palette').click());
    await escape();
    assert.equal(document.activeElement, button('Desktop'));
    await act(async () => button('Desktop').click());
    desktop = false;
    await escape();
    assert.equal(document.activeElement, button('Phone'));
    await act(async () => button('Phone').click());
    desktop = true;
    await escape();
    assert.equal(document.activeElement, button('Desktop'));
  } finally {
    await act(async () => root.unmount());
    for (const [key, value] of originals) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
    await browser.happyDOM.close();
  }
});
