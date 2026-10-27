import { useCallback, useEffect, useRef, useState } from 'react';

type Region = 'trigger' | 'tooltip' | 'focus';
const transferDelayMs = 120;

/** Keep a tooltip open across its two hover regions without moving focus. */
export function useHistoryTooltip(): {
  readonly visible: boolean;
  readonly enter: (region: Region) => void;
  readonly leave: (region: Region) => void;
} {
  const [visible, setVisible] = useState(false);
  const shown = useRef(false);
  const region = useRef({
    trigger: false,
    tooltip: false,
    focus: false,
    engaged: false,
    dismissed: false,
  });
  const timer = useRef<number | null>(null);
  /** Record and render the open state together so key handlers read the latest value. */
  const show = useCallback((next: boolean): void => {
    shown.current = next;
    setVisible(next);
  }, []);
  /** Cancel a pending close, for example when the pointer reaches the other region. */
  const cancelClose = useCallback((): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  /** Close after a short delay unless the pointer or focus enters a region again. */
  const closeOutside = useCallback((): void => {
    cancelClose();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const current = region.current;
      if (current.trigger || current.tooltip || current.focus) return;
      current.engaged = false;
      current.dismissed = false;
      show(false);
    }, transferDelayMs);
  }, [cancelClose, show]);
  /** Open when a region gains the pointer or focus, unless Escape dismissed this visit. */
  const enter = useCallback(
    (part: Region): void => {
      cancelClose();
      const current = region.current;
      if (!current.engaged) current.dismissed = false;
      current[part] = true;
      current.engaged = true;
      if (!current.dismissed) show(true);
    },
    [cancelClose, show],
  );
  /** Release one region and close if no other region holds the tooltip. */
  const leave = useCallback(
    (part: Region): void => {
      region.current[part] = false;
      closeOutside();
    },
    [closeOutside],
  );
  useEffect(() => {
    /** Close on Escape without moving focus, and keep it closed until the visit ends. */
    const dismiss = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !shown.current) return;
      region.current.dismissed = true;
      region.current.tooltip = false;
      show(false);
      closeOutside();
    };
    // The editor can hold focus while the pointer opens the tooltip.
    window.addEventListener('keydown', dismiss, true);
    return () => {
      window.removeEventListener('keydown', dismiss, true);
      cancelClose();
    };
  }, [show, closeOutside, cancelClose]);
  return { visible, enter, leave };
}
