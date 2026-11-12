/** Shared geometry for document frames and their controls. */
import { fixedRegionClasses } from './scroll-classes.ts';
import { pageRowClassName, pageSideClassName } from './layout-classes.ts';
import { controlStripClassName, focusOutline } from './control-classes.ts';
import { transitionSurface } from './motion.ts';
import { pageGutter } from './public-layout.ts';
export function noteColumnClassName(): string {
  return 'self-center flex w-full max-w-note flex-col gap-1';
}
export function noteScreenClassName(): string {
  return 'flex overflow-hidden min-w-0 flex-1 flex-col';
}
export function noteFrameClassName(): string {
  return 'flex overflow-hidden min-w-0 flex-1 flex-col';
}
/** Keep the editor bounded when phone find controls need visible overflow. */
export function noteEditorHostClassName(): string {
  return 'min-h-0 flex-1 overflow-hidden max-lg:pointer-coarse:overflow-visible';
}
/** The visible note side region owns the right edge of the frame. */
export function noteEditorGutterClassName(): string {
  return `${pageGutter} xl:pr-0 coarse:xl:pr-0`;
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
  const base = `flex flex-col shrink-0 px-2 py-2 text-secondary text-muted ${fixedRegionClasses('top')}`;
  return typing ? `${base} ${phoneTypingHiddenClassName}` : base;
}
export function formatToolbarFrameClassName(): string {
  return `flex justify-center shrink-0 px-2 ${fixedRegionClasses('bottom')}`;
}
export function formatToolbarColumnClassName(): string {
  return 'flex min-w-0 w-full max-w-note';
}
export function formatToolbarClassName(): string {
  return `${controlStripClassName()} min-w-0 flex-1 gap-1 md:gap-4`;
}
/** Passive cues have their own space and never cover a tool. */
export function formatToolbarCueClassName(visible: boolean): string {
  const base =
    'pointer-events-none flex w-4 shrink-0 items-center justify-center text-muted';
  return visible ? base : `${base} invisible`;
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
