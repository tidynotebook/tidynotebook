/** Shared control composition for the editor's in-flow search panel. */
import { pageHeaderActionsClassName } from './layout-classes.ts';

export const editorSearchClasses = {
  count: 'whitespace-nowrap text-secondary text-muted',
  status: 'text-secondary text-muted',
  error: 'text-secondary text-danger',
  // Use the same action cluster as page headers and dialog footers.
  actions: pageHeaderActionsClassName('cluster'),
  glyph: 'size-4 shrink-0',
} as const;
