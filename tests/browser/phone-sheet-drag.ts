/** Real touch input against the local review image. This test writes no data. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { hasChromium, isRecord } from './browser.ts';
const loaded: unknown = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '.local-app/node_modules/playwright-core/index.mjs',
  ).href
);
assert.ok(hasChromium(loaded));
const fixture: unknown = JSON.parse(
  readFileSync('.local-app/review-fixture.json', 'utf8'),
);
assert.ok(isRecord(fixture) && typeof fixture.workspaceId === 'string');
const home = `${process.env.UI_AUDIT_ORIGIN ?? 'http://localhost:3517'}/w/${fixture.workspaceId}`;
const browser = await loaded.chromium.launch();
const results: string[] = [];
try {
  for (const reduced of [false, true])
    for (const kind of ['Settings', 'New folder']) {
      const c = await browser.newContext({
        storageState: '.local-app/review-session.json',
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        colorScheme: 'light',
        reducedMotion: reduced ? 'reduce' : 'no-preference',
      });
      const p = await c.newPage();
      const cdp = await c.newCDPSession(p);
      await p.goto(home);
      await p
        .getByRole('button', { name: 'Account: UI review', exact: true })
        .waitFor();
      const open = async () => {
        if (kind === 'Settings') {
          await p
            .getByRole('button', { name: 'Account: UI review', exact: true })
            .click();
          await p
            .getByRole('menuitem', { name: 'Settings', exact: true })
            .click();
          await p.getByRole('button', { name: 'Devices', exact: true }).click();
        } else {
          await p
            .getByRole('button', { name: 'Open navigation', exact: true })
            .click();
          await p
            .getByRole('button', { name: 'New folder', exact: true })
            .click();
        }
        await p.locator('[role=dialog][data-sheet-ready]').waitFor();
        await pause(260);
      };
      const measure = () =>
        p.evaluate(() => {
          const panel = document.querySelector<HTMLElement>(
            '[role=dialog][data-sheet-ready]',
          );
          if (!panel) throw Error('Sheet missing');
          const scrim =
            panel.parentElement?.querySelector('[data-sheet-scrim]');
          if (!scrim) throw Error('Scrim missing');
          return {
            y: new DOMMatrix(getComputedStyle(panel).transform).m42,
            opacity: Number(getComputedStyle(scrim).opacity),
            height: panel.offsetHeight,
          };
        });
      const touch = (type: string, x: number, y: number) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
          modifiers: 0,
        });
      const drag = async (distance: number, fast = false) => {
        const box = await p.locator('[data-sheet-drag]').first().boundingBox();
        assert.ok(box);
        const x = 195,
          y = box.y + 22;
        await touch('touchStart', x, y);
        await pause(20);
        for (let i = 1; i <= 4; i++) {
          await touch('touchMove', x, y + (distance * i) / 4);
          await pause(fast ? 5 : 60);
        }
        const middle = await measure();
        if (!fast) await pause(130);
        await touch('touchEnd', x, y + distance);
        return middle;
      };
      const closed = async () => {
        await pause(280);
        assert.equal(await p.getByRole('dialog').count(), 0);
        assert.ok(
          await p.evaluate(
            () =>
              document.activeElement !== document.body &&
              document.activeElement instanceof HTMLElement &&
              document.activeElement.isConnected,
          ),
        );
      };
      await open();
      const initial = await measure();
      const middle = await drag(50);
      assert.ok(middle.y >= 45);
      assert.ok(middle.opacity < initial.opacity);
      await pause(280);
      assert.equal((await measure()).y, 0);
      results.push(`${kind} ${reduced}: direct drag and snap back`);
      const up = await drag(-90);
      assert.ok(up.y >= -24 && up.y < 0);
      await pause(280);
      assert.equal((await measure()).y, 0);
      await drag((await measure()).height * 0.3);
      await closed();
      results.push(`${kind} ${reduced}: threshold closes and returns focus`);
      if (kind === 'New folder')
        await p
          .getByRole('button', { name: 'Close navigation', exact: true })
          .click();
      await open();
      await drag(50, true);
      await closed();
      results.push(`${kind} ${reduced}: flick closes and returns focus`);
      if (kind === 'Settings') {
        await open();
        const before = await p.evaluate(() => {
          const body = document.querySelector<HTMLElement>(
            '.ui-settings-content',
          );
          if (!body) throw Error('Body missing');
          body.scrollTop = 160;
          return body.scrollTop;
        });
        assert.ok(before > 0);
        await pause(50);
        const box = await p.locator('.ui-settings-content').boundingBox();
        assert.ok(box);
        await touch('touchStart', 190, box.y + 120);
        await pause(30);
        for (let i = 1; i <= 5; i++) {
          await touch('touchMove', 190, box.y + 120 + i * 12);
          await pause(30);
        }
        await touch('touchEnd', 190, box.y + 180);
        await pause(100);
        assert.equal((await measure()).y, 0);
        const after = await p
          .locator('.ui-settings-content')
          .evaluate((e) => e.scrollTop);
        assert.ok(after < before);
        results.push(`${kind} ${reduced}: scrolled body owns scrolling`);
      }
      await c.close();
    }
  writeFileSync(
    '.local-app/drag-results.json',
    JSON.stringify({ results }, null, 2),
  );
  process.stdout.write(`${results.length} drag checks pass\n`);
} finally {
  await browser.close();
}
