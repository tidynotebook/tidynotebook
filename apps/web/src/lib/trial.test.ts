import assert from 'node:assert/strict';
import test from 'node:test';
import { trialOffer, trialStatus } from './trial.ts';

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
    /trial has ended/,
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
