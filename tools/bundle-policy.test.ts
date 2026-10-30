import assert from 'node:assert/strict';
import test from 'node:test';
import {
  firstScreenBudgetBytes,
  firstScreenCeilingBytes,
  withinFirstScreenBudget,
} from './performance/bundle-policy.ts';
await test('the approved DS1 allowance is the measured remainder and small rounded margin', () => {
  assert.equal(
    firstScreenBudgetBytes,
    Math.ceil((314_874 + 256) / 1024) * 1024,
  );
  assert.ok(firstScreenBudgetBytes - 307_456 < 8 * 1024);
  assert.equal(firstScreenCeilingBytes, Math.floor(0.62 * 1024 * 1024));
});
await test('the limit accepts its boundary and refuses larger or invalid samples', () => {
  assert.equal(withinFirstScreenBudget(firstScreenBudgetBytes), true);
  for (const sample of [firstScreenBudgetBytes + 1, NaN, Infinity, -1])
    assert.equal(withinFirstScreenBudget(sample), false);
});
