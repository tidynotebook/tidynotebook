/** Fit measured columns without adding space beyond their content. */
export function fitTableColumns(
  natural: readonly number[],
  minimum: readonly number[],
  available: number,
): readonly number[] {
  const total = natural.reduce((sum, width) => sum + width, 0);
  const floor = minimum.reduce((sum, width) => sum + width, 0);
  if (total <= available || total <= floor) return natural;
  const fraction = Math.max(0, available - floor) / (total - floor);
  return natural.map((width, column) => {
    const min = minimum[column] ?? width;
    return min + (width - min) * Math.min(1, fraction);
  });
}
