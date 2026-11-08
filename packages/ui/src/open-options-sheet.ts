/** The id of the dialog panel of the sheet, for `aria-controls`. */
export const optionsSheetPanelId = 'editor-options-title-panel';

/** What the opener of the sheet learns, and where the focus goes back. */
export type OptionsSheetEvents = {
  /** Runs once when the sheet closes, by any road. */
  readonly onClose?: () => void;
  /** Gives the focus back on close, in place of the element that opened it. */
  readonly returnFocus?: () => void;
};

/** Load the transient editor sheet only when the person requests it. */
export async function openOptionsSheet(
  title: string,
  options: readonly {
    readonly label: string;
    readonly read: () => boolean;
    readonly change: (checked: boolean) => void;
  }[],
  events: OptionsSheetEvents = {},
): Promise<() => void> {
  const sheet = await import('./options-sheet.tsx');
  return sheet.openOptionsSheet(title, options, events);
}
