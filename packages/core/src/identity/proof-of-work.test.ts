import assert from 'node:assert/strict';
import test from 'node:test';
import {
  leadingZeroBits,
  maxProofDifficulty,
  minProofDifficulty,
  proofInput,
  proofRefusal,
  type ProofFacts,
} from './proof-of-work.ts';

const now = Date.parse('2026-09-27T12:00:00.000Z');

function facts(extra: Partial<ProofFacts> = {}): ProofFacts {
  return {
    signed: true,
    difficulty: 12,
    expiresAt: now + 60_000,
    used: false,
    // Twelve zero bits and then a one.
    digest: Uint8Array.from([0, 0x08, 0xff]),
    solution: '4711',
    ...extra,
  };
}

await test('a digest counts its leading zero bits', () => {
  assert.equal(leadingZeroBits(Uint8Array.from([0x80])), 0);
  assert.equal(leadingZeroBits(Uint8Array.from([0x01])), 7);
  assert.equal(leadingZeroBits(Uint8Array.from([0, 0x08])), 12);
  assert.equal(leadingZeroBits(Uint8Array.from([0, 0, 0])), 24);
  assert.equal(proofInput('abc', '12'), 'abc:12');
});

await test('a signed, live, unused and sufficient proof counts', () => {
  assert.equal(proofRefusal(facts(), now), null);
});

await test('a forged, an expired, a reused and a weak proof are refused', () => {
  assert.equal(proofRefusal(facts({ signed: false }), now), 'forged');
  assert.equal(
    proofRefusal(facts({ difficulty: minProofDifficulty - 1 }), now),
    'forged',
  );
  assert.equal(
    proofRefusal(facts({ difficulty: maxProofDifficulty + 1 }), now),
    'forged',
  );
  assert.equal(proofRefusal(facts({ expiresAt: now }), now), 'expired');
  assert.equal(proofRefusal(facts({ used: true }), now), 'reused');
  assert.equal(proofRefusal(facts({ difficulty: 13 }), now), 'insufficient');
  assert.equal(proofRefusal(facts({ solution: '' }), now), 'insufficient');
  assert.equal(
    proofRefusal(facts({ solution: 'x'.repeat(33) }), now),
    'insufficient',
  );
  // A forged challenge is refused before anything else of it is read.
  assert.equal(
    proofRefusal(facts({ signed: false, used: true, expiresAt: 0 }), now),
    'forged',
  );
});
