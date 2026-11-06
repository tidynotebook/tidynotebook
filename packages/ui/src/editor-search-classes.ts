/** Shared composition for the editor's in-flow search controls. */
export const editorSearchClasses = {
  main: 'flex flex-wrap items-center gap-1',
  query: 'min-w-0 flex-1',
  controls: 'order-3 w-full @xl:order-2 @xl:w-auto',
  close: 'order-2 @xl:order-3',
  row: 'flex items-center gap-1',
  count: 'flex-1 whitespace-nowrap text-secondary text-muted @xl:flex-none',
  options: 'hidden @xl:contents',
  more: '@xl:hidden',
  replacement:
    'flex flex-col items-stretch gap-2 @xl:flex-row @xl:items-center',
  replaceField: 'min-w-0 @xl:flex-1',
  status: 'text-secondary text-muted',
  error: 'text-secondary text-danger',
  // The gap-2 action cluster of PageHeader and DialogFooter.
  actions: 'flex shrink-0 items-center gap-2',
  glyph: 'size-4 shrink-0',
} as const;
