import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Meter } from '../dist/controls.js';

await test('a static meter states its role, range, value and accessible name', () => {
  const markup = renderToStaticMarkup(
    createElement(Meter, {
      label: 'Storage',
      value: 89,
      max: 100,
      text: '89 bytes of 100 bytes used',
    }),
  );
  for (const attribute of [
    'role="meter"',
    'aria-label="Storage"',
    'aria-valuemin="0"',
    'aria-valuemax="100"',
    'aria-valuenow="89"',
    'aria-valuetext="89 bytes of 100 bytes used"',
  ])
    assert.ok(markup.includes(attribute), attribute);
  assert.ok(markup.includes('89 bytes of 100 bytes used</p>'));
  assert.doesNotMatch(
    markup,
    /Almost full|fill-danger-fill|<script|\son[a-z]+=|\sstyle=/i,
  );
});

await test('a static meter states Almost full near its limit', () => {
  const markup = renderToStaticMarkup(
    createElement(Meter, {
      label: 'Use',
      value: 90,
      max: 100,
      text: '90 of 100 used',
    }),
  );
  assert.ok(markup.includes('fill-accent-fill'));
  assert.ok(markup.includes('90 of 100 used. Almost full</p>'));
  assert.ok(markup.includes('aria-valuetext="90 of 100 used. Almost full"'));
});

await test('a meter above its maximum keeps the real use in words and a valid ARIA range', () => {
  const markup = renderToStaticMarkup(
    createElement(Meter, {
      label: 'Use',
      value: 125,
      max: 100,
      text: '125 of 100 used',
    }),
  );
  assert.ok(markup.includes('aria-valuenow="100"'));
  assert.ok(markup.includes('125 of 100 used. Limit reached</p>'));
  assert.ok(markup.includes('fill-danger-fill'));
  assert.ok(markup.includes('width="100%"'));
});

await test('a small use has its true width and a two pixel minimum without inline styles', () => {
  const markup = renderToStaticMarkup(
    createElement(Meter, {
      label: 'Storage',
      value: 12_000_000,
      max: 5_000_000_000,
      text: '12 MB of 5 GB used',
    }),
  );
  assert.match(markup, /width="0.24%"/);
  assert.match(markup, /width="2"/);
  assert.doesNotMatch(markup, /style=/);
});
await test('half use fills half the track', () => {
  const markup = renderToStaticMarkup(
    createElement(Meter, {
      label: 'Storage',
      value: 50,
      max: 100,
      text: 'Half used',
    }),
  );
  assert.match(markup, /<rect width="50%"/);
});

await test('a full meter states the limit in words and danger text', () => {
  const markup = renderToStaticMarkup(
    createElement(Meter, {
      label: 'Storage',
      value: 100,
      max: 100,
      text: '100 of 100 used',
    }),
  );
  assert.match(markup, /text-danger/);
  assert.match(markup, /fill-danger-fill/);
  assert.match(markup, /aria-valuetext="100 of 100 used. Limit reached"/);
  assert.doesNotMatch(markup, /Almost full/);
});

await test('progress keeps the supplied check text and accent fill at and beyond completion', () => {
  for (const value of [11, 12, 15]) {
    const text = `Check ${value} of 12. Next check in 5 seconds.`;
    const markup = renderToStaticMarkup(
      createElement(Meter, {
        kind: 'progress',
        label: 'Checks with Paddle',
        value,
        max: 12,
        text,
      }),
    );
    assert.match(markup, /role="progressbar"/);
    assert.match(markup, /aria-valuemin="0" aria-valuemax="12"/);
    assert.ok(markup.includes(`aria-valuenow="${Math.min(value, 12)}"`));
    assert.ok(markup.includes(`aria-valuetext="${text}"`));
    assert.match(markup, /fill-accent-fill/);
    assert.match(markup, /text-muted/);
    assert.match(markup, /<rect width="2" height="100%"/);
    assert.doesNotMatch(
      markup,
      /Almost full|Limit reached|fill-danger-fill|text-danger|role="meter"/,
    );
  }
});
