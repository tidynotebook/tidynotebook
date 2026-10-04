/**
 * The readiness probe of an S3 store (record 0192).
 *
 * The port promises that a probe confirms that the store answers a read and
 * takes a write. A `HeadBucket` proves the read only: a key pair that may
 * see the bucket and may not write to it passes it, and then every upload
 * and every import fails. A write on each probe would cost a write every few
 * seconds, because a platform probes often, and record 0193 counts and caps
 * writes. So the probe writes, reads and removes one object at most once in
 * `writeCheckMs` for each process, and keeps the answer. In between it asks
 * the bucket only, and a bucket that does not answer fails the probe at once.
 * A failed write check is tried again after `failedWriteCheckMs`, so a short
 * fault of the service keeps a process out of service for a short time only.
 */

/** How long a passed write check holds. */
export const writeCheckMs = 10 * 60 * 1000;

/** How long a failed write check holds before the next one. */
export const failedWriteCheckMs = 60 * 1000;

/** What the probe calls. */
export type WriteProbeCalls = {
  /** Whether the bucket answers, by a call that writes nothing. */
  readonly head: () => Promise<boolean>;
  /** Writes, reads back and removes one probe object, or fails. */
  readonly writeReadRemove: () => Promise<void>;
  /** The clock in milliseconds. */
  readonly now: () => number;
};

/** The probe of one process. */
export function createWriteProbe(
  calls: WriteProbeCalls,
): () => Promise<boolean> {
  let checked: { readonly at: number; readonly passed: boolean } | null = null;
  return async () => {
    if (!(await calls.head())) return false;
    const now = calls.now();
    const holds =
      checked !== null &&
      now - checked.at < (checked.passed ? writeCheckMs : failedWriteCheckMs);
    if (checked !== null && holds) return checked.passed;
    let passed: boolean;
    try {
      await calls.writeReadRemove();
      passed = true;
    } catch {
      passed = false;
    }
    checked = { at: now, passed };
    return passed;
  };
}
