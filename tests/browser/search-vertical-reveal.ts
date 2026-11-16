/**
 * Component check: Find shows a match vertically when it ends on hidden
 * table syntax.
 *
 * The editor scrolls a range by the caret of its head, and a hidden pipe
 * has none, so a match that ended there did not scroll into view at all.
 * Each case starts from where the person is, with no row placed first. The
 * check measures the rendered text of the selected match: it must sit
 * inside the editor and the visible area, clear of the floating find card,
 * and inside its table.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { hasChromium, type Page } from './browser.ts';

const loaded: unknown = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ?? '.local-app/playwright-installed.mjs',
  ).href
);
assert.ok(hasChromium(loaded));
const browser = await loaded.chromium.launch();
const output =
  process.env.SEARCH_VERTICAL_OUTPUT ?? '.local-app/search-vertical-reveal';
mkdirSync(output, { recursive: true });

/** The rendered text of the selected match, or its caret, and the frames. */
function measure(page: Page) {
  return page.evaluate(() => {
    const fixture = window.searchTableReveal;
    const state = fixture.snapshot();
    const scroller = document.querySelector('.cm-scroller');
    const panel = document.querySelector('.cm-np-search');
    const area = window.visualViewport;
    if (!(scroller instanceof HTMLElement)) throw Error('No scroller.');
    const frame = scroller.getBoundingClientRect();
    const card = panel?.getBoundingClientRect() ?? null;
    return {
      count: state.count,
      selected: state.selected,
      empty: state.selection.empty,
      parts: state.parts,
      match: state.match,
      top: Math.max(frame.top, area?.offsetTop ?? 0),
      bottom: Math.min(
        frame.bottom,
        (area?.offsetTop ?? 0) + (area?.height ?? window.innerHeight),
      ),
      card:
        card === null
          ? null
          : {
              top: card.top,
              bottom: card.bottom,
              left: card.left,
              right: card.right,
            },
      scrollTop: fixture.top(),
    };
  });
}

type Measure = Awaited<ReturnType<typeof measure>>;

/** The selected match shows whole: in the text, in its table, off the card. */
function assertVisible(state: Measure, step: string): void {
  assert.ok(state.match !== null, `${step}: no rendered match`);
  const boxes =
    state.parts.length > 0
      ? state.parts
      : [
          {
            left: state.match.left,
            right: state.match.right,
            top: state.match.top,
            bottom: state.match.bottom,
          },
        ];
  for (const box of boxes) {
    assert.ok(
      box.top >= state.top - 0.5 && box.bottom <= state.bottom + 0.5,
      `${step}: text ${String(Math.round(box.top))}..${String(Math.round(box.bottom))} is outside ${String(Math.round(state.top))}..${String(Math.round(state.bottom))}`,
    );
    assert.ok(
      box.left >= state.match.boxLeft - 0.5 &&
        box.right <= state.match.boxRight + 0.5,
      `${step}: text is outside its table`,
    );
    const card = state.card;
    if (card !== null)
      assert.ok(
        box.bottom <= card.top ||
          box.top >= card.bottom ||
          box.right <= card.left ||
          box.left >= card.right,
        `${step}: the find card covers the text`,
      );
  }
}

const viewports = [
  { name: '1440', width: 1440, height: 900, touch: false },
  { name: '390', width: 390, height: 844, touch: false },
  { name: '320', width: 320, height: 844, touch: false },
  // A short browser window. It is not the visual viewport of a phone
  // keyboard, which this check does not drive.
  { name: '390x420-short-viewport', width: 390, height: 420, touch: false },
] as const;

try {
  for (const viewport of viewports)
    for (const theme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: theme,
        hasTouch: viewport.touch,
        isMobile: viewport.touch,
      });
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (
            message.type() === 'error' &&
            /plugin|handler|update/i.test(message.text())
          )
            errors.push(message.text());
        });
        await page.goto(
          (process.env.UI_AUDIT_ORIGIN ?? 'http://127.0.0.1:3019') +
            '/tests/browser/fixtures/search-table-reveal.html?theme=' +
            theme,
        );
        await page.evaluate(() => {
          const main = document.querySelector('main');
          if (main instanceof HTMLElement)
            main.style.width = `${String(Math.min(900, window.innerWidth))}px`;
          return window.searchTableReveal.ready;
        });
        const steps: Record<string, Measure> = {};
        const find = async (name: string, query: string): Promise<Measure> => {
          await page.getByLabel('Find', { exact: true }).fill(query);
          await page.getByLabel('Find', { exact: true }).press('Enter');
          await page.evaluate(() => window.searchTableReveal.settle());
          const state = await measure(page);
          steps[name] = state;
          return state;
        };
        // The option toggles show on a wide card, and in the options sheet
        // on a narrow one.
        const regexp = async (on: boolean): Promise<void> => {
          const toggle = page
            .locator('.cm-np-search button[aria-label="Regular expression"]')
            .first();
          if (await toggle.isVisible()) {
            if ((await toggle.getAttribute('aria-pressed')) !== String(on))
              await toggle.click();
            return;
          }
          await page.getByRole('button', { name: 'More find options' }).click();
          const option = page
            .locator('[role=dialog] button[role=switch]')
            .filter({ hasText: 'Regular expression' });
          if ((await option.getAttribute('aria-checked')) !== String(on))
            await option.click();
          await page.getByRole('button', { name: 'Done' }).click();
        };
        const wide = viewport.width >= 1024;

        // A far jump from the start to a match that ends on a hidden pipe.
        await page.evaluate(() => window.searchTableReveal.home());
        await page.keyboard.press('Control+f');
        await regexp(true);
        const hiddenEnd = 'D cell 1 10 plain words \\| dx \\|';
        let state = await find('far-hidden-end', hiddenEnd);
        assert.equal(state.selected, 'D cell 1 10 plain words | dx |');
        assertVisible(state, 'far jump to a hidden end');

        // The same with the replace row open, where the card is taller.
        if (wide) {
          await page.keyboard.press('Escape');
          await page.evaluate(() => window.searchTableReveal.home());
          await page.keyboard.press('Control+h');
          await page.getByLabel('Find', { exact: true }).focus();
          state = await find('far-hidden-end-replace', hiddenEnd);
          assertVisible(state, 'far jump with the replace row open');
          await page.getByRole('button', { name: 'Show replace' }).click();
        }

        // Wrap around from the end of the note to the first table.
        await page.keyboard.press('Escape');
        await page.evaluate(() => window.searchTableReveal.end());
        await page.keyboard.press('Control+f');
        state = await find('wrap-hidden-end', 'A cell 0 13 plain words \\|');
        assert.equal(state.count, '1 of 1');
        assertVisible(state, 'wrap around to a hidden end');

        // A visible end, and a zero width match, still show.
        state = await find('visible-end', 'D cell 2 10 plain');
        assertVisible(state, 'a visible end');
        state = await find('zero-width', '(?=C cell 3 11)');
        assert.equal(state.empty, true);
        assertVisible(state, 'a zero width match');

        // Across rows, ending on a pipe: a tall match shows its start.
        state = await find(
          'cross-row-hidden-end',
          'D cell 0 13 plain words \\|\\n\\| D cell 1 0 plain words \\|',
        );
        assert.ok(state.parts.length > 0);
        const first = state.parts[0];
        assert.ok(first !== undefined);
        assert.ok(
          first.top >= state.top - 0.5 && first.bottom <= state.bottom + 0.5,
          'the start of a match across rows is outside the text',
        );

        // Next and Previous through four tables, every end hidden.
        await page
          .getByLabel('Find', { exact: true })
          .fill('cell 0 13 plain words \\|');
        await page.evaluate(() => window.searchTableReveal.home());
        await page.keyboard.press('Control+f');
        for (let press = 1; press <= 4; press++) {
          await page.getByRole('button', { name: 'Next' }).click();
          await page.evaluate(() => window.searchTableReveal.settle());
          state = await measure(page);
          steps[`next-${String(press)}`] = state;
          assertVisible(state, `Next ${String(press)}`);
        }
        for (let press = 1; press <= 3; press++) {
          await page.getByRole('button', { name: 'Previous' }).click();
          await page.evaluate(() => window.searchTableReveal.settle());
          state = await measure(page);
          steps[`previous-${String(press)}`] = state;
          assertVisible(state, `Previous ${String(press)}`);
        }

        // A wheel moves the text away, and it stays where the person put it.
        const before = state.scrollTop;
        await page.mouse.move(
          viewport.width / 2,
          Math.min(300, viewport.height - 40),
        );
        await page.mouse.wheel(0, -1500);
        await page.evaluate(() => window.searchTableReveal.settle());
        state = await measure(page);
        steps['wheel'] = state;
        assert.ok(
          state.scrollTop < before - 100,
          'the wheel did not move the text',
        );
        await page.evaluate(() => window.searchTableReveal.settle());
        assert.equal((await measure(page)).scrollTop, state.scrollTop);

        // Replace acts on the match that shows, after a far jump. A pipe in
        // a replacement is escaped inside a cell, so the words carry none.
        if (wide) {
          await regexp(false);
          await page.getByLabel('Find', { exact: true }).fill('dx');
          await page.evaluate(() => window.searchTableReveal.home());
          await page.keyboard.press('Control+h');
          await page.keyboard.type('dy');
          await page.getByLabel('Find', { exact: true }).press('Enter');
          await page.evaluate(() => window.searchTableReveal.settle());
          state = await measure(page);
          assert.equal(state.selected, 'dx');
          assertVisible(state, 'match before replace');
          const textBefore = (
            await page.evaluate(() => window.searchTableReveal.snapshot())
          ).text;
          await page
            .getByRole('button', { name: 'Replace', exact: true })
            .click();
          await page.evaluate(() => window.searchTableReveal.settle());
          const textAfter = (
            await page.evaluate(() => window.searchTableReveal.snapshot())
          ).text;
          assert.equal(textAfter, textBefore.replace('| dx |', '| dy |'));
          await page.keyboard.press('Escape');
          await page.keyboard.press('Control+z');
          assert.equal(
            (await page.evaluate(() => window.searchTableReveal.snapshot()))
              .text,
            textBefore,
          );
          await page.keyboard.press('Control+y');
          assert.equal(
            (await page.evaluate(() => window.searchTableReveal.snapshot()))
              .text,
            textAfter,
          );
        }

        assert.deepEqual(errors, []);
        writeFileSync(
          `${output}/${viewport.name}-${theme}-steps.json`,
          JSON.stringify(steps, null, 2),
        );
        await page.screenshot({
          path: `${output}/${viewport.name}-${theme}.png`,
        });
        process.stdout.write(
          `Vertical reveal passed: ${viewport.name} ${theme}\n`,
        );
      } finally {
        await context.close();
      }
    }
} finally {
  await browser.close();
}
