import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { hasChromium, type Page } from './browser.ts';
import { collaborationFixture } from './collaboration-fixture.ts';

const loaded: unknown = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '.local-app/node_modules/playwright-core/index.mjs',
  ).href
);
assert.ok(hasChromium(loaded));
const origin = process.env.UI_AUDIT_ORIGIN ?? 'http://localhost:3000';
const fixture = await collaborationFixture(origin);
const space = `/w/${fixture.workspaceId}`;
const note = `${space}/notes/${fixture.fileId}`;
const output = '.local-app/collaboration-screenshots';
mkdirSync(output, { recursive: true });
const browser = await loaded.chromium.launch();

async function signIn(page: Page, email: string): Promise<void> {
  page.setDefaultTimeout(20_000);
  await page.goto(`${origin}/login`);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /Account/ }).waitFor();
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await page.screenshot({
    path: `${output}/${name}.png`,
    animations: 'disabled',
  });
}

async function bothSee(first: Page, second: Page, text: RegExp): Promise<void> {
  await Promise.all(
    [first, second].map((page) =>
      page.locator('.cm-content').getByText(text).waitFor(),
    ),
  );
}

try {
  const ownerContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    hasTouch: false,
    isMobile: false,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const editorContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    hasTouch: false,
    isMobile: false,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  const owner = await ownerContext.newPage();
  const editor = await editorContext.newPage();
  owner.on('pageerror', (error) => {
    process.stderr.write(`${error.message}\n`);
  });
  editor.on('pageerror', (error) => {
    process.stderr.write(`${error.message}\n`);
  });
  await Promise.all([
    signIn(owner, fixture.owner),
    signIn(editor, fixture.editor),
  ]);
  await owner.goto(`${origin}${space}`);
  await owner
    .getByRole('link', { name: 'Launch plan', exact: true })
    .getByText(/just now|ago/)
    .waitFor();
  await owner.goto(`${origin}${space}?settings=members`);
  await owner.getByText(fixture.editor, { exact: true }).waitFor();
  await screenshot(owner, 'members-desktop-light');
  await owner
    .getByRole('button', { name: 'Invite people', exact: true })
    .click();
  await owner.getByRole('dialog', { name: /Invite people to/ }).waitFor();
  await screenshot(owner, 'invite-desktop-light');
  let inviteRequests = 0;
  owner.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/invitations'))
      inviteRequests += 1;
  });
  await owner.getByLabel('Email addresses').fill('a@example.com, bad@');
  await owner.getByRole('button', { name: 'Send 2 invites' }).click();
  await owner
    .getByText('“bad@” is not a valid email address.', { exact: true })
    .waitFor();
  assert.equal(
    await owner.getByLabel('Email addresses').getAttribute('aria-invalid'),
    'true',
  );
  assert.equal(inviteRequests, 0);
  await screenshot(owner, 'invite-bad-address-desktop-light');
  await owner
    .getByLabel('Email addresses')
    .fill(`pending@example.com\n${fixture.editor}`);
  await owner.getByRole('button', { name: 'Send 2 invites' }).click();
  const inviteResults = owner.getByRole('dialog', {
    name: '0 invites created',
  });
  await inviteResults.waitFor();
  assert.equal(inviteRequests, 1);
  await owner
    .getByText('Already invited. Copy the link to send it again.')
    .waitFor();
  await screenshot(owner, 'invite-results-desktop-light');
  await owner.getByText('Already a member.').waitFor();
  await inviteResults.getByRole('button', { name: 'Copy link' }).waitFor();
  await owner.getByRole('button', { name: 'Done', exact: true }).click();
  await Promise.all(
    [owner, editor].map((page) => page.goto(`${origin}${note}`)),
  );
  await Promise.all(
    [owner, editor].map((page) =>
      page.getByText('Live', { exact: true }).waitFor(),
    ),
  );
  const ownerText = owner.locator('.cm-content');
  const editorText = editor.locator('.cm-content');
  await Promise.all([ownerText.focus(), editorText.focus()]);
  await Promise.all([
    ownerText.press('Control+Home'),
    editorText.press('Control+End'),
  ]);
  await Promise.all([
    owner.keyboard.type('Owner note item\n'),
    editor.keyboard.type('\nEditor note item'),
  ]);
  await bothSee(owner, editor, /Owner note item/);
  await bothSee(owner, editor, /Editor note item/);
  await Promise.all(
    [owner, editor].map((page) =>
      page.getByRole('button', { name: /People in this note/ }).waitFor(),
    ),
  );
  await Promise.all(
    [owner, editor].map((page) =>
      page.locator('.cm-ySelectionCaret').first().waitFor(),
    ),
  );
  const peerLabel = owner
    .locator('.cm-ySelectionInfo[data-active="true"]')
    .filter({ hasText: 'Casey Editor' })
    .first();
  await peerLabel.waitFor();
  await screenshot(owner, 'editor-desktop-light');
  await screenshot(editor, 'editor-desktop-dark');
  await owner
    .locator('.cm-ySelectionInfo[data-active="true"]')
    .first()
    .waitFor({ state: 'detached' });
  await owner.locator('.cm-ySelectionCaret').first().hover();
  assert.equal(
    await owner
      .locator('.cm-ySelectionInfo')
      .first()
      .evaluate((node) => getComputedStyle(node).opacity),
    '1',
  );
  const desktopPresence = owner.getByRole('button', {
    name: /People in this note/,
  });
  await desktopPresence.click();
  const popover = owner.getByRole('dialog', { name: 'People in this note' });
  await popover.getByRole('list').getByRole('listitem').first().waitFor();
  assert.equal(await popover.getAttribute('aria-modal'), null);
  await screenshot(owner, 'presence-desktop-light');
  await owner.keyboard.press('Escape');
  await popover.waitFor({ state: 'hidden' });
  await ownerText.focus();
  await ownerText.press('Control+End');

  await editorContext.setOffline(true);
  await editor.getByText(/Offline. Your edits merge/).waitFor();
  await screenshot(editor, 'editor-offline-dark');
  await Promise.all([
    owner.keyboard.type('\nOnline addition'),
    editor.keyboard.type('\nOffline addition'),
  ]);
  await editorContext.setOffline(false);
  await bothSee(owner, editor, /Online addition/);
  await bothSee(owner, editor, /Offline addition/);
  await editorText.press('Control+s');
  await ownerText.press('Control+s');
  await owner.goto(`${origin}${note}/history`);
  await owner
    .getByText(/Casey Editor/)
    .first()
    .waitFor();
  await screenshot(owner, 'history-desktop-light');

  await editor.goto(`${origin}${note}/history`);
  await editor.getByText(/Owner/).first().waitFor();
  await screenshot(editor, 'history-desktop-dark');
  await Promise.all(
    [owner, editor].map((page) => page.goto(`${origin}${note}`)),
  );

  for (const scheme of ['light', 'dark'] as const) {
    for (const width of [320, 390, 1440]) {
      const phone = width < 1440;
      const layout =
        width === 320 ? 'compact-phone' : phone ? 'phone' : 'desktop';
      const context = await browser.newContext({
        viewport: { width, height: phone ? 844 : 900 },
        hasTouch: phone,
        isMobile: phone,
        colorScheme: scheme,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      await page.goto(fixture.pendingLink);
      await page
        .getByRole('button', { name: 'Create account and join' })
        .waitFor();
      await screenshot(page, `join-signed-out-${layout}-${scheme}`);
      await signIn(page, fixture.owner);
      await page.goto(fixture.pendingLink);
      await page
        .getByText('This invite is for another email', { exact: true })
        .waitFor();
      await screenshot(page, `join-wrong-account-${layout}-${scheme}`);
      await page.goto(`${origin}${space}?settings=members`);
      await page.getByText(fixture.editor, { exact: true }).waitFor();
      await screenshot(page, `members-${layout}-${scheme}`);
      await page
        .getByRole('button', { name: 'Invite people', exact: true })
        .click();
      await page.getByRole('dialog', { name: /Invite people to/ }).waitFor();
      await screenshot(page, `invite-${layout}-${scheme}`);
      await page.goto(`${origin}${space}`);
      if (phone)
        await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.getByRole('button', { name: /Workspace: / }).click();
      await page.getByText('Rename workspace', { exact: true }).waitFor();
      await screenshot(page, `switcher-${layout}-${scheme}`);
      await page.getByText('Delete permanently', { exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Delete workspace permanently' })
        .getByText(/2 other members will lose access/)
        .waitFor();
      await screenshot(page, `delete-workspace-${layout}-${scheme}`);
      if (phone) {
        await page.goto(`${origin}${note}`);
        await page
          .getByRole('button', { name: /People in this note/ })
          .waitFor();
        await screenshot(page, `editor-${layout}-${scheme}`);
      }
      await context.close();
    }
  }
  for (const scheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      colorScheme: scheme,
      reducedMotion: 'reduce',
    });
    const phone = await context.newPage();
    await signIn(phone, fixture.viewer);
    await phone.goto(`${origin}${note}`);
    await phone.getByText('View only', { exact: true }).waitFor();
    assert.equal(
      await phone.locator('.cm-content').getAttribute('aria-readonly'),
      'true',
    );
    await screenshot(phone, `viewer-phone-${scheme}`);
    await phone.setViewportSize({ width: 320, height: 720 });
    await phone
      .getByText('View only', { exact: true })
      .waitFor({ state: 'hidden' });
    await phone
      .getByText('View only. You can read this note and its history.')
      .waitFor();
    await screenshot(phone, `viewer-compact-phone-${scheme}`);
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.getByRole('button', { name: /People in this note/ }).click();
    await phone.getByRole('dialog', { name: 'People in this note' }).waitFor();
    await screenshot(phone, `presence-phone-${scheme}`);
    await phone.goto(`${origin}${note}/history`);
    await phone.getByText(/View only/).waitFor();
    assert.equal(
      await phone.getByRole('button', { name: /^Restore/ }).count(),
      0,
    );
    await screenshot(phone, `history-phone-${scheme}`);
    await phone.goto(`${origin}${space}?settings=members`);
    await phone.getByText(fixture.editor, { exact: true }).waitFor();
    assert.equal(
      await phone.getByRole('button', { name: 'Invite people' }).count(),
      0,
    );
    await screenshot(phone, `members-viewer-phone-${scheme}`);
    if (scheme === 'dark') {
      await phone.goto(fixture.viewerLink);
      await phone.getByRole('button', { name: 'Accept and open' }).waitFor();
      await screenshot(phone, 'join-valid-phone-dark');
      await phone.getByRole('button', { name: 'Accept and open' }).click();
      await phone.waitForURL(`${origin}/w/${fixture.viewerJoinId}`);
      await phone.getByText('You joined Join check as a Viewer.').waitFor();
      await phone.getByRole('button', { name: 'Open', exact: true }).click();
      await phone.goto(fixture.viewerLink);
      await phone.getByText('This invite no longer works').waitFor();
      await screenshot(phone, 'join-used-phone-dark');
      await phone.goto(`${origin}${space}`);
      await phone.getByRole('button', { name: 'Open navigation' }).click();
      const switcher = phone.getByRole('button', { name: /Workspace: / });
      await switcher.click();
      const accept = phone.getByText('Accept invite to Switcher check');
      await accept.waitFor();
      await accept.scrollIntoViewIfNeeded();
      await screenshot(phone, 'switcher-pending-phone-dark');
      await accept.click();
      await phone.waitForURL(`${origin}/w/${fixture.viewerSwitcherId}`);
      await phone
        .getByText('You joined Switcher check as an Editor.')
        .waitFor();
      await screenshot(phone, 'switcher-joined-phone-dark');
    }
    await context.close();
  }
  await editor.goto(`${origin}${note}`);
  await editor.getByText('Live', { exact: true }).waitFor();
  await owner.goto(`${origin}${space}?settings=members`);
  await editorContext.setOffline(true);
  await editor.getByText(/Offline. Your edits merge/).waitFor();
  await editorText.focus();
  await editorText.press('Control+End');
  await editor.keyboard.type('\nKeep this unsent text');
  const roleMenu = owner.getByRole('button', { name: 'Role for Casey Editor' });
  await roleMenu.click();
  await owner
    .getByRole('menuitemradio', { name: 'Viewer', exact: true })
    .click();
  await roleMenu.getByText('Viewer', { exact: true }).waitFor();
  await editorContext.setOffline(false);
  await editor
    .getByText('Your role changed to Viewer. Editing is off.')
    .waitFor();
  assert.equal(await editorText.getAttribute('aria-readonly'), 'true');
  await screenshot(editor, 'editor-downgraded-desktop-dark');
  await editor
    .getByText(
      `Your unsent text is in Personal, in the folder From ${fixture.workspaceName}.`,
    )
    .waitFor();
  await editor.goto(`${origin}/w/${fixture.editorPersonalId}`);
  await editor
    .getByRole('link', {
      name: `Launch plan, in From ${fixture.workspaceName}`,
      exact: true,
    })
    .click();
  await editorText
    .getByText('Keep this unsent text', { exact: true })
    .waitFor();
  await roleMenu.click();
  await owner
    .getByRole('menuitemradio', { name: 'Editor', exact: true })
    .click();
  await roleMenu.getByText('Editor', { exact: true }).waitFor();
  await editor.goto(`${origin}${note}`);
  await editor.getByText('Live', { exact: true }).waitFor();
  await editorContext.setOffline(true);
  await editor.getByText(/Offline. Your edits merge/).waitFor();
  await editorText.focus();
  await editorText.press('Control+End');
  await editor.keyboard.type('\nKeep this text after removal');
  await roleMenu.click();
  await owner.getByText('Remove from workspace', { exact: true }).click();
  await owner
    .getByRole('dialog', { name: 'Remove from workspace' })
    .getByRole('button', { name: 'Remove', exact: true })
    .click();
  await roleMenu.waitFor({ state: 'hidden' });
  await editorContext.setOffline(false);
  await editor
    .getByText(
      `You no longer have access to ${fixture.workspaceName}. Your unsent text`,
    )
    .waitFor();
  await screenshot(editor, 'access-removed-desktop-dark');
  await editor.goto(`${origin}/w/${fixture.editorPersonalId}`);
  await editor
    .getByRole('link', {
      name: `Launch plan 2, in From ${fixture.workspaceName}`,
      exact: true,
    })
    .click();
  await editorText
    .getByText('Keep this text after removal', { exact: true })
    .waitFor();
  await owner.goto(`${origin}${note}/history`);
  await owner
    .getByText(/Former member/)
    .first()
    .waitFor();
  await screenshot(owner, 'history-former-member-desktop-light');
  await owner.goto(`${origin}${space}?settings=members`);
  await owner.getByRole('button', { name: 'Invite people' }).click();
  await owner.getByLabel('Email addresses').fill(fixture.editor);
  await owner.getByRole('button', { name: 'Send invite' }).click();
  await owner.getByText('Invite created. Copy the link to send it.').waitFor();
  await editor.goto(`${origin}/w/${fixture.editorPersonalId}`);
  await editor.getByRole('button', { name: /Workspace: / }).click();
  await editor.getByText(`Accept invite to ${fixture.workspaceName}`).click();
  await editor.waitForURL(`${origin}${space}`);
  process.stdout.write(
    'Concurrent edits, cursors, presence, offline merge, invites, viewer access, downgrade and removal recovery, and former contributors passed.\n',
  );
} catch (error) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const details = await page
        .evaluate(() => ({
          path: location.pathname,
          text: document.body.innerText.slice(0, 1500),
        }))
        .catch(() => null);
      if (details !== null)
        process.stderr.write(`${JSON.stringify(details)}\n`);
    }
  }
  throw error;
} finally {
  await browser.close();
}
