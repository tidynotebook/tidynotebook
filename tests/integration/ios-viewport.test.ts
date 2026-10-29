import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
await test('the built document changes its viewport only for iOS and iPadOS', async () => {
  const html = await readFile(
    new URL('../../apps/web/dist/web/index.html', import.meta.url),
    'utf8',
  );
  for (const [userAgent, maxTouchPoints, apple] of [
    ['Mozilla iPhone', 1, true],
    ['Mozilla iPad', 5, true],
    ['Mozilla Macintosh', 5, true],
    ['Mozilla Macintosh', 0, false],
    ['Mozilla Android', 5, false],
    ['Mozilla Windows', 0, false],
  ] as const) {
    const browser = new Window({
      settings: { navigator: { userAgent, maxTouchPoints } },
    });
    try {
      browser.document.head.innerHTML =
        '<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content">';
      const scripts = [
        ...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g),
      ];
      const code = scripts.find((m) =>
        m[1]?.includes('isAppleTouchDevice'),
      )?.[1];
      assert.ok(code, 'The iOS rule must remain inline in the built document.');
      browser.eval(code);
      const viewport =
        browser.document
          .querySelector('meta[name="viewport"]')
          ?.getAttribute('content') ?? '';
      assert.equal(viewport.includes('maximum-scale=1'), apple);
      assert.ok(viewport.includes('interactive-widget=resizes-content'));
    } finally {
      await browser.happyDOM.close();
    }
  }
});
