import assert from 'node:assert/strict';
import test from 'node:test';
import { revalidateIntervalMs, shouldRevalidate } from './revalidate.ts';

await test('the first background read always runs', () => {
  assert.equal(shouldRevalidate(null, 0), true);
  assert.equal(shouldRevalidate(null, 1_000_000), true);
});

await test('a second read waits out the quiet period', () => {
  assert.equal(shouldRevalidate(1000, 1000), false);
  assert.equal(shouldRevalidate(1000, 1000 + revalidateIntervalMs - 1), false);
  assert.equal(shouldRevalidate(1000, 1000 + revalidateIntervalMs), true);
});

await test('a clock that moves backwards releases the quiet period', () => {
  // A person can set the device clock back. Holding the period against a
  // reading from the future would stop every later read of the session.
  assert.equal(shouldRevalidate(10_000, 500), true);
});
