/**
 * The one modal dialog of the application.
 *
 * The dialog owns every rule that a modal needs, so no screen repeats them:
 * a labelled title, Escape, a focus trap on Tab and Shift plus Tab, focus
 * restore to the element that opened it, or to the place that `returnFocus`
 * names when the act of the dialog can remove that element, and `inert` on
 * the page behind it
 * where the browser supports that property. The scrim uses the theme token,
 * so both palettes dim the page by the same amount.
 *
 * The panel is the largest radius of the named scale, the card fill, the
 * subtle edge and the modal elevation step. Its three parts separate by space
 * and not by a rule: three rules across one small panel is the look of a
 * generated form, and the title, the body and the footer already differ in
 * type and in alignment. A dialog never grows past the screen: the panel
 * scrolls between its title and its action row, which `dialog-classes.ts`
 * states and tests. See
 * [decision 0063](../../../docs/decisions/0063-the-resting-edge-of-a-control-is-the-divider.md)
 * and
 * [decision 0065](../../../docs/decisions/0065-one-recipe-for-a-control-and-one-grid-for-an-icon.md).
 */
import {
  Children,
  cloneElement,
  isValidElement,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
} from 'react';
import {
  dialogFooterClassName,
  dialogPanelClassName,
  dialogRootClassName,
  dialogHeaderClassName,
  dialogHeaderTitleClassName,
  dialogTitleClassName,
  type DialogAlign,
  type DialogWidth,
} from './dialog-classes.ts';
import { createPortal } from 'react-dom';
import { isTouchInput } from './input-focus.ts';
import { placeOverlay } from './overlay-position.ts';
import { followVisibleArea, readVisibleArea } from './visible-area.ts';
import { giveFocusBack } from './dialog-focus.ts';
import { PhoneSheetHeader } from './phone-sheet.tsx';
import { followPhoneSheetViewport } from './phone-sheet-viewport.ts';
import { Button } from './controls.tsx';
import { transitionRaise } from './motion.ts';

export type { DialogWidth } from './dialog-classes.ts';

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Whether an element is on the screen, where the browser can tell. */
function shown(element: HTMLElement): boolean {
  const check: unknown = Reflect.get(element, 'checkVisibility');
  return typeof check !== 'function' || element.checkVisibility();
}

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
 * when it opens unless a child already claimed it. When it closes, the focus
 * goes back to the element that opened it, or `returnFocus` gives it back
 * instead: a row that the act of the dialog moves away is no place to return
 * to.
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
  returnFocus,
  anchor,
  actions,
  headerActions = false,
  fillSheet = false,
}: {
  readonly fillSheet?: boolean;
  readonly anchor?: HTMLElement | null;
  /** Controls at the end of the title row, such as a link to settings. */
  readonly actions?: ReactNode;
  /** Allows a child picker to place a control beside the title. */
  readonly headerActions?: boolean | undefined;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly titleId: string;
  /** Keeps the title for assistive technology only. */
  readonly hideTitle?: boolean | undefined;
  readonly width?: DialogWidth | undefined;
  readonly align?: DialogAlign | undefined;
  readonly children: ReactNode;
  readonly describedBy?: string | undefined;
  /** Gives the focus back on close, in place of the element that opened it. */
  readonly returnFocus?: (() => void) | undefined;
}): ReactNode {
  const [phone, setPhone] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 1023px) and (pointer: coarse)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia(
      '(max-width: 1023px) and (pointer: coarse)',
    );
    const change = (): void => setPhone(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [headerTarget, setHeaderTarget] = useState<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  // Capture before a child's autoFocus runs during the commit.
  if (open && !wasOpen.current) {
    const active =
      typeof document === 'undefined' ? null : document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
  }
  wasOpen.current = open;
  // The latest close handler, which the effect below reads when a key or a
  // pointer asks for it. A screen passes a new function on every render, and
  // the effect must not run again for that: it moves focus when it starts and
  // when it ends, so a repeat would take the caret out of the field a person
  // is typing in.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const returnRef = useRef(returnFocus);
  useEffect(() => {
    returnRef.current = returnFocus;
  }, [returnFocus]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const releaseInert = setPageInert(panel, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // A control that a responsive class hides takes no focus, so the trap
    // and the first focus skip it. A browser with no visibility check keeps
    // every control.
    const focusables = (): HTMLElement[] =>
      panel === null
        ? []
        : Array.from(
            panel.querySelectorAll<HTMLElement>(focusableSelector),
          ).filter((element) => shown(element));
    const root = panel?.closest('[data-notes-dialog-root]') ?? null;
    window.requestAnimationFrame(() => {
      const targets = focusables();
      if (panel !== null && !panel.contains(document.activeElement))
        (
          (isTouchInput()
            ? targets.find(
                (target) => !target.matches('input[data-list-search]'),
              )
            : targets[0]) ?? panel
        ).focus();
    });
    const onKeyDown = (event: KeyboardEvent): void => {
      // A dialog that this one opened, such as a confirmation inside
      // Settings, owns the keys while it is open.
      if (
        event.target instanceof Element &&
        root !== null &&
        event.target.closest('[data-notes-dialog-root]') !== root &&
        root.contains(event.target)
      )
        return;
      if (event.key === 'Escape') {
        // A popup inside the dialog, such as a folder tree under a field,
        // closes itself first, and the dialog stays open.
        if (
          event.target instanceof Element &&
          event.target.closest('[data-dialog-escape="local"]') !== null
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
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
      giveFocusBack(openerRef.current, returnRef.current);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || phone || anchor === undefined || anchor === null) return;
    /** Place the dialog next to its anchor on wide screens. */
    const place = (): void => {
      const panel = panelRef.current;
      if (panel === null) return;
      if (!window.matchMedia('(min-width: 1024px)').matches) {
        panel.style.position = '';
        panel.style.top = '';
        panel.style.left = '';
        panel.style.maxHeight = '';
        return;
      }
      panel.style.position = 'fixed';
      panel.style.maxHeight = '';
      const position = placeOverlay({
        anchor: anchor.getBoundingClientRect(),
        overlay: panel.getBoundingClientRect(),
        screen: readVisibleArea(),
        align: 'end',
      });
      panel.style.top = `${String(position.top)}px`;
      panel.style.left = `${String(position.left)}px`;
      panel.style.maxHeight = `${String(position.maxHeight)}px`;
    };
    place();
    const stop = followVisibleArea(place);
    window.addEventListener('scroll', place, true);
    return () => {
      stop();
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor, phone]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const panel = panelRef.current;
    if (!open || !phone || width === 'screen' || !root || !panel) return;
    return followPhoneSheetViewport(
      root,
      panel,
      width === 'settings' || width === 'template',
    );
  }, [open, phone, width]);

  useLayoutEffect(() => {
    if (
      !open ||
      !phone ||
      width === 'screen' ||
      !rootRef.current ||
      !panelRef.current
    )
      return;
    const root = rootRef.current;
    const panel = panelRef.current;
    let disposed = false;
    let stop: (() => void) | undefined;
    void import('./phone-sheet-drag.ts').then(({ followPhoneSheetDrag }) => {
      if (!disposed)
        stop = followPhoneSheetDrag(root, panel, () => closeRef.current());
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [open, phone, width]);

  if (!open) return null;

  const screen = width === 'screen';
  const root = `${dialogRootClassName(width, align, phone)} ${anchor == null ? '' : 'lg:bg-transparent'}`;
  const panel = dialogPanelClassName(width, phone, fillSheet);

  return (
    <div
      ref={rootRef}
      className={`fixed inset-0 z-50 flex justify-center ${root} ${transitionRaise}`}
      data-notes-dialog-root=""
      role="presentation"
      onMouseDown={(event): void => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {phone && !screen ? (
        <div
          data-sheet-scrim=""
          className="absolute inset-0 bg-scrim/40 opacity-0"
          onMouseDown={onClose}
        />
      ) : null}
      <div
        ref={panelRef}
        id={`${titleId}-panel`}
        className={`${panel} ${transitionRaise}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        {phone && !screen ? (
          <div
            data-sheet-drag=""
            className="flex h-11 shrink-0 touch-pan-x touch-pinch-zoom items-center justify-center"
            aria-hidden="true"
          >
            <span className="h-1 w-9 rounded-full bg-edge-line" />
          </div>
        ) : null}
        {phone && !hideTitle && !screen ? (
          <PhoneSheetHeader
            title={title}
            titleId={titleId}
            onClose={onClose}
            trailing={
              <>
                {actions}
                {headerActions ? (
                  <div
                    ref={setHeaderTarget}
                    className="flex shrink-0 items-center"
                  />
                ) : null}
              </>
            }
          />
        ) : (actions === undefined && !headerActions) || hideTitle || screen ? (
          <h2
            className={dialogTitleClassName(hideTitle || screen)}
            id={titleId}
          >
            {title}
          </h2>
        ) : (
          <div className={dialogHeaderClassName()}>
            <h2 className={dialogHeaderTitleClassName()} id={titleId}>
              {title}
            </h2>
            {actions}
            {headerActions ? (
              <div
                ref={setHeaderTarget}
                className="flex shrink-0 items-center empty:hidden"
              />
            ) : null}
          </div>
        )}
        <PhoneSheetContext.Provider
          value={phone && width !== 'screen' && width !== 'settings'}
        >
          <DialogHeaderActionsContext.Provider value={headerTarget}>
            {children}
          </DialogHeaderActionsContext.Provider>
        </PhoneSheetContext.Provider>
      </div>
    </div>
  );
}

/** A body control can share its dialog's title row without another header. */
export const DialogHeaderActionsContext = createContext<HTMLElement | null>(
  null,
);

export function DialogHeaderAction({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const target = useContext(DialogHeaderActionsContext);
  return target === null ? null : createPortal(children, target);
}

const PhoneSheetContext = createContext(false);

const FixedDialogContext = createContext(false);

/** Keeps the body scrollable and the footer fixed inside a fixed-height view. */
export function FixedDialogLayout({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <FixedDialogContext.Provider value>{children}</FixedDialogContext.Provider>
  );
}

/** The standard padded body of a dialog. */
export function DialogBody({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const fixed = useContext(FixedDialogContext);
  const phone = useContext(PhoneSheetContext);
  return (
    <div
      className={
        fixed || phone
          ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain ui-dialog-body'
          : 'ui-dialog-body'
      }
    >
      {children}
    </div>
  );
}

/**
 * The action row at the bottom of a dialog.
 *
 * The buttons sit at the end of the row, because the confirming action is the
 * last thing a person reads and the closest to where their pointer already
 * is. There is no rule above them: the space is the separation.
 */
export function DialogFooter({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const fixed = useContext(FixedDialogContext);
  const phone = useContext(PhoneSheetContext);
  if (phone) {
    const nodes = Children.toArray(children);
    const buttons = nodes.filter(
      (node) => isValidElement(node) && node.type === Button,
    );
    const primary =
      buttons.findLast(
        (node) =>
          isValidElement<{ variant?: string }>(node) &&
          (node.props.variant === undefined ||
            node.props.variant === 'primary' ||
            node.props.variant === 'danger'),
      ) ?? buttons.at(-1);
    const action = isValidElement<ComponentProps<typeof Button>>(primary)
      ? cloneElement(primary, {
          variant: primary.props.variant === 'danger' ? 'danger' : 'primary',
        })
      : primary;
    const extra = nodes.filter(
      (node) =>
        node !== primary &&
        (!isValidElement<{ children?: ReactNode; variant?: string }>(node) ||
          node.type !== Button ||
          (node.props.children !== 'Cancel' && node.props.variant !== 'ghost')),
    );
    return (
      <>
        {extra.length === 0 ? null : (
          <div className="shrink-0 px-4 pb-2">{extra}</div>
        )}
        <div className="ui-dialog-footer shrink-0 border-t border-edge-subtle bg-card [&_button]:min-h-11 [&_button]:w-full">
          {action}
        </div>
      </>
    );
  }
  return (
    <div className={`${dialogFooterClassName()} ${fixed ? 'shrink-0' : ''}`}>
      {children}
    </div>
  );
}
