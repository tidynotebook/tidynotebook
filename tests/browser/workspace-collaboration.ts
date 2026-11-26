import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { hasChromium, isRecord, type Page } from './browser.ts';

const loaded: unknown = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '.local-app/node_modules/playwright-core/index.mjs',
  ).href
);
assert.ok(hasChromium(loaded));
const supplied: unknown = JSON.parse(
  readFileSync('.local-app/collaboration-fixture.json', 'utf8'),
);
assert.ok(isRecord(supplied));
const fixture = supplied;
function value(key: string): string {
  const item = fixture[key];
  assert.equal(typeof item, 'string', key);
  return String(item);
}

const origin = process.env.UI_AUDIT_ORIGIN ?? 'http://localhost:3000';
const space = `/w/${value('workspaceId')}`;
const note = `${space}/notes/${value('fileId')}`;
const output = '.local-app/collaboration-screenshots';
mkdirSync(output, { recursive: true });
const browser = await loaded.chromium.launch();
const password = value('password');

async function signIn(page: Page, email: string): Promise<void> {
  page.setDefaultTimeout(20_000);
  await page.goto(`${origin}/login`);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /Account/ }).waitFor();
}

async function screenshot(page: Page, name: string): Promise<void> {
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
  });
  const editorContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    hasTouch: false,
    isMobile: false,
    colorScheme: 'dark',
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
    signIn(owner, value('owner')),
    signIn(editor, value('editor')),
  ]);
  await owner.goto(`${origin}${space}?settings=members`);
  await owner.getByText(value('editor'), { exact: true }).waitFor();
  await screenshot(owner, 'members-desktop-light');
  await owner
    .getByRole('button', { name: 'Invite people', exact: true })
    .click();
  await owner.getByRole('dialog', { name: /Invite people to/ }).waitFor();
  await screenshot(owner, 'invite-desktop-light');
  await owner.keyboard.press('Escape');
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
  await screenshot(owner, 'editor-desktop-light');
  await screenshot(editor, 'editor-desktop-dark');

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
  await owner.goto(`${origin}${note}/history`);
  await owner
    .getByText(/Owner|Editor/)
    .first()
    .waitFor();
  await screenshot(owner, 'history-desktop-light');

  const pendingLink = value('pendingLink');
  for (const scheme of ['light', 'dark'] as const) {
    for (const width of [390, 1440]) {
      const phone = width === 390;
      const layout = phone ? 'phone' : 'desktop';
      const context = await browser.newContext({
        viewport: { width, height: phone ? 844 : 900 },
        hasTouch: phone,
        isMobile: phone,
        colorScheme: scheme,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      await page.goto(pendingLink);
      await page
        .getByRole('button', { name: 'Create account and join' })
        .waitFor();
      await screenshot(page, `join-signed-out-${layout}-${scheme}`);
      await signIn(page, value('owner'));
      await page.goto(pendingLink);
      await page
        .getByText('This invite is for another email', { exact: true })
        .waitFor();
      await screenshot(page, `join-wrong-account-${layout}-${scheme}`);
      await page.goto(`${origin}${space}?settings=members`);
      await page.getByText(value('editor'), { exact: true }).waitFor();
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
      await context.close();
    }
  }
  for (const scheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      colorScheme: scheme,
    });
    const phone = await context.newPage();
    await signIn(phone, value('viewer'));
    await phone.goto(`${origin}${note}`);
    await phone.getByText(/View only/).waitFor();
    assert.equal(
      await phone.locator('.cm-content').getAttribute('aria-readonly'),
      'true',
    );
    await screenshot(phone, `viewer-phone-${scheme}`);
    await phone.goto(`${origin}${note}/history`);
    await phone.getByText(/View only/).waitFor();
    assert.equal(
      await phone.getByRole('button', { name: /^Restore/ }).count(),
      0,
    );
    await screenshot(phone, `history-phone-${scheme}`);
    await phone.goto(`${origin}${space}?settings=members`);
    await phone.getByText(value('editor'), { exact: true }).waitFor();
    assert.equal(
      await phone.getByRole('button', { name: 'Invite people' }).count(),
      0,
    );
    await screenshot(phone, `members-viewer-phone-${scheme}`);
    await context.close();
  }
  process.stdout.write(
    'Concurrent edits, presence, cursors, offline merge and viewer access passed.\n',
  );
} finally {
  await browser.close();
}
