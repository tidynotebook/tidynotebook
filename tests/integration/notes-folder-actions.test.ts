import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router';

const fixture = new URL('./support/notes-folder-fixture.ts', import.meta.url)
  .href;
const boundaries = new Set([
  '../../app.js',
  '../../shell/files.js',
  '../../shell/now.js',
  '../../shell/document-title.js',
  './writing-start.js',
  '../templates/new-from-template.js',
  './new-note.js',
  '../folders/folder-page-actions.js',
]);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (
      context.parentURL?.endsWith('/features/notes/notes-home.js') &&
      boundaries.has(specifier)
    )
      return { url: fixture, shortCircuit: true };
    return next(specifier, context);
  },
});
const { NotesHomeView } =
  await import('../../apps/web/dist/features/notes/notes-home.js');

after(() => hooks.deregister());

await test('a folder with only subfolders keeps its creation actions', () => {
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: ['/w/work/folders/Projects'],
      },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/w/:workspaceId/folders/*',
          element: createElement(NotesHomeView),
        }),
      ),
    ),
  );
  assert.match(html, /Archive/);
  assert.match(html, /New note/);
  assert.match(html, /Use template/);
});
