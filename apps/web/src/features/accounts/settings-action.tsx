/** The action view loads after Settings opens. */
import {
  useLayoutEffect,
  useRef,
  useId,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { FixedDialogLayout, isTouchInput, type Dialog } from '@notesapp/ui';
import type { SettingsActionHost } from './settings-action-context.ts';
/** An action replaces the section content without changing the modal frame. */
export default function SettingsAction({
  open,
  onClose,
  title,
  children,
  returnFocus,
  context,
}: ComponentProps<typeof Dialog> & {
  readonly context: SettingsActionHost;
}): ReactNode {
  const id = useId();
  const panel = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const returnRef = useRef(returnFocus);
  returnRef.current = returnFocus;
  const setActive = context.setActive;
  const target = context.target;
  useLayoutEffect(() => {
    if (!open || target === null) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement ? active : null;
    setActive({ id, title, close: () => closeRef.current() });
    return () => {
      setActive((held) => (held?.id === id ? null : held));
      // The section is visible again before focus returns to its control.
      window.requestAnimationFrame(() => {
        if (returnRef.current !== undefined) returnRef.current();
        else if (opener.current?.isConnected === true) opener.current.focus();
      });
    };
  }, [open, target, id, setActive]);
  useLayoutEffect(() => {
    setActive((held) =>
      held?.id === id && held.title !== title ? { ...held, title } : held,
    );
  }, [id, title, setActive]);
  useLayoutEffect(() => {
    if (!open || target === null) return;
    // Wait until the host is visible. An input can also take focus through
    // autoFocus, or the read-only secret field can select its value.
    const frame = window.requestAnimationFrame(() => {
      const held = panel.current;
      if (held !== null && !held.contains(document.activeElement))
        (
          held.querySelector<HTMLElement>(
            isTouchInput()
              ? 'input:not([data-list-search]), select, textarea'
              : 'input, select, textarea',
          ) ??
          held.querySelector<HTMLElement>(
            '[role="treeitem"][aria-selected="true"]',
          ) ??
          held.querySelector<HTMLElement>('[aria-pressed="true"]') ??
          held.querySelector<HTMLElement>('button') ??
          held
        ).focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, target]);
  if (!open || target === null) return null;
  return createPortal(
    <section
      ref={panel}
      className="ui-settings-action flex min-h-0 flex-1 flex-col"
      aria-label={title}
      data-dialog-escape="local"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeRef.current();
        }
      }}
    >
      <FixedDialogLayout>{children}</FixedDialogLayout>
    </section>,
    target,
  );
}
