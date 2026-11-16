/** Complete outlines and navigation in the local candidate deployment. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { hasChromium, type Page } from './browser.ts';

const loaded: unknown = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '.local-app/node_modules/playwright-core/index.mjs',
  ).href
);
assert.ok(hasChromium(loaded));
const notePath = process.env.OUTLINE_NOTE_PATH;
const otherPath = process.env.OUTLINE_OTHER_PATH;
assert.ok(
  notePath?.startsWith('/w/'),
  'Set OUTLINE_NOTE_PATH to a disposable note.',
);
assert.ok(
  otherPath?.startsWith('/w/'),
  'Set OUTLINE_OTHER_PATH to a second disposable note.',
);
const origin = process.env.UI_AUDIT_ORIGIN ?? 'http://localhost:3000';
const output = '.local-app/screenshots';
mkdirSync(output, { recursive: true });
const source = Array.from(
  { length: 42 },
  (_, index) =>
    `${'#'.repeat((index % 6) + 1)} Section ${String(index + 1)}\n\n${'Synthetic text for a long note. '.repeat(28)}\n\n`,
)
  .join('')
  .replace('Synthetic', 'Test note');
assert.equal(source.length, 38400);
assert.equal(source.trim().split(/\s+/u).length, 7183);
writeFileSync('.local-app/outline-safe-note.md', source);
const results: unknown[] = [];

async function rows(
  page: Page,
  expected: number,
  lastText?: string,
): Promise<void> {
  const passed = await page.evaluate(
    async ({ count, last }) => {
      const end = performance.now() + 10000;
      do {
        const found = document.querySelectorAll('[data-outline-level]');
        if (
          found.length === count &&
          (last === undefined || found.item(count - 1)?.textContent === last)
        )
          return true;
        await new Promise(requestAnimationFrame);
      } while (performance.now() < end);
      return false;
    },
    { count: expected, last: lastText },
  );
  if (!passed) {
    await page.screenshot({ path: `${output}/note-outline-failure.png` });
    const detail = await page.evaluate(() => ({
      url: location.href,
      rows: Array.from(document.querySelectorAll('[data-outline-level]')).map(
        (row) => row.textContent,
      ),
      words: document.querySelector('footer')?.textContent,
    }));
    assert.fail(
      `Expected ${String(expected)} outline rows: ${JSON.stringify(detail)}`,
    );
  }
}

/** Clear the full CodeMirror document, including text outside its DOM viewport. */
async function replaceText(page: Page, text: string): Promise<void> {
  const editor = page.locator('.cm-content');
  await editor.press('Control+a');
  await editor.press('Backspace');
  if (text !== '') await editor.fill(text);
}

/** Wait for the checkpoint before a full-page navigation or a new session. */
async function checkpoint(page: Page): Promise<void> {
  await page.locator('.cm-content').press('Control+s');
  await page.locator('[data-save-state="saved-server"]').waitFor();
}

const browser = await loaded.chromium.launch();
try {
  for (const width of [1440, 390])
    for (const scheme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        storageState:
          process.env.UI_AUDIT_STATE ?? '.local-app/review-session.json',
        viewport: { width, height: 900 },
        hasTouch: width < 1024,
        isMobile: width < 1024,
        colorScheme: scheme,
      });
      try {
        process.stdout.write(`Checking ${String(width)} ${scheme}\n`);
        await context.addInitScript(
          (theme) => localStorage.setItem('notesapp.theme', theme),
          scheme,
        );
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(origin + notePath);
        const editor = page.locator('.cm-content');
        await editor.waitFor();
        const start = performance.now();
        await replaceText(page, source);
        await rows(page, 42);
        await page
          .getByText('7141 words', { exact: true })
          .waitFor({ state: 'attached' });
        await checkpoint(page);
        const elapsed = performance.now() - start;
        const pasted = await page.evaluate(() => ({
          scroll: document.querySelector('.cm-scroller')?.scrollTop,
          rows: Array.from(
            document.querySelectorAll('[data-outline-level]'),
          ).map((row) => ({
            level: row.getAttribute('data-outline-level'),
            text: row.textContent,
          })),
        }));
        assert.equal(pasted.rows.length, 42);
        for (const [index, row] of pasted.rows.entries()) {
          assert.equal(row.text, `Section ${String(index + 1)}`);
          assert.equal(row.level, String((index % 6) + 1));
        }
        // Reopen at the start. All rows must exist without editor scrolling.
        await page.goto(origin + otherPath);
        await page.locator('.cm-content').waitFor();
        await replaceText(page, '### Other note\n');
        await rows(page, 1, 'Other note');
        await checkpoint(page);
        const openedAt = performance.now();
        await page.goto(origin + notePath);
        await editor.waitFor();
        await rows(page, 42);
        const initial = await page.evaluate(() => ({
          scroll: document.querySelector('.cm-scroller')?.scrollTop,
          headings: document.querySelectorAll('[data-outline-level]').length,
        }));
        const initialOpenMs = performance.now() - openedAt;
        assert.equal(initial.scroll, 0);
        assert.equal(initial.headings, 42);
        await page.screenshot({
          path: `${output}/note-outline-initial-${String(width)}-${scheme}.png`,
          animations: 'disabled',
        });
        if (width >= 1280) {
          const insets = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-outline-level]'))
              .slice(0, 6)
              .map(
                (row) =>
                  row.querySelector('span')?.getBoundingClientRect().left,
              ),
          );
          for (let index = 1; index < insets.length; index += 1) {
            const before = insets[index - 1],
              current = insets[index];
            assert.ok(
              before !== undefined && current !== undefined && current > before,
              'Deeper levels have a larger inset.',
            );
          }
          for (let index = 36; index < 42; index += 1) {
            const row = page.locator('[data-outline-level]').nth(index);
            await row.scrollIntoViewIfNeeded();
            await row.click();
            assert.equal(
              await page.evaluate(
                async (text) => {
                  const end = performance.now() + 5000;
                  do {
                    const scroller = document.querySelector('.cm-scroller');
                    const bounds = scroller?.getBoundingClientRect();
                    if (
                      bounds &&
                      scroller &&
                      scroller.scrollTop > 0 &&
                      Array.from(document.querySelectorAll('.cm-line')).some(
                        (line) => {
                          if (!line.textContent?.includes(text)) return false;
                          const range = document.createRange();
                          range.selectNodeContents(line);
                          const content = range.getBoundingClientRect();
                          const selection = window.getSelection()?.anchorNode;
                          return (
                            content.top >= bounds.top &&
                            content.bottom <= bounds.bottom &&
                            selection !== null &&
                            selection !== undefined &&
                            line.contains(selection)
                          );
                        },
                      )
                    )
                      return true;
                    await new Promise(requestAnimationFrame);
                  } while (performance.now() < end);
                  return false;
                },
                `Section ${String(index + 1)}`,
              ),
              true,
              'Click reveals the distant heading.',
            );
          }
        } else {
          assert.equal(
            await page
              .locator('aside[aria-label="Note outline and inbound links"]')
              .boundingBox(),
            null,
            'The outline is hidden on phones.',
          );
        }
        // Repeated text, skipped levels, fences, and edits at the end.
        await replaceText(
          page,
          source +
            '### Repeated\n\n###### Repeated\n\n```typescript\n# Fake\n```\n',
        );
        await rows(page, 44);
        await replaceText(page, source + '### Repeated\n\n###### Renamed\n');
        await rows(page, 44, 'Renamed');
        assert.equal(
          await page
            .locator('[data-outline-level]')
            .nth(43)
            .evaluate((el) => el.textContent),
          'Renamed',
        );
        await replaceText(page, source);
        await rows(page, 42);
        await replaceText(page, 'No headings here.\n');
        await rows(page, 0);
        await replaceText(page, '');
        await rows(page, 0);
        await replaceText(page, source);
        await rows(page, 42);
        await checkpoint(page);
        await page.goto(origin + notePath);
        await editor.waitFor();
        await rows(page, 42);
        if (width >= 1280) {
          await page
            .locator('[data-outline-level]')
            .nth(41)
            .scrollIntoViewIfNeeded();
          await page.locator('[data-outline-level]').nth(41).click();
        }
        await page.screenshot({
          path: `${output}/note-outline-${String(width)}-${scheme}.png`,
          animations: 'disabled',
        });
        assert.deepEqual(errors, []);
        results.push({
          width,
          scheme,
          headings: 42,
          replaceAndSaveMs: elapsed,
          initialOpenMs,
          initial,
          pasted,
          errors,
        });
      } finally {
        await context.close();
      }
    }
} finally {
  await browser.close();
}
writeFileSync(
  '.local-app/outline-browser-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
process.stdout.write(
  'Outline checks passed in both themes at desktop and phone widths.\n',
);
