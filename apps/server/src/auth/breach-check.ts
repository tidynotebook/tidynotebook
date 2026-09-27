/**
 * The breach check of a new password (record 0116).
 *
 * The range service of Have I Been Pwned takes the first five characters of
 * the SHA-1 digest of a password and answers every suffix that shares them,
 * so the service never learns the password. This module holds the rule: what
 * leaves the server, how an answer is read, and what an answer that never
 * came means. The one request to the service is in `better-auth.ts`, the one
 * file of this server that speaks to another service.
 *
 * When the service does not answer, the check accepts the password and the
 * caller writes a log event, because an outage of a third party must not stop
 * every sign-up.
 */
import { createHash } from 'node:crypto';

/** What the check found. */
export type BreachOutcome = 'breached' | 'clear' | 'unavailable';

/** The part of a digest that leaves the server, and the part that stays. */
export function digestParts(password: string): {
  readonly prefix: string;
  readonly suffix: string;
} {
  const digest = createHash('sha1')
    .update(password, 'utf8')
    .digest('hex')
    .toUpperCase();
  return { prefix: digest.slice(0, 5), suffix: digest.slice(5) };
}

/**
 * Whether a range answer lists one suffix.
 *
 * Each line is `SUFFIX:COUNT`. A padded answer adds suffixes with a count of
 * zero, which name no breached password, so a zero count is no match.
 */
export function rangeLists(body: string, suffix: string): boolean {
  const wanted = suffix.toUpperCase();
  for (const line of body.split(/\r?\n/)) {
    const [candidate, count] = line.trim().split(':');
    if (candidate === undefined || count === undefined) continue;
    if (candidate.toUpperCase() !== wanted) continue;
    return Number(count) > 0;
  }
  return false;
}

/**
 * Reads the range of one prefix, or answers `null` when the service did not
 * answer in time or answered a failure.
 */
export type RangeQuery = (prefix: string) => Promise<string | null>;

/** Checks one new password against the range service. */
export async function checkBreach(
  password: string,
  query: RangeQuery,
): Promise<BreachOutcome> {
  const { prefix, suffix } = digestParts(password);
  let body: string | null;
  try {
    body = await query(prefix);
  } catch {
    body = null;
  }
  if (body === null) return 'unavailable';
  return rangeLists(body, suffix) ? 'breached' : 'clear';
}
