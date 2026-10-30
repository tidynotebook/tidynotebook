/** The first-screen JavaScript policy, shared by CI and production-build tests. */
export const firstScreenCeilingBytes = Math.floor(0.62 * 1024 * 1024);
// 2026-10-30, DS1: after route and interaction splitting, 314,874 gzip bytes.
// Sidebar/tree controls retain ui/primitives, layout, Region, Menu and their
// surface/type roles. Deferred actions retain a small immediate dialog frame.
// Login, Settings/Administration, calendar UI and action forms are deferred.
// The owner approved only the remaining gap plus a small margin: 314,874 +
// 256 bytes, rounded up to the next KiB, gives 315,392 (was 307,456).
export const firstScreenBudgetBytes = Math.min(
  firstScreenCeilingBytes,
  315_392,
);
export function withinFirstScreenBudget(bytes: number): boolean {
  return (
    Number.isFinite(bytes) && bytes >= 0 && bytes <= firstScreenBudgetBytes
  );
}
