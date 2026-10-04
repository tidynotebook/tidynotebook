import assert from 'node:assert/strict';
import test from 'node:test';
import { lockedAccountKeeps, lockedAccountOperations } from './locked.ts';

await test('a locked account keeps the way to pay, to export and to leave', () => {
  for (const kept of [
    'signInWithPassword',
    'signOut',
    'getAccount',
    'listWorkspaces',
    'exportWorkspace',
    'openAccountPortal',
    'openSyncNotices',
    'removeOwnAccount',
    'acceptLegalDocuments',
  ])
    assert.equal(lockedAccountKeeps(kept), true, kept);
});

await test('a locked account keeps nothing that the list does not name', () => {
  for (const refused of [
    'commitChangeset',
    'createWorkspace',
    'createPublishedLink',
    'uploadAttachment',
    'importWorkspace',
    'exportNote',
    'updateProfile',
    'updatePreferences',
    'listAccounts',
    'a new operation',
    '',
  ])
    assert.equal(lockedAccountKeeps(refused), false, refused);
  assert.equal(
    new Set(lockedAccountOperations).size,
    lockedAccountOperations.length,
  );
});
