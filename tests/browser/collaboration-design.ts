import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import {
  fineTextRoles,
  touchTextRoles,
} from '../../packages/ui/src/typography.ts';
import { hasChromium, routeAuditAssets, type Page } from './browser.ts';
import {
  clearCollaborationFixtures,
  collaborationFixture,
} from './collaboration-fixture.ts';
import { auditSettings } from './settings-measurements.ts';
import {
  auditContentParity,
  auditHoverPadding,
  captureSurface,
} from './symmetry.ts';
import { auditText } from './text-audit.ts';

type Spacing = typeof import('./spacing-audit.ts').auditSpacing;
type Audit =
  'spacing-audit' | 'settings-symmetry' | 'touch-typography' | 'content-parity';

export async function runCollaborationAudit(
  spacing?: Spacing,
  audits: readonly Audit[] = [
    'spacing-audit',
    'settings-symmetry',
    'touch-typography',
    'content-parity',
  ],
): Promise<void> {
  const output =
    process.env.COLLABORATION_AUDIT_OUTPUT ?? '.local-app/collaboration-design';
  const variants = (process.env.TOUCH_WIDTHS ?? '1440,390,320')
    .split(',')
    .map(Number);
  const themes = process.env.TOUCH_SCHEMES?.split(',') ?? ['light', 'dark'];
  const origin = process.env.UI_AUDIT_ORIGIN ?? 'http://localhost:3000';
  const loaded: unknown = await import(
    pathToFileURL(
      process.env.PLAYWRIGHT_MODULE ??
        '.local-app/node_modules/playwright-core/index.mjs',
    ).href
  );
  assert.ok(hasChromium(loaded));
  mkdirSync(output, { recursive: true });
  const browser = await loaded.chromium.launch();
  const results = new Map(
    audits.map((audit) => [audit, new Array<Record<string, unknown>>()]),
  );
  const defects: string[] = [];
  const runId = randomUUID().slice(0, 4);
  const cleanup: (() => Promise<void>)[] = [];
  try {
    for (const width of variants)
      for (const theme of themes) {
        assert.ok(theme === 'light' || theme === 'dark');
        const colorScheme = theme;
        const phone = width < 1024;
        const suffix = ` ${width} ${theme} ${runId}`;
        const fixture = await collaborationFixture(origin, cleanup, suffix);
        const home = `${origin}/w/${fixture.workspaceId}`;
        const note = `${home}/notes/${fixture.fileId}`;
        async function newContext() {
          const context = await browser.newContext({
            viewport: { width, height: phone ? 844 : 900 },
            hasTouch: phone,
            isMobile: phone,
            colorScheme,
            reducedMotion: 'reduce',
            serviceWorkers: 'block',
          });
          await routeAuditAssets(context);
          return context;
        }
        async function signIn(page: Page, email: string) {
          page.setDefaultTimeout(18_000);
          page.on('pageerror', (error) =>
            process.stderr.write(error.message + '\n'),
          );
          await page.goto(`${origin}/login`);
          await page.getByLabel('Email address').fill(email);
          await page
            .getByLabel('Password', { exact: true })
            .fill(fixture.password);
          await page
            .getByRole('button', { name: 'Sign in', exact: true })
            .click();
          await page.getByRole('button', { name: /Account/ }).waitFor();
        }
        async function check(page: Page, surface: string) {
          const name = `${surface}-${width}-${theme}`;
          await pause(100);
          await captureSurface(page, name, output);
          for (const audit of audits) {
            let report: Record<string, unknown>;
            let issues: readonly unknown[];
            switch (audit) {
              case 'spacing-audit': {
                assert.ok(spacing);
                const measured = await spacing(page);
                const hover =
                  process.env.HOVER_AUDIT === '1'
                    ? await auditHoverPadding(page)
                    : [];
                report = { ...measured, hover };
                issues = [...measured.issues, ...hover];
                break;
              }
              case 'settings-symmetry': {
                const measured = await auditSettings(page);
                report = measured;
                issues = measured.errors;
                break;
              }
              case 'touch-typography': {
                const measured = await auditText(
                  page,
                  phone ? touchTextRoles : fineTextRoles,
                );
                report = measured;
                issues = measured.problems;
                break;
              }
              case 'content-parity': {
                const measured = await auditContentParity(page);
                report = measured;
                issues = measured.issues;
                break;
              }
            }
            results.get(audit)?.push({ surface, width, theme, ...report });
            defects.push(
              ...issues.map(
                (issue) => `${audit} ${name}: ${JSON.stringify(issue)}`,
              ),
            );
          }
          process.stdout.write(`${name}\n`);
        }

        const guestContext = await newContext();
        const guest = await guestContext.newPage();
        guest.setDefaultTimeout(18_000);
        guest.on('pageerror', (error) =>
          process.stderr.write(error.message + '\n'),
        );
        guest.on('console', (event) => {
          if (event.type() === 'error')
            process.stderr.write(event.text() + '\n');
        });
        let failInviteRead = false;
        await guestContext.route(
          '**/api/registrations/workspace-invitation',
          (route) =>
            failInviteRead
              ? route.fulfill({
                  status: 503,
                  json: { title: 'The invitation could not load.' },
                })
              : route.continue(),
        );
        await guest.goto(fixture.pendingLink);
        await guest
          .getByRole('button', { name: 'Create account and join' })
          .waitFor();
        await check(guest, 'join-sign-up');
        await guest.goto(`${origin}/join#${'a'.repeat(43)}`);
        await guest
          .getByText('This invite no longer works', { exact: true })
          .waitFor();
        await check(guest, 'join-invalid');
        failInviteRead = true;
        await guest.goto(fixture.pendingLink);
        await guest
          .getByRole('heading', { name: 'Workspace invitation' })
          .waitFor();
        await guest.getByRole('alert').waitFor();
        await check(guest, 'join-error');
        await guestContext.close();

        const ownerContext = await newContext();
        const owner = await ownerContext.newPage();
        await signIn(owner, fixture.owner);
        await owner.goto(fixture.pendingLink);
        await owner
          .getByText('This invite is for another email', { exact: true })
          .waitFor();
        await check(owner, 'join-wrong-account');

        if (phone) {
          for (const [path, heading] of [
            ['accounts', 'Users'],
            ['daily-notes', 'Daily notes'],
          ] as const) {
            await owner.goto(`${home}?settings=${path}`);
            await owner
              .locator('.ui-settings-column .ui-settings-header-title')
              .filter({ hasText: heading })
              .waitFor();
            await check(owner, `settings-${path}`);
          }
        }

        let emptyInvites = false;
        await ownerContext.route(
          `**/api/workspaces/${fixture.workspaceId}/invitations`,
          (route) =>
            emptyInvites && route.request().method() === 'GET'
              ? route.fulfill({ json: { invitations: [] } })
              : route.continue(),
        );
        const settings = `${home}?settings=members`;
        const members = async () => {
          await owner.goto(settings);
          await owner.getByText(fixture.editor, { exact: true }).waitFor();
        };
        await members();
        await owner.getByText(fixture.pendingEmail, { exact: true }).waitFor();
        await check(owner, 'members');
        emptyInvites = true;
        await members();
        await owner.getByText('No pending invites.', { exact: true }).waitFor();
        await check(owner, 'members-empty-invites');
        emptyInvites = false;
        const invite = owner.getByRole('button', {
          name: 'Invite people',
          exact: true,
        });
        await invite.click();
        const emailField = owner.getByLabel('Email addresses');
        await emailField.waitFor();
        if (phone)
          await owner
            .getByRole('button', { name: 'Back to section' })
            .waitFor();
        await check(owner, 'invite-people');
        await emailField.fill('valid@example.com, bad@');
        await owner
          .getByRole('button', { name: 'Send invite', exact: true })
          .click();
        await owner.getByText('“bad@” is not a valid email address.').waitFor();
        await check(owner, 'invite-errors');
        await emailField.fill(`${fixture.pendingEmail}, result@example.test`);
        await owner
          .getByRole('button', { name: 'Send 2 invites', exact: true })
          .click();
        await owner.getByText('1 invite created', { exact: true }).waitFor();
        if (phone)
          await owner
            .getByRole('button', { name: 'Back to section' })
            .waitFor();
        await check(owner, 'invite-results');
        await owner.getByRole('button', { name: 'Done', exact: true }).click();
        const role = owner.getByRole('button', {
          name: 'Role for Casey Editor',
        });
        await role.click();
        if (phone)
          await owner
            .getByRole('button', { name: 'Back to section' })
            .waitFor();
        await owner
          .getByText('Viewers can read notes and their history.', {
            exact: true,
          })
          .waitFor();
        await check(owner, 'role-picker');
        await owner.getByText('Remove from workspace', { exact: true }).click();
        await owner
          .getByRole('dialog', { name: 'Remove from workspace' })
          .waitFor();
        await check(owner, 'remove-confirmation');

        async function switcher(page: Page) {
          if (phone)
            await page
              .getByRole('button', { name: 'Open navigation', exact: true })
              .click();
          await page.getByRole('button', { name: /Workspace: / }).click();
        }
        await owner.goto(home);
        await switcher(owner);
        await owner.getByText('Rename workspace', { exact: true }).click();
        await owner.getByRole('dialog', { name: 'Rename workspace' }).waitFor();
        await check(owner, 'rename-confirmation');
        await owner.goto(home);
        await switcher(owner);
        await owner.getByText('Delete permanently', { exact: true }).click();
        await owner
          .getByRole('dialog', { name: 'Delete workspace permanently' })
          .waitFor();
        await check(owner, 'delete-confirmation');
        await owner.goto(note);
        await owner.locator('.cm-content').waitFor();
        if (!phone)
          await owner.locator('[data-note-word-count]:visible').waitFor();
        await check(owner, 'note-panel');
        await owner
          .getByRole('button', { name: 'Note actions', exact: true })
          .click();
        if (phone)
          await owner
            .locator('[role=menu] [data-note-word-count]:visible')
            .waitFor();
        if (width === 320) await owner.setViewportSize({ width, height: 700 });
        await check(owner, 'note-actions-count');
        if (phone) {
          assert.deepEqual(
            await owner.locator('[data-menu-fit-viewport]').evaluate((menu) => {
              const list = menu.querySelector('[data-menu-scroll]');
              if (list === null)
                throw new Error('The menu has no scroll region.');
              const clip = list.getBoundingClientRect();
              return ['Attach an image', 'Export as Markdown'].map((label) =>
                [...list.querySelectorAll('[data-menu-label]')].some(
                  (row) =>
                    row.textContent === label &&
                    row.getBoundingClientRect().bottom <= clip.bottom + 1,
                ),
              );
            }),
            [true, true],
          );
          await owner.setViewportSize({ width, height: 290 });
          await owner
            .locator('[data-menu-fit-viewport] [data-edge-top]')
            .waitFor({ state: 'attached' });
          await check(owner, 'note-actions-overflow');
          await owner.locator('[data-menu-scroll]').evaluate((scroll) => {
            scroll.scrollTop = scroll.scrollHeight;
          });
          await owner
            .locator('[data-menu-fit-viewport] [data-scroll-hidden="false"]')
            .waitFor({ state: 'attached' });
          await check(owner, 'note-actions-end');
          await owner.setViewportSize({ width, height: 844 });
        }
        await owner
          .getByRole('menuitem', { name: 'Version history', exact: true })
          .click();
        await owner.getByText('Current version', { exact: true }).waitFor();
        await check(owner, 'history-contributors');
        await owner.goto(note);

        const viewerContext = await newContext();
        const viewer = await viewerContext.newPage();
        await signIn(viewer, fixture.viewer);
        await viewer.goto(fixture.viewerLink);
        await viewer.getByRole('button', { name: 'Accept and open' }).waitFor();
        await check(viewer, 'join-valid');
        await viewer.getByRole('button', { name: 'Accept and open' }).click();
        const joinToast = viewer
          .getByRole('status')
          .filter({ hasText: `You joined ${fixture.viewerJoinName}` });
        await joinToast.waitFor();
        assert.equal(
          await joinToast
            .getByRole('button', { name: 'Open', exact: true })
            .count(),
          0,
        );
        await check(viewer, 'joined-toast');
        await viewer.goto(home);
        await switcher(viewer);
        const accept = viewer.getByText(
          `Accept invite to ${fixture.viewerSwitcherName}`,
          { exact: true },
        );
        await accept.waitFor();
        await accept.scrollIntoViewIfNeeded();
        await check(viewer, 'switcher-invites');
        await accept.click();
        const openToast = viewer
          .getByRole('status')
          .filter({ hasText: `You joined ${fixture.viewerSwitcherName}` });
        await openToast
          .getByRole('button', { name: 'Open', exact: true })
          .waitFor();
        await viewer.waitForURL(home);
        await check(viewer, 'switcher-joined-toast');
        await openToast
          .getByRole('button', { name: 'Open', exact: true })
          .click();
        await viewer.waitForURL(`${origin}/w/${fixture.viewerSwitcherId}`);
        await viewer.goto(home);
        await switcher(viewer);
        await viewer.getByText('Leave workspace', { exact: true }).click();
        await viewer.getByRole('dialog', { name: 'Leave workspace' }).waitFor();
        await check(viewer, 'leave-confirmation');
        await viewer.goto(note);
        await viewer
          .getByText('View only. You can read this note and its history.')
          .waitFor();
        await check(viewer, 'viewer-note');
        await owner
          .getByRole('button', { name: /People in this note: Sam Viewer/ })
          .click();
        await owner.getByText(/^Viewing(?: · Idle)?$/).waitFor();
        await check(owner, 'presence');

        const reconnectContext = await newContext();
        await reconnectContext.routeWebSocket('**/api/sync/notices', (socket) =>
          socket.close(),
        );
        const reconnect = await reconnectContext.newPage();
        await signIn(reconnect, fixture.editor);
        await reconnect.goto(note);
        await reconnect.locator('.cm-content').waitFor();
        if (phone)
          await reconnect
            .getByRole('button', { name: 'Open navigation', exact: true })
            .click();
        await reconnect
          .getByText('Reconnecting. Your edits are safe on this device.', {
            exact: true,
          })
          .waitFor();
        await check(reconnect, 'sidebar-reconnecting');
        await reconnectContext.close();

        const editorContext = await newContext();
        const editor = await editorContext.newPage();
        await signIn(editor, fixture.editor);
        await editor.goto(note);
        const text = editor.locator('.cm-content');
        await text.waitFor();
        await editor.locator('[data-live-connection=Live]').waitFor();
        await owner.goto(note);
        for (const [page, surface] of [
          [viewer, 'viewer-note-with-presence'],
          [editor, 'editor-note-with-presence'],
        ] as const) {
          await page
            .getByRole('button', { name: /People in this note: .+, .+/ })
            .waitFor();
          await check(page, surface);
        }
        await editorContext.setOffline(true);
        if (phone)
          await editor
            .getByRole('button', { name: 'Open navigation', exact: true })
            .click();
        await editor
          .getByText('Offline. Your edits merge when you reconnect.', {
            exact: true,
          })
          .waitFor();
        await check(editor, 'sidebar-offline');
        if (phone)
          await editor
            .getByRole('button', { name: 'Close navigation', exact: true })
            .click();
        await text.focus();
        await text.press('Control+End');
        await editor.keyboard.type('\nKeep this offline draft');
        await text.press('Control+s');
        await members();
        await role.click();
        await owner
          .getByRole(phone ? 'button' : 'menuitemradio', {
            name: 'Viewer',
            exact: true,
          })
          .click();
        await role.getByText('Viewer', { exact: true }).waitFor();
        await editorContext.setOffline(false);
        await editor
          .getByText('Your role changed to Viewer. Editing is off.', {
            exact: true,
          })
          .waitFor();
        await editor.getByText(/Your unsent text is in Personal/).waitFor();
        await check(editor, 'downgrade-and-recovery-toasts');
        await editor
          .getByRole('button', { name: 'Dismiss', exact: true })
          .click();
        async function removeMember(name: string) {
          await owner.getByRole('button', { name: `Role for ${name}` }).click();
          await owner
            .getByText('Remove from workspace', { exact: true })
            .click();
          await owner
            .getByRole('dialog', { name: 'Remove from workspace' })
            .getByRole('button', { name: 'Remove', exact: true })
            .click();
        }
        await removeMember('Sam Viewer');
        await viewer
          .getByText(`You no longer have access to ${fixture.workspaceName}.`, {
            exact: true,
          })
          .waitFor();
        await check(viewer, 'removal-toast');
        await viewerContext.close();

        await role.click();
        await owner
          .getByRole(phone ? 'button' : 'menuitemradio', {
            name: 'Editor',
            exact: true,
          })
          .click();
        await role.getByText('Editor', { exact: true }).waitFor();
        await editor.goto(note);
        await editor.locator('[data-live-connection=Live]').waitFor();
        await editorContext.setOffline(true);
        await text.focus();
        await text.press('Control+End');
        await editor.keyboard.type('\nKeep this text after removal');
        await text.press('Control+s');
        await removeMember('Casey Editor');
        await editorContext.setOffline(false);
        await editor
          .getByText(
            `You no longer have access to ${fixture.workspaceName}. Your unsent text`,
            { exact: false },
          )
          .waitFor();
        await check(editor, 'removal-recovery-toast');
        await editorContext.close();
        await ownerContext.close();
      }
  } catch (error) {
    for (const context of browser.contexts())
      for (const page of context.pages())
        process.stderr.write(
          JSON.stringify(
            await page
              .evaluate(() => ({
                address: location.pathname,
                words: document.body.innerText.slice(0, 1300),
                connection: document
                  .querySelector('[data-live-connection]')
                  ?.getAttribute('data-live-connection'),
              }))
              .catch(() => null),
          ) + '\n',
        );
    throw error;
  } finally {
    try {
      for (const [audit, samples] of results)
        writeFileSync(
          `${output}/${audit}.json`,
          JSON.stringify(
            {
              samples,
              defects: defects.filter((issue) => issue.startsWith(`${audit} `)),
            },
            null,
            2,
          ),
        );
    } finally {
      try {
        await browser.close();
      } finally {
        await clearCollaborationFixtures(cleanup);
      }
    }
  }
  assert.deepEqual(defects, []);
}
