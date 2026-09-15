import { test, expect } from './support/stack.ts';
import { prepareCleanBrowser } from './support/browser-state.ts';
import {
  createNewNote,
  openPersonalWorkspace,
  replaceEditorText,
  signIn,
  waitForServerSave,
} from './support/account.ts';

test.beforeEach(async ({ context }) => prepareCleanBrowser(context));

test('a task box stays a box on the line that is being written', async ({
  checkedPage: page,
  stack,
}) => {
  await signIn(page, stack);
  await openPersonalWorkspace(page);
  await createNewNote(page);
  await page.getByLabel('Note name').fill('Today');

  const editor = page.locator('.cm-content');
  await replaceEditorText(page, '# Today\n\n');
  await editor.press('Control+End');

  // The box appears as the item is written, and the caret never leaves the
  // line. This is the moment the old surface showed `- [ ]` instead.
  await editor.pressSequentially('- [ ] Look into the items');
  const box = page.getByRole('checkbox', { name: 'Task not done' });
  await expect(box).toBeVisible();
  await expect(editor).not.toContainText('- [ ]');

  // Ticking it from the same line writes the done marker and saves it.
  await box.click();
  const done = page.getByRole('checkbox', { name: 'Task done' });
  await expect(done).toBeVisible();
  await waitForServerSave(page);

  await page.reload();
  await expect(page.getByLabel('Note name')).toHaveValue('Today');
  await expect(page.getByRole('checkbox', { name: 'Task done' })).toBeVisible();
  await expect(page.locator('.cm-content')).not.toContainText('- [x]');
});

test('the caret on a task line keeps the box at every position', async ({
  checkedPage: page,
  stack,
}) => {
  await signIn(page, stack);
  await openPersonalWorkspace(page);
  await createNewNote(page);
  await replaceEditorText(page, '- [ ] one\n- [x] two\n');

  const editor = page.locator('.cm-content');
  await editor.press('Control+Home');
  for (let step = 0; step < 6; step += 1) {
    await expect(page.getByRole('checkbox')).toHaveCount(2);
    await editor.press('ArrowRight');
  }
  await expect(editor).not.toContainText('[ ]');
  await expect(editor).not.toContainText('[x]');
});
