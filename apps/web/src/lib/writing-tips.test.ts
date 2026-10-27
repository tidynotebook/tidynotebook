import assert from 'node:assert/strict';
import test from 'node:test';
import { nextWritingTip, writingTips } from './writing-tips.ts';
await test('Next shows every compact tip and then returns to the first', () => {
  let tip = 0;
  const seen = new Set<number>();
  for (const text of writingTips) {
    seen.add(tip);
    assert.ok(text.split(/\s+/).length <= 6);
    tip = nextWritingTip(tip);
  }
  assert.equal(seen.size, writingTips.length);
  assert.equal(tip, 0);
});
