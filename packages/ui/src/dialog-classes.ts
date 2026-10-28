/**
 * The classes of the one modal dialog, as pure functions.
 *
 * `dialog.tsx` is JSX, so no unit test can load it. The rule that keeps a
 * dialog inside the screen lives here, where `dialog-classes.test.ts` reads
 * it.
 *
 * A dialog is never taller than the screen. The panel takes the height that
 * the scrim leaves free and scrolls inside itself. Its title sticks to the
 * top and its action row to the bottom, so a long list, such as the keyboard
 * shortcuts, scrolls between them and a person always reads what the dialog
 * is and reaches its actions. The scrim itself does not scroll: when it did,
 * the title of a tall dialog scrolled off the screen with the list.
 *
 * The title and the action row take the card fill, so the text that scrolls
 * under them is covered. They separate by that fill and not by a rule, as the
 * three parts of a dialog always do (decision 0063).
 */

/**
 * How wide a dialog panel is.
 *
 * `screen` is no panel at all: the content fills the screen over a deeper
 * scrim, with no fill, edge or radius of its own. It is for content that a
 * person looks at rather than reads, such as a picture in the image viewer
 * (record 0145), and that content draws its own raised controls.
 *
 * `settings` is the modal of Settings (issue 517): a full-screen sheet on a
 * phone, and from the large width a panel of 940 by 620 px whose columns
 * scroll on their own, so the panel itself does not scroll.
 */
export type DialogWidth =
  'small' | 'medium' | 'large' | 'template' | 'settings' | 'screen';

/** Where a dialog panel sits on the screen. */
export type DialogAlign = 'top' | 'center' | 'sheet';

/** The scrim that holds the panel, as classes. */
export function dialogRootClassName(
  width: DialogWidth,
  align: DialogAlign,
): string {
  if (width === 'screen') return 'bg-scrim/80';
  if (width === 'settings')
    return 'bg-scrim/40 items-stretch lg:items-center lg:p-6';
  if (align === 'sheet') return 'bg-scrim/40 items-end lg:items-center lg:p-6';
  const position =
    align === 'center' ? 'items-center py-6' : 'items-start pb-6 pt-20';
  return `bg-scrim/40 px-gutter ${position}`;
}

/** The panel of a dialog, as classes. */
export function dialogPanelClassName(width: DialogWidth): string {
  if (width === 'screen') return 'relative h-full w-full text-ink outline-none';
  if (width === 'settings')
    return 'flex h-full max-h-full w-full flex-col overflow-hidden bg-card text-ink outline-none lg:h-settings lg:max-w-settings lg:rounded-xl lg:border lg:border-edge-subtle lg:shadow-modal';
  if (width === 'template')
    return 'flex h-full max-h-full w-full flex-col overflow-hidden rounded-t-xl border border-edge-subtle bg-card text-ink shadow-modal outline-none lg:h-template lg:max-w-3xl lg:rounded-xl';
  const measure =
    width === 'small'
      ? 'max-w-md'
      : width === 'large'
        ? 'max-w-3xl'
        : 'max-w-xl';
  return `w-full ${measure} max-h-full overflow-y-auto overscroll-contain rounded-xl border border-edge-subtle bg-card text-ink shadow-modal outline-none`;
}

/** The title of a dialog, as classes. */
export function dialogTitleClassName(hidden: boolean): string {
  return hidden
    ? 'sr-only'
    : 'sticky top-0 z-10 m-0 bg-card px-5 pb-1 pt-4 text-ui font-semibold text-strong';
}

/** The title row of a dialog that has controls next to its title. */
export function dialogHeaderClassName(): string {
  return 'sticky top-0 z-10 flex items-center gap-2 bg-card pb-1 pl-5 pr-3 pt-3';
}

/** The title inside the title row of {@link dialogHeaderClassName}. */
export function dialogHeaderTitleClassName(): string {
  return 'm-0 min-w-0 flex-1 truncate text-ui font-semibold text-strong';
}

/** The action row at the bottom of a dialog, as classes. */
export function dialogFooterClassName(): string {
  return 'sticky bottom-0 z-10 flex flex-wrap justify-end gap-cluster bg-card px-5 pb-4 pt-2';
}
