/** A field popup: over the content on desktop, in the sheet on a phone. */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { placeOverlay } from './overlay-position.ts';
import { followVisibleArea, readVisibleArea } from './visible-area.ts';

/** Keeps a field choice in its dialog and outside its scrolling content. */
export function FieldPopover({
  id,
  anchor,
  onClose,
  children,
}: {
  readonly id: string;
  readonly anchor: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly children: ReactNode;
}): ReactNode {
  const surface = useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 64rem)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(min-width: 64rem)');
    const change = (): void => setWide(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useLayoutEffect(() => {
    if (!wide) return;
    const position = (): void => {
      const field = anchor.current;
      const panel = surface.current;
      if (field === null || panel === null) return;
      const rect = field.getBoundingClientRect();
      const room = readVisibleArea();
      panel.style.width = `${String(Math.min(Math.max(rect.width, 240), room.right - room.left - 16))}px`;
      const placement = placeOverlay({
        anchor: rect,
        overlay: { width: panel.offsetWidth, height: panel.scrollHeight },
        screen: room,
        align: 'start',
      });
      panel.style.top = `${String(placement.top)}px`;
      panel.style.left = `${String(placement.left)}px`;
      panel.style.maxHeight = `${String(placement.maxHeight)}px`;
    };
    position();
    const observer = new window.ResizeObserver(position);
    if (surface.current !== null) observer.observe(surface.current);
    const stop = followVisibleArea(position);
    window.addEventListener('scroll', position, true);
    return () => {
      observer.disconnect();
      stop();
      window.removeEventListener('scroll', position, true);
    };
  }, [wide, anchor]);
  useEffect(() => {
    const outside = (event: PointerEvent): void => {
      if (
        event.target instanceof Node &&
        !surface.current?.contains(event.target) &&
        !anchor.current?.contains(event.target)
      )
        onClose();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [anchor, onClose]);
  const panel = (
    <div
      id={id}
      ref={surface}
      data-dialog-escape="local"
      className={
        wide
          ? 'fixed z-50 overflow-y-auto rounded-lg border border-edge-subtle bg-surface p-1 shadow-modal'
          : 'mt-1 rounded-lg border border-edge-subtle bg-surface p-1'
      }
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {children}
    </div>
  );
  if (!wide) return panel;
  const target = anchor.current?.closest('[role="dialog"]') ?? document.body;
  return createPortal(panel, target);
}
