import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { hasChromium, type Page } from './browser.ts';
import {
  clearCollaborationFixtures,
  collaborationFixture,
} from './collaboration-fixture.ts';

const loaded: unknown = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '.local-app/node_modules/playwright-core/index.mjs',
  ).href
);
assert.ok(hasChromium(loaded));
const origin = process.env.UI_AUDIT_ORIGIN ?? 'http://localhost:3000';
const runId = randomUUID().slice(0, 6);
const output = '.local-app/collaboration-screenshots';
mkdirSync(output, { recursive: true });
const cleanup: (() => Promise<void>)[] = [];
const fixture = await collaborationFixture(
  origin,
  cleanup,
  ` ${runId}`,
  `pending-${runId}@example.com`,
).catch(async (error: unknown) => {
  await clearCollaborationFixtures(cleanup);
  throw error;
});
const space = `/w/${fixture.workspaceId}`;
const note = `${space}/notes/${fixture.fileId}`;
const browser = await loaded.chromium.launch().catch(async (error: unknown) => {
  await clearCollaborationFixtures(cleanup);
  throw error;
});

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

async function workspaceWrites(
  page: Page,
  workspaceId: string,
): Promise<readonly number[]> {
  return page.evaluate(async (workspaceId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('notesapp');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const tx = db.transaction(['queue', 'drafts']);
      return await Promise.all(
        ['queue', 'drafts'].map(
          (name) =>
            new Promise<number>((resolve, reject) => {
              const request = tx.objectStore(name).getAllKeys();
              request.onsuccess = () =>
                resolve(
                  request.result.filter(
                    (key) => Array.isArray(key) && key[2] === workspaceId,
                  ).length,
                );
              request.onerror = () => reject(request.error);
            }),
        ),
      );
    } finally {
      db.close();
    }
  }, workspaceId);
}

async function waitForFrozenSave(
  page: Page,
  workspaceId: string,
): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [queue, drafts] = await workspaceWrites(page, workspaceId);
    if ((queue ?? 0) > 0 && (drafts ?? 0) > 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(
    'The offline note needs a queued save and a draft before access changes.',
  );
}

async function readOpenRecovery(page: Page) {
  const fileId = await page.evaluate(() => location.pathname.split('/').at(-1));
  assert.ok(fileId);
  return fixture.readRecovery(fileId);
}

async function waitForSavedHead(text: string): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const head = await fixture.readNote();
    if (head?.includes(text)) return head;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`The server did not save "${text}".`);
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
  await owner
    .getByLabel('Email addresses')
    .fill('a@example.com, bad@, also bad');
  await owner.getByRole('button', { name: 'Send invite', exact: true }).click();
  for (const address of ['bad@', 'also', 'bad'])
    await owner
      .getByText(`“${address}” is not a valid email address.`)
      .waitFor();
  assert.equal(
    await owner.getByLabel('Email addresses').getAttribute('aria-invalid'),
    'true',
  );
  assert.equal(inviteRequests, 0);
  await screenshot(owner, 'invite-bad-address-desktop-light');
  await owner
    .getByLabel('Email addresses')
    .fill(`${fixture.pendingEmail}\n${fixture.editor}`);
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
      page.locator('[data-live-connection=Live]').waitFor(),
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
  assert.equal(await peerLabel.getAttribute('data-below'), 'false');
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
  assert.equal(
    await popover.evaluate((node) => getComputedStyle(node).outlineStyle),
    'none',
  );
  await screenshot(owner, 'presence-desktop-light');
  await owner.keyboard.press('Escape');
  await popover.waitFor({ state: 'hidden' });
  await ownerText.focus();
  await ownerText.press('Control+End');
  const editorCaret = owner.locator('.cm-ySelectionCaret').first();
  const ownerCaret = editor.locator('.cm-ySelectionCaret').first();
  assert.notEqual(
    await editorCaret.evaluate((node) => getComputedStyle(node).borderColor),
    await ownerCaret.evaluate((node) => getComputedStyle(node).borderColor),
  );

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

  const memberSettings = await ownerContext.newPage();
  await memberSettings.goto(`${origin}${space}?settings=members`);
  const onlineRole = memberSettings.getByRole('button', {
    name: 'Role for Casey Editor',
  });
  await onlineRole.click();
  await editor.locator('[data-live-connection=Live]').waitFor();
  await editorContext.route(
    `**/api/workspaces/${fixture.workspaceId}/changesets`,
    async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 503 });
      } else await route.continue();
    },
  );
  await ownerText.focus();
  await ownerText.press('Control+Home');
  await owner.keyboard.type('Owner work in progress\n');
  await editorText.focus();
  await editorText.press('Control+End');
  await editor.keyboard.type('\nCasey wrote this before the change');
  await bothSee(owner, editor, /Casey wrote this before the change/);
  await memberSettings
    .getByRole('menuitemradio', { name: 'Viewer', exact: true })
    .click();
  await editor
    .getByText('Your role changed to Viewer. Editing is off.')
    .waitFor();
  assert.equal(await editorText.getAttribute('aria-readonly'), 'true');
  await ownerText.focus();
  await ownerText.press('Control+End');
  await owner.keyboard.type('\nThe owner can still save');
  await ownerText.press('Control+s');
  const head = await waitForSavedHead('The owner can still save');
  await owner
    .getByRole('button', { name: /Show save details/ })
    .waitFor({ state: 'hidden' });
  await owner
    .getByRole('treeitem', { name: /Launch plan/ })
    .getByText('Local', { exact: true })
    .waitFor({ state: 'hidden' });
  await bothSee(owner, editor, /The owner can still save/);
  await editorContext.unrouteAll({ behavior: 'wait' });
  assert.match(head, /Casey wrote this before the change/);
  assert.match(head, /Owner work in progress/);
  await Promise.all(
    [owner, editor].map((page) => page.goto(`${origin}${note}`)),
  );
  await bothSee(owner, editor, /The owner can still save/);
  assert.equal(await owner.getByText(/Two versions of this note/).count(), 0);
  await owner
    .getByRole('button', { name: /People in this note: Casey Editor/ })
    .waitFor();
  await editor
    .getByRole('button', { name: /People in this note: Owner/ })
    .waitFor();
  await screenshot(owner, 'editor-after-downgrade-desktop-light');
  await screenshot(editor, 'viewer-after-downgrade-desktop-dark');
  const versions = await fixture.readHistory();
  for (const [index, version] of versions.entries())
    assert.notEqual(version.text, versions[index + 1]?.text);
  const beforeDowngrade = versions
    .filter((version) =>
      version.text?.includes('Casey wrote this before the change'),
    )
    .at(-1);
  assert.ok(
    beforeDowngrade?.contributors?.some(
      (person) => person.displayName === 'Casey Editor',
    ),
  );
  assert.ok(
    versions[0]?.contributors?.some((person) => person.displayName === 'Owner'),
  );
  await onlineRole.click();
  await memberSettings
    .getByRole('menuitemradio', { name: 'Editor', exact: true })
    .click();
  await onlineRole.getByText('Editor', { exact: true }).waitFor();

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
      await page.getByLabel('Email addresses').waitFor();
      if (phone)
        await page.getByRole('button', { name: 'Back to section' }).waitFor();
      else
        await page
          .getByRole('dialog', {
            name: `Invite people to ${fixture.workspaceName}`,
          })
          .waitFor();
      await screenshot(page, `invite-${layout}-${scheme}`);
      await page.goto(`${origin}${space}`);
      if (phone)
        await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.getByRole('button', { name: /Workspace: / }).click();
      await page.getByText('Rename workspace', { exact: true }).waitFor();
      await page
        .getByRole('menuitemradio', {
          name: `${fixture.workspaceName} Owner · 3`,
          exact: true,
        })
        .waitFor();
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
      const joined = phone.getByRole('status').filter({
        hasText: `You joined ${fixture.viewerJoinName} as a Viewer.`,
      });
      await joined.waitFor();
      assert.equal(
        await joined.getByRole('button', { name: 'Open', exact: true }).count(),
        0,
      );
      await phone.goto(fixture.viewerLink);
      await phone.getByText('This invite no longer works').waitFor();
      await screenshot(phone, 'join-used-phone-dark');
      await phone.goto(`${origin}${space}`);
      await phone.getByRole('button', { name: 'Open navigation' }).click();
      const switcher = phone.getByRole('button', { name: /Workspace: / });
      await switcher.click();
      const accept = phone.getByText(
        `Accept invite to ${fixture.viewerSwitcherName}`,
        { exact: true },
      );
      await accept.waitFor();
      await accept.scrollIntoViewIfNeeded();
      await screenshot(phone, 'switcher-pending-phone-dark');
      await accept.click();
      const switched = phone.getByRole('status').filter({
        hasText: `You joined ${fixture.viewerSwitcherName} as an Editor.`,
      });
      await switched.waitFor();
      await phone.waitForURL(`${origin}${space}`);
      await screenshot(phone, 'switcher-joined-phone-dark');
      await switched.getByRole('button', { name: 'Open', exact: true }).click();
      await phone.waitForURL(`${origin}/w/${fixture.viewerSwitcherId}`);
    }
    await context.close();
  }
  const recoveryFileId = await fixture.createNote('Recovery plan');
  const recoveryNote = `${space}/notes/${recoveryFileId}`;
  await editor.goto(`${origin}${recoveryNote}`);
  await editor.locator('[data-live-connection=Live]').waitFor();
  await owner.goto(`${origin}${space}?settings=members`);
  await fixture.addRecoveryOccupant('Recovery plan');
  await editorContext.setOffline(true);
  await editor.getByText(/Offline. Your edits merge/).waitFor();
  await editorText.focus();
  await editorText.press('Control+End');
  await editor.keyboard.type('\nKeep this unsent text');
  await editorText.press('Control+s');
  await waitForFrozenSave(editor, fixture.workspaceId);
  await editor
    .getByRole('treeitem', { name: /Recovery plan/ })
    .getByText('Local', { exact: true })
    .waitFor();
  const roleMenu = owner.getByRole('button', { name: 'Role for Casey Editor' });
  await roleMenu.click();
  await owner
    .getByRole('menuitemradio', { name: 'Viewer', exact: true })
    .click();
  await roleMenu.getByText('Viewer', { exact: true }).waitFor();
  let occupiedDuringUpload = false;
  await editorContext.route(
    `**/api/workspaces/${fixture.editorPersonalId}/files`,
    async (route) => {
      if (route.request().method() === 'POST' && !occupiedDuringUpload) {
        occupiedDuringUpload = true;
        await fixture.addRecoveryOccupant('Recovery plan 2');
      }
      await route.continue();
    },
  );
  await editorContext.setOffline(false);
  await editor
    .getByText('Your role changed to Viewer. Editing is off.')
    .waitFor();
  assert.equal(await editorText.getAttribute('aria-readonly'), 'true');
  await editor
    .getByText(
      `Your unsent text is in Personal, in the folder From ${fixture.workspaceName}.`,
    )
    .waitFor();
  await editorText
    .getByText('Keep this unsent text', { exact: true })
    .waitFor({ state: 'hidden' });
  await editor
    .getByRole('treeitem', { name: /Recovery plan/ })
    .getByText('Local', { exact: true })
    .waitFor({ state: 'hidden' });
  await editor
    .getByRole('button', { name: /Show save details/ })
    .waitFor({ state: 'hidden' });
  assert.deepEqual(await workspaceWrites(editor, fixture.workspaceId), [0, 0]);
  const downgradeToast = editor
    .getByRole('status')
    .filter({ hasText: 'Your unsent text is in Personal' });
  await downgradeToast
    .getByRole('button', { name: 'Dismiss', exact: true })
    .waitFor();
  const cardBox = await downgradeToast.boundingBox();
  const roleBox = await editor
    .getByRole('status')
    .filter({ hasText: 'Your role changed to Viewer. Editing is off.' })
    .boundingBox();
  assert.ok(cardBox && roleBox && roleBox.y + roleBox.height <= cardBox.y);
  await screenshot(editor, 'recovery-downgrade-desktop-dark');
  await downgradeToast
    .getByRole('button', { name: 'Open', exact: true })
    .click();
  await editorText
    .getByText('Keep this unsent text', { exact: true })
    .waitFor();
  const downgradedCopy = await readOpenRecovery(editor);
  assert.equal(occupiedDuringUpload, true);
  assert.equal(
    downgradedCopy.path,
    `From ${fixture.workspaceName}/Recovery plan 3.md`,
  );
  assert.match(downgradedCopy.head?.text ?? '', /Keep this unsent text/);
  await editorContext.unrouteAll({ behavior: 'wait' });
  await roleMenu.click();
  await owner
    .getByRole('menuitemradio', { name: 'Editor', exact: true })
    .click();
  await roleMenu.getByText('Editor', { exact: true }).waitFor();
  await editor.goto(`${origin}${recoveryNote}`);
  await editor.locator('[data-live-connection=Live]').waitFor();
  await editorContext.setOffline(true);
  await editor.getByText(/Offline. Your edits merge/).waitFor();
  await editorText.focus();
  await editorText.press('Control+End');
  await editor.keyboard.type('\nKeep this text after removal');
  await editorText.press('Control+s');
  await waitForFrozenSave(editor, fixture.workspaceId);
  await editor
    .getByRole('treeitem', { name: /Recovery plan/ })
    .getByText('Local', { exact: true })
    .waitFor();
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
  assert.deepEqual(await workspaceWrites(editor, fixture.workspaceId), [0, 0]);
  const removalToast = editor
    .getByRole('status')
    .filter({ hasText: 'Your unsent text is in Personal' });
  await removalToast
    .getByRole('button', { name: 'Dismiss', exact: true })
    .waitFor();
  await removalToast.getByRole('button', { name: 'Open', exact: true }).click();
  await editorText
    .getByText('Keep this text after removal', { exact: true })
    .waitFor();
  const removedCopy = await readOpenRecovery(editor);
  assert.equal(
    removedCopy.path,
    `From ${fixture.workspaceName}/Recovery plan 4.md`,
  );
  assert.match(removedCopy.head?.text ?? '', /Keep this text after removal/);
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
  const rejoined = editor
    .getByRole('status')
    .filter({ hasText: `You joined ${fixture.workspaceName} as an Editor.` });
  await rejoined.getByRole('button', { name: 'Open', exact: true }).click();
  await editor.waitForURL(`${origin}${space}`);
  await memberSettings.goto(`${origin}${space}?settings=members`);
  await Promise.all(
    [owner, editor].map((page) => page.goto(`${origin}${note}`)),
  );
  await editorText
    .getByText('The owner can still save', { exact: true })
    .waitFor();
  await editor.locator('[data-live-connection=Live]').waitFor();
  const recoveryPaths = await fixture.recoveryPaths();
  assert.deepEqual(await workspaceWrites(editor, fixture.workspaceId), [0, 0]);
  await editor.evaluate(() =>
    Object.defineProperty(document, 'hidden', {
      value: true,
      configurable: true,
    }),
  );
  const idlePresence = owner.getByRole('button', {
    name: /People in this note: Casey Editor/,
  });
  const idlePopover = owner.getByRole('dialog', {
    name: 'People in this note',
  });
  await idlePresence.click();
  await idlePopover.getByText('Editing · Idle', { exact: true }).waitFor();
  await screenshot(owner, 'presence-idle-editor-desktop-light');
  await owner.keyboard.press('Escape');

  await onlineRole.click();
  await memberSettings
    .getByRole('menuitemradio', { name: 'Viewer', exact: true })
    .click();
  await editor
    .getByText('Your role changed to Viewer. Editing is off.')
    .waitFor();
  assert.equal(await editorText.getAttribute('aria-readonly'), 'true');
  await idlePresence.click();
  await idlePopover.getByText('Viewing · Idle', { exact: true }).waitFor();
  await screenshot(owner, 'presence-idle-viewer-desktop-light');
  assert.deepEqual(await fixture.recoveryPaths(), recoveryPaths);
  assert.equal(
    await editor.getByText(/Your unsent text is in Personal/).count(),
    0,
  );
  await onlineRole.click();
  await memberSettings
    .getByText('Remove from workspace', { exact: true })
    .click();
  await memberSettings
    .getByRole('dialog', { name: 'Remove from workspace' })
    .getByRole('button', { name: 'Remove', exact: true })
    .click();
  const removedNotice = `You no longer have access to ${fixture.workspaceName}.`;
  const cleanToast = editor
    .getByRole('status')
    .filter({ hasText: removedNotice });
  await cleanToast.getByText(removedNotice, { exact: true }).waitFor();
  assert.equal(
    await cleanToast.getByRole('button', { name: 'Open', exact: true }).count(),
    0,
  );
  await editor.waitForURL(`${origin}/w/${fixture.editorPersonalId}`);
  assert.deepEqual(await workspaceWrites(editor, fixture.workspaceId), [0, 0]);
  assert.deepEqual(await fixture.recoveryPaths(), recoveryPaths);
  await screenshot(editor, 'clean-removal-desktop-dark');
  const signupContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    colorScheme: 'light',
  });
  const signup = await signupContext.newPage();
  await signup.goto(fixture.pendingLink);
  await signup.getByLabel('Your name').fill('Invite Test');
  await signup.getByLabel('Password', { exact: true }).fill(fixture.password);
  await signup
    .getByLabel('Password again', { exact: true })
    .fill(fixture.password);
  await signup.getByRole('button', { name: 'Create account and join' }).click();
  await signup.waitForURL(`${origin}${space}`);
  const signupToast = signup.getByRole('status').filter({
    hasText: `You joined ${fixture.workspaceName} as an Editor.`,
  });
  await signupToast.waitFor();
  assert.equal(
    await signupToast
      .getByRole('button', { name: 'Open', exact: true })
      .count(),
    0,
  );
  await screenshot(signup, 'join-sign-up-toast-phone-light');
  await signupContext.close();
  process.stdout.write(
    'Concurrent edits, cursors, presence and idle modes, offline merge, invites, access changes with and without unsent work, and former contributors passed.\n',
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
  try {
    await browser.close();
  } finally {
    await clearCollaborationFixtures(cleanup);
  }
}
