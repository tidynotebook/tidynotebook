import assert from 'node:assert/strict';
import test from 'node:test';
import {
  firstScreenBudgetBytes,
  firstScreenCeilingBytes,
  withinFirstScreenBudget,
} from './performance/bundle-policy.ts';
await test('the budget keeps the owner-approved finite margin for reviewed UI fixes', () => {
  assert.equal(firstScreenBudgetBytes, 317_952);
  assert.ok(firstScreenBudgetBytes - 307_456 <= 10 * 1024 + 256);
  assert.equal(firstScreenBudgetBytes - 315_904, 2048);
  assert.equal(firstScreenBudgetBytes - 317_433, 519);
  assert.equal(firstScreenCeilingBytes, Math.floor(0.62 * 1024 * 1024));
});
await test('the limit accepts its boundary and refuses larger or invalid samples', () => {
  assert.equal(withinFirstScreenBudget(firstScreenBudgetBytes), true);
  for (const sample of [firstScreenBudgetBytes + 1, NaN, Infinity, -1])
    assert.equal(withinFirstScreenBudget(sample), false);
});
