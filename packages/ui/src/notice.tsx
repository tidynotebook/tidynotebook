/**
 * A short message with one optional action.
 *
 * The notice is a live region, so assistive technology reads it without a
 * focus move. A `problem` notice is assertive because it reports something
 * the person must answer; every other tone is polite.
 *
 * A tone is a fill and a mark, and never a text colour alone. The fill is the
 * derived surface of that tone, and the mark is one icon in the tone colour,
 * so a person who does not separate the hues still reads which tone this is.
 * The message takes the strong text, which the contrast test holds on every
 * fill of the product, and the notice carries no edge: the fill is the
 * boundary. See
 * [decision 0065](../../../docs/decisions/0065-one-recipe-for-a-control-and-one-grid-for-an-icon.md).
 */
import type { ReactNode } from 'react';
import { AlertCircleIcon, CheckIcon, InfoIcon } from './icons.tsx';
import { Button } from './controls.tsx';

/** What kind of message the notice carries. */
export type NoticeTone = 'info' | 'success' | 'problem';

/** The fill, the mark colour and the mark of one tone. */
const tones: Readonly<
  Record<NoticeTone, { readonly classes: string; readonly mark: ReactNode }>
> = {
  info: {
    classes: 'bg-accent-surface text-accent',
    mark: <InfoIcon />,
  },
  success: {
    classes: 'bg-success-surface text-success',
    mark: <CheckIcon />,
  },
  problem: {
    classes: 'bg-danger-surface text-danger',
    mark: <AlertCircleIcon />,
  },
};

/** A live message row. */
export function Notice({
  tone = 'info',
  message,
  children,
  className,
  onDismiss,
}: {
  readonly tone?: NoticeTone | undefined;
  readonly message: string;
  /** Actions of the notice, such as Undo or Reload. */
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
  /** Removes the notice when the person selects Dismiss. */
  readonly onDismiss?: (() => void) | undefined;
}): ReactNode {
  const chosen = tones[tone];
  return (
    <div
      className={`flex flex-wrap items-center gap-group rounded-lg px-3 py-2.5 text-control ${chosen.classes} ${className ?? ''}`}
      role={tone === 'problem' ? 'alert' : 'status'}
      aria-live={tone === 'problem' ? 'assertive' : 'polite'}
    >
      <span className="inline-flex shrink-0 items-center" aria-hidden="true">
        {chosen.mark}
      </span>
      <span className="min-w-0 flex-1 text-strong">{message}</span>
      {children}
      {onDismiss === undefined ? null : (
        <Button onClick={onDismiss}>Dismiss</Button>
      )}
    </div>
  );
}
