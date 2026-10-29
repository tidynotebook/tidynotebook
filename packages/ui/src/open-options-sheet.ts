/** Load the transient editor sheet only when the person requests it. */
export async function openOptionsSheet(
  title: string,
  options: readonly {
    readonly label: string;
    readonly read: () => boolean;
    readonly change: (checked: boolean) => void;
  }[],
): Promise<() => void> {
  const sheet = await import('./options-sheet.tsx');
  return sheet.openOptionsSheet(title, options);
}
