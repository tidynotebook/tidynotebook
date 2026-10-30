/** The public content frame. Put the gutter outside the capped container. */
export const pageGutter = 'px-6 coarse:px-4';

export const publicLayout = {
  gutter: `${pageGutter} flex flex-col items-center`,
  container: 'flex w-full max-w-5xl flex-col items-center',
  reading: 'w-full min-w-0 max-w-note',
} as const;
