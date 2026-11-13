import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContentHeader, SettingsSurface } from '../dist/index.js';

await test('persistent Settings dividers do not change other header defaults', () => {
  const header = createElement(ContentHeader, { children: 'Profile' });
  assert.doesNotMatch(renderToStaticMarkup(header), / data-edge-always=/);
  assert.match(
    renderToStaticMarkup(createElement(SettingsSurface, { children: header })),
    /data-edge-always=""/,
  );
  const pending = renderToStaticMarkup(
    createElement(ContentHeader, { divider: 'always', children: null }),
  );
  assert.match(pending, /data-edge-always=""/);
  assert.doesNotMatch(pending, /\sdivider=/);
});
