import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { useSettingsListFocus } from '../../apps/web/dist/features/accounts/settings-list-focus.js';

await test('Settings Back focuses the visible row after render and preserves workspace scope', async () => {
  const browser = new Window({ url: 'http://localhost/' });
  const values = {
    window: browser,
    document: browser.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = new Map(
    Object.keys(values).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const { createRoot } = await import('react-dom/client');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  /** Render a Settings list and Back button that follow the current page. */
  function Page({
    scope,
    path,
  }: {
    readonly scope: string;
    readonly path: string | undefined;
  }) {
    const ref = useSettingsListFocus(scope, path);
    return createElement(
      'div',
      null,
      createElement(
        'nav',
        { ref, className: path === undefined ? '' : 'hidden' },
        createElement(
          'button',
          { type: 'button', 'data-settings-page': 'account' },
          'Account',
        ),
      ),
      createElement(
        'button',
        { className: path === undefined ? 'hidden' : '', id: 'back' },
        'Back to Settings',
      ),
    );
  }
  /** Render the page for a Settings scope and an optional open page. */
  async function render(scope: string, path: string | undefined) {
    await act(async () => {
      root.render(createElement(Page, { scope, path }));
    });
  }
  try {
    await render('one', 'account');
    container.querySelector<HTMLElement>('#back')?.focus();
    await render('one', undefined);
    const row = container.querySelector('[data-settings-page]');
    assert.equal(document.activeElement, row);
    assert.equal(row?.parentElement?.className, '');
    await render('one', 'account');
    const back = container.querySelector<HTMLElement>('#back');
    back?.focus();
    await render('two', undefined);
    assert.equal(document.activeElement, back);
  } finally {
    await act(async () => root.unmount());
    for (const [key, value] of originals) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
    await browser.happyDOM.close();
  }
});
