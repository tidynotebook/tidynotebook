/**
 * The solver of the proof of work of a sign-up (record 0115).
 *
 * The server issues a value and a difficulty. The browser counts up, digests
 * the value and each count with Web Crypto, and stops at the first digest
 * that starts with enough zero bits. The rule is the one of `packages/core`,
 * which the server reads as well. No third party takes part.
 */
import { leadingZeroBits, proofInput } from '@notesapp/core';

/** Digests one text with SHA-256. */
export type Digest = (text: string) => Promise<Uint8Array>;

/** The SHA-256 of Web Crypto. */
export const webDigest: Digest = async (text) =>
  new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
  );

/** Gives the browser one turn, so it draws a frame and takes input. */
export type Pause = () => Promise<void>;

/** The pause of a browser: one task later. */
const nextTask: Pause = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/** How many digests the solver computes between two pauses. */
export const digestsPerTurn = 256;

/**
 * Finds the first solution of one challenge.
 *
 * The digests run on the page, so the solver pauses after each batch and the
 * page keeps drawing its busy state and taking input while it works.
 */
export async function solveChallenge(
  value: string,
  difficulty: number,
  digest: Digest = webDigest,
  pause: Pause = nextTask,
): Promise<string> {
  for (let counter = 0; ; counter += 1) {
    if (counter > 0 && counter % digestsPerTurn === 0) await pause();
    const solution = counter.toString(36);
    if (
      leadingZeroBits(await digest(proofInput(value, solution))) >= difficulty
    )
      return solution;
  }
}
