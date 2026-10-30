/** Check the four DS1.1 regressions on the affected surfaces only. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { hasChromium, isRecord, routeAuditAssets } from './browser.ts';
import {
  auditContentParity,
  auditComposition,
  auditHoverPadding,
  captureSurface,
} from './symmetry.ts';
const module: unknown = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '.local-app/node_modules/playwright-core/index.mjs',
  ).href
);
assert.ok(hasChromium(module));
const fixture: unknown = JSON.parse(
  readFileSync('.local-app/review-fixture.json', 'utf8'),
);
assert.ok(
  isRecord(fixture) &&
    typeof fixture.workspaceId === 'string' &&
    Array.isArray(fixture.files),
);
const note: unknown = fixture.files[0];
assert.ok(isRecord(note) && typeof note.fileId === 'string');
const base = process.env.UI_AUDIT_ORIGIN ?? 'http://10.20.30.98:3517',
  home = base + '/w/' + fixture.workspaceId,
  out = process.env.CONTENT_CAPTURE ?? '/tmp/review517/ds11/after';
mkdirSync(out, { recursive: true });
const browser = await module.chromium.launch(),
  results: unknown[] = [],
  issues: string[] = [];
try {
  for (const width of [1440, 390, 320])
    for (const scheme of ['light', 'dark'] as const) {
      const phone = width < 1024,
        c = await browser.newContext({
          storageState: '.local-app/review-session.json',
          reducedMotion: 'reduce',
          viewport: { width, height: phone ? 844 : 900 },
          hasTouch: phone,
          isMobile: phone,
          colorScheme: scheme,
        });
      await routeAuditAssets(c);
      await c.addInitScript(
        (s) => localStorage.setItem('notesapp.theme', s),
        scheme,
      );
      const p = await c.newPage();
      p.setDefaultTimeout(15000);
      const now = new Date().toISOString();
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
      const check = async (name: string) => {
        await pause(120);
        const result = await auditContentParity(p);
        if (name === 'trash' || name === 'trash-menu') {
          assert.deepEqual((await auditComposition(p)).issues, []);
          assert.deepEqual(await auditHoverPadding(p), []);
        }
        results.push({ width, scheme, name, ...result });
        issues.push(
          ...result.issues.map(
            (x) => `${width} ${scheme} ${name}: ${JSON.stringify(x)}`,
          ),
        );
        await captureSurface(p, `${name}-${width}-${scheme}`, out);
        process.stdout.write(
          `${width} ${scheme} ${name}: ${result.issues.length} issues\n`,
        );
      };
      await p.goto(home);
      await p
        .getByRole('heading', { name: 'All notes', exact: true })
        .waitFor();
      await p
        .getByRole('link', {
          name: 'Launch plan, in Projects/Website',
          exact: true,
        })
        .waitFor();
      await check('page');
      if (phone) {
        await p
          .getByRole('button', { name: 'Open navigation', exact: true })
          .click();
        await p.locator('#notes-sidebar[data-drawer-ready]').waitFor();
      }
      await check('rail');
      await p.getByRole('button', { name: 'Calendar', exact: true }).click();
      await check('rail-calendar');
      await p.getByRole('button', { name: 'Notes', exact: true }).click();
      await p.getByRole('treeitem', { name: 'Personal', exact: true }).click();
      await check('folder');
      if (phone)
        await p
          .getByRole('button', { name: 'Close navigation', exact: true })
          .click();
      await p.goto(home + '/notes/' + note.fileId);
      await p.locator('.cm-content').waitFor();
      await p.getByText('23 words', { exact: true }).waitFor();
      await check('note');
      await p
        .getByRole('button', { name: 'Note actions', exact: true })
        .click();
      await p
        .getByRole('menuitem', { name: 'Version history', exact: true })
        .click();
      await p
        .getByRole('heading', { name: 'Version history', exact: true })
        .waitFor();
      await p.getByText('Current version', { exact: true }).waitFor();
      await check('history');
      await p.goto(home + '?settings=account');
      await p
        .getByRole('heading', { name: 'Profile', exact: true, level: 2 })
        .waitFor();
      await check('navigation');
      await p.keyboard.press('Escape');
      for (const [path, name] of [
        ['trash', 'trash'],
        ['published', 'published'],
      ] as const) {
        await p.goto(home + '/' + path);
        await p
          .getByRole('heading', {
            name: path === 'trash' ? 'Trash' : 'Published links',
            exact: true,
          })
          .waitFor();
        await pause(100);
        await check(name);
        if (path === 'trash') {
          await p
            .getByRole('button', {
              name: 'Actions for Personal/Reading/Reading list',
              exact: true,
            })
            .click();
          await p
            .getByRole('menuitem', { name: 'Delete for good', exact: true })
            .waitFor();
          await check('trash-menu');
          await p.keyboard.press('Escape');
        }
      }
      await p.goto(home);
      await p.getByRole('button', { name: 'Search', exact: true }).click();
      await p.locator('#command-palette-list').waitFor();
      await check('search');
      await c.unrouteAll({ behavior: 'ignoreErrors' });
      await c.close();
    }
} finally {
  await browser.close();
  writeFileSync(
    out + '/results.json',
    JSON.stringify({ results, issues }, null, 2),
  );
}
if (process.env.CONTENT_EXPECT_FAILURES === '1') {
  for (const kind of [
    'selected navigation surface',
    'outline content edge',
    'note footer content edge',
    'page row content edge',
  ])
    assert.ok(
      issues.some((x) => x.includes(kind)),
      `The audit must detect ${kind}`,
    );
} else assert.deepEqual(issues, []);
process.stdout.write(`${results.length} content parity cases checked\n`);
