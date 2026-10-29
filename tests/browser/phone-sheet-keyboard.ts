/** Run against a local build. Draft folder choices must not write review data. */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as api from '@notesapp/api-client';
import { hasChromium, isRecord, type Locator, type Page } from './browser.ts';

const loaded: unknown = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '.local-app/node_modules/playwright-core/index.mjs',
  ).href
);
assert.ok(hasChromium(loaded));
const base = process.env.UI_AUDIT_ORIGIN ?? 'http://localhost:3517';
const statePath =
  process.env.UI_AUDIT_STATE ?? '.local-app/review-session.json';
const state: unknown = JSON.parse(readFileSync(statePath, 'utf8'));
const fixture: unknown = JSON.parse(
  readFileSync(
    process.env.UI_AUDIT_FIXTURE ?? '.local-app/review-fixture.json',
    'utf8',
  ),
);
assert.ok(isRecord(state) && Array.isArray(state.cookies));
assert.ok(isRecord(fixture) && typeof fixture.workspaceId === 'string');
const workspaceId = fixture.workspaceId;
const home = `${base}/w/${workspaceId}`;
const headers = {
  origin: base,
  cookie: state.cookies
    .map((cookie: unknown) => {
      assert.ok(isRecord(cookie));
      assert.equal(typeof cookie.name, 'string');
      assert.equal(typeof cookie.value, 'string');
      return `${String(cookie.name)}=${String(cookie.value)}`;
    })
    .join('; '),
};
api.configureClient(base, undefined);
async function snapshot() {
  const account = await api.getAccount({ headers });
  const daily = await api.getDailyNoteSettings({
    headers,
    path: { workspaceId },
  });
  const templates = await api.getTemplateSettings({
    headers,
    path: { workspaceId },
  });
  const files = await api.listFiles({
    headers,
    path: { workspaceId },
    query: { limit: 500 },
  });
  const trash = await api.listDeletedFiles({
    headers,
    path: { workspaceId },
    query: { limit: 500 },
  });
  for (const result of [account, daily, templates, files, trash])
    assert.ok(result.data);
  return {
    preferences: account.data?.preferences,
    daily: daily.data,
    templates: templates.data,
    files: files.data?.files,
    trash: trash.data?.files,
  };
}
const original = await snapshot();
const browser = await loaded.chromium.launch();
const results: { variant: string; screen: string }[] = [];
const errors: string[] = [];
const writes: string[] = [];
mkdirSync('.local-app/screenshots', { recursive: true });
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
}
/** Assert both the viewport and every scrolling ancestor, not only the screen. */
async function visibleFieldAndFooter(
  page: Page,
  field: Locator,
  footer: Locator,
) {
  await settle(page);
  assert.equal(await field.evaluate((e) => e === document.activeElement), true);
  for (const [name, control] of [
    ['field', field],
    ['footer', footer],
  ] as const) {
    const clipped = await control.evaluate((e) => {
      const r = e.getBoundingClientRect(),
        v = window.visualViewport;
      const top = v?.offsetTop ?? 0,
        bottom = top + (v?.height ?? innerHeight);
      const problems: string[] = [];
      if (r.top < top - 1 || r.bottom > bottom + 1)
        problems.push('visual viewport');
      for (let a = e.parentElement; a; a = a.parentElement) {
        if (
          !['auto', 'scroll', 'hidden', 'clip'].includes(
            getComputedStyle(a).overflowY,
          )
        )
          continue;
        const b = a.getBoundingClientRect();
        if (r.top < b.top - 1 || r.bottom > b.bottom + 1)
          problems.push(a.className);
      }
      return problems;
    });
    assert.deepEqual(clipped, [], `${name} must be fully visible`);
  }
}
try {
  for (const width of [320, 390, 1440])
    for (const scheme of ['light', 'dark'] as const) {
      const phone = width < 1024,
        height = phone ? 844 : 900;
      const variant = `${width}-${scheme}`;
      const context = await browser.newContext({
        storageState: statePath,
        viewport: { width, height },
        hasTouch: phone,
        isMobile: phone,
        colorScheme: scheme,
      });
      await context.addInitScript(
        (value) => localStorage.setItem('notesapp.theme', value),
        scheme,
      );
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('request', (r) => {
        if (
          !['GET', 'HEAD', 'OPTIONS'].includes(r.method()) &&
          /\/api\//.test(r.url()) &&
          !r.url().endsWith('/sync/snapshots')
        )
          writes.push(`${r.method()} ${r.url()}`);
      });
      const dialog = () => page.getByRole('dialog').filter({ visible: true });
      async function shot(screen: string) {
        await settle(page);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await page.screenshot({
          path: `.local-app/screenshots/round6-${screen}-${variant}.png`,
          animations: 'disabled',
        });
        results.push({ variant, screen });
        process.stdout.write(`PASS ${variant} ${screen}\n`);
      }
      async function openFolderSetting(
        section = 'daily-notes',
        label = 'Folder',
      ) {
        await page.goto(`${home}?settings=${section}`);
        await dialog()
          .getByRole('button', { name: label, exact: true })
          .click();
        await dialog().getByRole('treeitem').first().waitFor();
      }
      async function startDraft() {
        // The chosen folder can be the root, or any stored review folder.
        await dialog()
          .getByText(/^New folder (in |here)/)
          .click();
        const field = dialog().getByRole('textbox', {
          name: 'Folder name',
          exact: true,
        });
        await field.waitFor();
        assert.equal(
          await dialog()
            .getByRole('button', { name: 'Add folder', exact: true })
            .count(),
          0,
        );
        assert.equal(
          await field.evaluate((e) => e.closest('[role="tree"]') !== null),
          true,
        );
        return field;
      }
      await openFolderSetting();
      await dialog()
        .getByRole('treeitem')
        .getByText('Personal', { exact: true })
        .click();
      let field = await startDraft();
      const draft = dialog().getByRole('treeitem', {
        name: 'New folder',
        exact: true,
      });
      assert.equal(
        await draft.evaluate((e) =>
          e.previousElementSibling?.getAttribute('aria-selected'),
        ),
        'true',
      );
      assert.equal(
        await dialog()
          .getByRole('button', { name: 'Cancel', exact: true })
          .count(),
        1,
      );
      assert.equal(
        await dialog()
          .getByRole('button', { name: 'Done', exact: true })
          .count(),
        1,
      );
      if (phone) {
        await page.setViewportSize({ width, height: 420 });
        await visibleFieldAndFooter(
          page,
          field,
          dialog().getByRole('button', { name: 'Done', exact: true }),
        );
        await shot('keyboard-inline');
      }
      await field.fill('Invalid/name');
      await field.press('Enter');
      await dialog().getByRole('alert').waitFor();
      await field.fill('Reading');
      await field.press('Enter');
      await dialog().getByRole('alert').waitFor();
      await shot('duplicate-name');
      await field.fill('Journal review draft');
      await field.press('Enter');
      await dialog()
        .getByRole('treeitem')
        .getByText('Journal review draft', { exact: true })
        .waitFor();
      assert.equal(
        await dialog()
          .getByRole('treeitem')
          .getByText('Journal review draft', { exact: true })
          .evaluate((e) =>
            e.closest('[role="treeitem"]')?.getAttribute('aria-selected'),
          ),
        'true',
      );
      await shot('created-draft');
      field = await startDraft();
      await field.press('Escape');
      assert.equal(
        await dialog()
          .getByRole('textbox', { name: 'Folder name', exact: true })
          .count(),
        0,
      );
      field = await startDraft();
      await dialog()
        .getByRole('heading', { name: 'Save in', exact: true })
        .click();
      assert.equal(await field.count(), 0);
      await dialog()
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
      await page.setViewportSize({ width, height });
      if (phone) {
        // iOS can shrink and move only visualViewport while layout height stays 844.
        await openFolderSetting();
        field = await startDraft();
        await page.evaluate(() => {
          const viewport = Object.assign(new EventTarget(), {
            width: innerWidth,
            height: 420,
            offsetTop: 70,
            offsetLeft: 0,
          });
          Object.defineProperty(window, 'visualViewport', {
            configurable: true,
            value: viewport,
          });
          viewport.dispatchEvent(new Event('resize'));
          viewport.offsetTop = 90;
          viewport.dispatchEvent(new Event('scroll'));
        });
        await visibleFieldAndFooter(
          page,
          field,
          dialog().getByRole('button', { name: 'Done', exact: true }),
        );
        await shot('visual-viewport-offset');
        await field.press('Escape');
      }
      await openFolderSetting('templates', 'Templates folder');
      field = await startDraft();
      await field.fill('Picker check draft');
      await dialog()
        .getByRole('button', { name: 'Create folder', exact: true })
        .click();
      await dialog()
        .getByRole('treeitem')
        .getByText('Picker check draft', { exact: true })
        .waitFor();
      await shot('template-folder-draft');
      await page.goto(home);
      await page
        .getByRole('button', { name: 'Use template', exact: true })
        .waitFor();
      if (phone)
        await page
          .getByRole('button', { name: 'Open navigation', exact: true })
          .click();
      const drawer = page.locator('#notes-sidebar');
      if (phone) {
        const box = await drawer.boundingBox();
        assert.equal(box?.x, 0);
        assert.equal(box?.width, width);
        const welcome = drawer.getByText('Welcome to tidy notebook', {
          exact: true,
        });
        await welcome.waitFor();
        assert.equal(
          await welcome.evaluate(
            (e) =>
              e.scrollWidth <= e.clientWidth &&
              e.scrollHeight <= e.clientHeight,
          ),
          true,
          'A normal note name must be fully readable',
        );
      }
      await shot('drawer');
      await drawer
        .getByRole('button', { name: 'New folder', exact: true })
        .click();
      const name = dialog().getByRole('textbox', { name: 'Name', exact: true });
      await name.waitFor();
      if (phone) {
        await page.setViewportSize({ width, height: 420 });
        await visibleFieldAndFooter(
          page,
          name,
          dialog().getByRole('button', { name: 'Create folder', exact: true }),
        );
        await shot('new-folder-keyboard');
      }
      await dialog().locator('#new-folder-inside').click();
      field = await startDraft();
      await field.fill('Inside review draft');
      await field.press('Enter');
      await shot('inside-draft');
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width, height });
      await page.goto(home);
      if (phone)
        await page
          .getByRole('button', { name: 'Open navigation', exact: true })
          .click();
      await page
        .getByRole('button', {
          name: 'Actions for the folder Personal',
          exact: true,
        })
        .filter({ visible: true })
        .click();
      await page
        .getByRole('menuitem', { name: 'Move to folder', exact: true })
        .click();
      field = await startDraft();
      await field.fill('Move review draft');
      await field.press('Enter');
      await shot('move-draft');
      await page.keyboard.press('Escape');
      await page.goto(home);
      await page
        .getByRole('button', { name: 'Use template', exact: true })
        .click();
      await dialog()
        .getByRole('button', { name: 'Meeting', exact: true })
        .filter({ visible: true })
        .click();
      await dialog().locator('#template-note-folder').click();
      field = await startDraft();
      await field.fill('Template destination draft');
      await field.press('Enter');
      await shot('template-destination');
      if (phone) {
        await page.goto(`${home}?settings=daily-notes`);
        await dialog()
          .getByRole('button', { name: 'Name format', exact: true })
          .click();
        field = dialog().getByRole('textbox', {
          name: 'Name format',
          exact: true,
        });
        await field.click();
        await page.setViewportSize({ width, height: 420 });
        await visibleFieldAndFooter(
          page,
          field,
          dialog().getByRole('button', { name: 'Done', exact: true }),
        );
        await shot('name-format-keyboard');
        await page.setViewportSize({ width, height });
        await page.goto(`${home}?settings=api-keys`);
        await dialog()
          .getByRole('button', { name: 'Create API key', exact: true })
          .click();
        field = dialog().getByRole('textbox', {
          name: 'Program name',
          exact: true,
        });
        await field.click();
        await page.setViewportSize({ width, height: 420 });
        await visibleFieldAndFooter(
          page,
          field,
          dialog().getByRole('button', { name: 'Create key', exact: true }),
        );
        await shot('api-key-keyboard');
        await page.setViewportSize({ width, height });
        const fileId = original.files?.[0]?.fileId;
        assert.ok(fileId);
        await page.goto(`${home}/notes/${fileId}`);
        await page
          .getByRole('button', { name: 'Note actions', exact: true })
          .click();
        await page.getByRole('menuitem', { name: 'Publish' }).click();
        field = dialog().getByLabel('Password', { exact: true });
        await field.click();
        await page.setViewportSize({ width, height: 420 });
        await visibleFieldAndFooter(
          page,
          field,
          dialog().getByRole('button', { name: 'Publish', exact: true }),
        );
        await shot('publish-keyboard');
      }
      await context.close();
    }
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
} finally {
  await browser.close();
  assert.deepEqual(
    await snapshot(),
    original,
    'The review data and settings must remain unchanged.',
  );
  writeFileSync(
    '.local-app/round6-results.json',
    JSON.stringify(
      { results, errors, writes, reviewDataUnchanged: true },
      null,
      2,
    ),
  );
}
