/**
 * The one toast of the application.
 *
 * A toast reports what just happened and offers the one action that answers
 * it, for example Undo after a note moved to Trash. It is not a notice: a
 * notice belongs to the screen it sits on, and a toast stands over every
 * screen at the foot of the window until the person answers it or it goes.
 *
 * It is a raised surface: the card fill, the subtle edge and the overlay step
 * (decisions 0052 and 0063). It arrives with the named raise of the motion
 * scale (decision 0054), so it fades in and nothing moves under the pointer.
 *
 * The region is polite and it is not a dialog, so it never takes focus. A
 * person who is typing keeps typing, and the action is reachable by the
 * keyboard because it is a real button in the document order.
 *
 * The width is the reading measure of a short sentence with a gutter on both
 * sides, both from the named scale, so no screen writes a clamp of its own.
 */
import type { ReactNode } from 'react';
import { pageGutter } from './layout.tsx';
import { transitionRaise } from './motion.ts';

/**
 * A message at the foot of the window, with one action.
 *
 * `message` is one sentence. `children` is the one action, usually a `sm`
 * secondary button.
 */
export function Toast({
  message,
  children,
}: {
  readonly message: string;
  /** The one action of the toast, such as Undo. */
  readonly children?: ReactNode | undefined;
}): ReactNode {
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-gutter ${pageGutter}`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex w-full max-w-md flex-wrap items-center gap-group rounded-lg border border-edge-subtle bg-card px-3 py-3 text-body text-strong shadow-overlay ${transitionRaise}`}
      >
        <span className="min-w-0 flex-1">{message}</span>
        {children}
      </div>
    </div>
  );
}
