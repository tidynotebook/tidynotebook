/**
 * The loading state of a screen.
 *
 * A screen that waits shows the shape of what comes next instead of one bare
 * sentence. The placeholder bars stand for the title and the lines that
 * arrive, so the frame does not jump when the content replaces them.
 *
 * The bars are decoration, so they carry `aria-hidden`. The sentence next to
 * them is the whole message for assistive technology: it sits in a polite
 * live region and it is read out without a focus move. The region also
 * carries `aria-busy`, so a screen reader knows the screen is not ready yet.
 *
 * The pulse runs only when the device accepts motion.
 */
import type { ReactNode } from 'react';

/** Which shape of screen the placeholder stands for. */
export type LoadingShape = 'screen' | 'note' | 'list';

/** The classes of one placeholder bar. */
function barClassName(width: string): string {
  return `h-4 rounded-md bg-hover ${width}`;
}

/** The widths of the text lines, so no two neighbours match. */
const lineWidths = ['w-full', 'w-11/12', 'w-4/5', 'w-2/3', 'w-3/4'];

/** The text lines of a paragraph placeholder. */
function Lines({ count }: { readonly count: number }): ReactNode {
  return (
    <>
      {Array.from({ length: count }, (_unused, index) => (
        <div
          key={index}
          className={barClassName(lineWidths[index % lineWidths.length] ?? '')}
        />
      ))}
    </>
  );
}

/** The rows of a list placeholder, each with its own leading mark. */
function Rows({ count }: { readonly count: number }): ReactNode {
  return (
    <>
      {Array.from({ length: count }, (_unused, index) => (
        <div key={index} className="flex min-h-8 items-center gap-group">
          <div className="size-4 shrink-0 rounded-md bg-hover" />
          <div
            className={barClassName(
              lineWidths[index % lineWidths.length] ?? '',
            )}
          />
        </div>
      ))}
    </>
  );
}

/**
 * The placeholder of one screen that loads.
 *
 * `screen` stands for a page with a title and a few lines, `note` for the
 * note surface, and `list` for a list of rows. `rows` sets how many lines or
 * rows the placeholder draws.
 */
export function LoadingState({
  label,
  shape = 'screen',
  rows = 4,
}: {
  /** The one sentence that states what loads. */
  readonly label: string;
  readonly shape?: LoadingShape | undefined;
  readonly rows?: number | undefined;
}): ReactNode {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div
        className="flex flex-col gap-group motion-safe:animate-pulse"
        aria-hidden="true"
      >
        {shape === 'list' ? (
          <Rows count={rows} />
        ) : (
          <>
            <div
              className={
                shape === 'note'
                  ? 'h-8 w-1/2 rounded-lg bg-hover'
                  : 'h-6 w-1/3 rounded-lg bg-hover'
              }
            />
            <Lines count={rows} />
          </>
        )}
      </div>
    </div>
  );
}
