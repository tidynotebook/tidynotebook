/** Sidebar role geometry, optical edges and parent-owned spacing. No review writes. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hasChromium, isRecord, type Page } from './browser.ts';

export async function auditSidebar(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('#notes-sidebar');
    if (!root) throw new Error('Sidebar missing');
    const coarse = matchMedia('(pointer:coarse)').matches;
    const visible = (e: Element) =>
      e.checkVisibility({ visibilityProperty: true }) &&
      e.getBoundingClientRect().width > 0;
    const errors: string[] = [];
    const measurements: unknown[] = [];
    const eq = (name: string, a: number, b: number) => {
      if (Math.abs(a - b) > 1) errors.push(`${name}: ${a} != ${b}`);
    };
    const box = (e: Element) => e.getBoundingClientRect();
    const panel = root.querySelector('.ui-sidebar-panel');
    if (!panel) throw new Error('Panel missing');
    const style = getComputedStyle(panel),
      pad = coarse ? 12 : 8;
    for (const side of [
      style.paddingTop,
      style.paddingBottom,
      style.paddingLeft,
      style.paddingRight,
    ])
      eq('panel padding', parseFloat(side), pad);
    eq('group gap', parseFloat(style.gap), pad);
    for (const parent of root.querySelectorAll(
      '.ui-sidebar-body,.ui-sidebar-tree-items',
    )) {
      const children = [...parent.children].filter(visible);
      const gap = parent.classList.contains('ui-sidebar-body') ? pad : 2;
      for (let index = 1; index < children.length; index++) {
        const previous = children[index - 1],
          next = children[index];
        if (previous && next)
          eq('parent item gap', box(next).top - box(previous).bottom, gap);
      }
    }
    const levels = new Map<number, number>();
    for (const row of root.querySelectorAll('.ui-sidebar-row')) {
      if (!visible(row)) continue;
      const r = box(row),
        s = getComputedStyle(row),
        label = row.querySelector('[data-tree-name]');
      const leading = row.querySelector(
        '.ui-sidebar-leading > .ui-sidebar-slot',
      );
      const trailing = row.querySelector(':scope > .ui-sidebar-slot');
      const y = coarse ? 8 : 4,
        x = coarse ? 12 : 8;
      eq('row top', parseFloat(s.paddingTop), y);
      eq('row bottom', parseFloat(s.paddingBottom), y);
      eq('row left', parseFloat(s.paddingLeft), x);
      eq('row right', parseFloat(s.paddingRight), x);
      if (label) {
        const l = box(label);
        eq('content height', r.height, l.height + 2 * y);
        eq('text vertical symmetry', l.top - r.top, r.bottom - l.bottom);
      }
      if (leading) {
        const l = box(leading);
        eq('leading optical edge', l.left - r.left, x);
        eq('leading vertical symmetry', l.top - r.top, r.bottom - l.bottom);
        const level = Number(
          row.closest('[aria-level]')?.getAttribute('aria-level') ?? 1,
        );
        const old = levels.get(level);
        if (old !== undefined) eq('same leading edge per level', l.left, old);
        else levels.set(level, l.left);
      }
      if (leading) {
        const glyph = leading.querySelector('svg');
        if (glyph) {
          eq('disclosure glyph x', box(glyph).left, box(leading).left);
          eq('disclosure glyph y', box(glyph).top, box(leading).top);
        }
      }
      if (trailing) {
        const glyph = trailing.querySelector('svg');
        if (glyph) {
          eq('menu glyph x', box(glyph).left, box(trailing).left);
          eq('menu glyph y', box(glyph).top, box(trailing).top);
        }
        const t = box(trailing);
        eq('trailing optical edge', r.right - t.right, x);
        eq('trailing vertical symmetry', t.top - r.top, r.bottom - t.bottom);
        const action = trailing.querySelector('button');
        if (action) {
          eq('row action width', box(action).width, coarse ? 40 : 28);
          eq('row action height', box(action).height, coarse ? 36 : 28);
        }
      }
      measurements.push({
        text: label?.textContent,
        height: r.height,
        left: parseFloat(s.paddingLeft),
        right: parseFloat(s.paddingRight),
      });
    }
    const first = levels.get(1);
    if (first !== undefined)
      for (const [level, left] of levels)
        eq('indent per level', left - first, (level - 1) * 20);
    for (const button of root.querySelectorAll(
      '.ui-sidebar-rail-button,.ui-sidebar-action,.ui-sidebar-header-close',
    )) {
      if (!visible(button)) continue;
      const r = box(button),
        svg = button.querySelector('svg');
      if (!svg) continue;
      const g = box(svg);
      eq('button horizontal symmetry', g.left - r.left, r.right - g.right);
      eq('button vertical symmetry', g.top - r.top, r.bottom - g.bottom);
      const size = button.classList.contains('ui-sidebar-rail-button')
        ? coarse
          ? 44
          : 28
        : button.classList.contains('ui-sidebar-header-close')
          ? 44
          : coarse
            ? 40
            : 28;
      eq('button width', r.width, size);
      eq('button height', r.height, size);
    }
    for (const switcher of root.querySelectorAll('.ui-sidebar-switcher')) {
      if (!visible(switcher)) continue;
      const r = box(switcher),
        first = switcher.firstElementChild,
        last = switcher.lastElementChild;
      eq('switcher height', r.height, coarse ? 36 : 28);
      if (first && last) {
        eq('switcher left', box(first).left - r.left, pad);
        eq('switcher right', r.right - box(last).right, pad);
        eq(
          'switcher vertical symmetry',
          box(first).top - r.top,
          r.bottom - box(first).bottom,
        );
      }
    }
    for (const header of root.querySelectorAll('.ui-sidebar-header')) {
      if (!visible(header)) continue;
      eq('header height', box(header).height, 44);
      const text = header.firstElementChild,
        slot = header.lastElementChild;
      if (text && slot) {
        eq('header text edge', box(text).left - box(panel).left, pad);
        eq('header close edge', box(panel).right - box(slot).right, pad);
        eq(
          'header vertical symmetry',
          box(text).top - box(header).top,
          box(header).bottom - box(text).bottom,
        );
      }
    }
    for (const footer of root.querySelectorAll('.ui-sidebar-status')) {
      if (!visible(footer)) continue;
      const f = getComputedStyle(footer);
      eq('footer height', box(footer).height, coarse ? 36 : 32);
      eq('footer left', parseFloat(f.paddingLeft), pad);
      eq('footer right', parseFloat(f.paddingRight), pad);
      for (const child of footer.children) {
        eq(
          'footer vertical symmetry',
          box(child).top - box(footer).top,
          box(footer).bottom - box(child).bottom,
        );
      }
    }
    return { errors, measurements };
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
const base = process.env.UI_AUDIT_ORIGIN ?? 'http://localhost:3517';
const browser = await loaded.chromium.launch();
const results: unknown[] = [],
  errors: string[] = [],
  writes: string[] = [];
mkdirSync('.local-app/screenshots', { recursive: true });
try {
  for (const width of [1440, 390, 320])
    for (const scheme of ['light', 'dark'] as const) {
      const phone = width < 1024,
        c = await browser.newContext({
          storageState: '.local-app/review-session.json',
          viewport: { width, height: 900 },
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
            const req = route.request();
            const url = new URL(req.url());
            if (url.pathname.startsWith('/api/'))
              return await route.fulfill({ response: await route.fetch() });
            const root = resolve(process.env.UI_AUDIT_ASSETS ?? '');
            const file = req.isNavigationRequest()
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
          } catch (error) {
            if (
              !(error instanceof Error) ||
              !/closed|handled|cancelled|aborted/i.test(error.message)
            )
              throw error;
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
      await p.goto(`${base}/w/${fixture.workspaceId}`);
      await p
        .getByRole('button', { name: 'Account: UI review', exact: true })
        .waitFor();
      if (phone) {
        await p
          .getByRole('button', { name: 'Open navigation', exact: true })
          .click();
        await p.locator('#notes-sidebar[data-drawer-ready]').waitFor();
      }
      const more = p
        .getByRole('button', { name: 'More drawer actions', exact: true })
        .filter({ visible: true });
      if (await more.count()) {
        await more.click();
        await p
          .getByRole('menuitem', { name: 'Expand all folders', exact: true })
          .click();
      } else
        await p
          .getByRole('button', { name: 'Expand all folders', exact: true })
          .click();
      await p
        .getByRole('button', {
          name: 'Actions for the note Home page',
          exact: true,
        })
        .waitFor();
      const measured = await auditSidebar(p);
      errors.push(...measured.errors.map((e) => `${width} ${scheme}: ${e}`));
      results.push({ width, scheme, ...measured });
      await p.locator('#notes-sidebar').screenshot({
        path: `.local-app/screenshots/s1-sidebar-${width}-${scheme}.png`,
        animations: 'disabled',
      });
      await p.evaluate(() => {
        const overlay = document.createElement('div');
        overlay.id = 'spacing-overlay';
        overlay.style.cssText =
          'position:fixed;inset:0;pointer-events:none;z-index:99999';
        document.body.append(overlay);
        const band = (
          x: number,
          y: number,
          w: number,
          h: number,
          color: string,
        ) => {
          const e = document.createElement('div');
          e.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px;background:${color}`;
          overlay.append(e);
        };
        for (const el of document.querySelectorAll(
          '#notes-sidebar .ui-sidebar-panel,#notes-sidebar .ui-sidebar-row,#notes-sidebar .ui-sidebar-body,#notes-sidebar .ui-sidebar-tree-items,#notes-sidebar .ui-sidebar-rail',
        )) {
          const r = el.getBoundingClientRect(),
            s = getComputedStyle(el);
          if (!el.checkVisibility()) continue;
          const [t = 0, b = 0, l = 0, rt = 0] = [
            s.paddingTop,
            s.paddingBottom,
            s.paddingLeft,
            s.paddingRight,
          ].map(parseFloat);
          band(r.x, r.y, r.width, t, '#f7258544');
          band(r.x, r.bottom - b, r.width, b, '#f7258544');
          band(r.x, r.y, l, r.height, '#f7258544');
          band(r.right - rt, r.y, rt, r.height, '#f7258544');
          const children = [...el.children].filter(
            (e) => e.getBoundingClientRect().height > 0,
          );
          for (let i = 1; i < children.length; i++) {
            const before = children[i - 1]?.getBoundingClientRect(),
              after = children[i]?.getBoundingClientRect();
            if (before && after && after.top > before.bottom)
              band(
                r.x,
                before.bottom,
                r.width,
                after.top - before.bottom,
                '#2c9cdb66',
              );
          }
        }
      });
      await p.locator('#notes-sidebar').screenshot({
        path: `.local-app/screenshots/s1-sidebar-${width}-${scheme}-padding.png`,
        animations: 'disabled',
      });
      process.stdout.write(
        `${width} ${scheme}: ${JSON.stringify(measured.errors)}\n`,
      );
      await c.unrouteAll({ behavior: 'ignoreErrors' });
      await c.close();
    }
  writeFileSync(
    '.local-app/sidebar-symmetry-results.json',
    JSON.stringify({ results, errors, writes }, null, 2),
  );
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
