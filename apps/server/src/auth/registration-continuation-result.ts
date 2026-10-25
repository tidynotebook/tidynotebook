/** Optional browser continuation must not undo a completed account operation. */
import { readProperty } from '../values.ts';

/** Publish cookies only after a successful, readable continuation response. */
export async function tryRegistrationContinuation(
  run: () => Promise<Response>,
  failed: () => void,
): Promise<{
  readonly cookies: readonly string[];
  readonly signedIn: boolean;
} | null> {
  try {
    const response = await run();
    if (!response.ok) {
      failed();
      return null;
    }
    const answer: unknown = await response.json();
    return {
      cookies: response.headers.getSetCookie(),
      signedIn: readProperty(answer, 'signedIn') === true,
    };
  } catch {
    // Do not pass error objects, proof values or response bodies to the logger.
    failed();
    return null;
  }
}
