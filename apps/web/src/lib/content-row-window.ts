/** Offsets for rows whose height comes from their content, including each gap. */
export function contentRowOffsets(
  heights: readonly number[],
  gap: number,
): number[] {
  const offsets = [0];
  for (const height of heights)
    offsets.push((offsets.at(-1) ?? 0) + height + gap);
  return offsets;
}

/** The window around the view, using measured offsets instead of one stride. */
export function contentRowWindow(
  offsets: readonly number[],
  top: number,
  height: number,
  overscan: number,
): { start: number; end: number; before: number; after: number } {
  const count = Math.max(0, offsets.length - 1);
  const indexAt = (position: number): number => {
    let low = 0;
    let high = count;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if ((offsets[middle + 1] ?? 0) <= position) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const start = Math.max(0, indexAt(Math.max(0, top)) - overscan);
  const end = Math.min(
    count,
    Math.max(start, indexAt(Math.max(0, top + height)) + 1 + overscan),
  );
  return {
    start,
    end,
    before: offsets[start] ?? 0,
    after: (offsets[count] ?? 0) - (offsets[end] ?? 0),
  };
}
