/**
 * The challenges of the proof of work of a sign-up (record 0115).
 *
 * This server issues each challenge and nobody else takes part. A challenge
 * is a random value, a difficulty and an expiry, signed with HMAC-SHA256 under
 * a key that HKDF derives from the secret of the server. The rule of a proof
 * lives in `packages/core`, so the browser and this server read one rule. This
 * file draws, signs and digests, and marks a challenge used through the store,
 * so one solution makes one account.
 */
import {
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import {
  proofInput,
  proofLifetimeMs,
  proofRefusal,
  type ProofRefusal,
} from '@notesapp/core';

/** The version mark of a challenge, so a later scheme can sit beside it. */
const challengeVersion = 'v1';

/** The purpose that the key derivation binds, so no other key equals it. */
const keyPurpose = 'notesapp sign-up challenge';

/** One issued challenge, in the shape of the contract. */
export type IssuedChallenge = {
  readonly challenge: string;
  readonly value: string;
  readonly difficulty: number;
  readonly expiresAt: string;
};

/** What a sign-up sends back. */
export type ProofAttempt = {
  readonly challenge: string;
  readonly solution: string;
};

/** Issues and checks the challenges of one server. */
export type SignUpChallenges = {
  issue(now: Date): IssuedChallenge;
  /**
   * Why a proof does not count, or `null` when it counts. A proof that
   * counts is marked used through `markUsed` before the answer, so a second
   * sign-up with it is refused.
   */
  check(
    attempt: ProofAttempt,
    now: Date,
    markUsed: (digest: string, expiresAt: Date) => Promise<boolean>,
  ): Promise<ProofRefusal | null>;
};

/** Builds the challenges of one server secret and one difficulty. */
export function createSignUpChallenges(
  secret: string,
  difficulty: number,
): SignUpChallenges {
  const key = Buffer.from(
    hkdfSync('sha256', secret, 'notesapp', keyPurpose, 32),
  );
  const sign = (body: string): string =>
    createHmac('sha256', key).update(body).digest('base64url');
  return {
    issue(now) {
      const value = randomBytes(16).toString('hex');
      const expiry = Math.floor((now.getTime() + proofLifetimeMs) / 1000);
      const body = `${challengeVersion}.${value}.${String(difficulty)}.${String(expiry)}`;
      return {
        challenge: `${body}.${sign(body)}`,
        value,
        difficulty,
        expiresAt: new Date(expiry * 1000).toISOString(),
      };
    },
    async check(attempt, now, markUsed) {
      const parts = attempt.challenge.split('.');
      const [version, value, level, expiry, signature] = parts;
      if (
        parts.length !== 5 ||
        version !== challengeVersion ||
        value === undefined ||
        level === undefined ||
        expiry === undefined ||
        signature === undefined ||
        !/^[0-9a-f]{32}$/.test(value) ||
        !/^\d{1,2}$/.test(level) ||
        !/^\d{1,12}$/.test(expiry)
      )
        return 'forged';
      const expected = Buffer.from(
        sign(`${version}.${value}.${level}.${expiry}`),
      );
      const given = Buffer.from(signature);
      const signed =
        given.length === expected.length && timingSafeEqual(given, expected);
      const expiresAt = Number(expiry) * 1000;
      const digest = createHash('sha256')
        .update(proofInput(value, attempt.solution))
        .digest();
      const facts = {
        signed,
        difficulty: Number(level),
        expiresAt,
        used: false,
        digest,
        solution: attempt.solution,
      };
      const refusal = proofRefusal(facts, now.getTime());
      if (refusal !== null) return refusal;
      // The digest of the whole challenge is the key, so a challenge counts
      // once whatever solution a second sign-up brings.
      const used = createHash('sha256').update(attempt.challenge).digest('hex');
      const first = await markUsed(used, new Date(expiresAt));
      return proofRefusal({ ...facts, used: !first }, now.getTime());
    },
  };
}
