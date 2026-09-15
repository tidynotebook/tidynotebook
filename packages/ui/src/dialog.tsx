/**
 * The one modal dialog of the application.
 *
 * The dialog owns every rule that a modal needs, so no screen repeats them:
 * a labelled title, Escape, a focus trap on Tab and Shift plus Tab, focus
 * restore to the element that opened it, and `inert` on the page behind it
 * where the browser supports that property. The scrim uses the theme token,
 * so both palettes dim the page by the same amount.
 */
import { useEffect, useRef, type ReactNode } from 'react';

/** How wide a dialog panel is. */
export type DialogWidth = 'small' | 'medium' | 'large';

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Marks the page behind the dialog inert where the browser supports it. */
function setPageInert(panel: HTMLElement | null, inert: boolean): () => void {
  const body = document.body;
  const container = panel?.closest('[data-notes-dialog-root]') ?? null;
  const changed: HTMLElement[] = [];
  for (const child of Array.from(body.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (container !== null && child.contains(container)) continue;
    if (!('inert' in child)) continue;
    if (child.inert === inert) continue;
    child.inert = inert;
    changed.push(child);
  }
  return () => {
    for (const element of changed) element.inert = !inert;
  };
}

/**
 * A modal dialog.
 *
 * `open` controls visibility. `onClose` runs for Escape, for the close
 * control, and for a pointer press on the scrim. The panel receives focus
 * when it opens unless a child already claimed it.
 */
export function Dialog({
  open,
  onClose,
  title,
  titleId,
  hideTitle = false,
  width = 'medium',
  align = 'top',
  children,
  describedBy,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly titleId: string;
  /** Keeps the title for assistive technology only. */
  readonly hideTitle?: boolean | undefined;
  readonly width?: DialogWidth | undefined;
  readonly align?: 'top' | 'center' | undefined;
  readonly children: ReactNode;
  readonly describedBy?: string | undefined;
}): ReactNode {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
    const panel = panelRef.current;
    const releaseInert = setPageInert(panel, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = (): HTMLElement[] =>
      panel === null
        ? []
        : Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
    window.requestAnimationFrame(() => {
      const targets = focusables();
      if (panel !== null && !panel.contains(document.activeElement))
        (targets[0] ?? panel).focus();
    });
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const targets = focusables();
      const first = targets[0];
      const last = targets.at(-1);
      if (first === undefined || last === undefined) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // Capture phase: the open dialog owns Escape before any other window
    // handler, such as the drawer behind it, can act on the same press.
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      releaseInert();
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const measure =
    width === 'small'
      ? 'max-w-md'
      : width === 'large'
        ? 'max-w-3xl'
        : 'max-w-xl';
  const position =
    align === 'center' ? 'items-center py-6' : 'items-start pb-6 pt-20';

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center overflow-y-auto bg-scrim/70 px-gutter ${position}`}
      data-notes-dialog-root=""
      role="presentation"
      onMouseDown={(event): void => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`w-full ${measure} overflow-hidden rounded-xl border border-edge bg-card text-ink shadow-xl outline-none`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        <h2
          className={
            hideTitle
              ? 'sr-only'
              : 'm-0 border-b border-edge-subtle px-5 py-4 text-base font-semibold text-strong'
          }
          id={titleId}
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

/** The standard padded body of a dialog. */
export function DialogBody({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return <div className="px-5 py-4">{children}</div>;
}

/** The action row at the bottom of a dialog. */
export function DialogFooter({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className="flex flex-wrap justify-end gap-cluster border-t border-edge-subtle px-5 py-3">
      {children}
    </div>
  );
}
