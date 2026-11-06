import assert from 'node:assert/strict';
import test from 'node:test';
import {
  firstScreenBudgetBytes,
  firstScreenCeilingBytes,
  withinFirstScreenBudget,
} from './performance/bundle-policy.ts';
await test('the budget keeps the DS1 margin and documented two-byte asset-reference adjustment', () => {
  assert.equal(
    firstScreenBudgetBytes,
    Math.ceil((314_874 + 256) / 1024) * 1024 + 2,
  );
  assert.ok(firstScreenBudgetBytes - 307_456 < 8 * 1024);
  assert.equal(firstScreenCeilingBytes, Math.floor(0.62 * 1024 * 1024));
});
await test('the limit accepts its boundary and refuses larger or invalid samples', () => {
  assert.equal(withinFirstScreenBudget(firstScreenBudgetBytes), true);
  for (const sample of [firstScreenBudgetBytes + 1, NaN, Infinity, -1])
    assert.equal(withinFirstScreenBudget(sample), false);
});
