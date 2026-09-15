/**
 * A short message with one optional action.
 *
 * The notice is a live region, so assistive technology reads it without a
 * focus move. A `problem` notice is assertive because it reports something
 * the person must answer; every other tone is polite.
 */
import type { ReactNode } from 'react';

/** What kind of message the notice carries. */
export type NoticeTone = 'info' | 'success' | 'problem';

/** A live message row. */
export function Notice({
  tone = 'info',
  message,
  children,
  className,
}: {
  readonly tone?: NoticeTone | undefined;
  readonly message: string;
  /** Actions of the notice, such as Undo or Reload. */
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
}): ReactNode {
  const toneClass =
    tone === 'problem'
      ? 'border-danger/40 text-danger'
      : tone === 'success'
        ? 'border-success/40 text-success'
        : 'border-edge text-ink';
  return (
    <div
      className={`flex flex-wrap items-center gap-group rounded-lg border bg-card px-3 py-2 text-control ${toneClass} ${className ?? ''}`}
      role={tone === 'problem' ? 'alert' : 'status'}
      aria-live={tone === 'problem' ? 'assertive' : 'polite'}
    >
      <span className="min-w-0 flex-1">{message}</span>
      {children}
    </div>
  );
}
