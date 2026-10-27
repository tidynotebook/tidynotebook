/** Keep drawer focus on the visible opener across phone and desktop layouts. */
import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';

export function useNavigationDrawer(
  drawerOpen: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
) {
  const phoneButton = useRef<HTMLButtonElement | null>(null);
  const desktopButton = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const drawerWasOpenRef = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
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
    const focusable = (): HTMLElement[] =>
      sidebar === null
        ? []
        : Array.from(
            sidebar.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          );
    const frame = window.requestAnimationFrame(() => focusable()[0]?.focus());
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
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
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen, setOpen]);

  return { phoneButton, desktopButton, panel, rememberOpener };
}
