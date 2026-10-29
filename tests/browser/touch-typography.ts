import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { touchTextRoles } from '../../packages/ui/src/typography.ts';
import { hasChromium, isRecord, type Page } from './browser.ts';
const loaded: unknown = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '.local-app/node_modules/playwright-core/index.mjs',
  ).href
);
assert.ok(hasChromium(loaded), 'The external module must provide Chromium.');
const { chromium } = loaded;
import * as api from '@notesapp/api-client';
const base = process.env.UI_AUDIT_ORIGIN ?? 'http://localhost:3517',
  statePath = process.env.UI_AUDIT_STATE ?? '.local-app/review-session.json',
  state = readState(statePath),
  fixture = readFixture(
    process.env.UI_AUDIT_FIXTURE ?? '.local-app/review-fixture.json',
  ),
  { workspaceId } = fixture,
  home = `${base}/w/${workspaceId}`,
  headers = {
    origin: base,
    cookie: state.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
  };
api.configureClient(base, undefined);
async function originalState() {
  const a = await api.getAccount({ headers }),
    d = await api.getDailyNoteSettings({ headers, path: { workspaceId } }),
    t = await api.getTemplateSettings({ headers, path: { workspaceId } });
  assert.ok(a.data);
  assert.ok(d.data);
  assert.ok(t.data);
  return { preferences: a.data.preferences, daily: d.data, templates: t.data };
}
mkdirSync('.local-app/screenshots', { recursive: true });
const original = await originalState(),
  browser = await chromium.launch(),
  results: Result[] = [],
  errors: { variant: string; error: string }[] = [],
  writes: { method: string; url: string }[] = [];
try {
  for (const width of process.env.TOUCH_WIDTHS?.split(',').map(Number) ?? [
    320, 390,
  ])
    for (const scheme of process.env.TOUCH_SCHEMES?.split(',') ?? [
      'light',
      'dark',
    ]) {
      assert.ok(scheme === 'light' || scheme === 'dark');
      const variant = `${width}-${scheme}`,
        c = await browser.newContext({
          storageState: statePath,
          viewport: { width, height: 844 },
          hasTouch: true,
          isMobile: true,
          colorScheme: scheme,
        });
      await c.addInitScript(
        (s) => localStorage.setItem('notesapp.theme', s),
        scheme,
      );
      const now = new Date().toISOString();
      await c.route('**/api/account', async (r) => {
        const response = await r.fetch(),
          a = await response.json();
        assert.ok(isRecord(a));
        await r.fulfill({
          response,
          json: { ...a, accountPortal: true, mcpAuthorization: true },
        });
      });
      await c.route('**/api/account/keys', (r) =>
        r.fulfill({
          json: {
            keys: [
              {
                keyId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
                name: 'Design key',
                createdAt: now,
                expiresAt: null,
                lastUsedAt: null,
              },
            ],
          },
        }),
      );
      await c.route('**/api/account/connected-apps', (r) =>
        r.fulfill({
          json: {
            apps: [
              {
                grantId: 'design-touch-grant',
                clientId: 'https://example.com/design',
                clientName: 'Design app',
                scopes: ['notes:read'],
                lastUsedAt: null,
              },
            ],
          },
        }),
      );
      await c.route('**/api/workspaces/*/trash*', (r) =>
        r.fulfill({
          json: {
            files: [
              {
                fileId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
                path: 'Personal/Reading/Reading list.md',
                kind: 'markdown',
                headRevisionId: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
                createdAt: now,
                deletedAt: now,
              },
            ],
            nextCursor: null,
          },
        }),
      );
      await c.route('**/api/workspaces/*/publications', (r) =>
        r.fulfill({
          json: {
            links: [
              {
                publicationId: 'dddddddd-dddd-4ddd-dddd-dddddddddddd',
                scope: { kind: 'folder', path: 'Personal' },
                createdAt: now,
                expiresAt: null,
                passwordProtected: false,
                takenDown: false,
              },
            ],
          },
        }),
      );
      const p = await c.newPage();
      p.setDefaultTimeout(12000);
      p.on('pageerror', (e) => errors.push({ variant, error: e.message }));
      p.on('request', (r) => {
        if (
          !['GET', 'HEAD', 'OPTIONS'].includes(r.method()) &&
          /\/api\//.test(r.url()) &&
          !r.url().endsWith('/sync/snapshots')
        )
          writes.push({ method: r.method(), url: r.url() });
      });
      const settle = () =>
        p.evaluate(() =>
          Promise.all(
            document
              .getAnimations()
              .filter(
                (a) => a.effect?.getComputedTiming().iterations !== Infinity,
              )
              .map((a) => a.finished.catch(() => {})),
          ),
        );
      async function shot(name: string) {
        await settle();
        const typography = await auditText(p, touchTextRoles);
        const issues = await p.evaluate(() => {
          const visible = (e: Element) =>
            e.checkVisibility({
              visibilityProperty: true,
              opacityProperty: true,
            }) && e.getBoundingClientRect().width > 0;
          const inScroller = (e: Element) => {
            for (let a = e.parentElement; a; a = a.parentElement) {
              const s = getComputedStyle(a);
              if (
                ['auto', 'scroll'].includes(s.overflowX) &&
                a.scrollWidth > a.clientWidth + 1
              )
                return true;
            }
            return false;
          };
          const controls = [
              ...document.querySelectorAll(
                'button,[role="menuitem"],[role="treeitem"],input:not([type="checkbox"]),select,textarea',
              ),
            ].filter(visible),
            problems: Problem[] = [];
          for (const e of controls) {
            const b = e.getBoundingClientRect(),
              label =
                e.getAttribute('aria-label') || e.textContent?.trim() || e.id;
            if ((b.left < -1 || b.right > innerWidth + 1) && !inScroller(e))
              problems.push({
                kind: 'outside',
                label,
                left: b.left,
                right: b.right,
              });
            if (e.matches('button,[role="menuitem"]') && b.height < 43.5)
              problems.push({ kind: 'height', label, height: b.height });
            if (
              e.matches('button') &&
              e.scrollWidth > e.clientWidth + 1 &&
              !e.querySelector('.truncate') &&
              !inScroller(e)
            )
              problems.push({
                kind: 'button-overflow',
                label,
                width: b.width,
                scroll: e.scrollWidth,
              });
          }
          for (const e of [
            ...document.querySelectorAll('.line-clamp-2.text-secondary'),
          ].filter(visible)) {
            const b = e.getBoundingClientRect(),
              clone = e.cloneNode(true);
            if (!(clone instanceof HTMLElement))
              throw new Error('Expected a help element.');
            clone.style.cssText = `position:absolute;visibility:hidden;width:${b.width}px;display:block;-webkit-line-clamp:unset;max-height:none;height:auto;`;
            document.body.append(clone);
            const full = clone.getBoundingClientRect().height;
            clone.remove();
            if (full > b.height + 1)
              problems.push({
                kind: 'help-cut',
                text: e.textContent,
                width: b.width,
                height: b.height,
                full,
              });
          }
          if (document.documentElement.scrollWidth > innerWidth + 1)
            problems.push({ kind: 'page-overflow' });
          return problems;
        });
        issues.push(...typography.problems);
        results.push({
          variant,
          screen: name,
          issues,
          combinations: typography.combinations,
        });
        await p.screenshot({
          path: `.local-app/screenshots/text-roles-${name}-${variant}.png`,
          animations: 'disabled',
        });
        process.stdout.write(`${variant} ${name} ${JSON.stringify(issues)}\n`);
      }
      const d = p.getByRole('dialog', { name: 'Settings', exact: true }),
        go = async (path: string) => {
          await p.goto(path.startsWith('http') ? path : `${home}${path}`);
          await p
            .getByRole('button', { name: 'Open navigation', exact: true })
            .waitFor();
        },
        settings = async (page: string) => {
          await go(`?settings=${page}`);
          await d.waitFor();
        };
      await go('');
      await p
        .getByRole('heading', { name: 'All notes', exact: true })
        .waitFor();
      await p.getByText(/^[0-9]+ notes?$/).waitFor();
      await shot('all-notes');
      await p
        .getByRole('button', { name: 'Account: UI review', exact: true })
        .click();
      await p.getByRole('menuitem', { name: 'Settings' }).waitFor();
      await shot('account-menu');
      await p.keyboard.press('Escape');
      await p
        .getByRole('button', { name: 'Open navigation', exact: true })
        .click();
      await p
        .getByRole('button', { name: 'Close navigation', exact: true })
        .waitFor();
      await shot('drawer');
      await p
        .getByRole('button', { name: 'Expand all folders', exact: true })
        .click();
      await p
        .getByRole('button', {
          name: 'Actions for the note Home page',
          exact: true,
        })
        .waitFor();
      await shot('drawer-expanded');
      await p
        .getByRole('button', { name: 'Collapse all folders', exact: true })
        .click();
      await p.getByRole('button', { name: 'New folder', exact: true }).click();
      await p
        .getByRole('dialog', { name: 'New folder', exact: true })
        .waitFor();
      await shot('new-folder');
      await p
        .getByRole('dialog', { name: 'New folder', exact: true })
        .locator('#new-folder-inside')
        .click();
      await p
        .getByRole('dialog', { name: 'New folder', exact: true })
        .getByRole('treeitem')
        .first()
        .waitFor();
      await shot('new-folder-tree');
      await p.keyboard.press('Escape');
      await p
        .getByRole('button', { name: 'Close dialog', exact: true })
        .click();
      await p
        .getByRole('button', {
          name: 'Actions for the folder Personal',
          exact: true,
        })
        .click();
      const move = p.getByRole('menuitem', {
        name: 'Move to folder',
        exact: true,
      });
      await move.click();
      await p
        .getByRole('dialog', { name: 'Move Personal to', exact: true })
        .getByRole('treeitem')
        .first()
        .waitFor();
      const rootText = p
        .getByRole('dialog', { name: 'Move Personal to', exact: true })
        .getByRole('treeitem')
        .first()
        .locator('span.min-w-0.flex-1');
      assert.equal(
        await rootText.evaluate(
          (e) =>
            e.scrollWidth <= e.clientWidth + 1 &&
            e.scrollHeight <= e.clientHeight + 1,
        ),
        true,
      );
      await shot('move');
      const folderSearch = p
        .getByRole('dialog', { name: 'Move Personal to', exact: true })
        .getByRole('button', { name: 'Search folders', exact: true });
      if (await folderSearch.count()) {
        await folderSearch.click();
        await shot('move-filter');
        await p.keyboard.press('Escape');
      }
      await p
        .getByRole('button', { name: 'Close dialog', exact: true })
        .click();
      await p
        .getByRole('button', { name: 'Close navigation', exact: true })
        .click();
      await p.keyboard.press('Control+/');
      await p
        .getByRole('dialog', { name: 'Keyboard shortcuts', exact: true })
        .waitFor();
      await shot('shortcuts');
      await p.keyboard.press('Escape');
      await p
        .getByRole('button', { name: 'Use template', exact: true })
        .click();
      const td = p.getByRole('dialog', {
        name: 'New note from template',
        exact: true,
      });
      await td.getByRole('button', { name: 'Meeting', exact: true }).waitFor();
      await shot('template-list');
      await td.getByRole('button', { name: 'Meeting', exact: true }).click();
      await td
        .getByRole('region', { name: 'The new note', exact: true })
        .and(p.locator('[aria-busy="false"]'))
        .waitFor();
      await shot('template-details');
      await td.locator('#template-note-folder').click();
      await td.getByRole('treeitem').first().waitFor();
      await shot('template-folder');
      await p.keyboard.press('Escape');
      await td
        .getByRole('button', { name: 'Close template dialog', exact: true })
        .filter({ visible: true })
        .click();
      await settings('');
      await shot('settings-list');
      for (const section of [
        'appearance',
        'offline',
        'daily-notes',
        'templates',
        'export-import',
        'account',
        'billing',
        'devices',
        'api-keys-apps',
      ]) {
        await settings(section);
        const titles: Record<string, string> = {
          appearance: 'Appearance and editor',
          'api-keys-apps': 'API keys and apps',
          'daily-notes': 'Daily notes',
          'export-import': 'Export and import',
          billing: 'Plan and billing',
        };
        await d
          .getByRole('heading', {
            name:
              titles[section] ??
              section.charAt(0).toUpperCase() + section.slice(1),
            exact: true,
          })
          .waitFor();
        if (section === 'daily-notes')
          await d
            .getByRole('button', { name: 'Name format', exact: true })
            .waitFor();
        if (section === 'devices')
          await d
            .getByRole('list', { name: 'This device', exact: true })
            .waitFor();
        if (section === 'api-keys-apps')
          await d
            .getByRole('button', { name: 'Revoke Design app', exact: true })
            .waitFor();
        await shot(`settings-${section}`);
        if (section === 'daily-notes')
          for (const field of ['Folder', 'Name format', 'Template']) {
            await d.getByRole('button', { name: field, exact: true }).click();
            await d
              .getByRole('heading', {
                name:
                  field === 'Folder'
                    ? 'Save in'
                    : field === 'Template'
                      ? 'Choose template'
                      : 'Name format',
                exact: true,
              })
              .waitFor();
            if (field === 'Folder')
              await d.getByRole('treeitem').first().waitFor();
            if (field === 'Template')
              await d
                .getByRole('group', { name: 'Templates', exact: true })
                .getByRole('button', { name: 'Meeting', exact: true })
                .waitFor();
            await shot(`daily-${field.toLowerCase().replaceAll(' ', '-')}`);
            if (field === 'Name format') {
              await d
                .getByRole('textbox', { name: 'Name format', exact: true })
                .fill('/');
              await d.locator('[aria-invalid=true]').waitFor();
              await shot('daily-format-error');
            }
            if (field === 'Template') {
              await d
                .getByRole('group', { name: 'Templates', exact: true })
                .getByRole('button', { name: 'Meeting', exact: true })
                .click();
              await d
                .getByRole('region', {
                  name: 'Daily note preview',
                  exact: true,
                })
                .and(p.locator('[aria-busy="false"]'))
                .waitFor();
              const fixedFooter = await d
                .getByRole('button', { name: 'Done', exact: true })
                .boundingBox();
              await shot('daily-template-preview');
              await d
                .getByRole('region', {
                  name: 'Daily note preview',
                  exact: true,
                })
                .scrollIntoViewIfNeeded();
              assert.deepEqual(
                await d
                  .getByRole('button', { name: 'Done', exact: true })
                  .boundingBox(),
                fixedFooter,
              );
              await shot('daily-template-preview-scrolled');
            }
            await d
              .getByRole('button', { name: 'Cancel', exact: true })
              .click();
          }
        if (section === 'templates') {
          await d
            .getByRole('button', { name: 'Templates folder', exact: true })
            .click();
          await d
            .getByRole('heading', { name: 'Save in', exact: true })
            .waitFor();
          await d.getByRole('treeitem').first().waitFor();
          await shot('templates-folder');
          await d.getByRole('button', { name: 'Cancel', exact: true }).click();
        }
        if (section === 'account') {
          await d
            .getByRole('button', { name: 'Edit name', exact: true })
            .click();
          await d.getByRole('textbox', { name: 'Name', exact: true }).waitFor();
          await shot('account-name');
          await d.getByRole('button', { name: 'Cancel', exact: true }).click();
          await d
            .getByRole('button', { name: 'Delete account', exact: true })
            .click();
          await d
            .getByRole('heading', { name: 'Delete your account?', exact: true })
            .waitFor();
          await shot('delete-account');
          await d.getByRole('button', { name: 'Cancel', exact: true }).click();
        }
        if (section === 'api-keys-apps') {
          for (const [trigger, name] of [
            ['Create API key', 'create-key'],
            ['Revoke Design key', 'revoke-key'],
            ['Revoke Design app', 'revoke-app'],
          ] as const) {
            await d.getByRole('button', { name: trigger, exact: true }).click();
            await d
              .getByRole('heading', {
                name:
                  name === 'create-key'
                    ? 'Create API key'
                    : name === 'revoke-key'
                      ? 'Revoke API key?'
                      : 'Revoke connected app?',
                exact: true,
              })
              .waitFor();
            await shot(name);
            await d
              .getByRole('button', { name: 'Cancel', exact: true })
              .click();
          }
        }
      }
      await go('/accounts');
      await p.getByRole('heading', { name: 'Mail', exact: true }).waitFor();
      await shot('manage-overview');
      await p.getByLabel('Server', { exact: true }).fill('smtp.example.com');
      await p.getByLabel('Server', { exact: true }).scrollIntoViewIfNeeded();
      const sizes = await p
        .getByLabel('Server', { exact: true })
        .evaluate((e) => {
          const label = document.querySelector(`label[for="${e.id}"]`);
          if (!label) throw new Error('The field label is missing.');
          return {
            field: getComputedStyle(e).fontSize,
            label: getComputedStyle(label).fontSize,
            line: getComputedStyle(e).lineHeight,
            coarse: matchMedia('(pointer: coarse)').matches,
          };
        });
      assert.deepEqual(sizes, {
        field: '16px',
        label: '16px',
        line: '24px',
        coarse: true,
      });
      await shot('manage-mail');
      for (const id of [
        'legal-heading',
        'reports-heading',
        'invitations-heading',
        'accounts-heading',
      ]) {
        await p.locator(`#${id}`).scrollIntoViewIfNeeded();
        await shot(`manage-${id.replace('-heading', '')}`);
      }
      await go('/trash');
      await p
        .getByRole('button', {
          name: 'Restore Personal/Reading/Reading list',
          exact: true,
        })
        .waitFor();
      await shot('trash');
      await go('/published');
      await p
        .getByRole('button', {
          name: 'Revoke the link to Personal',
          exact: true,
        })
        .waitFor();
      await shot('published');
      const note = fixture.files[0];
      assert.ok(note);
      await go(`/notes/${note.fileId}`);
      await p.locator('.cm-editor').waitFor();
      await shot('note-editor');
      await p
        .getByRole('button', { name: 'Account: UI review', exact: true })
        .click();
      await p.getByRole('menuitem', { name: 'Settings' }).waitFor();
      await shot('note-account-menu');
      await p.keyboard.press('Escape');
      for (const trigger of ['Note actions', 'Row actions', 'Column actions']) {
        const button = p.getByRole('button', { name: trigger, exact: true });
        if (await button.count()) {
          await button.scrollIntoViewIfNeeded();
          await button.click();
          await shot(`editor-${trigger.toLowerCase().replaceAll(' ', '-')}`);
          await p.keyboard.press('Escape');
        }
      }
      await c.close();
      const guest = await browser.newContext({
        viewport: { width, height: 844 },
        hasTouch: true,
        isMobile: true,
        colorScheme: scheme,
      });
      await guest.addInitScript(
        (s) => localStorage.setItem('notesapp.theme', s),
        scheme,
      );
      const auth = await guest.newPage();
      for (const path of ['login', 'signup']) {
        await auth.goto(`${base}/${path}`);
        await auth.locator('input[type="email"]').waitFor();
        await auth.screenshot({
          path: `.local-app/screenshots/text-roles-${path}-${variant}.png`,
          animations: 'disabled',
        });
        assert.equal(
          await auth.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        const typography = await auditText(auth, touchTextRoles);
        results.push({
          variant,
          screen: path,
          issues: typography.problems,
          combinations: typography.combinations,
        });
      }
      await auth
        .getByRole('textbox', { name: 'Email address', exact: true })
        .fill('type-check@example.com');
      await auth.getByLabel('Password', { exact: true }).fill('short');
      await auth
        .getByRole('button', { name: 'Create account', exact: true })
        .click();
      await auth.locator('[aria-invalid=true]').waitFor();
      assert.equal(
        await auth
          .locator('[role=alert]')
          .evaluate((e) => getComputedStyle(e).fontSize),
        '14px',
      );
      await auth.screenshot({
        path: `.local-app/screenshots/text-roles-signup-error-${variant}.png`,
        animations: 'disabled',
      });
      const typography = await auditText(auth, touchTextRoles);
      results.push({
        variant,
        screen: 'signup-error',
        issues: typography.problems,
        combinations: typography.combinations,
      });
      await guest.close();
      await browser
        .contexts()
        .find((c) => c === guest)
        ?.close();
    }
  assert.deepEqual(await originalState(), original);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    results.flatMap((r) => r.issues),
    [],
  );
  writeFileSync(
    '.local-app/text-roles-results.json',
    JSON.stringify({ results, errors, writes }, null, 2),
  );
  process.stdout.write(
    `${results.length} screens, ${results.flatMap((r) => r.issues).length} issues\n`,
  );
} finally {
  writeFileSync(
    '.local-app/text-roles-results.json',
    JSON.stringify({ results, errors, writes }, null, 2),
  );
  await browser.close();
  assert.deepEqual(await originalState(), original);
}

/** Inspect real visible text, including fields, without counting clipped accessibility text. */
async function auditText(page: Page, roles: typeof touchTextRoles) {
  return page.evaluate((roles) => {
    const allowed = new Set(
      Object.values(roles).map((r) => `${r.size}/${r.line}/${r.weight}`),
    );
    const problems: Problem[] = [],
      combinations: Record<string, string[]> = {};
    const roots = [...document.querySelectorAll('[role="dialog"]')].filter(
      (e) => e.checkVisibility(),
    );
    const root = roots.at(-1) ?? document.body;
    const visible = (e: Element, rect: DOMRect) => {
      if (
        !e.checkVisibility({
          visibilityProperty: true,
          opacityProperty: true,
        }) ||
        e.closest('.sr-only,.cm-content,.cm-line,.cm-tooltip-autocomplete')
      )
        return false;
      if (
        !rect.width ||
        !rect.height ||
        rect.bottom <= 0 ||
        rect.top >= innerHeight ||
        rect.right <= 0 ||
        rect.left >= innerWidth
      )
        return false;
      for (let a = e.parentElement; a; a = a.parentElement) {
        const s = getComputedStyle(a),
          r = a.getBoundingClientRect();
        if (
          ['hidden', 'auto', 'scroll', 'clip'].includes(s.overflowY) &&
          (rect.bottom <= r.top || rect.top >= r.bottom)
        )
          return false;
        if (
          ['hidden', 'auto', 'scroll', 'clip'].includes(s.overflowX) &&
          (rect.right <= r.left || rect.left >= r.right)
        )
          return false;
        if (s.position === 'fixed') break;
      }
      return true;
    };
    const colors: Record<string, string> = {};
    for (const role of ['strong', 'muted', 'danger']) {
      const probe = document.createElement('span');
      probe.style.color = `var(--notes-text-${role === 'danger' ? 'strong' : role})`;
      if (role === 'danger') probe.style.color = 'var(--notes-danger-text)';
      document.body.append(probe);
      colors[role] = getComputedStyle(probe).color;
      probe.remove();
    }
    const inspect = (e: Element, text: string) => {
      const s = getComputedStyle(e),
        size = parseFloat(s.fontSize),
        line = parseFloat(s.lineHeight),
        weight = Number(s.fontWeight);
      const key = `${size}/${line}/${weight}`;
      (combinations[key] ??= []).push(text.slice(0, 70));
      if (!allowed.has(key))
        problems.push({ kind: 'text-combination', text, key });
      if (e.classList.contains('text-value') && s.color !== colors.muted)
        problems.push({ kind: 'value-colour', text, colour: s.color });
      if (
        (e.classList.contains('text-title-header') ||
          e.classList.contains('text-title-page')) &&
        s.color !== colors.strong
      )
        problems.push({ kind: 'title-colour', text, colour: s.color });
      if (
        (e.classList.contains('text-secondary') ||
          e.classList.contains('text-group')) &&
        ![colors.muted, colors.danger].includes(s.color)
      )
        problems.push({ kind: 'secondary-colour', text, colour: s.color });

      if (size === 11 && !e.closest('kbd,.text-small,.text-avatar'))
        problems.push({ kind: 'small-role', text, key });
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode,
        text = (t.textContent ?? '').trim();
      if (!text) continue;
      const e = t.parentElement;
      if (e === null) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      if (visible(e, range.getBoundingClientRect())) inspect(e, text);
    }
    for (const e of root.querySelectorAll(
      'input:not([type="checkbox"]):not([type="radio"]),textarea,select',
    )) {
      if (!visible(e, e.getBoundingClientRect())) continue;
      if (!(
        e instanceof HTMLInputElement ||
        e instanceof HTMLTextAreaElement ||
        e instanceof HTMLSelectElement
      ))
        continue;
      inspect(e, e.value || e.getAttribute('aria-label') || e.id);
      if (getComputedStyle(e).fontWeight !== '400')
        problems.push({
          kind: 'field-weight',
          field: e.id,
          weight: getComputedStyle(e).fontWeight,
        });
      const label = [...document.querySelectorAll('label')].find(
        (l) => l.htmlFor === e.id,
      );
      if (label && visible(label, label.getBoundingClientRect())) {
        if (getComputedStyle(label).fontSize !== getComputedStyle(e).fontSize)
          problems.push({
            kind: 'field-label-size',
            field: e.id,
            label: getComputedStyle(label).fontSize,
            fieldSize: getComputedStyle(e).fontSize,
          });
      }
    }
    for (const title of root.querySelectorAll(
      '.text-title-header,.text-title-page',
    )) {
      if (
        !visible(title, title.getBoundingClientRect()) ||
        title.closest('[role="region"]')
      )
        continue;
      const section = title.closest('section,form,[role="dialog"],main');
      if (!section) continue;
      const size = parseFloat(getComputedStyle(title).fontSize);
      for (const e of section.querySelectorAll(
        'label,input,button,p,.text-body,.text-label',
      )) {
        if (
          e.closest('.cm-content,[role="region"]') ||
          !visible(e, e.getBoundingClientRect())
        )
          continue;
        const childSize = parseFloat(getComputedStyle(e).fontSize);
        if (childSize > size)
          problems.push({
            kind: 'inverted-heading',
            title: (title.textContent ?? '').trim(),
            text: (e.textContent ?? '').trim().slice(0, 50),
            size,
            childSize,
          });
      }
    }
    return { combinations, problems };
  }, roles);
}

type Problem = { kind: string; [key: string]: unknown };
type Result = {
  variant: string;
  screen: string;
  issues: Problem[];
  combinations: Record<string, string[]>;
};
function readState(path: string): {
  cookies: { name: string; value: string }[];
} {
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(isRecord(data) && Array.isArray(data.cookies));
  return {
    cookies: data.cookies.map((cookie: unknown) => {
      assert.ok(
        isRecord(cookie) &&
          typeof cookie.name === 'string' &&
          typeof cookie.value === 'string',
      );
      return { name: cookie.name, value: cookie.value };
    }),
  };
}
function readFixture(path: string): {
  workspaceId: string;
  files: { fileId: string }[];
} {
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(
    isRecord(data) &&
      typeof data.workspaceId === 'string' &&
      Array.isArray(data.files),
  );
  return {
    workspaceId: data.workspaceId,
    files: data.files.map((file: unknown) => {
      assert.ok(isRecord(file) && typeof file.fileId === 'string');
      return { fileId: file.fileId };
    }),
  };
}
