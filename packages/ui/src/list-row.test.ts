/** Native button alignment must not override the shared row text. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ListRow } from '../dist/layout.js';
await test('button and link rows explicitly align their row and text column left', () => {
  for (const density of ['setting', 'tree', 'menu'] as const)
    for (const kind of ['button', 'link'] as const) {
      const html = renderToStaticMarkup(
        createElement(ListRow, {
          density,
          label: 'Images',
          help: 'Uses more space',
          ...(kind === 'button' ? { as: 'button' } : { href: '/notes' }),
        }),
      );
      const tag = kind === 'button' ? 'button' : 'a';
      assert.match(html, new RegExp(`<${tag}[^>]*class="[^"]*\\btext-left\\b`));
      assert.match(html, /class="[^"]*ui-settings-copy[^"]*\btext-left\b/);
      assert.ok(html.includes('Images') && html.includes('Uses more space'));
    }
});
