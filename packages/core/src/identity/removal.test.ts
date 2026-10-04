import assert from 'node:assert/strict';
import test from 'node:test';
import {
  removalStep,
  runRemovals,
  type RemovalCandidate,
  type RemovalStore,
} from './removal.ts';

const now = new Date('2026-10-04T12:00:00.000Z');
const day = 24 * 60 * 60 * 1000;

function candidate(
  daysLeft: number,
  notices = 0,
  email: string | null = 'ada@example.test',
): RemovalCandidate {
  return {
    accountId: `account-${String(daysLeft)}-${String(notices)}`,
    email,
    removalAt: new Date(now.getTime() + daysLeft * day).toISOString(),
    notices,
  };
}

await test('a passed removal time removes the account', () => {
  assert.deepEqual(removalStep(candidate(0), now), { kind: 'remove' });
  assert.deepEqual(removalStep(candidate(-3, 2), now), { kind: 'remove' });
});

await test('a mail goes 30 days and 7 days before the removal, each once', () => {
  assert.deepEqual(removalStep(candidate(31), now), { kind: 'wait' });
  assert.deepEqual(removalStep(candidate(30), now), {
    kind: 'notice',
    notices: 1,
    days: 30,
  });
  assert.deepEqual(removalStep(candidate(12, 1), now), { kind: 'wait' });
  assert.deepEqual(removalStep(candidate(7, 1), now), {
    kind: 'notice',
    notices: 2,
    days: 7,
  });
  assert.deepEqual(removalStep(candidate(2, 2), now), { kind: 'wait' });
  // An account locked 5 days before its removal gets the nearest mail alone.
  assert.deepEqual(removalStep(candidate(5), now), {
    kind: 'notice',
    notices: 2,
    days: 5,
  });
});

/** A fake store over some candidates, which records each write. */
function storeOf(candidates: readonly RemovalCandidate[]): RemovalStore & {
  readonly removed: string[];
  readonly marked: string[];
} {
  const removed: string[] = [];
  const marked: string[] = [];
  return {
    removed,
    marked,
    removalCandidates: (horizon) => {
      assert.equal(horizon.getTime(), now.getTime() + 30 * day);
      return Promise.resolve(candidates);
    },
    removeDueAccount: (accountId) => {
      removed.push(accountId);
      return Promise.resolve(true);
    },
    markRemovalNotice: (accountId, notices) => {
      marked.push(`${accountId}:${String(notices)}`);
      return Promise.resolve(true);
    },
  };
}

await test('a run removes, mails and records, and a failed mail is tried again later', async () => {
  const due = candidate(-1);
  const soon = candidate(6, 1);
  const quiet = candidate(20, 1);
  const failing = { ...candidate(25), accountId: 'failing' };
  const store = storeOf([due, soon, quiet, failing]);
  const sent: string[] = [];
  const run = await runRemovals(
    store,
    (account, days) => {
      if (account.accountId === 'failing')
        return Promise.reject(new Error('the mail server is down'));
      sent.push(`${account.email}:${String(days)}`);
      return Promise.resolve();
    },
    now,
  );
  assert.deepEqual(run, { removed: 1, noticed: 1, failed: 1 });
  assert.deepEqual(store.removed, [due.accountId]);
  assert.deepEqual(sent, ['ada@example.test:6']);
  // A mail that failed is not recorded, so the next run sends it.
  assert.deepEqual(store.marked, [`${soon.accountId}:2`]);
});

await test('with no mail transport or no address the account is still removed at its time', async () => {
  const store = storeOf([candidate(-1), candidate(3, 0, null)]);
  const run = await runRemovals(store, null, now);
  assert.deepEqual(run, { removed: 1, noticed: 0, failed: 0 });
  assert.deepEqual(store.marked, []);
});
