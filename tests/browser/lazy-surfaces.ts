/** Cold and intent-warmed action chunks preserve the frame, page and focus. */
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
const base = process.env.UI_AUDIT_ORIGIN ?? 'http://10.20.30.98:3517';
const browser = await loaded.chromium.launch();
const results: string[] = [];
try {
  for (const width of [1440, 390, 320])
    for (const scheme of ['light', 'dark'] as const) {
      const phone = width < 1024;
      const context = await browser.newContext({
        storageState: '.local-app/review-session.json',
        viewport: { width, height: phone ? 844 : 900 },
        hasTouch: phone,
        isMobile: phone,
        colorScheme: scheme,
        serviceWorkers: 'block',
      });
      await context.addInitScript(
        (value) => localStorage.setItem('notesapp.theme', value),
        scheme,
      );
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const requests: string[] = [];
      page.on('request', (request) => requests.push(request.url()));
      let releaseSettings: () => void = () => {};
      const settingsGate = new Promise<void>((done) => {
        releaseSettings = done;
      });
      let settingsRequested = false;
      await context.route('**/assets/account-settings-*.js', async (route) => {
        settingsRequested = true;
        await settingsGate;
        await route.continue();
      });
      let releaseFolder: () => void = () => {};
      const folderGate = new Promise<void>((done) => {
        releaseFolder = done;
      });
      let folderRequested = false;
      await context.route('**/assets/folder-dialogs-*.js', async (route) => {
        folderRequested = true;
        await folderGate;
        await route.continue();
      });
      try {
        await page.goto(`${base}/w/${fixture.workspaceId}`);
        await page
          .getByRole('heading', { name: 'All notes', exact: true })
          .waitFor();
        await page.locator('.ui-list-row').first().waitFor();
        assert.ok(
          !requests.some((url) =>
            /\/(account-settings|administration|installation-settings|calendar(?!-entry)|folder-dialogs|workspace-dialogs|new-from-template-dialog|publish-dialog(?!-entry)|history)-[^/]+\.js/.test(
              url,
            ),
          ),
          'the first screen does not request action implementations',
        );
        const content = await page.locator('main').boundingBox();
        const account = page.getByRole('button', {
          name: 'Account: UI review',
          exact: true,
        });
        await account.click();
        const settings = page.getByRole('menuitem', {
          name: 'Settings',
        });
        await settings.hover();
        await pause(80);
        assert.ok(settingsRequested, 'Settings preloads on intent');
        await settings.click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        assert.ok(
          (await dialog.locator('[aria-busy=true]').count()) > 0,
          'a cold Settings load shows its frame at once',
        );
        if (phone)
          await page.locator('[role=dialog][data-sheet-ready]').waitFor();
        const settle = () =>
          page.evaluate(() =>
            Promise.all(
              document
                .getAnimations()
                .filter(
                  (animation) =>
                    animation.effect?.getComputedTiming().iterations !==
                    Infinity,
                )
                .map((animation) => animation.finished.catch(() => {})),
            ),
          );
        await settle();
        const before = await dialog.boundingBox();
        releaseSettings();
        await page
          .locator(phone ? '.ui-settings-list' : '.ui-settings-column')
          .waitFor();
        if (phone)
          await page.locator('[role=dialog][data-sheet-ready]').waitFor();
        await settle();
        const after = await dialog.boundingBox();
        assert.ok(before && after);
        for (const key of ['x', 'y', 'width', 'height'] as const)
          assert.ok(
            Math.abs(before[key] - after[key]) <= 1,
            `Settings ${key} stays stable: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
          );
        assert.deepEqual(
          await page.locator('main').boundingBox(),
          content,
          'Settings does not shift the page',
        );
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.matches(
              'h2[tabindex="-1"],.ui-settings-root-heading [tabindex="-1"]',
            ),
          ),
          true,
        );
        await page
          .getByRole('button', { name: 'Close Settings', exact: true })
          .filter({ visible: true })
          .click();
        await pause(60);
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.getAttribute('aria-label'),
          ),
          'Account: UI review',
        );
        if (phone)
          await page
            .getByRole('button', { name: 'Open navigation', exact: true })
            .click();
        const folder = page
          .getByRole('button', { name: 'New folder', exact: true })
          .filter({ visible: true });
        await folder.hover();
        await pause(80);
        assert.ok(folderRequested, 'New folder preloads on intent');
        await folder.click();
        const action = page.getByRole('dialog', {
          name: 'New folder',
          exact: true,
        });
        await action.waitFor();
        assert.ok(
          (await action.locator('[aria-busy=true]').count()) > 0,
          'a cold action shows its frame at once',
        );
        releaseFolder();
        await page
          .getByRole('textbox', { name: 'Name', exact: true })
          .waitFor();
        const input = page.getByRole('textbox', { name: 'Name', exact: true });
        await input.focus();
        await input.press('Escape');
        await pause(60);
        assert.equal(await action.count(), 0);
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.getAttribute('aria-label'),
          ),
          'New folder',
        );
        results.push(
          `${width} ${scheme}: no eager actions; intent preload; immediate frame; stable page; focus return`,
        );
      } finally {
        releaseSettings();
        releaseFolder();
        await context.close();
      }
    }
  writeFileSync(
    '.local-app/lazy-surface-results.json',
    JSON.stringify(results, null, 2),
  );
  process.stdout.write(results.join('\n') + '\n');
} finally {
  await browser.close();
}
