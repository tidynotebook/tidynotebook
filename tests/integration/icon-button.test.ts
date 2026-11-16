import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IconButton, FolderIcon } from '@notesapp/ui';

await test('the active rail button has current and pressed semantics', () => {
  const active = renderToStaticMarkup(
    createElement(IconButton, {
      size: 'rail',
      label: 'Notes',
      current: true,
      glyph: createElement(FolderIcon),
    }),
  );
  assert.match(active, /aria-current="page"/);
  assert.match(active, /aria-pressed="true"/);
  const inactive = renderToStaticMarkup(
    createElement(IconButton, {
      size: 'rail',
      label: 'Notes',
      current: false,
      ariaPressed: true,
      glyph: createElement(FolderIcon),
    }),
  );
  assert.doesNotMatch(inactive, /aria-current/);
  assert.match(inactive, /aria-pressed="false"/);
});
