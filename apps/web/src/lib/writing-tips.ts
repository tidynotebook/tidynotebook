/** Compact help changes only when the person selects Next. */
export const writingTips = [
  'Type [[ to link a note.',
  'Templates save repeat typing.',
  'Search finds text in notes.',
  "Today's note is in the menu.",
  'Notes save on this device first.',
] as const;

/** Wrap to the first tip without changing the dismissal preference. */
export function nextWritingTip(current: number): number {
  return (current + 1) % writingTips.length;
}
