/** Drawer geometry, real touch gestures, and rail navigation. No review writes. */
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
const browser = await loaded.chromium.launch(),
  results: string[] = [],
  writes: string[] = [];
try {
  for (const width of [320, 390, 430, 1440])
    for (const scheme of ['light', 'dark'] as const) {
      const phone = width < 1024;
      const c = await browser.newContext({
        storageState: '.local-app/review-session.json',
        viewport: { width, height: phone ? 844 : 900 },
        hasTouch: phone,
        isMobile: phone,
        colorScheme: scheme,
      });
      await c.addInitScript(
        (s) => localStorage.setItem('notesapp.theme', s),
        scheme,
      );
      const p = await c.newPage(),
        cdp = await c.newCDPSession(p);
      p.on('request', (r) => {
        if (
          !['GET', 'HEAD', 'OPTIONS'].includes(r.method()) &&
          r.url().includes('/api/') &&
          !r.url().endsWith('/sync/snapshots')
        )
          writes.push(`${r.method()} ${r.url()}`);
      });
      await p.goto(home);
      await p
        .getByRole('button', { name: 'Account: UI review', exact: true })
        .waitFor();
      const panel = p.locator('#notes-sidebar');
      const open = async () => {
        await p
          .getByRole('button', { name: 'Open navigation', exact: true })
          .click();
        await p.locator('#notes-sidebar[data-drawer-ready]').waitFor();
        await pause(250);
      };
      const measure = () =>
        p.evaluate(() => {
          const panel = document.getElementById('notes-sidebar'),
            scrim = document.querySelector('[data-drawer-scrim]');
          if (!panel || !scrim) throw Error('Drawer missing');
          return {
            x: new DOMMatrix(getComputedStyle(panel).transform).m41,
            opacity: Number(getComputedStyle(scrim).opacity),
            width: panel.getBoundingClientRect().width,
          };
        });
      if (phone) {
        await open();
        const size = await measure();
        assert.equal(size.width, Math.min(width - 56, 320));
        assert.ok(width - size.width >= 56);
        results.push(`${width} ${scheme}: width and page strip`);
        await p.screenshot({
          path: `.local-app/screenshots/k-drawer-${width}-${scheme}.png`,
        });
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: width - 24, y: 100 }],
        });
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
        await pause(250);
        assert.equal(
          await panel.evaluate((e) => e.getAttribute('aria-modal')),
          null,
        );
        results.push(`${width} ${scheme}: strip closes`);
        const touch = (type: string, x: number, y: number) =>
          cdp.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
            modifiers: 0,
          });
        const pull = async (distance: number, fast = false) => {
          const x = size.width - 24,
            y = 100;
          await touch('touchStart', x, y);
          for (let i = 1; i <= 4; i++) {
            await touch('touchMove', x - (distance * i) / 4, y);
            await pause(fast ? 8 : 60);
          }
          await pause(30);
          const mid = await measure();
          assert.ok(mid.x < -distance + 3, `Direct drag: ${mid.x}`);
          assert.ok(mid.opacity < 0.99);
          if (!fast) await pause(130);
          await touch('touchEnd', 0, 0);
          await pause(260);
        };
        await open();
        await pull(40);
        assert.equal((await measure()).x, 0);
        assert.equal(
          await panel.evaluate((e) => e.getAttribute('aria-modal')),
          'true',
        );
        results.push(`${width} ${scheme}: direct drag and return`);
        await pull(size.width * 0.3);
        assert.equal(
          await panel.evaluate((e) => e.getAttribute('aria-modal')),
          null,
        );
        assert.equal(
          await p.evaluate(() =>
            document.activeElement?.getAttribute('aria-label'),
          ),
          'Open navigation',
        );
        results.push(`${width} ${scheme}: threshold close and focus return`);
        await open();
        await pull(50, true);
        assert.equal(
          await panel.evaluate((e) => e.getAttribute('aria-modal')),
          null,
        );
        results.push(`${width} ${scheme}: fast flick closes`);
        await open();
      }
      const footer = panel
        .locator('[role=status] .ui-sidebar-status')
        .filter({ visible: true })
        .first();
      await footer.waitFor();
      const box = await footer.boundingBox();
      assert.equal(box?.height, phone ? 36 : 32);
      results.push(`${width} ${scheme}: compact footer`);
      for (const [name, path] of [
        ['Trash', 'trash'],
        ['Published links', 'published'],
      ] as const) {
        await panel.getByRole('link', { name: name, exact: true }).click();
        await p
          .getByRole('heading', { name: name, exact: true, level: 1 })
          .waitFor();
        if (phone) await open();
        assert.equal(
          await panel
            .getByRole('link', { name: name, exact: true })
            .evaluate((e) => e.getAttribute('aria-current')),
          'page',
        );
        assert.equal(
          await p.evaluate(() => location.pathname),
          `${new URL(home).pathname}/${path}`,
        );
        results.push(`${width} ${scheme}: ${name} rail navigation`);
      }
      await p.evaluate(() => {
        Object.defineProperty(navigator, 'onLine', {
          configurable: true,
          get: () => false,
        });
        window.dispatchEvent(new Event('offline'));
      });
      await panel
        .getByRole('button', {
          name: 'Offline. Show save details',
          exact: true,
        })
        .click();
      const details = p.getByRole('dialog', {
        name: 'Save status',
        exact: true,
      });
      await details
        .getByText('Offline. Saved on this device.', { exact: true })
        .filter({ visible: true })
        .waitFor();
      results.push(`${width} ${scheme}: offline status details`);
      await c.close();
    }
  assert.deepEqual(writes, []);
  writeFileSync(
    '.local-app/drawer-results.json',
    JSON.stringify({ results, writes }, null, 2),
  );
  process.stdout.write(`${results.length} drawer checks pass\n`);
} finally {
  await browser.close();
}
