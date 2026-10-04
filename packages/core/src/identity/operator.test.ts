import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyActor } from './actor.ts';
import type { AccountControls, ControlsWrite } from './controls.ts';
import {
  findOperatorAccount,
  listAccountEvents,
  openAccountPortal,
  portalAddress,
  readOperatorTotals,
  redeemHandoff,
  removeOperatorAccount,
  setOperatorControls,
  usageMonth,
  type AccountEvent,
  type OperatorAccountRecord,
  type OperatorRemoval,
  type OperatorStore,
  type OperatorTransaction,
} from './operator.ts';

const now = new Date('2026-10-04T12:00:00.000Z');
const accountId = '11111111-1111-4111-8111-111111111111';
const digest = 'c'.repeat(64);

const controls: AccountControls = {
  revision: 2,
  standing: 'locked',
  removalAt: '2026-11-03T00:00:00.000Z',
  limitBytes: 1000n,
  textLimitBytes: null,
  publishedTransferLimitBytes: null,
  downloadLimitBytes: null,
  features: { teams: true, collaboration: true },
};

const record: OperatorAccountRecord = {
  accountId,
  email: 'ada@example.test',
  role: 'member',
  state: 'enabled',
  createdAt: '2026-10-04T10:00:00.000Z',
  controls,
  usage: {
    usedBytes: 10n,
    textBytes: 10n,
    month: '2026-10',
    publishedTransferBytes: 0n,
    downloadBytes: 0n,
  },
};

/** A fake operator store over one account, which records each call. */
function storeOf(
  account: OperatorAccountRecord | null,
  answers: {
    readonly write?: ControlsWrite;
    readonly removal?: OperatorRemoval;
  } = {},
): OperatorStore & {
  readonly calls: string[];
  readonly written: () => AccountControls | null;
} {
  const calls: string[] = [];
  let written: AccountControls | null = null;
  return {
    calls,
    written: () => written,
    operator<T>(run: (tx: OperatorTransaction) => Promise<T>): Promise<T> {
      let current = account;
      return run({
        findAccount: (email) => {
          calls.push(`find ${email}`);
          return Promise.resolve(
            current !== null && email === current.email
              ? current.accountId
              : null,
          );
        },
        account: (id, month) => {
          calls.push(`account ${month}`);
          return Promise.resolve(
            current !== null && id === current.accountId ? current : null,
          );
        },
        setControls: (_id, revision, next) => {
          calls.push(`write ${String(revision)}`);
          const outcome = answers.write ?? 'written';
          if (outcome === 'written' && current !== null) {
            written = next;
            current = {
              ...current,
              controls: { ...next, revision: revision + 1 },
            };
          }
          return Promise.resolve(outcome);
        },
        remove: () => Promise.resolve(answers.removal ?? 'removed'),
        totals: (month) =>
          Promise.resolve({
            month,
            publishedTransferBytes: 0n,
            downloadBytes: 0n,
            objectWrites: 0n,
            objectReads: 0n,
          }),
        events: (after, limit) => {
          calls.push(`events ${String(after)} ${String(limit)}`);
          const all: AccountEvent[] = [1, 2, 3].map((cursor) => ({
            cursor,
            accountId,
            kind: 'made',
            occurredAt: '2026-10-04T10:00:00.000Z',
          }));
          return Promise.resolve(
            all.filter((event) => event.cursor > after).slice(0, limit),
          );
        },
        redeemHandoff: (tokenDigest) =>
          Promise.resolve(
            tokenDigest === digest ? { accountId, email: record.email } : null,
          ),
      });
    },
  };
}

await test('the month of a count is the calendar month in UTC', () => {
  assert.equal(usageMonth(now), '2026-10');
  assert.equal(usageMonth(new Date('2026-10-31T23:59:59.999Z')), '2026-10');
  assert.equal(usageMonth(new Date('2026-11-01T00:00:00.000Z')), '2026-11');
});

await test('an account is found by its one written address', async () => {
  const store = storeOf(record);
  const found = await findOperatorAccount(store, ' ADA@example.test ', now);
  assert.deepEqual(found, { ok: true, value: record });
  assert.deepEqual(store.calls, ['find ada@example.test', 'account 2026-10']);
  assert.deepEqual(await findOperatorAccount(store, 'not an address', now), {
    ok: false,
    error: { code: 'not_found', fileIds: [] },
  });
  assert.deepEqual(
    await findOperatorAccount(storeOf(null), 'ada@example.test', now),
    { ok: false, error: { code: 'not_found', fileIds: [] } },
  );
});

await test('a control write unlocks an account and clears its removal time', async () => {
  const store = storeOf(record);
  const changed = await setOperatorControls(
    store,
    accountId,
    { revision: 2, standing: 'active' },
    now,
  );
  assert.ok(changed.ok);
  assert.equal(changed.value.controls.standing, 'active');
  assert.equal(changed.value.controls.removalAt, null);
  assert.equal(changed.value.controls.revision, 3);
  assert.deepEqual(store.calls.at(-2), 'write 2');
});

await test('a control write from an old revision writes nothing', async () => {
  const early = storeOf(record);
  assert.deepEqual(
    await setOperatorControls(
      early,
      accountId,
      { revision: 1, standing: 'active' },
      now,
    ),
    { ok: false, error: { code: 'controls_changed', fileIds: [] } },
  );
  assert.equal(early.written(), null);
  // A write that passed the read and lost the race in the database answers
  // the same.
  assert.deepEqual(
    await setOperatorControls(
      storeOf(record, { write: 'changed' }),
      accountId,
      { revision: 2, standing: 'active' },
      now,
    ),
    { ok: false, error: { code: 'controls_changed', fileIds: [] } },
  );
});

await test('an administrator is never locked', async () => {
  const store = storeOf({
    ...record,
    role: 'administrator',
    controls: { ...controls, standing: 'active', removalAt: null },
  });
  assert.deepEqual(
    await setOperatorControls(
      store,
      accountId,
      { revision: 2, standing: 'locked' },
      now,
    ),
    { ok: false, error: { code: 'forbidden', fileIds: [] } },
  );
  assert.equal(store.written(), null);
});

await test('a removal answers the refusal of the last administrator', async () => {
  assert.deepEqual(await removeOperatorAccount(storeOf(record), accountId), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(
    await removeOperatorAccount(
      storeOf(record, { removal: 'missing' }),
      accountId,
    ),
    { ok: false, error: { code: 'not_found', fileIds: [] } },
  );
  assert.deepEqual(
    await removeOperatorAccount(
      storeOf(record, { removal: 'last_administrator' }),
      accountId,
    ),
    { ok: false, error: { code: 'last_administrator', fileIds: [] } },
  );
});

await test('the totals name one month, the current one by default', async () => {
  const store = storeOf(record);
  const current = await readOperatorTotals(store, null, now);
  assert.ok(current.ok);
  assert.equal(current.value.month, '2026-10');
  assert.equal(current.value.objectReads, 0n);
  assert.deepEqual(await readOperatorTotals(store, '2026-13', now), {
    ok: false,
    error: { code: 'forbidden', fileIds: [] },
  });
});

await test('the events continue after a cursor and answer the next one', async () => {
  const store = storeOf(record);
  const first = await listAccountEvents(store, 0, 2);
  assert.ok(first.ok);
  assert.deepEqual(
    first.value.events.map((event) => event.cursor),
    [1, 2],
  );
  assert.equal(first.value.cursor, 2);
  const next = await listAccountEvents(store, first.value.cursor, 2);
  assert.ok(next.ok);
  assert.deepEqual(
    next.value.events.map((event) => event.cursor),
    [3],
  );
  // An empty page keeps the cursor that the reader named.
  const empty = await listAccountEvents(store, 3, null);
  assert.ok(empty.ok);
  assert.deepEqual(empty.value, { events: [], cursor: 3 });
  assert.deepEqual(store.calls.at(-1), 'events 3 100');
  await listAccountEvents(store, 0, 9000);
  assert.deepEqual(store.calls.at(-1), 'events 0 500');
});

await test('a handoff is redeemed by its digest and refuses any other shape', async () => {
  const store = storeOf(record);
  assert.deepEqual(await redeemHandoff(store, digest), {
    ok: true,
    value: { accountId, email: 'ada@example.test' },
  });
  assert.deepEqual(await redeemHandoff(store, 'd'.repeat(64)), {
    ok: false,
    error: { code: 'not_found', fileIds: [] },
  });
  assert.deepEqual(await redeemHandoff(store, 'not a digest'), {
    ok: false,
    error: { code: 'not_found', fileIds: [] },
  });
});

await test('the portal address keeps the path of the portal and adds the token', () => {
  assert.equal(
    portalAddress('https://billing.example.test', '/start', 'abc'),
    'https://billing.example.test/start?token=abc',
  );
  assert.equal(
    portalAddress('https://example.test/portal/', '/plans/', 'a-b_c'),
    'https://example.test/portal/plans/?token=a-b_c',
  );
});

await test('the portal opens only when the installation names one', async () => {
  const made = verifyActor(accountId, []);
  assert.ok(made.ok);
  const opened: string[] = [];
  const store = {
    account<T>(
      _actor: unknown,
      run: (tx: {
        openHandoff(tokenDigest: string): Promise<void>;
      }) => Promise<T>,
    ): Promise<T> {
      return run({
        openHandoff: (tokenDigest) => {
          opened.push(tokenDigest);
          return Promise.resolve();
        },
      });
    },
  };
  const input = { path: '/start', token: 'abc', tokenDigest: digest };
  assert.deepEqual(
    await openAccountPortal(store, made.value, { ...input, portal: null }),
    { ok: false, error: { code: 'not_found', fileIds: [] } },
  );
  assert.deepEqual(opened, []);
  assert.deepEqual(
    await openAccountPortal(store, made.value, {
      ...input,
      portal: 'https://billing.example.test',
    }),
    { ok: true, value: 'https://billing.example.test/start?token=abc' },
  );
  assert.deepEqual(opened, [digest]);
});
