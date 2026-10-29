import assert from 'node:assert/strict';
import test from 'node:test';
import { scrollEdgesFrom } from './scroll-edges.ts';
await test('scroll edges follow the top, middle and end sentinels', () => {
  const start = {},
    end = {};
  const entry = (target: unknown, intersectionRatio: number) => ({
    target,
    intersectionRatio,
    isIntersecting: intersectionRatio > 0,
  });
  const top = scrollEdgesFrom(
    { start: false, end: false },
    [entry(start, 1), entry(end, 0)],
    start,
    end,
  );
  assert.deepEqual(top, { start: false, end: true });
  const middle = scrollEdgesFrom(top, [entry(start, 0)], start, end);
  assert.deepEqual(middle, { start: true, end: true });
  assert.deepEqual(scrollEdgesFrom(middle, [entry(end, 1)], start, end), {
    start: true,
    end: false,
  });
  assert.deepEqual(
    scrollEdgesFrom(top, [entry(start, 0.5), entry({}, 1)], start, end),
    { start: true, end: true },
  );
});
