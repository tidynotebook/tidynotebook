import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Pill } from '../dist/section-heading.js';

await test('a neutral pill keeps its quiet surface and has no tone dot', () => {
  const markup = renderToStaticMarkup(
    createElement(Pill, { children: 'Trial' }),
  );
  assert.match(markup, /bg-hover/);
  assert.match(markup, /text-muted/);
  assert.doesNotMatch(markup, /aria-hidden/);
});

for (const tone of ['accent', 'success', 'danger'] as const) {
  await test(`a ${tone} pill states its fact with a tone surface and decorative dot`, () => {
    const markup = renderToStaticMarkup(
      createElement(Pill, { tone, children: 'Plan state' }),
    );
    assert.ok(markup.includes(`bg-${tone}-surface`));
    assert.ok(markup.includes(`bg-${tone}`));
    assert.match(markup, /text-strong/);
    assert.match(markup, /aria-hidden="true"/);
    assert.match(markup, />Plan state<\/span>/);
  });
}
