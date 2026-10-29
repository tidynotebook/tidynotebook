/** Keep drawer focus on the visible opener across phone and desktop layouts. */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';

/**
 * Match Tailwind's md breakpoint so only the phone overlay is modal.
 * Media-query changes release the trap and scroll lock without closing the drawer.
 */
export function useNavigationDrawer(
  drawerOpen: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
) {
  const [viewport] = useState(() => window.matchMedia('(width < 48rem)'));
  /** Keep one media subscription while open state and focus change. */
  const subscribe = useCallback(
    (changed: () => void) => {
      viewport.addEventListener('change', changed);
      return () => viewport.removeEventListener('change', changed);
    },
    [viewport],
  );
  const phone = useSyncExternalStore(
    subscribe,
    () => viewport.matches,
    () => false,
  );
  const modal = drawerOpen && phone;
  const phoneButton = useRef<HTMLButtonElement | null>(null);
  const desktopButton = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const scrim = useRef<HTMLDivElement | null>(null);
  const drawerWasOpenRef = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  /** Capture the control before a palette row leaves the document. */
  const rememberOpener = useCallback((target?: HTMLElement | null) => {
    opener.current =
      target ??
      (document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null);
  }, []);
  useEffect(() => {
    if (!drawerOpen) {
      if (drawerWasOpenRef.current)
        [opener.current, desktopButton.current, phoneButton.current]
          .find(
            (target) =>
              target?.isConnected && target.getClientRects().length > 0,
          )
          ?.focus();
      drawerWasOpenRef.current = false;
      return;
    }
    drawerWasOpenRef.current = true;
    const sidebar = panel.current;
    /** Preserve native keyboard order inside the phone overlay. */
    const focusable = (): HTMLElement[] =>
      sidebar === null
        ? []
        : Array.from(
            sidebar.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          );
    const frame = modal
      ? window.requestAnimationFrame(() => focusable()[0]?.focus())
      : null;
    const previousOverflow = document.body.style.overflow;
    if (modal) document.body.style.overflow = 'hidden';
    /** Close on Escape. Only the phone overlay keeps Tab inside the drawer. */
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (!modal || event.key !== 'Tab') return;
      const targets = focusable();
      const first = targets[0];
      const last = targets.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
      if (modal) document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen, modal, setOpen]);

  useEffect(() => {
    if (
      !modal ||
      !matchMedia('(pointer: coarse)').matches ||
      !panel.current ||
      !scrim.current
    )
      return;
    const element = panel.current,
      backdrop = scrim.current;
    let disposed = false;
    let stop: (() => void) | undefined;
    void import('./drawer-drag.ts').then(({ followDrawerDrag }) => {
      if (!disposed)
        stop = followDrawerDrag(element, backdrop, () => setOpen(false));
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [modal, setOpen]);
  return { phoneButton, desktopButton, panel, scrim, rememberOpener, modal };
}
