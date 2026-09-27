import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { leadingZeroBits, proofInput } from '@notesapp/core';
import { createSignUpChallenges } from './proof-of-work.ts';

const secret = 'proof-test-secret-0123456789abcdefghij';
const now = new Date('2026-09-27T12:00:00.000Z');

/** Finds a solution the way a browser does, with a small difficulty. */
function solve(value: string, difficulty: number): string {
  for (let counter = 0; ; counter += 1) {
    const solution = counter.toString(36);
    const digest = createHash('sha256')
      .update(proofInput(value, solution))
      .digest();
    if (leadingZeroBits(digest) >= difficulty) return solution;
  }
}

/** A store of used digests in memory. */
function usedStore(): (digest: string) => Promise<boolean> {
  const seen = new Set<string>();
  return (digest) => {
    const first = !seen.has(digest);
    seen.add(digest);
    return Promise.resolve(first);
  };
}

await test('a solved challenge counts once', async () => {
  const challenges = createSignUpChallenges(secret, 8);
  const issued = challenges.issue(now);
  assert.equal(issued.difficulty, 8);
  const solution = solve(issued.value, 8);
  const markUsed = usedStore();
  const attempt = { challenge: issued.challenge, solution };
  assert.equal(await challenges.check(attempt, now, markUsed), null);
  assert.equal(await challenges.check(attempt, now, markUsed), 'reused');
});

await test('an expired, a forged and a weak proof are refused', async () => {
  const challenges = createSignUpChallenges(secret, 8);
  const issued = challenges.issue(now);
  const solution = solve(issued.value, 8);
  const later = new Date(now.getTime() + 11 * 60 * 1000);
  assert.equal(
    await challenges.check(
      { challenge: issued.challenge, solution },
      later,
      usedStore(),
    ),
    'expired',
  );
  // Another secret signed nothing of this challenge.
  assert.equal(
    await createSignUpChallenges(`${secret}-other`, 8).check(
      { challenge: issued.challenge, solution },
      now,
      usedStore(),
    ),
    'forged',
  );
  // A lower difficulty written into the challenge breaks its signature.
  const easier = issued.challenge.replace('.8.', '.1.');
  assert.equal(
    await challenges.check(
      { challenge: easier, solution: '0' },
      now,
      usedStore(),
    ),
    'forged',
  );
  assert.equal(
    await challenges.check(
      { challenge: 'v1.nothing', solution },
      now,
      usedStore(),
    ),
    'forged',
  );
  // A solution that does not reach the difficulty.
  const hard = createSignUpChallenges(secret, 28).issue(now);
  assert.equal(
    await challenges.check(
      { challenge: hard.challenge, solution: '0' },
      now,
      usedStore(),
    ),
    'insufficient',
  );
});
