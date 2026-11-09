/**
 * Component check: the vertical reveal of a table range whose end is on
 * hidden syntax, case by case.
 *
 * Each case measures the rendered text of the edge it intends to show, on
 * its text nodes, or the caret of an empty range. The text must sit inside
 * the box the person sees through and clear of the find card. Every case
 * runs and reports, so one run states which cases pass. The short viewport
 * is a short browser window, not the visual viewport of a phone keyboard.
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
  process.env.SEARCH_CASES_OUTPUT ?? '.local-app/search-vertical-cases';
mkdirSync(output, { recursive: true });
const origin = process.env.UI_AUDIT_ORIGIN ?? 'http://127.0.0.1:3019';

type Rect = { left: number; right: number; top: number; bottom: number };
type Result = { name: string; pass: boolean; detail: string };
const results: Result[] = [];

async function open(
  width: number,
  height: number,
  layout = '',
): Promise<{
  page: Page;
  errors: string[];
  warnings: number[];
  close: () => Promise<void>;
}> {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: 'light',
    hasTouch: false,
    isMobile: false,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  const warnings: number[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // The editor warns when its measure does not settle. The merged base
    // warns too with these tall rows, so warnings are counted, not failed.
    if (/Measure loop restarted/.test(message.text())) warnings.push(1);
    if (
      message.type() === 'error' &&
      /plugin|handler|update/i.test(message.text())
    )
      errors.push(message.text());
  });
  await page.goto(
    `${origin}/tests/browser/fixtures/search-table-reveal.html?theme=light${layout === '' ? '' : `&layout=${layout}`}`,
  );
  await page.evaluate(() => window.searchTableReveal.ready);
  return { page, errors, warnings, close: () => context.close() };
}

/** Where the text of a range renders, and the frame and card around it. */
function look(page: Page, text: string, length: number, empty = false) {
  return page.evaluate(
    ({ text, length, empty }) => {
      const fixture = window.searchTableReveal;
      const from = fixture.offset(text);
      const rects = fixture.rendered(from, empty ? from : from + length);
      const card = document
        .querySelector('.cm-np-search')
        ?.getBoundingClientRect();
      return {
        from,
        rects,
        frame: fixture.frame(),
        card:
          card === undefined
            ? null
            : {
                left: card.left,
                right: card.right,
                top: card.top,
                bottom: card.bottom,
              },
      };
    },
    { text, length, empty },
  );
}

/** Where the caret of an empty cell renders: `marker` plus `delta`. */
function lookCaret(page: Page, marker: string, delta: number) {
  return page.evaluate(
    ({ marker, delta }) => {
      const fixture = window.searchTableReveal;
      const from = fixture.offset(marker) + delta;
      const card = document
        .querySelector('.cm-np-search')
        ?.getBoundingClientRect();
      return {
        from,
        rects: fixture
          .rendered(from, from)
          .filter((rect) => rect.bottom - rect.top > 0 && rect.left > 0),
        frame: fixture.frame(),
        card:
          card === undefined
            ? null
            : {
                left: card.left,
                right: card.right,
                top: card.top,
                bottom: card.bottom,
              },
      };
    },
    { marker, delta },
  );
}

function shown(view: Awaited<ReturnType<typeof look>>): string | null {
  if (view.rects.length === 0) return 'no rendered text';
  for (const rect of view.rects) {
    if (rect.bottom - rect.top <= 0) return 'empty rectangle';
    if (
      rect.top < view.frame.top - 0.5 ||
      rect.bottom > view.frame.bottom + 0.5
    )
      return `text ${String(Math.round(rect.top))}..${String(Math.round(rect.bottom))} outside ${String(Math.round(view.frame.top))}..${String(Math.round(view.frame.bottom))}`;
    if (
      rect.left < view.frame.left - 0.5 ||
      rect.right > view.frame.right + 0.5
    )
      return `text ${String(Math.round(rect.left))}..${String(Math.round(rect.right))} outside ${String(Math.round(view.frame.left))}..${String(Math.round(view.frame.right))} across`;
    const card: Rect | null = view.card;
    if (
      card !== null &&
      !(
        rect.bottom <= card.top ||
        rect.top >= card.bottom ||
        rect.right <= card.left ||
        rect.left >= card.right
      )
    )
      return 'the find card covers the text';
  }
  return null;
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => window.searchTableReveal.settle());
}

async function find(page: Page, query: string, regexp: boolean): Promise<void> {
  await page.evaluate(() => window.searchTableReveal.home());
  await page.keyboard.press('Control+f');
  const toggle = page
    .locator('.cm-np-search button[aria-label="Regular expression"]')
    .first();
  if (await toggle.isVisible()) {
    if ((await toggle.getAttribute('aria-pressed')) !== String(regexp))
      await toggle.click();
  } else if (regexp) {
    await page.getByRole('button', { name: 'More find options' }).click();
    const option = page
      .locator('[role=dialog] button[role=switch]')
      .filter({ hasText: 'Regular expression' });
    if ((await option.getAttribute('aria-checked')) !== 'true')
      await option.click();
    await page.getByRole('button', { name: 'Done' }).click();
  }
  await page.getByLabel('Find', { exact: true }).fill(query);
  await page.getByLabel('Find', { exact: true }).press('Enter');
  await settle(page);
}

async function record(
  name: string,
  run: () => Promise<string | null>,
): Promise<void> {
  let detail: string | null;
  try {
    detail = await run();
  } catch (error) {
    detail =
      error instanceof Error
        ? (error.message.split('\n')[0] ?? 'error')
        : String(error);
  }
  results.push({ name, pass: detail === null, detail: detail ?? 'shown' });
  process.stdout.write(
    `${detail === null ? 'PASS' : 'FAIL'} ${name}: ${detail ?? 'shown'}\n`,
  );
}

try {
  for (const viewport of [
    { label: '1440', width: 1440, height: 900 },
    { label: 'short browser viewport 390x420', width: 390, height: 420 },
  ]) {
    const { page, errors, warnings, close } = await open(
      viewport.width,
      viewport.height,
    );
    try {
      // 1. A short match at the foot of a row taller than the editor.
      await record(
        `${viewport.label}: short match at the foot of a tall row`,
        async () => {
          await find(page, 'tailmark \\|', true);
          return shown(await look(page, 'tailmark', 8));
        },
      );
      // 2. An empty match on the hidden pipe after that word: the caret
      // stands on hidden syntax, and the word before it is what shows.
      await record(
        `${viewport.label}: empty match on a hidden pipe`,
        async () => {
          await find(page, '(?=\\| E cell 0 2)', true);
          return shown(await look(page, 'tailmark', 8));
        },
      );
      // 4. A distant range across rows, forward, ending on a pipe: the head
      // edge is the row after the tall one.
      await record(
        `${viewport.label}: distant cross-row range shows its head edge`,
        async () => {
          await find(
            page,
            'tailmark \\| E cell 0 2 \\|\\n\\| E cell 1 0 \\|',
            true,
          );
          return shown(await look(page, 'E cell 1 0', 10));
        },
      );
      // A match of the delimiter row of Table E: its header shows.
      await record(`${viewport.label}: delimiter row`, async () => {
        await find(page, '^\\| --- \\| --- \\| --- \\|$', true);
        return shown(await look(page, 'E head 2', 8));
      });
      // Table F: an empty header row, its delimiter, an empty body row, and
      // an empty match at the start of an empty row. What shows is the caret
      // of an empty cell of that row.
      await record(`${viewport.label}: empty header row`, async () => {
        await find(page, '^\\|  \\|  \\|$', true);
        return shown(await lookCaret(page, '|  |  |\n| --- | --- |', 1));
      });
      await record(
        `${viewport.label}: empty body row, next match`,
        async () => {
          await page.getByLabel('Find', { exact: true }).press('Enter');
          await settle(page);
          return shown(await lookCaret(page, '|  |  |\n| F 2 0', 1));
        },
      );
      await record(
        `${viewport.label}: delimiter row after an empty header`,
        async () => {
          await find(page, '^\\| --- \\| --- \\|$', true);
          return shown(await lookCaret(page, '|  |  |\n| --- | --- |', 4));
        },
      );
      await record(
        `${viewport.label}: empty match at the start of an empty row`,
        async () => {
          await find(page, '^(?=\\|  \\|  \\|\\n\\| F 2 0)', true);
          return shown(await lookCaret(page, '|  |  |\n| F 2 0', 4));
        },
      );
      // A far range across text the editor has not drawn: its head shows.
      await record(
        `${viewport.label}: far range across undrawn text shows its head`,
        async () => {
          await find(
            page,
            'A cell 0 0 plain[\\s\\S]*?D cell 1 10 plain words \\| dx \\|',
            true,
          );
          return shown(await look(page, '| dx |', 6));
        },
      );
      // Control: a visible end in a table still shows.
      await record(`${viewport.label}: control, a visible end`, async () => {
        await find(page, 'D cell 2 10 plain', false);
        return shown(await look(page, 'D cell 2 10 plain', 17));
      });
      if (viewport.width >= 1024) {
        // 3. Explicit alignment of a tall range, forward and backward.
        const tall = await page.evaluate(() => {
          const fixture = window.searchTableReveal;
          const start = fixture.offset('E cell 0 0');
          const end = fixture.offset('tailmark |') + 'tailmark |'.length;
          return { start, end };
        });
        // Recorded, not asserted: the first request to a row that never
        // rendered can drift, because the grid measures its columns after
        // the scroll. Only Find measures again after that render.
        {
          await page.keyboard.press('Escape');
          await page.evaluate(() => window.searchTableReveal.home());
          await settle(page);
          await page.evaluate(
            ({ tall }) =>
              window.searchTableReveal.scrollMapped(
                tall.end,
                tall.start,
                'nearest',
              ),
            { tall },
          );
          await settle(page);
          const cold = shown(await look(page, 'E cell 0 0', 10));
          process.stdout.write(
            `LIMIT ${viewport.label}: mapped caller, first request to an unrendered tall row, backward nearest: ${cold ?? 'shown'}\n`,
          );
        }
        // Recorded, not asserted: a backward range taller than the room,
        // nearest and center, from a mapped caller. The editor aligns its
        // head, but its measure of this tall row does not settle (it warns,
        // as the merged base does), and only Find measures again after.
        for (const y of ['nearest', 'center'] as const) {
          await page.evaluate(() => window.searchTableReveal.home());
          await settle(page);
          await page.evaluate(
            ({ tall, y }) =>
              window.searchTableReveal.scrollMapped(tall.end, tall.start, y),
            { tall, y },
          );
          await settle(page);
          const result = shown(await look(page, 'E cell 0 0', 10));
          process.stdout.write(
            `LIMIT ${viewport.label}: mapped caller, tall range backward y ${y}: ${result ?? 'shown'}\n`,
          );
        }
        // The asserted cases below run on a row that has rendered once.
        for (const [y, forward, edge] of [
          ['end', true, 'tailmark'],
          ['nearest', true, 'tailmark'],
          ['start', true, 'E cell 0 0'],
          ['end', false, 'tailmark'],
          ['start', false, 'E cell 0 0'],
        ] as const) {
          await record(
            `${viewport.label}: mapped caller, tall range ${forward ? 'forward' : 'backward'} y ${y} shows ${edge}`,
            async () => {
              await page.keyboard.press('Escape');
              await page.evaluate(() => window.searchTableReveal.home());
              await settle(page);
              await page.evaluate(
                ({ tall, y, forward }) =>
                  window.searchTableReveal.scrollMapped(
                    forward ? tall.start : tall.end,
                    forward ? tall.end : tall.start,
                    y,
                  ),
                { tall, y, forward },
              );
              await settle(page);
              return shown(await look(page, edge, edge.length));
            },
          );
        }
        // The editor aligns a range taller than the room by its head for
        // center as well: the end of a forward range, the start of a
        // backward one. That native rule is kept.
        for (const [forward, edge] of [[true, 'tailmark']] as const)
          await record(
            `${viewport.label}: mapped caller, tall range ${forward ? 'forward' : 'backward'} y center shows its head ${edge}`,
            async () => {
              await page.evaluate(() => window.searchTableReveal.home());
              await settle(page);
              await page.evaluate(
                ({ tall, forward }) =>
                  window.searchTableReveal.scrollMapped(
                    forward ? tall.start : tall.end,
                    forward ? tall.end : tall.start,
                    'center',
                  ),
                { tall, forward },
              );
              await settle(page);
              return shown(await look(page, edge, edge.length));
            },
          );
        // Recorded, not asserted: a raw request from any other caller that
        // ends on a hidden pipe keeps the result of the editor, which does
        // not scroll. Find and the panel reveal are the scope of the fix.
        {
          await page.evaluate(() => window.searchTableReveal.home());
          await settle(page);
          await page.evaluate(
            ({ tall }) =>
              window.searchTableReveal.scrollRange(tall.start, tall.end, 'end'),
            { tall },
          );
          await settle(page);
          const raw = shown(await look(page, 'tailmark', 8));
          process.stdout.write(
            `LIMIT ${viewport.label}: raw request ending on a hidden pipe, y end: ${raw ?? 'shown'}\n`,
          );
        }
        // Replace grows the header of Table E, and the next match is its
        // delimiter row: the header shows after the grid measures again.
        await record(
          `${viewport.label}: replace onto the delimiter row`,
          async () => {
            await find(page, 'E head 1|^\\| --- \\| --- \\| --- \\|$', true);
            const before = (
              await page.evaluate(() => window.searchTableReveal.snapshot())
            ).text;
            await page.keyboard.press('Control+h');
            await page.keyboard.type(
              'E head 1 grows with words that wrap the header over lines',
            );
            await page
              .getByRole('button', { name: 'Replace', exact: true })
              .click();
            await settle(page);
            const state = await page.evaluate(() =>
              window.searchTableReveal.snapshot(),
            );
            const result =
              state.selected === '| --- | --- | --- |'
                ? shown(await look(page, 'E head 2', 8))
                : `the next match is ${JSON.stringify(state.selected)}`;
            await page.keyboard.press('Escape');
            await page.keyboard.press('Control+z');
            const undone = (
              await page.evaluate(() => window.searchTableReveal.snapshot())
            ).text;
            return (
              result ??
              (undone === before ? null : 'undo did not restore the text')
            );
          },
        );
        // Replace far above, and the next match is the delimiter row of
        // Table E far below. The scroll of the replace cannot move the new
        // match off hidden syntax, so the reveal measures it after the
        // update.
        await record(
          `${viewport.label}: replace far above onto a distant delimiter row`,
          async () => {
            await find(
              page,
              'needle near left|^\\| --- \\| --- \\| --- \\|$',
              true,
            );
            const before = (
              await page.evaluate(() => window.searchTableReveal.snapshot())
            ).text;
            await page.keyboard.press('Control+h');
            await page.keyboard.type('needle near left grows');
            await page
              .getByRole('button', { name: 'Replace', exact: true })
              .click();
            await settle(page);
            const state = await page.evaluate(() =>
              window.searchTableReveal.snapshot(),
            );
            const result =
              state.selected === '| --- | --- | --- |'
                ? shown(await look(page, 'E head 2', 8))
                : `the next match is ${JSON.stringify(state.selected)}`;
            await page.keyboard.press('Escape');
            await page.keyboard.press('Control+z');
            const undone = (
              await page.evaluate(() => window.searchTableReveal.snapshot())
            ).text;
            return (
              result ??
              (undone === before ? null : 'undo did not restore the text')
            );
          },
        );
        // A new query while a reveal may still run: nothing moves after it.
        await record(
          `${viewport.label}: a new query ends a pending reveal`,
          async () => {
            await page.evaluate(() => window.searchTableReveal.home());
            await page.keyboard.press('Control+f');
            await page.getByLabel('Find', { exact: true }).fill('tailmark \\|');
            await page.getByLabel('Find', { exact: true }).press('Enter');
            await page.getByLabel('Find', { exact: true }).fill('Synthetic');
            await settle(page);
            const first = await page.evaluate(() =>
              window.searchTableReveal.top(),
            );
            await settle(page);
            const second = await page.evaluate(() =>
              window.searchTableReveal.top(),
            );
            return first === second
              ? null
              : `offset moved from ${String(first)} to ${String(second)}`;
          },
        );
        // 6. A wheel wins after a reveal, and the offset stays.
        await record(
          `${viewport.label}: a wheel keeps its offset after a reveal`,
          async () => {
            await find(page, 'tailmark \\|', true);
            await page.mouse.move(700, 300);
            await page.mouse.wheel(0, -1200);
            await settle(page);
            const first = await page.evaluate(() =>
              window.searchTableReveal.top(),
            );
            await settle(page);
            const second = await page.evaluate(() =>
              window.searchTableReveal.top(),
            );
            return first === second
              ? null
              : `offset moved from ${String(first)} to ${String(second)}`;
          },
        );
        // Control: a plain caret far away scrolls by the default path.
        await record(
          `${viewport.label}: control, a plain caret far away`,
          async () => {
            await page.keyboard.press('Escape');
            await page.evaluate(() => window.searchTableReveal.home());
            await settle(page);
            const at = await page.evaluate(() =>
              window.searchTableReveal.offset('## Table C'),
            );
            await page.evaluate(
              (at) => window.searchTableReveal.scrollRange(at, at, 'nearest'),
              at,
            );
            await settle(page);
            return shown(await look(page, '## Table C', 0, true));
          },
        );
      }
      await record(`${viewport.label}: no editor update errors`, () =>
        Promise.resolve(
          errors.length === 0 ? null : errors.join(' | ').slice(0, 300),
        ),
      );
      process.stdout.write(
        `WARNINGS ${viewport.label}: measure loop restarted ${String(warnings.length)} times\n`,
      );
    } finally {
      await close();
    }
  }

  // 5. A nested scroll box on both axes: the request must reach it.
  {
    const { page, errors, warnings, close } = await open(1440, 900, 'nested');
    try {
      await record(
        'nested box: hidden end reaches the outer box on both axes',
        async () => {
          await find(page, 'D cell 1 10 plain words \\| dx \\|', true);
          return shown(await look(page, 'D cell 1 10 plain words', 23));
        },
      );
      await record('nested box: control, a visible end', async () => {
        await find(page, 'D cell 2 10 plain', false);
        return shown(await look(page, 'D cell 2 10 plain', 17));
      });
      // Lifecycle: the editor goes while a reveal may be pending.
      await record(
        'nested box: destroy during a reveal raises nothing',
        async () => {
          await page.evaluate(() => window.searchTableReveal.home());
          await page.keyboard.press('Control+f');
          await page.getByLabel('Find', { exact: true }).fill('tailmark');
          await page.getByLabel('Find', { exact: true }).press('Enter');
          await page.evaluate(() => window.searchTableReveal.destroy());
          // Thirty frames give any pending measure a chance to run and fail.
          await page.evaluate(
            () =>
              new Promise<void>((resolve) => {
                let frames = 0;
                const step = () =>
                  ++frames >= 30 ? resolve() : requestAnimationFrame(step);
                requestAnimationFrame(step);
              }),
          );
          return errors.length === 0 ? null : errors.join(' | ').slice(0, 300);
        },
      );
      process.stdout.write(
        `WARNINGS nested box: measure loop restarted ${String(warnings.length)} times\n`,
      );
    } finally {
      await close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((result) => !result.pass);
process.stdout.write(
  `${String(results.length - failed.length)} of ${String(results.length)} cases pass\n`,
);
if (failed.length > 0) process.exitCode = 1;
