import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import {
  fineTextRoles,
  touchTextRoles,
} from '../../packages/ui/src/typography.ts';
import {
  hasChromium,
  routeAuditAssets,
  type Locator,
  type Page,
} from './browser.ts';
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
          await context.addInitScript(() => {
            Object.defineProperty(navigator, 'clipboard', {
              value: {
                async writeText(value: string) {
                  if (
                    document.documentElement.hasAttribute(
                      'data-block-clipboard',
                    )
                  )
                    throw new Error('Clipboard refused the write.');
                  document.documentElement.dataset.testCopiedText = value;
                },
              },
            });
          }, undefined);
          return context;
        }
        async function assertToastAbove(toast: Locator) {
          await toast.waitFor();
          assert.ok(
            await toast.evaluate((element) => {
              const { left, top, width, height } =
                element.getBoundingClientRect();
              return element.contains(
                document.elementFromPoint(left + width / 2, top + height / 2),
              );
            }),
            'The toast is visible above the current overlay.',
          );
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
          const storageAdvisory = page.getByRole('status').filter({
            hasText:
              'This browser can remove offline data when the device needs space.',
          });
          if (await storageAdvisory.isVisible())
            await storageAdvisory
              .getByRole('button', { name: 'Close', exact: true })
              .click();
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

        const adminContext = await newContext();
        const admin = await adminContext.newPage();
        await signIn(admin, 'owner@example.com');
        const accountHome = await admin.evaluate(() => location.pathname);
        await admin.goto(`${origin}${accountHome}?settings=accounts`);
        await admin
          .locator('.ui-settings-column .ui-settings-header-title')
          .filter({ hasText: 'Users' })
          .waitFor();
        if (phone) {
          await check(admin, 'settings-accounts');
          await admin
            .getByRole('button', { name: 'Account: Casey Editor', exact: true })
            .filter({ hasText: fixture.editor })
            .click();
          await admin
            .getByRole('button', { name: /Limits and access/ })
            .click();
        } else {
          await admin
            .locator('[data-ui-row]')
            .filter({ hasText: fixture.editor })
            .getByRole('button', { name: 'Change the account of Casey Editor' })
            .click();
          await admin
            .getByRole('menuitem', { name: 'Change limits and access' })
            .click();
        }
        await admin
          .getByLabel('Member limit', { exact: true })
          .scrollIntoViewIfNeeded();
        await admin
          .getByText(
            'The number of people, not the owner, in the workspaces of this account. Empty means no limit.',
            { exact: true },
          )
          .waitFor();
        if (!phone)
          assert.equal(
            await admin
              .getByRole('heading', { name: 'Change limits and access' })
              .getAttribute('data-scroll-edge'),
            null,
          );
        await check(admin, 'account-member-limit');
        await adminContext.close();
        if (phone) {
          await owner.goto(`${home}?settings=daily-notes`);
          await owner
            .locator('.ui-settings-column .ui-settings-header-title')
            .filter({ hasText: 'Daily notes' })
            .waitFor();
          await check(owner, 'settings-daily-notes');
        }

        let emptyInvites = false;
        let beforeInviteWrite: (() => Promise<void>) | null = null;
        await ownerContext.route(
          `**/api/workspaces/${fixture.workspaceId}/invitations`,
          async (route) => {
            const method = route.request().method();
            if (method === 'GET' && emptyInvites)
              return route.fulfill({ json: { invitations: [] } });
            if (method === 'POST') await beforeInviteWrite?.();
            return route.continue();
          },
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
        const resultCopyRow = owner
          .locator('[data-ui-row]')
          .filter({ hasText: 'result@example.test' });
        const resultCopy = resultCopyRow.getByRole('button', {
          name: 'Copy link',
          exact: true,
        });
        const copyWidth = (await resultCopy.boundingBox())?.width;
        assert.ok(copyWidth);
        await resultCopy.click();
        const resultCopied = resultCopyRow.getByRole('button', {
          name: 'Copied!',
          exact: true,
        });
        await resultCopied.waitFor();
        assert.equal((await resultCopied.boundingBox())?.width, copyWidth);
        const copiedMessage = 'Invitation link copied.';
        assert.equal(
          await resultCopyRow
            .getByRole('status')
            .filter({ hasText: copiedMessage })
            .count(),
          1,
        );
        assert.equal(
          await owner
            .locator('[data-toast-message]')
            .filter({ hasText: copiedMessage })
            .count(),
          0,
        );
        await check(owner, 'invite-results-copied');
        await resultCopy.waitFor();
        const copiedURL = await owner.evaluate(
          () => document.documentElement.dataset.testCopiedText,
        );
        assert.ok(copiedURL && new URL(copiedURL).hash.length > 1);
        await owner.evaluate(() =>
          document.documentElement.setAttribute('data-block-clipboard', ''),
        );
        await resultCopy.click();
        const copyError = owner.getByRole('alert').filter({
          hasText: 'Could not copy the link. Select and copy it yourself.',
        });
        await copyError.waitFor();
        assert.ok(
          await owner
            .getByLabel('Invitation link', { exact: true })
            .evaluate(
              (field) =>
                field instanceof HTMLInputElement &&
                field.readOnly &&
                field.value.length > 0 &&
                field.selectionStart === 0 &&
                field.selectionEnd === field.value.length,
            ),
        );
        await check(owner, 'invite-results-copy-error');
        await owner.evaluate(() =>
          document.documentElement.removeAttribute('data-block-clipboard'),
        );
        await owner.getByRole('button', { name: 'Done', exact: true }).click();
        const pendingCopyRow = owner
          .locator('[data-member-row]')
          .filter({ hasText: fixture.pendingEmail });
        if (phone) {
          await pendingCopyRow
            .getByRole('button', {
              name: `Actions for ${fixture.pendingEmail}`,
            })
            .click();
          const menu = owner.getByRole('menu');
          await menu
            .getByRole('menuitem', { name: 'Copy link', exact: true })
            .click();
          await menu.waitFor({ state: 'hidden' });
          await owner.getByRole('dialog').waitFor();
          const toast = owner
            .getByRole('status')
            .filter({ hasText: copiedMessage });
          await assertToastAbove(toast);
          await check(owner, 'members-copy-toast');
          await toast.waitFor({ state: 'hidden' });
        } else {
          await pendingCopyRow
            .getByRole('button', { name: 'Copy link', exact: true })
            .click();
          await pendingCopyRow
            .getByRole('button', { name: 'Copied!', exact: true })
            .waitFor();
          await check(owner, 'members-copied');
        }
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
        const acceptLink = viewer.getByRole('button', {
          name: 'Accept and open',
        });
        await acceptLink.waitFor();
        await members();
        await fixture.setMemberLimit(6);
        await owner.getByText('6 of 7 seats used', { exact: true }).waitFor();
        const openInvites = owner.getByText('3 open invites', { exact: true });
        await openInvites.waitFor();
        assert.equal(
          await openInvites.evaluate((element) => {
            const range = document.createRange();
            range.selectNodeContents(element);
            return (
              range.getBoundingClientRect().height <=
              parseFloat(getComputedStyle(element).lineHeight)
            );
          }),
          true,
          'The open invite count fits on one line.',
        );
        await owner.getByRole('meter', { name: 'Seats' }).waitFor();
        if (fixture.hasPortal)
          await owner.getByRole('link', { name: 'Manage seats' }).waitFor();
        await check(owner, 'members-seat-usage');
        await invite.click();
        await owner
          .getByLabel('Email addresses')
          .fill('seat-one@example.test, seat-two@example.test');
        await owner
          .getByText('You have 1 free seat. Remove 1 address, or add seats.')
          .waitFor();
        assert.ok(
          await owner
            .getByRole('button', { name: 'Send 2 invites' })
            .isDisabled(),
        );
        await check(owner, 'invite-seat-limit');
        await fixture.assertSeatBatchRefused();
        await owner
          .getByRole('button', {
            name: phone ? 'Back to section' : 'Cancel',
            exact: true,
          })
          .click();
        await viewer
          .getByText(
            'Owner invited you as Viewer. Your seat in this workspace is part of the plan of Owner.',
            { exact: true },
          )
          .waitFor();
        await check(viewer, 'join-seat-notice');
        await role.click();
        await owner.getByText('Remove from workspace', { exact: true }).click();
        await owner
          .getByText("Casey Editor's seat becomes free.", { exact: true })
          .waitFor();
        await check(owner, 'remove-seat-notice');
        await owner
          .getByRole('dialog', { name: 'Remove from workspace' })
          .getByRole('button', {
            name: phone ? 'Close dialog' : 'Cancel',
            exact: true,
          })
          .click();
        await fixture.setMemberLimit(5);
        await owner
          .getByText('All 6 seats are in use. Add seats to invite more people.')
          .waitFor();
        assert.ok(await invite.isEnabled());
        async function checkNoticeAction(message: string, label: string) {
          const action = owner.getByRole('link', { name: label, exact: true });
          await action.waitFor();
          const notice = owner.getByRole('status').filter({ hasText: message });
          const position = await notice.evaluate((element) => {
            const message = element.querySelector('span.text-strong');
            const actionText = element.querySelector('a')?.firstChild;
            if (!message || !actionText)
              throw new Error('Notice action is missing.');
            const range = document.createRange();
            range.selectNode(actionText);
            const anchorText = range.getBoundingClientRect();
            const body = message.getBoundingClientRect();
            return {
              dx: anchorText.left - body.left,
              below: anchorText.top >= body.bottom,
            };
          });
          if (phone) {
            assert.ok(
              position.below,
              'The portal link is below the full notice.',
            );
            assert.ok(
              Math.abs(position.dx) <= 1,
              'The portal link starts at the notice text edge.',
            );
          } else assert.ok(!position.below && position.dx > 0);
        }
        if (fixture.hasPortal)
          await checkNoticeAction('All 6 seats are in use.', 'Manage seats');
        await check(owner, 'members-seats-full');
        await invite.click();
        const sendInvite = owner.getByRole('button', {
          name: 'Send invite',
          exact: true,
        });
        await emailField.fill('new-seat@example.test');
        const noSeats =
          'You have 0 free seats. Remove 1 address, or add seats.';
        await owner.getByText(noSeats, { exact: true }).waitFor();
        assert.ok(await sendInvite.isDisabled());
        await check(owner, 'invite-seats-full');
        await emailField.fill(fixture.pendingEmail);
        await sendInvite.click();
        await owner
          .getByText('Already invited. Copy the link to send it again.')
          .waitFor();
        await owner.getByRole('button', { name: 'Done', exact: true }).click();
        await fixture.setMemberLimit(null);
        await owner
          .getByText('All 6 seats are in use. Add seats to invite more people.')
          .waitFor({ state: 'hidden' });
        await invite.click();
        await emailField.fill('unquoted-seat@example.test');
        const membersUrl = `**/api/workspaces/${fixture.workspaceId}/members*`;
        const roster = Promise.withResolvers<void>();
        await ownerContext.route(membersUrl, async (route) => {
          await roster.promise;
          await route.continue();
        });
        beforeInviteWrite = () => fixture.setMemberLimit(5);
        try {
          await sendInvite.click();
          await owner.getByText(noSeats, { exact: true }).waitFor();
          assert.ok(await sendInvite.isDisabled());
          await check(owner, 'invite-limit-added');
        } finally {
          roster.resolve();
          beforeInviteWrite = null;
        }
        await owner
          .getByRole('button', {
            name: phone ? 'Back to section' : 'Cancel',
            exact: true,
          })
          .click();
        await fixture.setMemberLimit(null);
        const joinBlocked =
          'The owner of this workspace cannot add members now.';
        await fixture.setCollaboration(false);
        const offText = fixture.hasPortal
          ? 'Your plan does not include collaboration.'
          : 'Collaboration is turned off for this account.';
        const offNotice = owner
          .getByRole('status')
          .filter({ hasText: offText });
        await offNotice.waitFor();
        const help = owner.getByText(
          'Owners and admins can invite people and change roles.',
        );
        const [noticeBounds, helpBounds] = await Promise.all([
          offNotice.boundingBox(),
          help.boundingBox(),
        ]);
        assert.ok(noticeBounds && helpBounds);
        assert.equal(noticeBounds.x, helpBounds.x);
        assert.ok(noticeBounds.y + noticeBounds.height < helpBounds.y);
        assert.ok(
          await offNotice.evaluate(
            (element) =>
              Math.abs(
                element.getBoundingClientRect().width -
                  (element.parentElement?.getBoundingClientRect().width ?? 0),
              ) <= 1,
          ),
          'The collaboration notice fills the Members content width.',
        );
        if (fixture.hasPortal) await checkNoticeAction(offText, 'See plans');
        assert.ok(await invite.isDisabled());
        await owner.getByText(fixture.pendingEmail, { exact: true }).waitFor();
        assert.equal(
          await owner
            .getByRole('button', { name: 'Copy link', exact: true })
            .count(),
          0,
        );
        await check(owner, 'members-collaboration-off');
        if (phone) {
          await owner
            .getByRole('button', {
              name: `Actions for ${fixture.pendingEmail}`,
            })
            .click();
          const menu = owner.getByRole('menu');
          await menu
            .getByRole('menuitem', { name: 'Revoke', exact: true })
            .waitFor();
          assert.equal(
            await menu.getByRole('menuitem', { name: 'Copy link' }).count(),
            0,
          );
          await check(owner, 'members-collaboration-off-actions');
          await owner.keyboard.press('Escape');
          await menu.waitFor({ state: 'hidden' });
        } else {
          assert.ok(
            await owner
              .getByRole('button', { name: 'Revoke', exact: true })
              .first()
              .isEnabled(),
          );
        }
        await viewer.getByText(joinBlocked, { exact: true }).waitFor();
        assert.ok(await acceptLink.isDisabled());
        assert.ok(
          await viewer
            .getByRole('button', { name: 'Decline', exact: true })
            .isEnabled(),
        );
        await check(viewer, 'join-collaboration-off');
        await fixture.assertInvitationsBlocked();

        await viewer.goto(home);
        await switcher(viewer);
        const workspaceMenu = viewer.getByRole('menu');
        const workspaceRow = workspaceMenu.getByRole('menuitemradio', {
          name: `${fixture.workspaceName} Viewer`,
          exact: true,
        });
        await workspaceRow.waitFor();
        await check(viewer, 'switcher-roles');
        await viewer
          .getByText(fixture.viewerSwitcherName, { exact: true })
          .click();
        await viewer.getByText(joinBlocked, { exact: true }).waitFor();
        const acceptMenu = viewer.getByRole('menuitem', {
          name: /^Accept invite/,
        });
        assert.ok(await acceptMenu.isDisabled());
        assert.ok(
          await viewer
            .getByRole('menuitem', { name: 'Decline invite' })
            .isEnabled(),
        );
        await check(viewer, 'switcher-collaboration-off');
        await fixture.setCollaboration(true);
        await offNotice.waitFor({ state: 'hidden' });
        assert.ok(await invite.isEnabled());
        await viewer
          .getByRole('menuitem', { name: 'Accept invite', exact: true })
          .waitFor();
        assert.ok(await acceptMenu.isEnabled());
        await owner.goto(note);
        await viewer.goto(fixture.viewerLink);
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
        const pending = viewer.getByText(fixture.viewerSwitcherName, {
          exact: true,
        });
        await pending.waitFor();
        await pending.scrollIntoViewIfNeeded();
        await check(viewer, 'switcher-invites');
        await pending.click();
        const inviteActions = viewer.getByRole('menu', {
          name: fixture.viewerSwitcherName,
          exact: true,
        });
        await inviteActions
          .locator('button:focus')
          .getByText('Accept invite', { exact: true })
          .waitFor();
        assert.equal(
          await inviteActions
            .getByRole('menuitem', { name: 'Back', exact: true })
            .evaluate((row) => getComputedStyle(row).backgroundColor),
          'rgba(0, 0, 0, 0)',
        );
        await check(viewer, 'switcher-invite-actions');
        await inviteActions
          .getByRole('menuitem', { name: 'Accept invite', exact: true })
          .click();
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
        const titleEdges: number[] = [];
        for (const [page, surface] of [
          [viewer, 'viewer-note-with-presence'],
          [editor, 'editor-note-with-presence'],
        ] as const) {
          await page
            .getByRole('button', { name: /People in this note: .+, .+/ })
            .waitFor();
          if (phone)
            titleEdges.push(
              await page
                .locator('[data-note-header-title]')
                .evaluate((title) => {
                  const style = getComputedStyle(title);
                  return (
                    title.getBoundingClientRect().left +
                    parseFloat(style.paddingLeft) +
                    parseFloat(style.borderLeftWidth)
                  );
                }),
            );
          if (width < 360) {
            const stack = page.locator('[data-presence-stack]');
            const overflow = stack.locator('[data-presence-overflow]:visible');
            await overflow.waitFor();
            const chips = await stack.evaluate((element) =>
              [
                ...element.querySelectorAll(
                  '[data-presence-slot], [data-presence-overflow]',
                ),
              ]
                .filter((chip) => chip.checkVisibility())
                .map((chip) => {
                  const { width, height, left, right } =
                    chip.getBoundingClientRect();
                  return { text: chip.textContent, width, height, left, right };
                }),
            );
            const [avatar, extra] = chips;
            assert.ok(avatar && extra);
            assert.equal(chips.length, 2);
            assert.equal(extra.text, '+1');
            assert.equal(extra.width, avatar.width);
            assert.equal(extra.height, avatar.height);
            assert.equal(avatar.right - extra.left, 4);
          }
          await check(page, surface);
        }
        if (phone) assert.equal(titleEdges[0], titleEdges[1]);
        await editor.keyboard.press('Control+,');
        await editor.getByRole('dialog').waitFor();
        await editor
          .getByRole('button', { name: 'Close Settings', exact: true })
          .click();
        await editor.getByRole('dialog').waitFor({ state: 'hidden' });
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
        await editor.keyboard.press('Control+,');
        await editor.getByRole('dialog').waitFor();
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
        await assertToastAbove(
          editor.getByRole('status').filter({
            hasText: 'Your role changed to Viewer. Editing is off.',
          }),
        );
        const recoveryToast = editor
          .getByRole('status')
          .filter({ hasText: 'Your unsent text is in Personal' });
        await assertToastAbove(recoveryToast);
        const recoverySettings = editor.getByRole('dialog');
        await recoverySettings.focus();
        await editor.keyboard.press('Tab');
        assert.ok(
          await recoverySettings.evaluate((dialog) => {
            const first = document.activeElement;
            if (!(first instanceof HTMLElement) || !dialog.contains(first))
              return false;
            first.setAttribute('data-test-first-settings-control', '');
            return first !== dialog;
          }),
        );
        const firstControl = recoverySettings.locator(
          '[data-test-first-settings-control]',
        );
        await editor.keyboard.press('Shift+Tab');
        assert.ok(
          await recoveryToast
            .getByRole('button', { name: 'Dismiss', exact: true })
            .evaluate((button) => button === document.activeElement),
          'Shift+Tab from the first Settings control reaches the toast.',
        );
        await editor.keyboard.press('Shift+Tab');
        assert.ok(
          await recoveryToast
            .getByRole('button', { name: 'Open', exact: true })
            .evaluate((button) => button === document.activeElement),
        );
        await editor.keyboard.press('Shift+Tab');
        assert.ok(
          await recoverySettings.evaluate((dialog) =>
            dialog.contains(document.activeElement),
          ),
        );
        await editor.keyboard.press('Tab');
        assert.ok(
          await recoveryToast
            .getByRole('button', { name: 'Open', exact: true })
            .evaluate((button) => button === document.activeElement),
          'Tab from the last Settings control reaches the toast.',
        );
        await editor.keyboard.press('Tab');
        await editor.keyboard.press('Tab');
        assert.ok(
          await firstControl.evaluate(
            (control) => control === document.activeElement,
          ),
        );
        await editor
          .getByRole('button', { name: 'Close Settings', exact: true })
          .click();
        await editor.getByRole('dialog').waitFor({ state: 'hidden' });
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
        await assertToastAbove(
          viewer.getByRole('status').filter({
            hasText: `You no longer have access to ${fixture.workspaceName}.`,
          }),
        );
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
