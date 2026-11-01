/** Regression checks for the core screen design audit. Uses a local server. */
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { hasChromium } from './browser.ts';
const loaded: unknown = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '.local-app/node_modules/playwright-core/index.mjs',
  ).href
);
assert.ok(hasChromium(loaded));
const origin = process.env.UI_AUDIT_ORIGIN ?? 'http://127.0.0.1:4583';
const browser = await loaded.chromium.launch();
try {
  for (const colorScheme of ['light', 'dark'] as const)
    for (const width of [390, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        colorScheme,
        hasTouch: false,
        isMobile: false,
      });
      const page = await context.newPage();
      await page.goto(`${origin}/login`);
      await page.getByLabel('Email address').waitFor();
      const geometry = await page.evaluate(() => {
        const card = document.querySelector('[data-ui-card]');
        if (!card) throw new Error('Account card is missing.');
        const style = getComputedStyle(card);
        const form = document.querySelector('form');
        return {
          shadow: style.boxShadow,
          outline: style.outlineWidth,
          noValidate: form?.noValidate,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.notEqual(geometry.shadow, 'none');
      assert.notEqual(geometry.outline, '0px');
      assert.equal(geometry.noValidate, true);
      assert.equal(geometry.overflow, false);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page
        .getByText('Enter the email address.', { exact: true })
        .first()
        .waitFor();
      assert.equal(
        await page
          .getByLabel('Email address')
          .evaluate((element) => element.getAttribute('aria-invalid')),
        'true',
      );
      await page.getByLabel('Email address').fill('writer@example..com');
      await page
        .getByLabel('Password', { exact: true })
        .fill('A local test password');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page
        .getByText('Enter an email address.', { exact: true })
        .waitFor();
      await context.route('**/api/auth/sign-in/email', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/problem+json',
          json: {
            type: 'about:blank',
            title: 'Invalid email',
            status: 400,
            code: 'invalid_request',
            requestId: 'design-email-test',
            issues: [{ path: '/email', message: 'Invalid email' }],
          },
        });
      });
      await page.getByLabel('Email address').fill('writer@example.com');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page
        .getByText('Enter an email address.', { exact: true })
        .waitFor();
      await context.close();
    }
  const session = process.env.UI_AUDIT_SESSION;
  const workspace = process.env.UI_AUDIT_WORKSPACE;
  const note = process.env.UI_AUDIT_NOTE;
  if (session && workspace && note)
    for (const colorScheme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        storageState: session,
        viewport: { width: 1440, height: 900 },
        colorScheme,
        hasTouch: false,
        isMobile: false,
      });
      const page = await context.newPage();
      const home = `${origin}/w/${workspace}`;
      await page.goto(`${home}/settings/appearance`);
      const scroller = page.locator('[data-settings-scroll]');
      await scroller.waitFor({ state: 'visible' });
      await pause(250);
      assert.ok(
        await scroller.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      );
      assert.equal(
        await page
          .locator('[data-scroll-cue]')
          .evaluate((element) => getComputedStyle(element).opacity),
        '1',
      );
      await scroller.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await pause(250);
      assert.equal(
        await page
          .locator('[data-scroll-cue]')
          .evaluate((element) => getComputedStyle(element).opacity),
        '0',
      );
      await page.goto(`${home}/notes/${note}/history`);
      const title = page.getByRole('heading', {
        name: 'Version history',
        exact: true,
      });
      await title.waitFor();
      assert.ok(
        await title.evaluate((element) => {
          const glyph = element
            .closest('.ui-page-header')
            ?.querySelector('svg');
          if (!glyph) return false;
          const titleBox = element.getBoundingClientRect(),
            glyphBox = glyph.getBoundingClientRect();
          return (
            Math.abs(
              titleBox.top +
                titleBox.height / 2 -
                glyphBox.top -
                glyphBox.height / 2,
            ) <= 1
          );
        }),
      );
      await context.close();
    }
} finally {
  await browser.close();
}
process.stdout.write('Core design checks passed in both themes and widths.\n');
