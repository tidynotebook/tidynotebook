/** The sentinels report whether content is hidden at either end. */
export type ScrollEdges = { readonly start: boolean; readonly end: boolean };
export function scrollEdgesFrom(
  previous: ScrollEdges,
  entries: readonly {
    readonly target: unknown;
    readonly isIntersecting: boolean;
    readonly intersectionRatio: number;
  }[],
  start: unknown,
  end: unknown,
): ScrollEdges {
  let next = previous;
  for (const entry of entries) {
    const hidden = !entry.isIntersecting || entry.intersectionRatio < 1;
    if (entry.target === start) next = { ...next, start: hidden };
    if (entry.target === end) next = { ...next, end: hidden };
  }
  return next;
}
