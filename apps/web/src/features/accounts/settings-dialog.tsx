/** Settings actions use the existing content column, with one modal and one scrim. */
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useId,
  type ComponentProps,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Button, ChevronLeftIcon, Dialog } from '@notesapp/ui';

/** The action host and its current registration. */
type SettingsActionHost = {
  readonly target: HTMLDivElement | null;
  readonly setActive: Dispatch<SetStateAction<string | null>>;
};

/** The stable action area inside Settings. Hidden sections stay mounted. */
export const SettingsActionContext = createContext<SettingsActionHost | null>(
  null,
);

/** Uses an in-panel action in Settings and a normal dialog on other pages. */
export function SettingsDialog(
  props: ComponentProps<typeof Dialog>,
): ReactNode {
  const context = useContext(SettingsActionContext);
  return context === null ? (
    <Dialog {...props} />
  ) : (
    <SettingsAction {...props} context={context} />
  );
}

/** An action replaces the section content without changing the modal frame. */
function SettingsAction({
  open,
  onClose,
  title,
  titleId,
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
    setActive(id);
    return () => {
      setActive((held) => (held === id ? null : held));
      // The section is visible again before focus returns to its control.
      window.requestAnimationFrame(() => {
        if (returnRef.current !== undefined) returnRef.current();
        else if (opener.current?.isConnected === true) opener.current.focus();
      });
    };
  }, [open, target, id, setActive]);
  useLayoutEffect(() => {
    if (!open || target === null) return;
    // Wait until the host is visible. An input can also take focus through
    // autoFocus, or the read-only secret field can select its value.
    const frame = window.requestAnimationFrame(() => {
      const held = panel.current;
      if (held !== null && !held.contains(document.activeElement))
        (
          held.querySelector<HTMLElement>('input, select, textarea, button') ??
          held
        ).focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, target]);
  if (!open || target === null) return null;
  return createPortal(
    <section
      ref={panel}
      aria-labelledby={titleId}
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
      <div className="mb-3 flex items-center gap-cluster px-5">
        <Button
          variant="ghost"
          icon={<ChevronLeftIcon />}
          label="Back to section"
          onClick={onClose}
        />
        <h3 id={titleId} className="m-0 text-ui font-semibold text-strong">
          {title}
        </h3>
      </div>
      {children}
    </section>,
    target,
  );
}
