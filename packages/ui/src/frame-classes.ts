/** Shared geometry for document frames and their controls. */
import { pageRowClassName, pageSideClassName } from './layout-classes.ts';
import { controlStripClassName, focusOutline } from './control-classes.ts';
import { transitionSurface } from './motion.ts';
export function noteColumnClassName(): string {
  return 'self-center flex w-full max-w-note flex-col gap-1';
}
export function noteScreenClassName(): string {
  return 'flex overflow-hidden min-w-0 flex-1 flex-col';
}
export function noteFrameClassName(): string {
  return 'flex overflow-hidden min-w-0 flex-1 flex-col';
}
export function noteRowClassName(): string {
  return `${pageRowClassName()} overflow-hidden flex-1`;
}
export function noteSideRegionClassName(): string {
  return `${pageSideClassName()} overflow-hidden`;
}
export function noteOutlineScrollClassName(): string {
  return 'overflow-hidden overflow-y-auto overscroll-contain';
}
export function noteFooterClassName(typing: boolean): string {
  const base =
    'shrink-0 border-t border-edge-line px-2 py-2 text-secondary text-muted';
  return typing ? `${base} ${phoneTypingHiddenClassName}` : base;
}
export function formatToolbarFrameClassName(): string {
  return 'flex justify-center shrink-0 border-b border-edge-line px-2';
}
export function formatToolbarColumnClassName(): string {
  return 'w-full max-w-note';
}
export function formatToolbarClassName(): string {
  return `${controlStripClassName()} gap-1 md:gap-4`;
}
export function formatToolGroupClassName(): string {
  return 'flex shrink-0 items-center gap-1';
}
export function noteNameFieldClassName(): string {
  return `absolute inset-0 w-full min-w-0 max-w-full truncate rounded-md border-0 bg-transparent ${noteNameFieldText} text-strong outline-none ${transitionSurface} hover:bg-hover ${focusOutline}`;
}
export const noteNameFieldText = `px-1 py-1 text-body`;
export const noteNameFieldContainer = 'relative inline-grid min-w-0 max-w-full';
export const noteNameFieldMeasure = `invisible overflow-hidden whitespace-pre border-r border-transparent ${noteNameFieldText}`;
export function frameContentClassName(): string {
  return 'flex overflow-hidden flex-1 flex-col overflow-y-auto';
}
export function frameNoticeRowClassName(): string {
  return `${pageRowClassName()} shrink-0`;
}
const phoneTypingHiddenClassName = 'coarse:max-md:hidden';

export const syncStatusClassNames = {
  status: 'flex min-w-0 flex-1 items-start gap-2 py-1',
  dotFrame: 'flex h-5 shrink-0 items-center',
  line: 'min-w-0 flex-1 text-muted',
} as const;
