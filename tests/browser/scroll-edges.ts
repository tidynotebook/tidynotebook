/** Scroll edge states and theme shadows on fixed sidebar and Settings regions. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { hasChromium, isRecord, type Page } from './browser.ts';
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
const b = await loaded.chromium.launch(),
  results: unknown[] = [],
  writes: string[] = [];
async function paddingOverlay(p: Page) {
  await p.evaluate(() => {
    const overlay = document.createElement('div');
    overlay.id = 'padding-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:99999';
    document.body.append(overlay);
    const band = (x: number, y: number, w: number, h: number, c: string) => {
      const e = document.createElement('div');
      e.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px;background:${c}`;
      overlay.append(e);
    };
    for (const el of document.querySelectorAll(
      '#notes-sidebar .ui-sidebar-top,#notes-sidebar .ui-sidebar-tree,#notes-sidebar .ui-sidebar-row,#notes-sidebar .ui-sidebar-status,#notes-sidebar .ui-sidebar-actions,#notes-sidebar .ui-sidebar-tree-items,#notes-sidebar .ui-sidebar-rail',
    )) {
      if (!el.checkVisibility()) continue;
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
      const children = [...el.children].filter((e) => e.checkVisibility());
      if (s.display === 'flex')
        for (let i = 1; i < children.length; i++) {
          const a = children[i - 1]?.getBoundingClientRect(),
            next = children[i]?.getBoundingClientRect();
          if (a && next && s.flexDirection === 'column' && next.top > a.bottom)
            band(
              r.x + l,
              a.bottom,
              r.width - l - rt,
              next.top - a.bottom,
              '#00b4d866',
            );
          if (a && next && s.flexDirection === 'row' && next.left > a.right)
            band(
              a.right,
              r.y + t,
              next.left - a.right,
              r.height - t - b,
              '#00b4d866',
            );
        }
    }
  });
}
try {
  for (const width of [1440, 390])
    for (const scheme of ['light', 'dark'] as const) {
      const phone = width < 1024,
        c = await b.newContext({
          storageState: '.local-app/review-session.json',
          viewport: { width, height: 420 },
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
        .locator('[role="treeitem"][aria-expanded="true"]')
        .first()
        .waitFor();
      for (const surface of ['sidebar', 'settings']) {
        if (surface === 'settings') {
          await p.goto(`${base}/w/${fixture.workspaceId}?settings=devices`);
          await p
            .getByRole('heading', { name: 'Other devices', exact: true })
            .waitFor();
        }
        for (const position of ['top', 'middle', 'end']) {
          const measured = await p.evaluate(
            ({ surface, position }) => {
              const root = document.querySelector<HTMLElement>(
                surface === 'sidebar'
                  ? '.ui-sidebar-tree'
                  : '.ui-settings-content > .ui-scroll-region',
              );
              if (!root) throw Error('Scroller missing');
              const max = root.scrollHeight - root.clientHeight;
              if (max < 5)
                throw Error(
                  `${surface} does not overflow: ${JSON.stringify({ height: root.clientHeight, scroll: root.scrollHeight, viewport: innerHeight, css: root.className, parent: root.parentElement?.getBoundingClientRect(), items: root.textContent?.slice(0, 400) })}`,
                );
              root.scrollTop =
                position === 'top' ? 0 : position === 'middle' ? max / 2 : max;
              return { max, height: root.clientHeight };
            },
            { surface, position },
          );
          await pause(250);
          const state = await p.evaluate((surface) => {
            const root = document.querySelector<HTMLElement>(
              surface === 'sidebar'
                ? '.ui-sidebar-tree'
                : '.ui-settings-content > .ui-scroll-region',
            );
            const top = document.querySelector(
                surface === 'sidebar'
                  ? '.ui-sidebar-top'
                  : '.ui-settings-column > .ui-settings-heading',
              ),
              bottom = document.querySelector('.ui-sidebar-footer');
            const probe = document.createElement('span');
            probe.className = 'border-edge-subtle';
            document.body.append(probe);
            const lineColor = getComputedStyle(probe).borderTopColor;
            probe.remove();
            const edge = (element: Element | null) => {
              if (!element) return null;
              const style = getComputedStyle(element, '::before');
              return {
                opacity: style.opacity,
                width: style.borderTopWidth,
                style: style.borderTopStyle,
                color: style.borderTopColor,
                shadow: style.boxShadow,
              };
            };
            return {
              lineColor,
              start: root?.dataset.scrollStartHidden,
              end: root?.dataset.scrollEndHidden,
              top: top?.getAttribute('data-scroll-hidden'),
              topEdge: edge(top),
              bottom:
                surface === 'sidebar'
                  ? bottom?.getAttribute('data-scroll-hidden')
                  : undefined,
              bottomEdge: surface === 'sidebar' ? edge(bottom) : null,
            };
          }, surface);
          assert.equal(state.start, String(position !== 'top'));
          assert.equal(state.end, String(position !== 'end'));
          assert.equal(state.top, String(position !== 'top'));
          const checkEdge = (edge: typeof state.topEdge, hidden: boolean) => {
            assert.ok(edge, 'The fixed region must have an edge');
            assert.equal(edge.opacity, '1', 'The hairline stays visible');
            assert.equal(edge.width, '1px');
            assert.equal(edge.style, 'solid');
            assert.equal(edge.color, state.lineColor);
            assert.notEqual(edge.color, 'rgba(0, 0, 0, 0)');
            assert.equal(
              edge.shadow !== 'none',
              hidden,
              'Only hidden content casts a scroll shadow',
            );
          };
          checkEdge(state.topEdge, position !== 'top');
          if (surface === 'sidebar') {
            assert.equal(state.bottom, String(position !== 'end'));
            checkEdge(state.bottomEdge, position !== 'end');
            if (position !== 'end') {
              await p.locator('#notes-sidebar').screenshot({
                path: `${out}/sidebar-${position}-${width}-${scheme}.png`,
                animations: 'disabled',
              });
              await paddingOverlay(p);
              await p.locator('#notes-sidebar').screenshot({
                path: `${out}/sidebar-${position}-${width}-${scheme}-overlay.png`,
                animations: 'disabled',
              });
              await p.evaluate(() =>
                document.getElementById('padding-overlay')?.remove(),
              );
            }
          }
          results.push({
            width,
            scheme,
            surface,
            position,
            ...measured,
            ...state,
          });
          process.stdout.write(
            `${width} ${scheme} ${surface} ${position}: PASS\n`,
          );
        }
      }
      await c.unrouteAll({ behavior: 'ignoreErrors' });
      await c.close();
    }
} finally {
  await b.close();
  writeFileSync(
    out + '/scroll-edges.json',
    JSON.stringify({ results, writes }, null, 2),
  );
}
assert.deepEqual(writes, []);
process.stdout.write(
  `PASS ${results.length} scroll edge states; no review writes\n`,
);
