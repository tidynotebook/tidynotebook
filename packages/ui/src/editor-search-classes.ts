import { fieldClassName } from './control-classes.ts';

/** The floating editor search card. Width changes layout; pointer changes targets. */
export const editorSearchClasses = {
  card: 'absolute pointer-events-auto w-max max-w-full overflow-auto rounded-lg border border-overlay-edge bg-overlay text-strong shadow-overlay state-overlay p-1 grid grid-cols-editor-search items-center gap-1 @max-md:grid-cols-1',
  grid: 'contents @max-md:grid @max-md:grid-cols-editor-search @max-md:items-center @max-md:gap-1',
  main: 'flex items-center gap-2',
  grow: 'flex-auto',
  desktop: 'hidden items-center gap-1 @md:flex',
  phone: 'flex @md:hidden',
  tail: 'flex flex-1 items-center gap-1',
  expandedMain: 'flex items-center gap-2 @max-md:contents',
  navigation:
    'flex flex-1 items-center gap-1 @max-md:col-start-2 @max-md:row-start-1',
  expandedTail:
    'flex flex-1 items-center gap-1 @max-md:col-start-2 @max-md:row-start-2',
  replacement: 'min-w-0 w-full col-start-1 row-start-2',
  actions:
    'flex items-center gap-2 col-start-2 row-start-2 @max-md:col-start-1',
  count: 'shrink-0 whitespace-nowrap text-secondary text-muted',
  errorCount: 'shrink-0 whitespace-nowrap text-secondary text-danger',
} as const;

/** A shared field surface with an inline search count and a native input. */
export function countedFieldClassName(invalid = false): string {
  return `${fieldClassName({ invalid }).replaceAll('focus-visible:', 'has-focus-visible:')} flex min-w-0 items-center gap-2`;
}
