import assert from 'node:assert/strict';
import test from 'node:test';
import { buttonClassName } from '@notesapp/ui';
import { reloadLabel, routeErrorScreen } from './lib/route-error.ts';
import { startFailureMarkup } from './start-failure.ts';

await test('a start that did not load states the screen of a module that did not arrive', () => {
  // Record 0161. A module of the entry that did not arrive left a white
  // page, because no route boundary runs before React draws.
  const markup = startFailureMarkup('load');
  const screen = routeErrorScreen({
    scope: 'application',
    error: new Error('Importing a module script failed.'),
    pathname: '/',
    workspaceId: null,
  });
  assert.ok(markup.includes(screen.title), markup);
  assert.ok(markup.includes(screen.description), markup);
  assert.equal(screen.title, 'tidy notebook did not load');
});

await test('a start that stopped states the screen of an error', () => {
  const markup = startFailureMarkup('stop');
  assert.ok(markup.includes('tidy notebook stopped'), markup);
});

await test('each screen offers Reload as the one button of the recipe', () => {
  for (const cause of ['load', 'stop'] as const) {
    const markup = startFailureMarkup(cause);
    const buttons = markup.match(/<button\b[^>]*>/g) ?? [];
    assert.equal(buttons.length, 1);
    assert.ok(markup.includes(`>${reloadLabel}</span>`), markup);
    const classes =
      buttons[0]?.match(/class="([^"]+)"/)?.[1]?.split(/\s+/) ?? [];
    for (const token of buttonClassName({}).split(/\s+/).filter(Boolean))
      assert.ok(classes.includes(token), token);
    // The page script adds the one handler. The markup holds no script and
    // no inline handler, which the content policy of the shell refuses.
    assert.doesNotMatch(markup, /<script|\son[a-z]+=/i);
  }
});
