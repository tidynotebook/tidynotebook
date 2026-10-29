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
      process.stdout.write(`CASE ${width} ${scheme}\n`);
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
      assert.deepEqual(
        await p.evaluate(() =>
          [...document.querySelectorAll('[aria-label="Sidebar views"] a')].map(
            (e) => e.getAttribute('aria-label'),
          ),
        ),
        ['Published links', 'Trash'],
      );
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
        const actionRow = panel.locator('.ui-drawer-actions-row');
        const controls = async () =>
          actionRow.evaluate((row) =>
            [...row.querySelectorAll('button')]
              .filter((e) => e.checkVisibility())
              .map((e) => ({
                name: e.getAttribute('aria-label'),
                x: e.getBoundingClientRect().x,
                y: e.getBoundingClientRect().y,
                width: e.getBoundingClientRect().width,
                height: e.getBoundingClientRect().height,
              })),
          );
        const actions = await controls();
        assert.equal(actions.length, width === 320 ? 4 : 5);
        for (const a of actions) {
          assert.ok(a.width === 40 && a.height === 40);
          assert.ok(
            Math.abs(a.y - (actions[0]?.y ?? NaN)) < 0.5,
            'Actions stay on one line',
          );
        }
        results.push(`${width} ${scheme}: one action line with 40 px targets`);
        if (width === 320) {
          const more = panel.getByRole('button', {
            name: 'More drawer actions',
            exact: true,
          });
          await more.click();
          assert.equal(
            await p
              .getByRole('menuitem')
              .getByText(/^(Expand|Collapse) all folders$/)
              .count(),
            1,
          );
          await p.screenshot({
            path: `.local-app/screenshots/l-drawer-more-${width}-${scheme}.png`,
          });
          await p
            .getByRole('menuitem', { name: 'Sort notes', exact: true })
            .click();
          const sort = p.getByRole('menu', { name: 'Sort notes', exact: true });
          await sort.waitFor();
          assert.equal(await sort.getByRole('menuitemradio').count(), 6);
          await p.keyboard.press('Escape');
          assert.equal(
            await p.evaluate(() =>
              document.activeElement?.getAttribute('aria-label'),
            ),
            'More drawer actions',
          );
          results.push(`${width} ${scheme}: overflow menu and sort choices`);
        }
        if (width === 390) {
          const container = panel.locator('.ui-drawer-actions');
          await container.evaluate((e) => {
            e.style.width = '190px';
          });
          await pause(50);
          assert.equal((await controls()).length, 4);
          await panel
            .getByRole('button', { name: 'More drawer actions', exact: true })
            .waitFor();
          await container.evaluate((e) => {
            e.style.width = '';
          });
          await pause(50);
          assert.equal((await controls()).length, 5);
          results.push(
            `${width} ${scheme}: container width changes the actions`,
          );
        }

        await p.screenshot({
          path: `.local-app/screenshots/l-drawer-${width}-${scheme}.png`,
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
        const touch = (
          type: string,
          x: number,
          y: number,
          timestamp?: number,
        ) =>
          cdp.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
            modifiers: 0,
            ...(timestamp === undefined ? {} : { timestamp }),
          });
        const pull = async (distance: number, fast = false) => {
          const x = size.width - 24,
            y = 100;
          const time = fast ? Date.now() / 1000 : undefined;
          await touch('touchStart', x, y, time);
          for (let i = 1; i <= 4; i++) {
            await touch(
              'touchMove',
              x - (distance * i) / 4,
              y,
              time === undefined ? undefined : time + i * 0.008,
            );
            await pause(fast ? 8 : 60);
          }
          await pause(30);
          const mid = await measure();
          assert.ok(mid.x < -distance + 3, `Direct drag: ${mid.x}`);
          assert.ok(mid.opacity < 0.99);
          if (!fast && distance === 40 && width === 390)
            await p.screenshot({
              path: `.local-app/screenshots/k-drawer-drag-390-${scheme}.png`,
            });
          if (!fast) await pause(130);
          await touch(
            'touchEnd',
            0,
            0,
            time === undefined ? undefined : time + 0.06,
          );
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
      assert.equal(box?.height, 32);
      results.push(`${width} ${scheme}: compact footer`);
      for (const [name, path] of [
        ['Published links', 'published'],
        ['Trash', 'trash'],
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
