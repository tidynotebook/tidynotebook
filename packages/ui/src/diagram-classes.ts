/** The inline diagram leaves the note gestures to the browser. */
export const diagramBlockClasses = {
  framePadding: 'p-2',
  outer: 'notes-diagram min-w-0 w-full',
  header: 'flex h-8 items-center justify-between gap-2 coarse:h-11',
  caption: 'text-secondary text-muted',
  body: 'relative min-w-0 w-full',
  viewport:
    'min-w-0 w-full overflow-x-auto overflow-y-hidden overscroll-x-contain touch-auto coarse:max-h-diagram-inline',
  horizontalCue:
    'pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-app to-transparent',
  verticalCue:
    'pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-app to-transparent',
} as const;
