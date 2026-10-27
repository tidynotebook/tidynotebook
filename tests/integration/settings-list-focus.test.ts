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
        createElement('a', { href: `${scope}/profile` }, 'Profile and email'),
      ),
      createElement(
        'button',
        { className: path === undefined ? 'hidden' : '' },
        'Back to Settings',
      ),
    );
  }
  async function render(scope: string, path: string | undefined) {
    await act(async () => {
      root.render(createElement(Page, { scope, path }));
    });
  }
  try {
    await render('/w/one/settings', 'profile');
    container.querySelector('button')?.focus();
    await render('/w/one/settings', undefined);
    const row = container.querySelector('a');
    assert.equal(document.activeElement, row);
    assert.equal(row?.parentElement?.className, '');
    await render('/w/one/settings', 'profile');
    const back = container.querySelector('button');
    back?.focus();
    await render('/w/two/settings', undefined);
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
