import assert from 'node:assert/strict';
import test from 'node:test';
import type { Account } from '@notesapp/api-client';
import {
  accountReadOutcome,
  createAccountRecheck,
  daysUntil,
  isLocked,
  lockedSentences,
  signedInSentence,
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

await test('the line under the card names the account that is signed in', () => {
  assert.equal(signedInSentence('a@example.com'), 'Signed in as a@example.com');
  // An account with no address still reads a whole sentence.
  assert.equal(signedInSentence(null), 'You are signed in.');
  assert.equal(signedInSentence(undefined), 'You are signed in.');
  assert.equal(signedInSentence('  '), 'You are signed in.');
});

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
    'Open billing to unlock the account.',
    'If the account stays locked, it and its notes are deleted in 30 days.',
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

type Standing = 'active' | 'locked';

/** A recheck whose reads answer when the test says. */
function recheckHarness(): {
  readonly ask: () => void;
  readonly reads: ((answer: Standing | 'gone' | Error) => Promise<void>)[];
  readonly adopted: Standing[];
  readonly signOuts: number[];
  readonly epoch: { value: number };
} {
  const reads: ((answer: Standing | 'gone' | Error) => Promise<void>)[] = [];
  const adopted: Standing[] = [];
  const signOuts: number[] = [];
  const epoch = { value: 1 };
  const ask = createAccountRecheck<Standing>({
    read: () =>
      new Promise((resolve, reject) => {
        reads.push(async (answer) => {
          if (answer instanceof Error) reject(answer);
          else if (answer === 'gone')
            resolve({ status: 401, account: undefined });
          else resolve({ status: 200, account: answer });
          // Let the read settle and start the next one.
          await new Promise((settled) => setImmediate(settled));
        });
      }),
    epoch: () => epoch.value,
    adopt: (account) => adopted.push(account),
    signOut: () => signOuts.push(epoch.value),
  });
  return { ask, reads, adopted, signOuts, epoch };
}

await test('a notice that comes while a read runs reads the account once more', async () => {
  const recheck = recheckHarness();
  recheck.ask();
  assert.equal(recheck.reads.length, 1);
  // The account is unlocked while the first read runs, and two notices say
  // so. The first read can carry the old state, so one more read must run.
  recheck.ask();
  recheck.ask();
  assert.equal(recheck.reads.length, 1);
  await recheck.reads[0]?.('locked');
  assert.equal(recheck.reads.length, 2);
  await recheck.reads[1]?.('active');
  assert.deepEqual(recheck.adopted, ['locked', 'active']);
  // With no notice after it, no read follows.
  assert.equal(recheck.reads.length, 2);
});

await test('a failed read still lets the next notice read the account', async () => {
  const recheck = recheckHarness();
  recheck.ask();
  recheck.ask();
  await recheck.reads[0]?.(new Error('offline'));
  assert.equal(recheck.reads.length, 2);
  await recheck.reads[1]?.('gone');
  assert.deepEqual(recheck.signOuts, [1]);
  recheck.ask();
  assert.equal(recheck.reads.length, 3);
});

await test('a sign-out drops the read that runs and the read that waits', async () => {
  const recheck = recheckHarness();
  recheck.ask();
  recheck.ask();
  recheck.epoch.value += 1;
  await recheck.reads[0]?.('locked');
  // The waiting read was asked for the old session, so it does not run: a
  // read before the sign-out ends could bring the old account back.
  assert.equal(recheck.reads.length, 1);
  assert.deepEqual(recheck.adopted, []);
  recheck.ask();
  await recheck.reads[1]?.('active');
  assert.deepEqual(recheck.adopted, ['active']);
});
