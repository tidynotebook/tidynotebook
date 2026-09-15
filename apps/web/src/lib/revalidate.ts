/**
 * When a background read of the server list may run again.
 *
 * A screen asks the server for the note list again when the window takes
 * focus and when the device comes back online. Both events fire as often as a
 * person switches windows, so the rule below bounds them: one read, then a
 * quiet period, then the next read.
 *
 * The rule is separate from what the screen shows. A read that runs in the
 * background never empties the list it already holds and never puts a
 * placeholder back on the screen, because the person is looking at the list
 * while it runs. Only the first read of a notes area has nothing to show.
 */

/** The quiet period between two background reads, in milliseconds. */
export const revalidateIntervalMs = 5000;

/**
 * Reports whether a background read may run now.
 *
 * `lastAt` is the clock reading of the previous read, or `null` when none has
 * run yet. A clock that moves backwards, which a manual change of the device
 * clock does, releases the quiet period instead of holding it forever.
 */
export function shouldRevalidate(
  lastAt: number | null,
  now: number,
  intervalMs: number = revalidateIntervalMs,
): boolean {
  if (lastAt === null) return true;
  if (now < lastAt) return true;
  return now - lastAt >= intervalMs;
}
