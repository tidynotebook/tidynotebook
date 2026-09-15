import { test, expect } from './support/stack.ts';
import { prepareCleanBrowser } from './support/browser-state.ts';
import {
  openNavigation,
  openPersonalWorkspace,
  replaceEditorText,
  runNoteAction,
  signIn,
  waitForServerSave,
} from './support/account.ts';

test.beforeEach(async ({ context }) => prepareCleanBrowser(context));

test('the selected folder receives a child folder and a saved note', async ({
  checkedPage: page,
  stack,
}) => {
  await signIn(page, stack);
  await openPersonalWorkspace(page);
  const suffix = Date.now().toString();
  const parent = `work-${suffix}`;
  const child = `plans-${suffix}`;
  const noteName = `outline-${suffix}`;
  const navigation = page.locator('#notes-sidebar');

  await openNavigation(page);
  await navigation
    .getByRole('button', { name: 'New folder', exact: true })
    .click();
  await page.getByLabel('Folder name').fill(parent);
  await page.getByRole('button', { name: 'Make folder' }).click();

  const work = page.getByRole('button', { name: parent, exact: true });
  await work.click();
  await expect(work).toHaveAttribute('aria-pressed', 'true');
  await expect(work).toHaveAttribute('aria-expanded', 'true');

  await navigation
    .getByRole('button', { name: 'New folder', exact: true })
    .click();
  await page.getByLabel('Folder name').fill('two/levels');
  await page.getByRole('button', { name: 'Make folder' }).click();
  await expect(
    page.getByText('A folder name cannot contain a slash.'),
  ).toBeVisible();
  await page.getByLabel('Folder name').fill(child);
  await page.getByRole('button', { name: 'Make folder' }).click();

  const plans = page.getByRole('button', { name: child, exact: true });
  await expect(plans).toHaveAttribute('aria-pressed', 'true');
  await navigation
    .getByRole('button', { name: 'New note', exact: true })
    .click();
  await page.waitForURL(/\/notes\/[0-9a-f-]+$/);
  await page.getByLabel('Note name').fill(noteName);
  await replaceEditorText(page, '# Nested note');
  await waitForServerSave(page);

  await page.reload();
  await expect(page.getByLabel('Note name')).toHaveValue(noteName);
  await openNavigation(page);
  const savedChild = page
    .getByRole('button', { name: child, exact: true })
    .locator('xpath=ancestor::li[1]');
  await expect(savedChild.getByRole('link', { name: noteName })).toBeVisible();
});

test('a note that moves into a folder stays there after the next edit', async ({
  checkedPage: page,
  stack,
}) => {
  await signIn(page, stack);
  await openPersonalWorkspace(page);
  const suffix = Date.now().toString();
  const folder = `archive-${suffix}`;
  const noteName = `moved-${suffix}`;
  const navigation = page.locator('#notes-sidebar');

  await openNavigation(page);
  await navigation
    .getByRole('button', { name: 'New folder', exact: true })
    .click();
  await page.getByLabel('Folder name').fill(folder);
  await page.getByRole('button', { name: 'Make folder' }).click();

  // The note starts at the top, so the move has somewhere to move it from.
  await navigation.getByRole('button', { name: 'All notes' }).click();
  await navigation
    .getByRole('button', { name: 'New note', exact: true })
    .click();
  await page.waitForURL(/\/notes\/[0-9a-f-]+$/);
  await page.getByLabel('Note name').fill(noteName);
  await replaceEditorText(page, '# Before the move');
  await waitForServerSave(page);

  await runNoteAction(page, 'Move this note to a folder');
  const dialog = page.getByRole('dialog', { name: 'Move to folder' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: folder, exact: true }).check();
  await dialog.getByRole('button', { name: 'Move note' }).click();
  await expect(dialog).toBeHidden();

  // The open editor keeps writing. Its next version must carry the new path,
  // so the note cannot leave the folder again.
  await replaceEditorText(page, '# After the move');
  await waitForServerSave(page);

  await page.reload();
  await expect(page.getByLabel('Note name')).toHaveValue(noteName);
  await openNavigation(page);
  const row = page
    .getByRole('button', { name: folder, exact: true })
    .locator('xpath=ancestor::li[1]');
  await expect(row.getByRole('link', { name: noteName })).toBeVisible();
});

test('a new folder lands inside the folder of the note that is open', async ({
  checkedPage: page,
  stack,
}) => {
  await signIn(page, stack);
  await openPersonalWorkspace(page);
  const suffix = Date.now().toString();
  const parent = `notes-${suffix}`;
  const child = `ideas-${suffix}`;
  const noteName = `entry-${suffix}`;
  const navigation = page.locator('#notes-sidebar');

  await openNavigation(page);
  await navigation
    .getByRole('button', { name: 'New folder', exact: true })
    .click();
  await page.getByLabel('Folder name').fill(parent);
  await page.getByRole('button', { name: 'Make folder' }).click();
  await navigation
    .getByRole('button', { name: 'New note', exact: true })
    .click();
  await page.waitForURL(/\/notes\/[0-9a-f-]+$/);
  await page.getByLabel('Note name').fill(noteName);
  await replaceEditorText(page, '# In the folder');
  await waitForServerSave(page);

  // The person selects the top, then opens the note again. Opening the note
  // is what decides the parent, so the folder below lands next to that note
  // and not at the top. This is the defect the journey covers.
  await openNavigation(page);
  await navigation.getByRole('button', { name: 'All notes' }).click();
  await navigation.getByRole('link', { name: noteName }).click();
  await page.waitForURL(/\/notes\/[0-9a-f-]+$/);

  await openNavigation(page);
  await navigation
    .getByRole('button', { name: 'New folder', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'New folder' });
  // The dialog states the parent, so the person reads where it lands.
  await expect(dialog).toContainText(`The folder goes inside ${parent}`);
  await page.getByLabel('Folder name').fill(child);
  await page.getByRole('button', { name: 'Make folder' }).click();

  const parentRow = page
    .getByRole('button', { name: parent, exact: true })
    .locator('xpath=ancestor::li[1]');
  await expect(
    parentRow.getByRole('button', { name: child, exact: true }),
  ).toBeVisible();
});

test('the folder row makes a folder inside that folder', async ({
  checkedPage: page,
  stack,
}) => {
  await signIn(page, stack);
  await openPersonalWorkspace(page);
  const suffix = Date.now().toString();
  const parent = `team-${suffix}`;
  const child = `plans-${suffix}`;
  const navigation = page.locator('#notes-sidebar');

  await openNavigation(page);
  await navigation
    .getByRole('button', { name: 'New folder', exact: true })
    .click();
  await page.getByLabel('Folder name').fill(parent);
  await page.getByRole('button', { name: 'Make folder' }).click();

  // The top is selected, so only the menu of the row can name this parent.
  await navigation.getByRole('button', { name: 'All notes' }).click();
  await page
    .getByRole('button', { name: `Actions for the folder ${parent}` })
    .click();
  await page
    .getByRole('menuitem', { name: 'New folder in this folder' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'New folder' });
  await expect(dialog).toContainText(`The folder goes inside ${parent}`);
  await page.getByLabel('Folder name').fill(child);
  await page.getByRole('button', { name: 'Make folder' }).click();

  const parentRow = page
    .getByRole('button', { name: parent, exact: true })
    .locator('xpath=ancestor::li[1]');
  await expect(
    parentRow.getByRole('button', { name: child, exact: true }),
  ).toBeVisible();
});
