import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { placeOverlay } from './overlay-position.ts';
import { followVisibleArea, readVisibleArea } from './visible-area.ts';

/** A tooltip leaves scrolling controls so its text cannot be clipped. */
export function Tooltip({
  text,
  anchor,
}: {
  readonly text: string;
  readonly anchor: HTMLElement;
}): ReactNode {
  const tipRef = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const place = (): void => {
      const tip = tipRef.current;
      if (tip === null) return;
      const position = placeOverlay({
        anchor: anchor.getBoundingClientRect(),
        overlay: tip.getBoundingClientRect(),
        screen: readVisibleArea(),
        align: 'start',
      });
      tip.style.top = `${String(position.top)}px`;
      tip.style.left = `${String(position.left)}px`;
    };
    place();
    const stop = followVisibleArea(place);
    window.addEventListener('scroll', place, true);
    return () => {
      stop();
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);
  return createPortal(
    <span
      ref={tipRef}
      aria-hidden="true"
      className="pointer-events-none fixed z-50 hidden whitespace-nowrap rounded-md border border-edge-line bg-card px-2 py-1 text-control text-strong shadow-overlay pointer-fine:block"
    >
      {text}
    </span>,
    document.body,
  );
}
