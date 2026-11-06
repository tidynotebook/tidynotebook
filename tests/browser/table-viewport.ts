/** Component regression: already measured tables must not collapse on reentry. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { hasChromium } from './browser.ts';
const loaded: unknown = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ?? '.local-app/playwright-installed.mjs',
  ).href
);
assert.ok(hasChromium(loaded));
const browser = await loaded.chromium.launch();
const output = process.env.TABLE_VIEWPORT_OUTPUT ?? '.local-app/table-viewport';
mkdirSync(output, { recursive: true });
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
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(
        (process.env.UI_AUDIT_ORIGIN ?? 'http://127.0.0.1:3019') +
          '/tests/browser/fixtures/table-viewport.html?theme=' +
          theme,
      );
      await page.evaluate(() => window.tableViewport.ready);
      const initial = await page.evaluate(() =>
        window.tableViewport.snapshot(),
      );
      await page.locator('.cm-np-table-cell').first().click();
      await page.keyboard.press('End');
      await page.keyboard.press('x');
      await page.evaluate(() => window.tableViewport.first());
      const before = await page.evaluate(() => window.tableViewport.snapshot());
      assert.notEqual(before.text, initial.text);
      await page.evaluate(() => window.tableViewport.jump(-1, 80));
      const firstBody = await page.evaluate(() =>
        window.tableViewport.snapshot(),
      );
      writeFileSync(
        output + '/' + theme + '-first-body.json',
        JSON.stringify(firstBody, null, 2),
      );
      assert.ok(firstBody.tables.some((t) => t.head === 0));
      assert.ok(firstBody.tables.every((t) => !t.tracks.startsWith('repeat(')));
      await page
        .locator('.cm-editor')
        .screenshot({ path: output + '/' + theme + '-first-body.png' });
      await page.evaluate(() => window.tableViewport.first());
      await page.evaluate(() => window.tableViewport.start());
      const down = await page.evaluate(() => window.tableViewport.sweep(1));
      const up = await page.evaluate(() => window.tableViewport.sweep(-1));
      const bodyReentry = await page.evaluate(() =>
        window.tableViewport.jump(-1, 80),
      );
      const reentry = await page.evaluate(() =>
        window.tableViewport.snapshot(),
      );
      writeFileSync(
        output + '/' + theme + '.json',
        JSON.stringify(
          { initial, before, reentry, down, up, bodyReentry },
          null,
          2,
        ),
      );
      await page
        .locator('.cm-editor')
        .screenshot({ path: output + '/' + theme + '-body-reentry.png' });
      assert.deepEqual(
        reentry.failures,
        [],
        'A known table returned to fallback floor tracks during vertical scrolling.',
      );
      for (const position of [down, up, bodyReentry]) {
        assert.ok(position.before && position.after);
        assert.equal(position.before.from, position.after.from);
        assert.ok(
          Math.abs(position.before.top - position.after.top) < 1,
          'Passive vertical reading anchor moved after reentry.',
        );
      }
      assert.equal(reentry.text, before.text);
      assert.deepEqual(reentry.selection, before.selection);
      await page.evaluate(() => window.tableViewport.first());
      const left = await page.evaluate(() => window.tableViewport.horizontal());
      assert.ok(left > 0);
      await page.evaluate(() => window.tableViewport.geometry(540, 24));
      const larger = await page.evaluate(() => window.tableViewport.snapshot());
      assert.notEqual(larger.tables[0]?.tracks, before.tables[0]?.tracks);
      await page.evaluate(() => window.tableViewport.geometry(900, 16));
      const resized = await page.evaluate(() =>
        window.tableViewport.snapshot(),
      );
      assert.deepEqual(resized.failures, []);
      assert.equal(resized.text, before.text);
      assert.equal(resized.tables[0]?.left, left);
      assert.deepEqual(resized.selection, before.selection);
      await page.evaluate(() => window.tableViewport.jump(1));
      const wide = await page.evaluate(() => window.tableViewport.snapshot());
      await page.evaluate(() => window.tableViewport.geometry(390, 16));
      const narrow = await page.evaluate(() => window.tableViewport.snapshot());
      const wideTwo = wide.tables.find((t) => t.tracks.split(' ').length === 2);
      assert.ok(wideTwo);
      const narrowTwo = narrow.tables.find((t) => t.id === wideTwo.id);
      assert.ok(narrowTwo);
      assert.notEqual(narrowTwo.tracks, wideTwo.tracks);
      await page.evaluate(() => window.tableViewport.zoom('1.25'));
      assert.deepEqual(
        (await page.evaluate(() => window.tableViewport.snapshot())).failures,
        [],
      );
      await page.evaluate(() => window.tableViewport.zoom('1'));
      await page.evaluate(() => window.tableViewport.geometry(900, 16));
      await page.evaluate(() => window.tableViewport.first());
      assert.equal(
        (await page.evaluate(() => window.tableViewport.snapshot())).tables[0]
          ?.left,
        left,
      );
      const fontLoad = await page.evaluate(() =>
        window.tableViewport.loadHeaderFont(),
      );
      assert.equal(fontLoad.status, 'loaded');
      assert.ok(
        fontLoad.completed > 0,
        'A real FontFaceSet loadingdone event is required.',
      );
      assert.ok(fontLoad.tables.every((t) => !t.tracks.startsWith('repeat(')));
      await page.evaluate(() => window.tableViewport.pause());
      // Passive viewport/layout work must not add a document undo step.
      await page.keyboard.press('Control+z');
      assert.equal(
        (await page.evaluate(() => window.tableViewport.snapshot())).text,
        initial.text,
      );
      await page.keyboard.press('Control+y');
      assert.equal(
        (await page.evaluate(() => window.tableViewport.snapshot())).text,
        before.text,
      );
      await page.locator('.cm-np-table-cell').first().click();
      await page.keyboard.press('End');
      await page.keyboard.press('x');
      await page.evaluate(() => window.tableViewport.geometry(900, 16));
      const typed = await page.evaluate(() => window.tableViewport.snapshot());
      assert.notEqual(typed.text, before.text);
      await page.keyboard.press('Control+z');
      assert.equal(
        (await page.evaluate(() => window.tableViewport.snapshot())).text,
        before.text,
      );
      await page.keyboard.press('Control+y');
      assert.equal(
        (await page.evaluate(() => window.tableViewport.snapshot())).text,
        typed.text,
      );
      const added = await page.evaluate(() =>
        window.tableViewport.editColumn(false),
      );
      assert.equal(added[0]?.tracks.split(' ').length, 17);
      const addedText = (
        await page.evaluate(() => window.tableViewport.snapshot())
      ).text;
      await page.keyboard.press('Control+z');
      assert.equal(
        (await page.evaluate(() => window.tableViewport.snapshot())).text,
        typed.text,
      );
      await page.keyboard.press('Control+y');
      assert.equal(
        (await page.evaluate(() => window.tableViewport.snapshot())).text,
        addedText,
      );
      const removed = await page.evaluate(() =>
        window.tableViewport.editColumn(true),
      );
      assert.equal(removed[0]?.tracks.split(' ').length, 16);
      const deleted = await page.evaluate(() =>
        window.tableViewport.deleteFirst(),
      );
      assert.ok(deleted.after.every((t) => t.id !== deleted.before));
      const replaced = await page.evaluate(() =>
        window.tableViewport.replace(),
      );
      assert.ok(replaced.after.every((t) => !replaced.before.includes(t.id)));
      assert.ok(replaced.after.every((t) => !t.tracks.startsWith('repeat(')));
      writeFileSync(
        output + '/' + theme + '-lifecycle.json',
        JSON.stringify(
          {
            firstBody,
            larger,
            resized,
            wide,
            narrow,
            fontLoad,
            deleted,
            replaced,
          },
          null,
          2,
        ),
      );
      assert.deepEqual(errors, []);
      await page
        .locator('.cm-editor')
        .screenshot({ path: output + '/' + theme + '.png' });
      await page.evaluate(() => window.tableViewport.destroy());
      process.stdout.write('Table viewport lifecycle passed: ' + theme + '\n');
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
