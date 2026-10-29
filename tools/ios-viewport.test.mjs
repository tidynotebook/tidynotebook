import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const html = readFileSync(
  new URL('../apps/web/index.html', import.meta.url),
  'utf8',
);
const script = html.match(
  /<script>([\s\S]*?isAppleTouchDevice[\s\S]*?)<\/script>/,
)?.[1];
assert.ok(script);
await test('only Apple touch devices stop field focus zoom', () => {
  for (const [userAgent, maxTouchPoints, expected] of [
    ['iPhone', 1, true],
    ['iPad', 5, true],
    ['Macintosh', 5, true],
    ['Macintosh', 0, false],
    ['Android', 5, false],
    ['Windows', 0, false],
  ]) {
    const viewport = {
      content:
        'width=device-width, initial-scale=1, interactive-widget=resizes-content',
    };
    const context = {
      navigator: { userAgent, maxTouchPoints },
      document: { querySelector: () => viewport },
    };
    runInNewContext(script, context);
    assert.equal(viewport.content.includes('maximum-scale=1'), expected);
    assert.ok(viewport.content.includes('interactive-widget=resizes-content'));
  }
});
