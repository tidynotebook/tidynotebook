import assert from 'node:assert/strict';
import test from 'node:test';
import type { Account } from '@notesapp/api-client';
import {
  accountReadOutcome,
  daysUntil,
  isLocked,
  lockedSentences,
} from './locked.ts';

const now = Date.parse('2026-10-04T12:00:00.000Z');

const controls: Account['controls'] = {
  revision: 1,
  standing: 'locked',
  removalAt: '2026-11-03T12:00:00.000Z',
  limitBytes: 1000,
  textLimitBytes: null,
  publishedTransferLimitBytes: null,
  downloadLimitBytes: null,
  features: { teams: true, collaboration: true },
};

await test('only a locked account opens the locked screen', () => {
  assert.equal(isLocked({ controls }), true);
  assert.equal(
    isLocked({
      controls: { ...controls, standing: 'active', removalAt: null },
    }),
    false,
  );
});

await test('the time to a removal reads in whole days', () => {
  assert.equal(daysUntil('2026-11-03T12:00:00.000Z', now), 'in 30 days');
  assert.equal(daysUntil('2026-10-05T11:00:00.000Z', now), 'in 1 day');
  assert.equal(daysUntil('2026-10-04T11:00:00.000Z', now), 'today');
  assert.equal(daysUntil('not an instant', now), null);
});

await test('the screen names the portal only when the installation has one', () => {
  assert.deepEqual(lockedSentences({ controls, accountPortal: true }, now), [
    'Your notes are safe, but you cannot change them now.',
    'Open the account portal to unlock the account.',
    'If the account stays locked, it and its notes are removed in 30 days.',
  ]);
  const plain = lockedSentences(
    { controls: { ...controls, removalAt: null }, accountPortal: false },
    now,
  );
  assert.deepEqual(plain, [
    'Your notes are safe, but you cannot change them now.',
    'Ask the administrator of this installation to unlock the account.',
  ]);
  // No sentence carries a raw instant or a code.
  for (const sentence of plain) assert.doesNotMatch(sentence, /\d{4}-|_/);
});

await test('a read of the account again adopts it, signs out a gone account, and keeps it through a failure', () => {
  const read = { startedIn: 3, finishedIn: 3 };
  assert.equal(
    accountReadOutcome({ ...read, status: 200, answered: true }),
    'adopt',
  );
  // The removal of a locked account ends its session, so the locked screen
  // goes to sign-in instead of standing still.
  assert.equal(
    accountReadOutcome({ ...read, status: 401, answered: false }),
    'signed-out',
  );
  assert.equal(
    accountReadOutcome({ ...read, status: 0, answered: false }),
    'keep',
  );
  assert.equal(
    accountReadOutcome({ ...read, status: 503, answered: false }),
    'keep',
  );
});

await test('a read that finishes after a sign-out or a new session is dropped', () => {
  // A notice started the read, and the person signed out before it answered,
  // so the old account must not come back.
  for (const status of [200, 401, 0])
    assert.equal(
      accountReadOutcome({
        status,
        answered: status === 200,
        startedIn: 3,
        finishedIn: 4,
      }),
      'drop',
    );
});
