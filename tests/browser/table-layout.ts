/** Check table geometry in a disposable deployment with a long table note. */
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
const notePath = process.env.TABLE_NOTE_PATH;
const readerPath = process.env.TABLE_READER_PATH;
assert.ok(
  notePath?.startsWith('/w/'),
  'Set TABLE_NOTE_PATH to a long table fixture.',
);
assert.ok(
  readerPath?.startsWith('/published/'),
  'Set TABLE_READER_PATH to its published page.',
);
const origin = process.env.UI_AUDIT_ORIGIN ?? 'http://localhost:3000';
mkdirSync('.local-app/screenshots', { recursive: true });
const browser = await loaded.chromium.launch();
try {
  for (const width of [320, 390, 1440])
    for (const scheme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        storageState:
          process.env.UI_AUDIT_STATE ?? '.local-app/review-session.json',
        viewport: { width, height: 844 },
        hasTouch: width < 1024,
        isMobile: width < 1024,
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
        await page.locator('.cm-np-table-head').first().waitFor();
        const geometry = async () =>
          page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise(requestAnimationFrame);
            const table = document.querySelector('.cm-np-table');
            if (!(table instanceof HTMLElement)) throw Error('Table missing.');
            const rows = [
              ...document.querySelectorAll(
                '.cm-np-table-line:not(.cm-np-table-closed)',
              ),
            ];
            const bounds = new Map<string, { left: number; width: number }>();
            for (const row of rows)
              for (const cell of row.querySelectorAll(
                '.cm-np-table-cell, .cm-np-table-head',
              )) {
                const column = getComputedStyle(cell).gridColumnStart;
                const box = cell.getBoundingClientRect();
                const previous = bounds.get(column);
                if (
                  previous &&
                  (Math.abs(previous.left - box.left) > 1 ||
                    Math.abs(previous.width - box.width) > 1)
                )
                  throw Error('Table columns do not align.');
                bounds.set(column, { left: box.left, width: box.width });
                if (box.height < 24)
                  throw Error('An empty cell has no usable height.');
              }
            return {
              tracks: getComputedStyle(rows[0] ?? table).gridTemplateColumns,
              columns: bounds.size,
              width: table.clientWidth,
              content: table.scrollWidth,
              pageWidth: document.documentElement.scrollWidth,
              viewport: innerWidth,
            };
          });
        const start = await geometry();
        assert.equal(start.columns, 3);
        assert.ok(
          start.pageWidth <= start.viewport,
          'A wide table must not widen the page.',
        );
        assert.ok(
          start.content > start.width,
          'The fixture must require horizontal scroll.',
        );
        await page.screenshot({
          path: `.local-app/screenshots/table-editor-${width}-${scheme}.png`,
        });
        await page.locator('.cm-scroller').evaluate(async (element) => {
          element.scrollTop = element.scrollHeight / 2;
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        assert.equal(
          (await geometry()).tracks,
          start.tracks,
          'Rows outside the first viewport use the same tracks.',
        );
        await page.locator('.cm-np-table').evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
        });
        assert.equal((await geometry()).tracks, start.tracks);
        await page.locator('.cm-scroller').evaluate(async (element) => {
          element.scrollTop = 0;
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        assert.equal(
          (await geometry()).tracks,
          start.tracks,
          'Returning to the header must not resize columns.',
        );
        await page.goto(origin + readerPath);
        await page.locator('.notes-table-scroll table').waitFor();
        const reader = await page
          .locator('.notes-table-scroll')
          .evaluate((element) => {
            const rows = [...element.querySelectorAll('tr')];
            const header = [...(rows[0]?.querySelectorAll('th') ?? [])].map(
              (cell) => cell.getBoundingClientRect(),
            );
            for (const row of rows.slice(1))
              [...row.querySelectorAll('td')].forEach((cell, index) => {
                const box = cell.getBoundingClientRect();
                const head = header[index];
                if (
                  !head ||
                  Math.abs(head.left - box.left) > 1 ||
                  Math.abs(head.width - box.width) > 1
                )
                  throw Error('Reader columns do not align.');
              });
            return {
              display: getComputedStyle(
                element.querySelector('table') ?? element,
              ).display,
              pageWidth: document.documentElement.scrollWidth,
              viewport: innerWidth,
            };
          });
        assert.equal(reader.display, 'table');
        assert.ok(reader.pageWidth <= reader.viewport);
        await page.screenshot({
          path: `.local-app/screenshots/table-reader-${width}-${scheme}.png`,
        });
        assert.deepEqual(errors, []);
        process.stdout.write(`Table layout passed: ${width} px, ${scheme}.\n`);
      } finally {
        await context.close();
      }
    }
} finally {
  await browser.close();
}
