import type { Page } from '@playwright/test';
import { test, expect } from './support/stack.ts';
import { prepareCleanBrowser } from './support/browser-state.ts';
import {
  createNewNote,
  openNavigation,
  openPersonalWorkspace,
  replaceEditorText,
  signIn,
  waitForServerSave,
} from './support/account.ts';

// The service worker of the application answers with its own fetch, and a
// request that a worker makes never reaches the route below. This journey
// holds one answer open on purpose, so it runs without the worker.
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ context }) => prepareCleanBrowser(context));

/**
 * Holds every answer of one operation until the test lets it go.
 *
 * The screen then stays in its loading state for as long as the test needs,
 * and without a fixed delay: a call releases the answers, not a timer.
 */
async function holdAnswers(
  page: Page,
  pattern: string,
  onRequest: () => void = () => {},
): Promise<() => void> {
  let release = (): void => {};
  const held = new Promise<void>((accept) => {
    release = accept;
  });
  await page.route(pattern, async (route) => {
    onRequest();
    await held;
    await route.continue();
  });
  return release;
}

test('a screen that waits shows the shape of what follows', async ({
  checkedPage: page,
  stack,
}) => {
  // The note list is held from before sign in, so the first screen of the
  // session is still waiting when the assertions below run.
  const release = await holdAnswers(page, '**/api/workspaces/*/files?*');
  await signIn(page, stack);
  await openPersonalWorkspace(page);
  await openNavigation(page);

  // The placeholder states what loads, in one polite live region. The bars
  // that stand for the rows are decoration, so the sentence is the whole
  // message for assistive technology.
  const loading = page
    .getByRole('status')
    .filter({ hasText: 'Your notes are loading.' })
    .first();
  await expect(loading).toBeAttached();
  await expect(loading).toHaveAttribute('aria-busy', 'true');
  await expect(loading.locator('[aria-hidden="true"]')).toHaveCount(1);

  release();
  await expect(page.getByText('Your notes are loading.')).toHaveCount(0);
});

test('the tree keeps its notes when the window comes back', async ({
  checkedPage: page,
  stack,
}) => {
  await signIn(page, stack);
  await openPersonalWorkspace(page);
  await createNewNote(page);
  const noteName = `focus-${String(Date.now())}`;
  await page.getByLabel('Note name').fill(noteName);
  await replaceEditorText(page, '# Still here');
  await waitForServerSave(page);
  await openNavigation(page);

  const navigation = page.locator('#notes-sidebar');
  const row = navigation.getByRole('link', { name: noteName });
  await expect(row).toBeVisible();

  // Hold every later read of the note list, so the refresh that the window
  // focus starts is still running while the assertions below run.
  let reads = 0;
  const release = await holdAnswers(page, '**/api/workspaces/*/files?*', () => {
    reads += 1;
  });

  // The window focus refresh waits out a quiet period between reads, so the
  // event is sent until one read starts. This waits for a condition and not
  // for a clock.
  await expect
    .poll(async () => {
      await page.evaluate(() => {
        window.dispatchEvent(new Event('blur'));
        window.dispatchEvent(new Event('focus'));
      });
      return reads;
    })
    .toBeGreaterThan(0);

  // The defect this covers: a refresh emptied the note list and put the
  // placeholder over the tree, every time the person came back to the window.
  await expect(row).toBeVisible();
  await expect(navigation.getByText('Your notes are loading.')).toHaveCount(0);

  release();
  await expect(row).toBeVisible();
});
