/** Keep phone sheets and their focused fields above the on-screen keyboard. */
import { followVisibleArea, readVisibleArea } from './visible-area.ts';

export function followPhoneSheetViewport(
  root: HTMLElement,
  panel: HTMLElement,
  fullHeight: boolean,
): () => void {
  let frame = 0;
  const reveal = (): void => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        active.matches('input, textarea, select, [contenteditable="true"]') &&
        panel.contains(active)
      )
        active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };
  const place = (): void => {
    const area = readVisibleArea();
    const height = area.bottom - area.top;
    root.style.top = `${String(area.top)}px`;
    root.style.bottom = 'auto';
    root.style.height = `${String(height)}px`;
    panel.style.maxHeight = fullHeight
      ? '100%'
      : `min(var(--spacing-sheet), ${String(height)}px)`;
    reveal();
  };
  place();
  const stop = followVisibleArea(place);
  panel.addEventListener('focusin', reveal);
  return () => {
    stop();
    window.cancelAnimationFrame(frame);
    panel.removeEventListener('focusin', reveal);
    root.style.top = '';
    root.style.bottom = '';
    root.style.height = '';
    panel.style.maxHeight = '';
  };
}
