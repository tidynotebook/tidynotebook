import assert from 'node:assert/strict';
import test from 'node:test';
import { createTrialRecheck, trialOffer, trialStatus } from './trial.ts';

await test('only an opted-in installation offers a trial for new accounts', () => {
  assert.equal(trialOffer(null), null);
  assert.match(trialOffer(14 * 86400) ?? '', /14 days from account creation/);
  assert.match(trialOffer(14 * 86400) ?? '', /No card is required/);
  assert.match(trialOffer(14 * 86400) ?? '', /no automatic charge/);
});

await test('the trial notice changes at the exact deadline and never grants a trial to existing accounts', () => {
  const end = '2026-11-07T12:00:00.000Z';
  const now = Date.parse(end);
  assert.equal(
    trialStatus({ trialEndsAt: null, trialState: 'none' }, now),
    null,
  );
  assert.equal(
    trialStatus({ trialEndsAt: end, trialState: 'ended' }, now),
    null,
  );
  assert.match(
    trialStatus({ trialEndsAt: end, trialState: 'active' }, now - 1) ?? '',
    /Time left: less than 1 minute/,
  );
  assert.match(
    trialStatus({ trialEndsAt: end, trialState: 'active' }, now) ?? '',
    /Checking your trial access/,
  );
  assert.match(
    trialStatus({ trialEndsAt: end, trialState: 'expired' }, now - 1) ?? '',
    /trial has ended/,
  );
});

await test('remaining time uses minutes near expiry', () => {
  const end = '2026-11-07T12:00:00.000Z';
  const controls = { trialEndsAt: end, trialState: 'active' } as const;
  const now = Date.parse(end);
  assert.match(trialStatus(controls, now - 60000) ?? '', /Time left: 1 minute/);
  assert.match(
    trialStatus(controls, now - 2 * 60000) ?? '',
    /Time left: 2 minutes/,
  );
  assert.match(trialStatus(controls, now - 3600000) ?? '', /Time left: 1 hour/);
});

await test('trial offers use exact durations and singular units', () => {
  for (const [seconds, expected] of [
    [86400, '1 day'],
    [3600, '1 hour'],
    [60, '1 minute'],
    [1, '1 second'],
    [3601, '3601 seconds'],
    [120, '2 minutes'],
  ] as const) {
    assert.match(
      trialOffer(seconds) ?? '',
      new RegExp(`for ${expected} from account creation`),
    );
  }
});

await test('clock-ahead retries remain bounded through account adoption and focus', () => {
  let reads = 0;
  const check = createTrialRecheck(() => {
    reads += 1;
  });
  assert.equal(check(1000), 30000);
  // Repeated account adoption and focus use the same request gate.
  for (let i = 0; i < 100; i += 1) assert.equal(check(1000), 30000);
  assert.equal(check(1001), 29999);
  assert.equal(check(30999), 1);
  assert.equal(reads, 1);
  assert.equal(check(31000), 30000);
  assert.equal(reads, 2);
});

await test('a synchronous adoption cannot reenter an unrecorded request', () => {
  let reads = 0;
  const check = createTrialRecheck(() => {
    reads += 1;
    assert.equal(check(1000), 30000);
  });
  assert.equal(check(1000), 30000);
  assert.equal(reads, 1);
});

await test('retry intervals ignore forward and backward wall clock changes', (context) => {
  let wallTime = 1000;
  context.mock.method(Date, 'now', () => wallTime);
  const reads: number[] = [];
  const check = createTrialRecheck(() => {
    reads.push(Date.now());
  });
  check(1000);
  wallTime += 15 * 86400000;
  assert.equal(check(1001), 29999);
  wallTime = -100000;
  assert.equal(check(2000), 29000);
  assert.deepEqual(reads, [1000]);
  assert.equal(check(31000), 30000);
  assert.deepEqual(reads, [1000, -100000]);
});
