/**
 * The proof of work of a sign-up (record 0115).
 *
 * The server issues a challenge: a random value, a difficulty and an expiry,
 * signed with a key of the server. The browser finds a solution whose digest
 * starts with as many zero bits as the difficulty names. The server checks the
 * signature, the expiry, the solution, and that nobody used the challenge
 * before, so one solution makes one account.
 *
 * This module holds the rule and nothing that computes a digest or a
 * signature, so the server and the browser share it and a unit test states
 * every refusal. The caller computes the digest of the solution and tells
 * whether the signature is valid and whether the challenge was used.
 */

/** The fewest leading zero bits that a configured difficulty may ask for. */
export const minProofDifficulty = 8;

/** The most leading zero bits that a configured difficulty may ask for. */
export const maxProofDifficulty = 28;

/** The difficulty of an installation that names none. */
export const defaultProofDifficulty = 16;

/** How long a challenge works, in milliseconds. */
export const proofLifetimeMs = 10 * 60 * 1000;

/** The longest solution that a sign-up may carry, in characters. */
export const maxProofSolutionLength = 32;

/** Why a proof does not count. */
export type ProofRefusal = 'forged' | 'expired' | 'reused' | 'insufficient';

/** How many zero bits a digest starts with. */
export function leadingZeroBits(digest: Uint8Array): number {
  let bits = 0;
  for (const byte of digest) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

/** The text whose digest a solution must reduce. */
export function proofInput(challengeValue: string, solution: string): string {
  return `${challengeValue}:${solution}`;
}

/** What the caller learned about one proof. */
export type ProofFacts = {
  /** Whether the signature of the server covers the challenge. */
  readonly signed: boolean;
  /** The difficulty that the challenge names. */
  readonly difficulty: number;
  /** The instant that the challenge stops, in milliseconds. */
  readonly expiresAt: number;
  /** Whether a sign-up already used the challenge. */
  readonly used: boolean;
  /** The digest of the proof input of the solution. */
  readonly digest: Uint8Array;
  /** The solution as the browser sent it. */
  readonly solution: string;
};

/**
 * Why one proof does not count, or `null` when it counts.
 *
 * A forged challenge is refused first, because nothing else of it can be
 * trusted. An expired one is refused next, so a used digest need not be kept
 * after the expiry.
 */
export function proofRefusal(
  facts: ProofFacts,
  now: number,
): ProofRefusal | null {
  if (!facts.signed) return 'forged';
  if (
    !Number.isInteger(facts.difficulty) ||
    facts.difficulty < minProofDifficulty ||
    facts.difficulty > maxProofDifficulty
  )
    return 'forged';
  if (facts.expiresAt <= now) return 'expired';
  if (facts.used) return 'reused';
  if (
    facts.solution === '' ||
    facts.solution.length > maxProofSolutionLength ||
    leadingZeroBits(facts.digest) < facts.difficulty
  )
    return 'insufficient';
  return null;
}
