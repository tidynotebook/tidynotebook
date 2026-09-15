import { test, expect } from './support/stack.ts';
import { prepareCleanBrowser } from './support/browser-state.ts';
import { openPersonalWorkspace, signIn } from './support/account.ts';

test.beforeEach(async ({ context }) => prepareCleanBrowser(context));

/** The phone viewport reaches the tree through the overlay, not this panel. */
const wideOnly = 768;

test('the sidebar hides, comes back, and keeps its width', async ({
  checkedPage: page,
  stack,
}) => {
  const viewport = page.viewportSize();
  test.skip(
    viewport === null || viewport.width < wideOnly,
    'The narrow frame has no fixed sidebar to size.',
  );

  await signIn(page, stack);
  await openPersonalWorkspace(page);
  const sidebar = page.locator('#notes-sidebar');
  await expect(sidebar).toBeVisible();

  const hide = page.getByRole('button', { name: 'Hide the sidebar' });
  await hide.click();
  await expect(sidebar).toBeHidden();
  // A hidden panel must leave the tab order, not only the screen.
  await expect(
    sidebar.getByRole('button', { name: 'New note', exact: true }),
  ).toBeHidden();

  // The choice survives a reload, because it belongs to the person.
  await page.reload();
  await expect(page.locator('#notes-sidebar')).toBeHidden();

  await page.getByRole('button', { name: 'Show the sidebar' }).click();
  await expect(page.locator('#notes-sidebar')).toBeVisible();
});

test('the sidebar edge sets the width without a pointer', async ({
  checkedPage: page,
  stack,
}) => {
  const viewport = page.viewportSize();
  test.skip(
    viewport === null || viewport.width < wideOnly,
    'The narrow frame has no fixed sidebar to size.',
  );

  await signIn(page, stack);
  await openPersonalWorkspace(page);
  const sidebar = page.locator('#notes-sidebar');
  const edge = page.getByRole('separator', { name: 'Sidebar width' });

  const before = (await sidebar.boundingBox())?.width ?? 0;
  expect(before).toBeGreaterThan(0);

  await edge.focus();
  await edge.press('ArrowRight');
  await expect
    .poll(async () => (await sidebar.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before);

  await edge.press('ArrowLeft');
  await expect
    .poll(async () => (await sidebar.boundingBox())?.width ?? 0)
    .toBe(before);

  // The width is a choice of the person, so it survives a reload.
  await edge.press('ArrowRight');
  const widened = (await sidebar.boundingBox())?.width ?? 0;
  await page.reload();
  await expect
    .poll(
      async () =>
        (await page.locator('#notes-sidebar').boundingBox())?.width ?? 0,
    )
    .toBe(widened);
});
