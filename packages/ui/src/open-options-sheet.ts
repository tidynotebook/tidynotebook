import type { openOptionsSheet as openSheet } from './options-sheet.tsx';

export type { OptionsSheetEvents } from './options-sheet.tsx';

/** Load the transient editor sheet only when the person requests it. */
export async function openOptionsSheet(
  ...args: Parameters<typeof openSheet>
): Promise<() => void> {
  const sheet = await import('./options-sheet.tsx');
  return sheet.openOptionsSheet(...args);
}
