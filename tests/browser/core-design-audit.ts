/** Regression checks for the core screen design audit. Uses a local server. */
import assert from 'node:assert/strict';
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
      await context.close();
    }
} finally {
  await browser.close();
}
process.stdout.write('Core design checks passed in both themes and widths.\n');
