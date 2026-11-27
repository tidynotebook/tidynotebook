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
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { pageGutter } from './public-layout.ts';
import { transitionRaise } from './motion.ts';
import { followToastPosition } from './toast-position.ts';

const ToastStackContext = createContext(false);

function ToastLayer({ children }: { readonly children: ReactNode }): ReactNode {
  const layer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (layer.current !== null) return followToastPosition(layer.current);
  }, []);
  return createPortal(
    <div
      ref={layer}
      data-toast-layer=""
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-60 flex flex-col items-center gap-2 pb-4 ${pageGutter}`}
    >
      {children}
    </div>,
    document.body,
  );
}

export function ToastStack({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <ToastStackContext.Provider value>
      <ToastLayer>{children}</ToastLayer>
    </ToastStackContext.Provider>
  );
}

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
  const stacked = useContext(ToastStackContext);
  const card = (
    <div
      role="status"
      className={`pointer-events-auto flex w-full max-w-md flex-wrap items-center gap-4 rounded-lg border border-overlay-edge bg-overlay p-3 coarse:p-4 text-body text-strong shadow-overlay ${transitionRaise}`}
    >
      <span
        className="min-w-0 flex-1 break-words coarse:basis-40"
        data-toast-message=""
      >
        {message}
      </span>
      {children}
    </div>
  );
  return stacked ? card : <ToastLayer>{card}</ToastLayer>;
}
