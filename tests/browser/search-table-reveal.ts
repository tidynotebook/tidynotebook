/**
 * Component check: Find reveals its selected match inside a wide table.
 *
 * Find keeps the focus in its own field. The selected match, which Replace
 * acts on, must still show inside its own table, in both directions and
 * between tables, while every other table keeps the offset a person gave it.
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
  process.env.SEARCH_TABLE_OUTPUT ?? '.local-app/search-table-reveal';
mkdirSync(output, { recursive: true });

type Snapshot = Awaited<ReturnType<typeof window.searchTableReveal.snapshot>>;

const snapshot = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => window.searchTableReveal.snapshot());
const settle = (page: Page): Promise<void> =>
  page.evaluate(() => window.searchTableReveal.settle());

/** The selected match shows whole inside its table and on the screen. */
function assertShown(state: Snapshot, step: string): void {
  assert.ok(state.match !== null, `${step}: no match rectangle`);
  const { match } = state;
  assert.ok(
    match.left >= match.boxLeft - 0.5 && match.right <= match.boxRight + 0.5,
    `${step}: match ${String(match.left)}..${String(match.right)} is outside its table ${String(match.boxLeft)}..${String(match.boxRight)}`,
  );
  assert.ok(
    match.top >= match.screenTop - 0.5 &&
      match.bottom <= match.screenBottom + 0.5,
    `${step}: match is outside the text vertically`,
  );
  // The page never moves sideways and every offset stays in its bounds.
  assert.equal(state.pageX, 0, `${step}: the page moved sideways`);
  assert.ok(state.pageWidth <= state.viewportWidth, `${step}: page overflow`);
  for (const table of Object.values(state.tables))
    assert.ok(
      table.left >= 0 && table.left <= table.max + 0.5,
      `${step}: table offset out of bounds`,
    );
}

try {
  for (const theme of ['light', 'dark'] as const) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: theme,
      hasTouch: false,
      isMobile: false,
    });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(
        (process.env.UI_AUDIT_ORIGIN ?? 'http://127.0.0.1:3019') +
          '/tests/browser/fixtures/search-table-reveal.html?theme=' +
          theme,
      );
      await page.evaluate(() => window.searchTableReveal.ready);
      const steps: Record<string, Snapshot> = {};
      const record = async (name: string): Promise<Snapshot> => {
        await settle(page);
        const state = await snapshot(page);
        steps[name] = state;
        return state;
      };

      // Table B carries an offset that a person gave it.
      await page.evaluate(() => window.searchTableReveal.pan('B', 240));
      await page.evaluate(() => window.searchTableReveal.home());
      await page.keyboard.press('Control+f');
      await page.keyboard.type('needle');
      await page.keyboard.press('Enter');
      let state = await record('first-far-right');
      assert.equal(state.focus, 'Find');
      assert.equal(state.selected, 'needle');
      assert.equal(state.table, 'A');
      assert.equal(state.count, '1 of 5');
      assertShown(state, 'first match, far right');
      assert.ok((state.tables.A?.left ?? 0) > 0, 'table A did not move');
      assert.equal(state.tables.B?.left, 240, 'table B lost its offset');

      // Back to the left within the same table.
      await page.keyboard.press('Enter');
      state = await record('second-near-left');
      assert.equal(state.count, '2 of 5');
      assertShown(state, 'second match, near left');
      assert.equal(state.tables.B?.left, 240, 'table B lost its offset');

      // The last column, at the end of its bounds.
      await page.keyboard.press('Enter');
      state = await record('third-last-column');
      assertShown(state, 'third match, last column');
      const tableA = state.tables.A?.left;

      // Into the next table: table A keeps where Find left it.
      await page.keyboard.press('Enter');
      state = await record('fourth-next-table');
      assert.equal(state.table, 'B');
      assertShown(state, 'fourth match, next table');
      assert.equal(state.tables.A?.left, tableA, 'table A lost its offset');

      // Far below: the text scrolls down and the table reveals the match.
      await page.keyboard.press('Enter');
      state = await record('fifth-far-below');
      assert.equal(state.table, 'C');
      assertShown(state, 'fifth match, far below');

      // Backwards across tables, and wrap from the first to the last.
      await page.keyboard.press('Shift+Enter');
      await page.keyboard.press('Shift+Enter');
      state = await record('previous-back-to-a');
      assert.equal(state.table, 'A');
      assertShown(state, 'previous match, back to table A');
      for (let press = 0; press < 3; press++)
        await page.keyboard.press('Shift+Enter');
      state = await record('previous-wraps');
      assert.equal(state.table, 'C');
      assertShown(state, 'previous wraps to the last match');

      // A person pans the table away from the match. Their offset wins
      // until they move to a match again.
      const center = await page.evaluate(() =>
        window.searchTableReveal.center('C'),
      );
      await page.mouse.move(center.x, center.y);
      await page.mouse.wheel(-5000, 0);
      state = await record('manual-pan');
      assert.equal(state.tables.C?.left, 0, 'a manual pan was undone');
      await page.keyboard.press('Shift+Enter');
      await page.keyboard.press('Enter');
      state = await record('reveal-after-pan');
      assert.equal(state.table, 'C');
      assertShown(state, 'reveal after a manual pan');

      // Show replace moves the focus to Replace with. Replace acts on the
      // match that shows, then shows the next match.
      await page.keyboard.press('Shift+Enter');
      await page.keyboard.press('Shift+Enter');
      state = await record('before-replace');
      assertShown(state, 'match before replace');
      const target = state.selection.from;
      await page.getByRole('button', { name: 'Show replace' }).click();
      state = await snapshot(page);
      assert.equal(state.focus, 'Replace with');
      await page.keyboard.type('pin');
      await page.keyboard.press('Enter');
      state = await record('after-replace');
      assert.equal(state.text.slice(target, target + 3), 'pin');
      assert.match(state.count ?? '', / of 4$/);
      assertShown(state, 'next match after replace');
      await page.keyboard.press('Enter');
      state = await record('after-second-replace');
      assert.match(state.count ?? '', / of 3$/);
      assertShown(state, 'next match after a second replace');

      // Undo and redo in the text bring the words back exactly.
      const replaced = state.text;
      await page.keyboard.press('Escape');
      state = await snapshot(page);
      assert.equal(state.focus, 'Note text');
      await page.keyboard.press('Control+z');
      await page.keyboard.press('Control+z');
      state = await record('undo');
      assert.equal((state.text.match(/needle/g) ?? []).length, 5);
      await page.keyboard.press('Control+y');
      await page.keyboard.press('Control+y');
      state = await record('redo');
      assert.equal(state.text, replaced);

      // Ctrl and H opens the replace row from the text and from Find.
      await page.keyboard.press('Control+h');
      state = await record('shortcut-from-text');
      assert.ok(state.panel && state.replaceShown);
      assert.equal(state.focus, 'Replace with');
      await page.getByRole('button', { name: 'Show replace' }).click();
      state = await snapshot(page);
      assert.equal(state.replaceShown, false);
      assert.equal(state.focus, 'Find');
      await page.keyboard.press('Control+h');
      state = await snapshot(page);
      assert.ok(state.replaceShown);
      assert.equal(state.focus, 'Replace with');

      // A zero width match is a caret, and it shows in its table too.
      await page.getByLabel('Find', { exact: true }).focus();
      await page.getByRole('button', { name: 'Regular expression' }).click();
      await page.getByLabel('Find', { exact: true }).fill('(?=needle)');
      await page.keyboard.press('Enter');
      state = await record('zero-width');
      assert.equal(state.selection.empty, true);
      assertShown(state, 'zero width match');

      // A closed and opened panel still reveals the match.
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+f');
      await page.getByLabel('Find', { exact: true }).fill('needle far');
      await page.getByRole('button', { name: 'Regular expression' }).click();
      await page.keyboard.press('Enter');
      state = await record('reopened');
      assert.equal(state.selected, 'needle far');
      assertShown(state, 'match after reopening the panel');

      assert.deepEqual(errors, []);
      writeFileSync(
        `${output}/${theme}-steps.json`,
        JSON.stringify(steps, null, 2),
      );
      await page.screenshot({ path: `${output}/${theme}.png` });
      await page.evaluate(() => window.searchTableReveal.destroy());
      process.stdout.write(`Find in wide tables passed: ${theme}\n`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
