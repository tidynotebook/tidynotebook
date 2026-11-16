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
  document.body.style.overflow = 'auto';
  /** Mount the real drawer hook with phone, desktop, keyboard and palette openers. */
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
        {
          ref: drawer.panel,
          hidden: !open,
          role: drawer.modal ? 'dialog' : undefined,
          'aria-modal': drawer.modal ? true : undefined,
        },
        createElement('button', null, 'Inside'),
      ),
    );
  }
  /** Find a button by its text. */
  function button(label: string) {
    const element = [...container.querySelectorAll('button')].find(
      (node) => node.textContent === label,
    );
    assert.ok(element);
    return element;
  }
  /** Wait one animation frame for the initial drawer focus. */
  async function frame() {
    await act(async () => {
      await new Promise<void>((resolve) =>
        browser.requestAnimationFrame(() => resolve()),
      );
    });
  }
  /** Press Tab on the last drawer control and report if the hook trapped it. */
  function tab() {
    button('Inside').focus();
    const event = new browser.KeyboardEvent('keydown', {
      key: 'Tab',
      cancelable: true,
    });
    browser.dispatchEvent(event);
    return event.defaultPrevented;
  }
  /** Check that the desktop drawer has no dialog semantics, scroll lock or Tab trap. */
  function assertDesktop() {
    assert.equal(container.querySelector('aside')?.getAttribute('role'), null);
    assert.equal(
      container.querySelector('aside')?.getAttribute('aria-modal'),
      null,
    );
    assert.equal(document.body.style.overflow, 'auto');
    assert.equal(tab(), false);
  }
  /** Press Escape inside the drawer. */
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
    await frame();
    assert.equal(document.activeElement, button('Desktop'));
    assertDesktop();
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
    await act(async () => {
      desktop = false;
      browser.happyDOM.setWindowSize({ width: 767, height: 844 });
    });
    await frame();
    assert.equal(document.activeElement, button('Inside'));
    assert.equal(document.body.style.overflow, 'hidden');
    assert.equal(
      container.querySelector('aside')?.getAttribute('role'),
      'dialog',
    );
    assert.equal(
      container.querySelector('aside')?.getAttribute('aria-modal'),
      'true',
    );
    assert.equal(tab(), true);
    await escape();
    assert.equal(document.body.style.overflow, 'auto');
    assert.equal(document.activeElement, button('Phone'));
    await act(async () => button('Phone').click());
    await act(async () => {
      desktop = true;
      browser.happyDOM.setWindowSize({ width: 768, height: 900 });
    });
    assertDesktop();
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
