import assert from 'node:assert/strict';
import test from 'node:test';
import { leadingZeroBits, proofInput } from '@notesapp/core';
import { digestsPerTurn, solveChallenge, webDigest } from './proof-of-work.ts';

await test('the solver finds a solution that reaches the difficulty', async () => {
  const value = '0123456789abcdef0123456789abcdef';
  const solution = await solveChallenge(value, 10);
  assert.match(solution, /^[0-9a-z]+$/);
  const digest = await webDigest(proofInput(value, solution));
  assert.ok(leadingZeroBits(digest) >= 10);
});

await test('the solver stops at the first solution', async () => {
  // A digest that reaches the difficulty on the third count only.
  let calls = 0;
  const solution = await solveChallenge('v', 8, (text) => {
    calls += 1;
    return Promise.resolve(
      Uint8Array.from(text === 'v:2' ? [0, 0xff] : [0xff]),
    );
  });
  assert.equal(solution, '2');
  assert.equal(calls, 3);
});

await test('the solver gives the page a turn after each batch', async () => {
  let pauses = 0;
  const target = `v:${(digestsPerTurn * 2 + 5).toString(36)}`;
  await solveChallenge(
    'v',
    8,
    (text) => Promise.resolve(Uint8Array.from(text === target ? [0, 1] : [1])),
    () => {
      pauses += 1;
      return Promise.resolve();
    },
  );
  assert.equal(pauses, 2);
});
