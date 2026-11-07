import assert from 'node:assert/strict';
import test from 'node:test';
import {
  firstScreenBudgetBytes,
  firstScreenCeilingBytes,
  withinFirstScreenBudget,
} from './performance/bundle-policy.ts';
await test('the budget keeps the documented finite margin for floating find and replace', () => {
  assert.equal(firstScreenBudgetBytes, 315_648);
  assert.ok(firstScreenBudgetBytes - 307_456 <= 8 * 1024);
  assert.equal(firstScreenBudgetBytes - 315_394, 254);
  assert.equal(firstScreenCeilingBytes, Math.floor(0.62 * 1024 * 1024));
});
await test('the limit accepts its boundary and refuses larger or invalid samples', () => {
  assert.equal(withinFirstScreenBudget(firstScreenBudgetBytes), true);
  for (const sample of [firstScreenBudgetBytes + 1, NaN, Infinity, -1])
    assert.equal(withinFirstScreenBudget(sample), false);
});
