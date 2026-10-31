/** Long notes scroll with touch and mouse input in the deployed application. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { hasChromium } from './browser.ts';

const loaded: unknown = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '.local-app/node_modules/playwright-core/index.mjs',
  ).href
);
assert.ok(hasChromium(loaded));
const notePath = process.env.SCROLL_NOTE_PATH;
assert.ok(
  notePath?.startsWith('/w/'),
  'Set SCROLL_NOTE_PATH to a long test note.',
);
const origin = process.env.UI_AUDIT_ORIGIN ?? 'http://localhost:3000';
const output = '.local-app/screenshots';
mkdirSync(output, { recursive: true });
const browser = await loaded.chromium.launch();
try {
  for (const width of [320, 390, 1440])
    for (const scheme of ['light', 'dark'] as const) {
      const phone = width < 1024;
      const context = await browser.newContext({
        storageState:
          process.env.UI_AUDIT_STATE ?? '.local-app/review-session.json',
        viewport: { width, height: 844 },
        hasTouch: phone,
        isMobile: phone,
        colorScheme: scheme,
      });
      try {
        await context.addInitScript(
          (theme) => localStorage.setItem('notesapp.theme', theme),
          scheme,
        );
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(origin + notePath);
        await page.locator('.cm-content').waitFor();
        const cdp = await context.newCDPSession(page);
        // Also check the reduced writing area above a phone keyboard.
        for (const height of phone ? [844, 420] : [844]) {
          await page.setViewportSize({ width, height });
          const start = await page.evaluate(async () => {
            await new Promise(requestAnimationFrame);
            const scroller = document.querySelector('.cm-scroller');
            if (!(scroller instanceof HTMLElement))
              throw Error('Editor missing.');
            scroller.scrollTop = 0;
            await new Promise(requestAnimationFrame);
            const box = scroller.getBoundingClientRect();
            const footer = scroller.closest('main')?.querySelector('footer');
            if (!(footer instanceof HTMLElement))
              throw Error('Word count missing.');
            const footerBox = footer.getBoundingClientRect();
            return {
              height: scroller.clientHeight,
              content: scroller.scrollHeight,
              top: box.top,
              bottom: box.bottom,
              footerTop: footerBox.top,
              footerBottom: footerBox.bottom,
              footerHeight: footerBox.height,
            };
          });
          assert.ok(start.height > 100, 'The editor has room for text.');
          assert.ok(start.bottom <= height, 'The editor stays on the screen.');
          assert.ok(
            start.footerHeight > 0 &&
              start.footerTop >= 0 &&
              start.footerBottom <= height,
            'The resting word count stays on the screen.',
          );
          assert.ok(
            start.content > start.height + 500,
            'The test note is long.',
          );
          const x = width / 2,
            y = start.top + start.height * 0.75;
          const scroll = async () => {
            if (phone) {
              await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchStart',
                touchPoints: [{ x, y }],
              });
              for (let distance = 10; distance <= 150; distance += 10) {
                await cdp.send('Input.dispatchTouchEvent', {
                  type: 'touchMove',
                  touchPoints: [{ x, y: y - distance }],
                });
                await page.evaluate(() => new Promise(requestAnimationFrame));
              }
              await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchEnd',
                touchPoints: [],
              });
            } else {
              await cdp.send('Input.synthesizeScrollGesture', {
                x,
                y,
                yDistance: -150,
                speed: 600,
                gestureSourceType: 'mouse',
              });
            }
          };
          await scroll();
          const moved = await page.evaluate(async () => {
            const end = performance.now() + 5000;
            while (performance.now() < end) {
              const scroller = document.querySelector('.cm-scroller');
              if (scroller && scroller.scrollTop > 0) return true;
              await new Promise(requestAnimationFrame);
            }
            return false;
          });
          assert.ok(moved, 'Input scrolls the note.');
          await page.screenshot({
            path: `${output}/note-scroll-${width}-${height}-${scheme}.png`,
            animations: 'disabled',
          });
          // CodeMirror renders more lines as it approaches the end.
          const reachedEnd = await page.evaluate(async () => {
            const scroller = document.querySelector('.cm-scroller');
            if (!(scroller instanceof HTMLElement))
              throw Error('Editor missing.');
            const end = performance.now() + 5000;
            while (performance.now() < end) {
              scroller.scrollTop = scroller.scrollHeight;
              await new Promise(requestAnimationFrame);
              if (
                scroller.scrollTop > 0 &&
                scroller.scrollHeight -
                  scroller.clientHeight -
                  scroller.scrollTop <
                  2
              )
                return true;
            }
            return false;
          });
          assert.ok(reachedEnd, 'The end of the note can be reached.');
          // Start near the end after CodeMirror has rendered the final lines.
          // A second gesture must cover the remaining distance.
          await page.evaluate(async () => {
            const scroller = document.querySelector('.cm-scroller');
            if (!(scroller instanceof HTMLElement))
              throw Error('Editor missing.');
            scroller.scrollTop =
              scroller.scrollHeight - scroller.clientHeight - 80;
            await new Promise(requestAnimationFrame);
          });
          await scroll();
          const inputReachedEnd = await page.evaluate(async () => {
            const end = performance.now() + 5000;
            while (performance.now() < end) {
              const scroller = document.querySelector('.cm-scroller');
              if (
                scroller &&
                scroller.scrollTop > 0 &&
                scroller.scrollHeight -
                  scroller.clientHeight -
                  scroller.scrollTop <
                  2
              )
                return true;
              await new Promise(requestAnimationFrame);
            }
            return false;
          });
          assert.ok(inputReachedEnd, 'A second input gesture reaches the end.');
          process.stdout.write(`PASS ${width} x ${height} ${scheme}\n`);
        }
        assert.deepEqual(errors, [], 'The page has no script errors.');
      } finally {
        await context.close();
      }
    }
} finally {
  await browser.close();
}
