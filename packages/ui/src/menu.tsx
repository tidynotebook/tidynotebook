/**
 * A menu button with full keyboard support.
 *
 * The trigger owns `aria-haspopup` and `aria-expanded`. The open menu takes
 * focus, moves it with the arrow keys, Home, and End, activates an item with
 * Enter or Space, and closes on Escape, on a pointer press outside, and
 * after an item runs. Focus always returns to the trigger.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/** One row of a menu. */
export type MenuItem = {
  /** A value that is unique inside one menu. */
  readonly id: string;
  readonly label: string;
  /** A short value shown on the right, such as the current theme. */
  readonly hint?: string | undefined;
  readonly icon?: ReactNode | undefined;
  readonly disabled?: boolean | undefined;
  /** Draws the row with the danger token. */
  readonly danger?: boolean | undefined;
  readonly onSelect: () => void;
};

/** Where the menu opens relative to its trigger. */
export type MenuAlign = 'start' | 'end';

/** A button that opens one menu of actions. */
export function Menu({
  label,
  icon,
  items,
  align = 'end',
  triggerClassName,
  children,
}: {
  /** The accessible name of the trigger. */
  readonly label: string;
  readonly icon?: ReactNode | undefined;
  readonly items: readonly MenuItem[];
  readonly align?: MenuAlign | undefined;
  readonly triggerClassName?: string | undefined;
  /** Visible trigger text. Omit it for an icon-only trigger. */
  readonly children?: ReactNode | undefined;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const enabled = items.filter((item) => item.disabled !== true);

  const close = useCallback((restoreFocus: boolean): void => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target) === true)
        return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      listRef.current
        ?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')
        [activeIndex]?.focus();
    });
    // The effect runs for the open state and for every move of the cursor.
  }, [open, activeIndex]);

  const move = (delta: number): void => {
    setActiveIndex((current) => {
      const count = enabled.length;
      if (count === 0) return 0;
      return (current + delta + count) % count;
    });
  };

  const menuId = `${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-menu`;

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={
          triggerClassName ??
          'inline-flex size-11 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-transparent text-strong transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:size-9'
        }
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={children === undefined ? label : undefined}
        title={children === undefined ? label : undefined}
        onClick={() => {
          setActiveIndex(0);
          setOpen((value) => !value);
        }}
        onKeyDown={(event): void => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex(event.key === 'ArrowDown' ? 0 : enabled.length - 1);
            setOpen(true);
          }
        }}
      >
        {icon === undefined ? null : (
          <span
            className="inline-flex items-center justify-center"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        {children === undefined ? null : <span>{children}</span>}
      </button>
      {open ? (
        <div
          ref={listRef}
          id={menuId}
          className={`absolute top-full z-40 mt-1 min-w-56 rounded-xl border border-edge bg-card p-1 shadow-xl ${align === 'end' ? 'right-0' : 'left-0'}`}
          role="menu"
          aria-label={label}
          onKeyDown={(event): void => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close(true);
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              move(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              move(-1);
            } else if (event.key === 'Home') {
              event.preventDefault();
              setActiveIndex(0);
            } else if (event.key === 'End') {
              event.preventDefault();
              setActiveIndex(Math.max(enabled.length - 1, 0));
            } else if (event.key === 'Tab') {
              event.preventDefault();
              close(true);
            }
          }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`flex min-h-11 w-full cursor-pointer items-center gap-cluster rounded-lg border-0 bg-transparent px-3 py-2 text-left text-control transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 md:min-h-9 ${item.danger === true ? 'text-danger' : 'text-strong'}`}
              disabled={item.disabled ?? false}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
            >
              {item.icon === undefined ? null : (
                <span
                  className="inline-flex shrink-0 items-center"
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
              )}
              <span className="flex-1 truncate">{item.label}</span>
              {item.hint === undefined ? null : (
                <span className="shrink-0 text-control text-muted">
                  {item.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
