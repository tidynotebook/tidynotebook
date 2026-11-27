/** Settings component symmetry and scroll edges. The audit makes no review writes. */
import assert from 'node:assert/strict';
import { auditText } from './text-audit.ts';
import {
  touchTextRoles,
  fineTextRoles,
} from '../../packages/ui/src/typography.ts';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { hasChromium, isRecord, type Page } from './browser.ts';

import { auditSettings } from './settings-measurements.ts';

if (process.env.COLLABORATION_AUDIT === '1') {
  await (
    await import('./collaboration-design.ts')
  ).runCollaborationAudit(undefined, ['settings-symmetry']);
  process.exit(0);
}

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
const base = process.env.UI_AUDIT_ORIGIN ?? 'http://10.20.30.98:3517',
  out = process.env.S2_SCREENSHOTS ?? '/tmp/review517/s2';
mkdirSync(out, { recursive: true });
const browser = await loaded.chromium.launch(),
  results: unknown[] = [],
  errors: string[] = [],
  writes: string[] = [];
const overlay = async (p: Page) =>
  p.evaluate(() => {
    const layer = document.createElement('div');
    layer.id = 'padding-overlay';
    layer.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:99999';
    document.body.append(layer);
    const band = (
      x: number,
      y: number,
      w: number,
      h: number,
      color: string,
    ) => {
      const e = document.createElement('div');
      e.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px;background:${color}`;
      layer.append(e);
    };
    for (const el of document.querySelectorAll(
      '.ui-settings-list,.ui-settings-column,.ui-settings-page,.ui-settings-row,.ui-settings-nav-row,.ui-settings-heading,.ui-account-card,.ui-settings-form-body,.ui-settings-footer,.ui-settings-group,.ui-settings-groups,.ui-settings-nav-groups',
    )) {
      if (!el.checkVisibility() || !el.getBoundingClientRect().width) continue;
      const r = el.getBoundingClientRect(),
        s = getComputedStyle(el),
        [t = 0, b = 0, l = 0, rt = 0] = [
          s.paddingTop,
          s.paddingBottom,
          s.paddingLeft,
          s.paddingRight,
        ].map(parseFloat);
      band(r.x, r.y, r.width, t, '#f7258544');
      band(r.x, r.bottom - b, r.width, b, '#f7258544');
      band(r.x, r.y + t, l, r.height - t - b, '#f7258544');
      band(r.right - rt, r.y + t, rt, r.height - t - b, '#f7258544');
      const children = [...el.children].filter(
        (e) =>
          e.checkVisibility() && getComputedStyle(e).position !== 'absolute',
      );
      if (s.display === 'flex' && s.flexDirection === 'column')
        for (let i = 1; i < children.length; i++) {
          const a = children[i - 1]?.getBoundingClientRect(),
            b = children[i]?.getBoundingClientRect();
          if (a && b && b.top > a.bottom)
            band(
              r.x + l,
              a.bottom,
              r.width - l - rt,
              b.top - a.bottom,
              '#00b4d866',
            );
        }
    }
  });
try {
  for (const width of process.env.CHECK_WIDTHS?.split(',').map(Number) ?? [
    1440, 390, 320,
  ])
    for (const scheme of ['light', 'dark'] as const) {
      const phone = width < 1024,
        c = await browser.newContext({
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
      if (process.env.UI_AUDIT_ASSETS)
        await c.route(base + '/**', async (route) => {
          try {
            const req = route.request(),
              url = new URL(req.url());
            if (url.pathname.startsWith('/api/'))
              return await route.fulfill({ response: await route.fetch() });
            const root = resolve(process.env.UI_AUDIT_ASSETS ?? ''),
              file = req.isNavigationRequest()
                ? resolve(root, 'index.html')
                : resolve(root, '.' + url.pathname);
            if (!file.startsWith(root) || !existsSync(file))
              return await route.continue();
            await route.fulfill({
              body: readFileSync(file),
              contentType:
                {
                  '.html': 'text/html',
                  '.css': 'text/css',
                  '.js': 'text/javascript',
                  '.woff2': 'font/woff2',
                }[extname(file)] ?? 'application/octet-stream',
            });
          } catch (e) {
            if (
              !(e instanceof Error) ||
              !/closed|handled|cancelled|aborted/i.test(e.message)
            )
              throw e;
          }
        });
      const p = await c.newPage();
      p.on('request', (r) => {
        if (
          !['GET', 'HEAD', 'OPTIONS'].includes(r.method()) &&
          r.url().includes('/api/') &&
          !r.url().endsWith('/sync/snapshots')
        )
          writes.push(r.url());
      });
      const check = async (name: string, shot = false) => {
        await pause(250);
        const measured = await auditSettings(p);
        const typography = await auditText(
          p,
          phone ? touchTextRoles : fineTextRoles,
        );
        errors.push(
          ...typography.problems.map(
            (issue) => `${width} ${scheme} ${name}: ${JSON.stringify(issue)}`,
          ),
        );
        process.stdout.write(
          `${width} ${scheme} ${name}: ${measured.errors.length} geometry, ${typography.problems.length} type issues\n`,
        );
        errors.push(
          ...measured.errors.map((e) => `${width} ${scheme} ${name}: ${e}`),
        );
        results.push({
          width,
          scheme,
          name,
          ...measured,
          combinations: typography.combinations,
        });
        if (shot && width !== 320) {
          await p.screenshot({
            path: `${out}/settings-${name}-${width}-${scheme}.png`,
            animations: 'disabled',
          });
          await overlay(p);
          await p.screenshot({
            path: `${out}/settings-${name}-${width}-${scheme}-overlay.png`,
            animations: 'disabled',
          });
          await p.evaluate(() =>
            document.getElementById('padding-overlay')?.remove(),
          );
        }
      };
      for (const section of [
        '',
        'appearance',
        'offline',
        'daily-notes',
        'templates',
        'export-import',
        'account',
        'devices',
        'api-keys-apps',
        'accounts',
        'mail',
        'legal',
        'reports',
      ]) {
        await p.goto(`${base}/w/${fixture.workspaceId}?settings=${section}`);
        await p.locator('[role=dialog]').waitFor();
        await pause(350);
        if (section === 'devices')
          await p
            .getByRole('heading', { name: 'Other devices', exact: true })
            .waitFor();
        await check(
          section || 'root',
          ['', 'account', 'daily-notes', 'devices'].includes(section),
        );
        const actions: readonly [string, string][] =
          section === 'daily-notes'
            ? [
                ['Folder', 'folder'],
                ['Name format', 'format'],
                ['Template', 'template'],
              ]
            : section === 'templates'
              ? [['Templates folder', 'template-folder']]
              : section === 'account' && phone
                ? [['Name', 'name-edit']]
                : section === 'mail'
                  ? []
                  : section === 'legal'
                    ? [
                        ['Terms', 'terms'],
                        ['Privacy notice', 'privacy'],
                      ]
                    : section === 'accounts'
                      ? [
                          [
                            phone ? '+ Invite a person' : 'Invite a person',
                            'invite',
                          ],
                        ]
                      : section === 'api-keys-apps'
                        ? [['Create API key', 'key']]
                        : [];
        for (const [label, name] of actions) {
          const button = p.getByRole('button', { name: label, exact: true });
          await button.click();
          await p
            .locator(
              '.ui-settings-action, #daily-format, #profile-name, #api-key-name, #mail-host, #invite-email',
            )
            .first()
            .waitFor();
          await check(
            name,
            (name === 'name-edit' && phone) ||
              (name === 'mail-server' && !phone),
          );
          await p.keyboard.press('Escape');
          await pause(100);
        }
        if (section === 'accounts') {
          if (phone) {
            await p
              .locator('.ui-settings-content')
              .getByRole('button', { name: 'Account: UI review', exact: true })
              .click();
            await p
              .getByRole('button', { name: 'Role', exact: true })
              .waitFor();
            await check('account-detail');
            for (const [label, field] of [
              ['Role', '#account-role'],
              ['Limits and access', '#controls-standing'],
            ] as const) {
              await p.getByRole('button', { name: label, exact: true }).click();
              await p.locator(field).waitFor();
              await check(label === 'Role' ? 'account-role' : 'account-limits');
              await p.keyboard.press('Escape');
              await pause(100);
            }
            await p.keyboard.press('Escape');
          } else {
            await p
              .getByRole('button', {
                name: 'Change the account of UI review',
                exact: true,
              })
              .click();
            await p
              .getByRole('menuitem', {
                name: 'Change limits and access',
                exact: true,
              })
              .click();
            await p.locator('#controls-standing').waitFor();
            await check('account-limits');
            await p.keyboard.press('Escape');
          }
        }
      }
      await c.unrouteAll({ behavior: 'ignoreErrors' });
      await c.close();
    }
} finally {
  await browser.close();
  writeFileSync(
    out + '/settings-symmetry.json',
    JSON.stringify({ results, errors, writes }, null, 2),
  );
}
assert.deepEqual(writes, []);
assert.deepEqual(errors, []);
process.stdout.write(
  `PASS ${results.length} Settings symmetry cases; no review writes\n`,
);
