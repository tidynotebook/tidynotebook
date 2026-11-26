/** The rules that decide which workspace the application opens. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Workspace } from '@notesapp/api-client';
import {
  addressInWorkspace,
  chooseWorkspace,
  isMemberOf,
  parseCachedWorkspaces,
  workspaceAfterRemoval,
  workspaceChoiceKey,
  workspaceListKey,
} from './workspace-choice.ts';

function workspace(
  workspaceId: string,
  name: string,
  personal = false,
): Workspace {
  return { workspaceId, name, role: 'owner', personal };
}

const personal = workspace('ws-personal', 'Personal', true);
const work = workspace('ws-work', 'Work');
const side = workspace('ws-side', 'Side project');

await test('the stored choice of the device wins', () => {
  const chosen = chooseWorkspace([personal, work], 'ws-work');
  assert.equal(chosen?.workspaceId, 'ws-work');
});

await test('a device that never chose opens the personal workspace', () => {
  // The list is given work first, so a fallback that took the first row would
  // pass by accident.
  const chosen = chooseWorkspace([work, personal], null);
  assert.equal(chosen?.workspaceId, 'ws-personal');
});

await test('a stored workspace that is gone falls back instead of failing', () => {
  // Another device deleted it. This one must still open something.
  const chosen = chooseWorkspace([personal, work], 'ws-deleted');
  assert.equal(chosen?.workspaceId, 'ws-personal');
});

await test('a list with no personal workspace opens the first one', () => {
  const chosen = chooseWorkspace([work, side], null);
  assert.equal(chosen?.workspaceId, 'ws-work');
});

await test('an empty list chooses nothing', () => {
  assert.equal(chooseWorkspace([], 'ws-work'), null);
  assert.equal(chooseWorkspace([], null), null);
});

await test('membership decides whether an address may open', () => {
  assert.equal(isMemberOf([personal, work], 'ws-work'), true);
  assert.equal(isMemberOf([personal, work], 'ws-side'), false);
  assert.equal(isMemberOf([], 'ws-work'), false);
});

await test('a delete moves to the next workspace, not to the first', () => {
  const after = workspaceAfterRemoval([personal, work, side], 'ws-work');
  assert.equal(after?.workspaceId, 'ws-side');
});

await test('deleting the last row of the list moves to the one before it', () => {
  const after = workspaceAfterRemoval([personal, work, side], 'ws-side');
  assert.equal(after?.workspaceId, 'ws-work');
});

await test('a removal of a workspace that is not listed still answers one', () => {
  const after = workspaceAfterRemoval([personal, work], 'ws-unknown');
  assert.equal(after?.workspaceId, 'ws-personal');
});

await test('each account has its own settings keys', () => {
  assert.notEqual(workspaceChoiceKey('a'), workspaceChoiceKey('b'));
  assert.notEqual(workspaceChoiceKey('a'), workspaceListKey('a'));
});

await test('a cached list round trips', () => {
  const cached = parseCachedWorkspaces(JSON.stringify([personal, work]));
  assert.deepEqual(cached, [personal, work]);
});

await test('a cached value that is not a workspace list answers nothing', () => {
  for (const source of [
    null,
    '',
    'not json',
    '{}',
    '"text"',
    '[{"workspaceId":"ws-a"}]',
    '[{"workspaceId":"","name":"n","role":"owner","personal":false}]',
    '[{"workspaceId":"ws-a","name":"","role":"owner","personal":false}]',
    '[{"workspaceId":"ws-a","name":"n","role":"guest","personal":false}]',
    '[{"workspaceId":"ws-a","name":"n","role":"owner","personal":"yes"}]',
  ])
    assert.deepEqual(parseCachedWorkspaces(source), [], String(source));
});

await test('cached lists retain each shared workspace role', () => {
  for (const role of ['admin', 'editor', 'viewer']) {
    const shared = { ...work, role };
    assert.deepEqual(parseCachedWorkspaces(JSON.stringify([shared])), [shared]);
  }
});

await test('one broken row drops the whole cached list', () => {
  // A partly understood list must not become a shorter list that then looks
  // read, because a missing workspace reads as a workspace somebody deleted.
  const source = JSON.stringify([personal, { workspaceId: 'ws-work' }]);
  assert.deepEqual(parseCachedWorkspaces(source), []);
});

/** An address as the router states it, with no search and no hash. */
function at(
  pathname: string,
  search = '',
  hash = '',
): {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
} {
  return { pathname, search, hash };
}

await test('the root address opens the note list of the workspace', () => {
  assert.equal(addressInWorkspace('ws-work', at('/')), '/w/ws-work');
});

await test('an address with no workspace opens the same page under one', () => {
  // A link to Settings from before record 0091 names no workspace. It opens
  // Settings inside the frame, not a page that stands outside it.
  assert.equal(
    addressInWorkspace('ws-work', at('/settings')),
    '/w/ws-work/settings',
  );
  assert.equal(addressInWorkspace('ws-work', at('/trash')), '/w/ws-work/trash');
});

await test('an unknown address keeps its path under the workspace', () => {
  // The frame then shows Page not found, and the person still reads the
  // address they opened.
  assert.equal(
    addressInWorkspace('ws-work', at('/no/such/page')),
    '/w/ws-work/no/such/page',
  );
});

await test('the search and the hash of the address stay', () => {
  assert.equal(
    addressInWorkspace('ws-work', at('/settings', '?from=mail', '#export')),
    '/w/ws-work/settings?from=mail#export',
  );
});

await test('a repeated separator yields one separator after the workspace', () => {
  assert.equal(
    addressInWorkspace('ws-work', at('//settings')),
    '/w/ws-work/settings',
  );
});
