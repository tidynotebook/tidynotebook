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

export async function auditSettings(page: Page) {
  return page.evaluate(() => {
    const phone = matchMedia('(pointer: coarse) and (width < 64rem)').matches;
    const errors: string[] = [],
      rows: unknown[] = [];
    const visible = (e: Element) =>
      e.checkVisibility({ visibilityProperty: true }) &&
      e.getBoundingClientRect().width > 0;
    const eq = (name: string, a: number, b: number) => {
      if (Math.abs(a - b) > 1) errors.push(`${name}: ${a} != ${b}`);
    };
    const box = (e: Element) => e.getBoundingClientRect();
    for (const header of [
      ...document.querySelectorAll('.ui-settings-heading'),
    ].filter(visible)) {
      const style = getComputedStyle(header);
      if (
        header.closest('.ui-settings-column') ||
        header.classList.contains('ui-settings-root-heading')
      ) {
        eq('header top padding', parseFloat(style.paddingTop), phone ? 16 : 24);
        eq(
          'header bottom padding',
          parseFloat(style.paddingBottom),
          phone ? 16 : 24,
        );
        const close = header.querySelector('[aria-label="Close Settings"]');
        if (close && visible(close)) {
          if (
            close
              .closest('[data-header-slot]')
              ?.getAttribute('data-header-slot') !== 'trailing'
          )
            errors.push('Close must be in the right header slot');
          const glyph = close.querySelector('svg');
          if (glyph)
            eq(
              'close glyph on right content edge',
              box(glyph).right,
              box(header).right - parseFloat(style.paddingRight),
            );
        }
      }
    }
    for (const label of [
      ...document.querySelectorAll('[data-mode-label]'),
    ].filter(visible)) {
      const range = document.createRange();
      range.selectNodeContents(label);
      const text = range.getBoundingClientRect();
      if (text.width > box(label).width + 1)
        errors.push(`Mode label is cut: ${label.textContent}`);
      if (label.parentElement?.querySelector('[data-mode-check]'))
        errors.push('Mode check must not take label width');
    }
    for (const el of document.querySelectorAll(
      '.ui-settings-row,.ui-settings-nav-row,.ui-account-card,.ui-settings-form-body,.ui-settings-footer',
    )) {
      if (!visible(el)) continue;
      const s = getComputedStyle(el),
        r = box(el);
      eq(
        'vertical padding',
        parseFloat(s.paddingTop),
        parseFloat(s.paddingBottom),
      );
      eq(
        'horizontal padding',
        parseFloat(s.paddingLeft),
        parseFloat(s.paddingRight),
      );
      if (el.matches('.ui-settings-row')) {
        eq('row vertical padding', parseFloat(s.paddingTop), 12);
        eq('row horizontal padding', parseFloat(s.paddingLeft), phone ? 16 : 0);
        for (const text of el.querySelectorAll(
          '.ui-settings-copy,.ui-settings-copy > span,.ui-settings-copy > p',
        )) {
          if (visible(text) && getComputedStyle(text).textAlign !== 'left')
            errors.push('Row label and help text must align left');
        }
        const copy = el.querySelector('.ui-settings-copy');
        const control = el.querySelector(
          '.ui-settings-control,.ui-settings-switch-slot,.ui-settings-button-slot',
        );
        if (copy && control)
          eq(
            'centered control',
            box(copy).y + box(copy).height / 2,
            box(control).y + box(control).height / 2,
          );
        const children = [...el.children].filter(
          (c) => visible(c) && getComputedStyle(c).position !== 'absolute',
        );
        if (children.length) {
          const top = Math.min(...children.map((c) => box(c).top)),
            bottom = Math.max(...children.map((c) => box(c).bottom));
          eq('content vertical symmetry', top - r.top, r.bottom - bottom);
        }
        rows.push({
          text: el.textContent?.trim().slice(0, 70),
          height: r.height,
          pad: s.padding,
        });
      }
      if (el.matches('.ui-settings-nav-row')) {
        eq('nav y', parseFloat(s.paddingTop), phone ? 12 : 4);
        eq('nav x', parseFloat(s.paddingLeft), phone ? 16 : 8);
      }
      if (el.matches('.ui-settings-form-body'))
        eq('form inset', parseFloat(s.paddingLeft), phone ? 16 : 24);
      if (el.matches('.ui-settings-footer'))
        eq('footer inset', parseFloat(s.paddingLeft), phone ? 12 : 24);
    }
    for (const card of document.querySelectorAll(
      '.ui-settings-card,.ui-settings-nav-card',
    )) {
      if (!visible(card)) continue;
      const expected =
        box(card).left +
        (phone ? 16 : card.classList.contains('ui-settings-nav-card') ? 8 : 0);
      for (const row of card.querySelectorAll(
        '.ui-settings-row,.ui-settings-nav-row',
      )) {
        if (visible(row))
          eq(
            'shared row edge',
            box(row).left + parseFloat(getComputedStyle(row).paddingLeft),
            expected,
          );
      }
    }
    for (const heading of document.querySelectorAll(
      '.ui-settings-group-heading',
    )) {
      if (!visible(heading)) continue;
      const card = heading.nextElementSibling;
      if (card && visible(card))
        eq('heading to card', box(card).top - box(heading).bottom, 8);
      if (phone && card?.classList.contains('ui-settings-card'))
        eq(
          'heading inner edge',
          box(heading).left + parseFloat(getComputedStyle(heading).paddingLeft),
          box(card).left + 16,
        );
    }
    for (const heading of document.querySelectorAll(
      '.ui-settings-nav-heading',
    )) {
      if (!visible(heading)) continue;
      const card = heading.nextElementSibling;
      if (card)
        eq(
          'navigation heading gap',
          box(card).top - box(heading).bottom,
          phone ? 8 : 2,
        );
      if (!phone) eq('navigation heading height', box(heading).height, 28);
    }
    for (const button of document.querySelectorAll(
      '.ui-settings-heading .ui-button,.ui-settings-footer .ui-button,.ui-settings-row-button',
    )) {
      if (!visible(button)) continue;
      const content = [...button.children].filter(visible);
      if (!content.length) continue;
      const r = box(button),
        left = Math.min(...content.map((e) => box(e).left)),
        right = Math.max(...content.map((e) => box(e).right)),
        top = Math.min(...content.map((e) => box(e).top)),
        bottom = Math.max(...content.map((e) => box(e).bottom));
      eq('button visible horizontal symmetry', left - r.left, r.right - right);
      eq('button visible vertical symmetry', top - r.top, r.bottom - bottom);
    }
    for (const copy of document.querySelectorAll('.ui-settings-copy')) {
      if (!visible(copy)) continue;
      const label = copy.querySelector('[data-setting-label]'),
        help = copy.querySelector('[data-setting-help]');
      if (label && help && visible(help))
        eq('label help gap', box(help).top - box(label).bottom, 2);
    }
    for (const field of document.querySelectorAll(
      '.ui-settings-form-body .ui-field-group',
    )) {
      if (!visible(field)) continue;
      const label = field.querySelector('label'),
        control = field.querySelector('input,select,textarea');
      if (label && control && visible(label))
        eq('label to field', box(control).top - box(label).bottom, 8);
      const next = field.nextElementSibling;
      if (
        next?.matches('.ui-field-group') &&
        visible(next) &&
        (getComputedStyle(field.parentElement ?? field).display !== 'grid' ||
          box(next).top > box(field).top + 1)
      )
        eq('field group gap', box(next).top - box(field).bottom, 12);
    }
    for (const grid of document.querySelectorAll('.ui-settings-form-grid')) {
      if (!visible(grid)) continue;
      eq('form grid row gap', parseFloat(getComputedStyle(grid).rowGap), 12);
      eq(
        'form grid column gap',
        parseFloat(getComputedStyle(grid).columnGap),
        12,
      );
    }
    if (phone) {
      for (const h of document.querySelectorAll('.ui-settings-heading')) {
        if (!visible(h)) continue;
        const parts = [...h.children].filter(
          (item) =>
            visible(item) && getComputedStyle(item).position !== 'absolute',
        );
        if (parts.length) {
          const first = Math.min(...parts.map((item) => box(item).top));
          const last = Math.max(...parts.map((item) => box(item).bottom));
          eq('header content top inset', first - box(h).top, 16);
          eq('header content bottom inset', box(h).bottom - last, 16);
        }
        const title = h.querySelector('h2,p');
        if (title) {
          eq(
            'header title horizontal center',
            box(title).left + box(title).width / 2,
            box(h).left + box(h).width / 2,
          );
          const line =
            title.parentElement?.closest('[data-ui-layout="inline"]') ?? h;
          eq(
            'header title line center',
            box(title).top + box(title).height / 2,
            box(line).top + box(line).height / 2,
          );
        }
      }
    }
    return { errors, rows };
  });
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
            .locator('.ui-settings-action, #mail-host, #invite-email')
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
