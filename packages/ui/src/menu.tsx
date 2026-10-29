/**
 * A menu button with full keyboard support.
 *
 * The trigger owns `aria-haspopup` and `aria-expanded`. The open menu takes
 * focus, moves it with the arrow keys, Home, and End, activates an item with
 * Enter or Space, and closes on Escape, on a pointer press outside, and
 * after an item runs. Focus always returns to the trigger.
 *
 * Every class the menu renders comes from `./control-classes.ts`: the trigger
 * is a ghost button and each row is `rowClassName` (decision 0065). A
 * `compact` trigger keeps its touch target and draws a smaller surface inside
 * it, exactly as a compact `Button` does, so a menu in a row of actions or in
 * the frame header stays as quiet as every other control. The
 * surface is a raised plane: the card fill, the subtle edge and the overlay
 * step (decisions 0052 and 0063). `hint` is the quiet value on the right of a
 * row, such as the theme that is in force; a keyboard hint is a key cap from
 * `kbdClassName` and the screen that owns the keys draws it. A row can name a
 * `group`, and the subtle hairline of the raised surface separates one group
 * from the next, as it separates the pinned rows; `./menu-groups.ts` decides
 * where it goes.
 *
 * The list is put at the end of the document and placed on the screen, not
 * laid out beside the trigger. A trigger can stand in a box that scrolls, and
 * a box that scrolls on one axis clips on both, so a list laid out inside it
 * loses every row that reaches past its edge. The row actions of the folder
 * tree are the case that proves it: a row near the foot of the tree showed
 * one of its five actions, and a row deep in a narrow sidebar lost its left
 * edge. `./overlay-position.ts` decides the place and this file is the one
 * that writes it. See
 * [decision 0058](../../../docs/decisions/0058-an-overlay-is-placed-on-the-screen.md).
 */
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  buttonClassName,
  compactButtonVisualClassName,
  menuSurfaceClassName,
  rowClassName,
} from './control-classes.ts';
import { CheckIcon } from './icons.tsx';
import { startsGroup } from './menu-groups.ts';
import { placeOverlay } from './overlay-position.ts';
import { followVisibleArea, readVisibleArea } from './visible-area.ts';

/** One row of a menu. */
export type MenuItem = {
  /** A value that is unique inside one menu. */
  readonly id: string;
  readonly label: string;
  /** A short value shown on the right, such as the current theme. */
  readonly hint?: ReactNode | undefined;
  readonly icon?: ReactNode | undefined;
  readonly disabled?: boolean | undefined;
  /** Draws the row with the danger token. */
  readonly danger?: boolean | undefined;
  /**
   * Marks the row as the one in force, for a menu that chooses between
   * alternatives rather than running actions.
   *
   * A menu that sets this on any row states the choice to assistive software:
   * the marked row carries `menuitemradio` and `aria-checked`, so a person
   * hears which one is open before they move off it.
   */
  readonly selected?: boolean | undefined;
  /**
   * The set this row belongs to. Rows of one group sit together, and a
   * hairline separates one group from the next.
   */
  readonly group?: string | undefined;
  readonly onSelect: () => void;
};

/**
 * The one hairline inside a menu: between two groups of rows, and above the
 * pinned rows. It is the subtle edge of a raised surface (decision 0063).
 */
const menuDividerClassName = 'border-t border-edge-subtle';

/** Where the menu opens relative to its trigger. */
export type MenuAlign = 'start' | 'end';

/** One row of an open menu, in either region. */
function MenuRow({
  item,
  choosing,
  onRun,
}: {
  readonly item: MenuItem;
  /** True when any row of this menu states a selection. */
  readonly choosing: boolean;
  readonly onRun: (item: MenuItem) => void;
}): ReactNode {
  return (
    <button
      type="button"
      role={choosing ? 'menuitemradio' : 'menuitem'}
      aria-checked={choosing ? item.selected === true : undefined}
      tabIndex={-1}
      className={rowClassName({
        danger: item.danger,
        className: 'w-full text-left md:min-h-8',
      })}
      disabled={item.disabled ?? false}
      onClick={() => onRun(item)}
    >
      {item.icon === undefined ? null : (
        <span className="inline-flex shrink-0 items-center" aria-hidden="true">
          {item.icon}
        </span>
      )}
      <span className="flex-1 truncate">{item.label}</span>
      {choosing ? (
        <span
          data-menu-check
          className="inline-flex size-4 shrink-0"
          aria-hidden="true"
        >
          {item.selected ? <CheckIcon /> : null}
        </span>
      ) : null}
      {item.hint === undefined ? null : (
        <span className="shrink-0 text-secondary text-muted">{item.hint}</span>
      )}
    </button>
  );
}

/** A place on the screen that a menu opens beside. */
export type MenuAnchor = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

/**
 * The open list of a menu: its rows, its keys, its place and its close.
 *
 * `Menu` renders it under its trigger and `AnchoredMenu` renders it at a place
 * that a caller names, so both menus share one behaviour for the keys, the
 * placement and a press outside.
 */
function MenuList({
  id,
  label,
  items,
  header,
  pinned,
  anchor,
  align,
  matchWidth,
  initialIndex,
  onClose,
  isInside,
}: {
  readonly id: string;
  readonly label: string;
  readonly header?: ReactNode;
  readonly items: readonly MenuItem[];
  readonly pinned: readonly MenuItem[];
  /** Reads the place the list opens beside, at the time it is placed. */
  readonly anchor: () => MenuAnchor | null;
  readonly align: MenuAlign;
  readonly matchWidth: boolean;
  readonly initialIndex: number;
  /** Closes the list. `restoreFocus` is true after a key or a chosen row. */
  readonly onClose: (restoreFocus: boolean) => void;
  /** A press here does not count as a press outside, such as the trigger. */
  readonly isInside?: ((target: Node) => boolean) | undefined;
}): ReactNode {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const listRef = useRef<HTMLDivElement | null>(null);

  // The arrow keys run over both regions in the order they are on the screen,
  // so a pinned row is reached by pressing End and never disappears from the
  // keyboard order when the scrolling list grows.
  const enabled = [...items, ...pinned].filter(
    (item) => item.disabled !== true,
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (isInside?.(target) === true) return;
      if (listRef.current?.contains(target) === true) return;
      onClose(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [onClose, isInside]);

  // Escape closes the open list wherever the focus is, because the list takes
  // the focus one frame after it opens and a key pressed before that reaches
  // what had it. The capture phase, so Escape closes the innermost thing and
  // nothing above it: an open menu inside the navigation drawer would
  // otherwise close the drawer as well, because the drawer listens for the key
  // on the window, and focus would have nowhere to return to.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      listRef.current
        ?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([disabled]),[role="menuitemradio"]:not([disabled])',
        )
        [activeIndex]?.focus();
    });
  }, [activeIndex]);

  /**
   * Writes the place of the open list.
   *
   * The height bound of the last placement is cleared first, so the list
   * reports the height it wants and not the height it was given. Nothing else
   * about the list is written here: its colour, its edge, its radius, its
   * padding and its depth all stay in the named scales.
   */
  const place = useCallback((): void => {
    const list = listRef.current;
    const spot = anchor();
    if (list === null || spot === null) return;
    list.style.maxHeight = '';
    if (matchWidth) list.style.width = `${String(spot.width)}px`;
    const size = list.getBoundingClientRect();
    const placed = placeOverlay({
      anchor: spot,
      overlay: { width: size.width, height: size.height },
      screen: readVisibleArea(),
      align,
    });
    list.style.top = `${String(placed.top)}px`;
    list.style.left = `${String(placed.left)}px`;
    list.style.maxHeight = `${String(placed.maxHeight)}px`;
  }, [align, matchWidth, anchor]);

  useLayoutEffect(() => {
    place();
    const follow = (): void => {
      place();
    };
    // The keyboard of a phone moves the visible area and not the window.
    const stopFollowing = followVisibleArea(follow);
    // The capture phase, because the trigger can sit in a box that scrolls,
    // such as the folder tree, and a scroll there does not reach the window.
    window.addEventListener('scroll', follow, true);
    return () => {
      stopFollowing();
      window.removeEventListener('scroll', follow, true);
    };
  }, [place]);

  const move = (delta: number): void => {
    setActiveIndex((current) => {
      const count = enabled.length;
      if (count === 0) return 0;
      return (current + delta + count) % count;
    });
  };

  // A menu states a selection only when a row claims one, so every menu that
  // runs actions keeps the plain `menuitem` role it had.
  const choosing = [...items, ...pinned].some(
    (item) => item.selected !== undefined,
  );

  const run = (item: MenuItem): void => {
    onClose(true);
    item.onSelect();
  };

  return createPortal(
    <div
      ref={listRef}
      id={id}
      className={`fixed z-50 ${menuSurfaceClassName()} ${matchWidth ? '' : 'min-w-56'}`}
      role="menu"
      aria-label={label}
      onKeyDown={(event): void => {
        if (event.key === 'ArrowDown') {
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
          onClose(true);
        }
      }}
    >
      {header === undefined ? null : (
        <div
          role="presentation"
          className="mb-1 border-b border-edge-subtle px-2 py-2"
        >
          {header}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.map((item, index) => (
          <Fragment key={item.id}>
            {startsGroup(items, index) ? (
              <div
                role="separator"
                className={`my-1 ${menuDividerClassName}`}
              />
            ) : null}
            <MenuRow item={item} choosing={choosing} onRun={run} />
          </Fragment>
        ))}
      </div>
      {pinned.length === 0 ? null : (
        <div className={`mt-1 shrink-0 pt-1 ${menuDividerClassName}`}>
          {pinned.map((item) => (
            <MenuRow
              key={item.id}
              item={item}
              choosing={choosing}
              onRun={run}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

/** The id of the list of one menu, from its name. */
function menuIdOf(label: string): string {
  return `${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-menu`;
}

/** A button that opens one menu of actions. */
export function Menu({
  label,
  icon,
  items,
  header,
  pinned = [],
  matchTrigger = false,
  align = 'end',
  triggerClassName,
  compact = false,
  children,
}: {
  /** The accessible name of the trigger. */
  readonly label: string;
  readonly icon?: ReactNode | undefined;
  readonly header?: ReactNode;
  readonly items: readonly MenuItem[];
  /**
   * Rows that stay in view while `items` scrolls.
   *
   * A list that can grow without bound, such as the workspaces of an account,
   * takes its create action here, so the action does not walk off the bottom
   * of the menu as the list fills. A pinned row is last in the keyboard order,
   * because it is last on the screen.
   */
  readonly pinned?: readonly MenuItem[] | undefined;
  /**
   * Opens the menu at the width of its trigger.
   *
   * A trigger that fills its column, such as the workspace switcher, reads as
   * one control with the list it opens. A menu narrower than its own trigger
   * lines up with neither edge and looks like a mistake.
   */
  readonly matchTrigger?: boolean | undefined;
  readonly align?: MenuAlign | undefined;
  readonly triggerClassName?: string | undefined;
  /**
   * Keeps the touch target of the trigger and draws a smaller surface inside
   * it, the way a compact `Button` does.
   *
   * A compact trigger is a quiet icon-only control, so the surface reads the
   * ghost recipe at the small size. The trigger stays as easy to hit under
   * touch, and the mark a person sees is the one the rest of the product
   * draws.
   */
  readonly compact?: boolean | undefined;
  /** Visible trigger text. Omit it for an icon-only trigger. */
  readonly children?: ReactNode | undefined;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [startIndex, setStartIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const enabledCount = [...items, ...pinned].filter(
    (item) => item.disabled !== true,
  ).length;

  const close = useCallback((restoreFocus: boolean): void => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);
  const anchor = useCallback(
    (): MenuAnchor | null =>
      triggerRef.current?.getBoundingClientRect() ?? null,
    [],
  );
  // The list is not a child of the trigger in the document, so a press on the
  // trigger has to be read as inside, or the press would close and reopen it.
  const isInside = useCallback(
    (target: Node): boolean => rootRef.current?.contains(target) === true,
    [],
  );

  const menuId = menuIdOf(label);

  const triggerContent = (
    <>
      {icon === undefined ? null : (
        <span
          className="inline-flex items-center justify-center"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      {children === undefined ? null : (
        // A flex box and not a plain span, because a trigger that shows text
        // often shows more than text: an icon, a label that has to take the
        // free width, and a chevron at the far edge. A plain span made those
        // three one inline box, so the parts could not be laid out at all.
        <span className="flex min-w-0 flex-1 items-center gap-cluster">
          {children}
        </span>
      )}
    </>
  );

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={
          triggerClassName ??
          buttonClassName({
            variant: 'ghost',
            size: compact ? 'sm' : 'md',
            iconOnly: children === undefined,
            compact,
          })
        }
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // `label` names the trigger whether or not it also shows text, because
        // visible text says what the menu is about and not what the control
        // does. A trigger reading `Personal` is a workspace name; its name has
        // to say that it opens the workspace menu. The visible text stays
        // inside the name, so speech input still reaches it.
        aria-label={label}
        // A trigger with visible text needs no tooltip. An icon-only one does,
        // because nothing else on the screen states its purpose.
        title={children === undefined ? label : undefined}
        onClick={() => {
          setStartIndex(0);
          setOpen((value) => !value);
        }}
        onKeyDown={(event): void => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setStartIndex(event.key === 'ArrowDown' ? 0 : enabledCount - 1);
            setOpen(true);
          }
        }}
      >
        {compact ? (
          <span
            className={compactButtonVisualClassName({
              variant: 'ghost',
              size: 'sm',
              iconOnly: children === undefined,
            })}
          >
            {triggerContent}
          </span>
        ) : (
          triggerContent
        )}
      </button>
      {open ? (
        <MenuList
          id={menuId}
          label={label}
          header={header}
          items={items}
          pinned={pinned}
          anchor={anchor}
          align={align}
          matchWidth={matchTrigger}
          initialIndex={Math.max(0, startIndex)}
          onClose={close}
          isInside={isInside}
        />
      ) : null}
    </div>
  );
}

/**
 * A menu that opens at a place a caller names, with no trigger of its own.
 *
 * A control that the editor draws, such as the handle of a table row, is no
 * React element, so it cannot own a `Menu`, and a right click or Shift + F10
 * on a row of the tree opens a menu where the pointer or the row is. Each
 * names its place on the screen,
 * and this menu opens there with the rows, the keys and the placement of every
 * other menu. `onClose` runs when the list closes; `restoreFocus` is true when
 * a key or a chosen row closed it, and the caller gives the focus back.
 */
export function AnchoredMenu({
  label,
  items,
  header,
  pinned = [],
  anchor,
  align = 'start',
  onClose,
}: {
  readonly label: string;
  readonly header?: ReactNode;
  readonly items: readonly MenuItem[];
  /**
   * Rows under the separator, as `Menu` takes them. The context menu of a
   * tree row pins Move to Trash there (record 0164).
   */
  readonly pinned?: readonly MenuItem[] | undefined;
  readonly anchor: MenuAnchor;
  readonly align?: MenuAlign | undefined;
  readonly onClose: (restoreFocus: boolean) => void;
}): ReactNode {
  const place = useCallback((): MenuAnchor => anchor, [anchor]);
  return (
    <MenuList
      id={menuIdOf(label)}
      label={label}
      header={header}
      items={items}
      pinned={pinned}
      anchor={place}
      align={align}
      matchWidth={false}
      initialIndex={0}
      onClose={onClose}
    />
  );
}
