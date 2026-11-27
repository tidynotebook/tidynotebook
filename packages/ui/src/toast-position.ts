import { followVisibleArea, readVisibleArea } from './visible-area.ts';

export function followToastPosition(layer: HTMLElement): () => void {
  let footers = new Set<HTMLElement>();
  const place = (): void => {
    const bottom = readVisibleArea().bottom;
    let edge = bottom;
    for (const footer of footers) {
      const bounds = footer.getBoundingClientRect();
      if (bounds.height === 0 || footer.closest('[inert]')) continue;
      // The projected edge also clears a footer while its sheet slides in.
      edge = Math.min(edge, bounds.top, bottom - bounds.height);
    }
    layer.style.bottom =
      edge === bottom
        ? ''
        : `${document.documentElement.clientHeight - edge}px`;
  };
  const resize =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
  const sync = (): void => {
    const next = new Set(
      document.querySelectorAll<HTMLElement>('[data-phone-sheet-footer]'),
    );
    for (const footer of footers)
      if (!next.has(footer)) resize?.unobserve(footer);
    for (const footer of next)
      if (!footers.has(footer)) resize?.observe(footer);
    footers = next;
    place();
  };
  const mutation = new MutationObserver(sync);
  mutation.observe(document.body, {
    subtree: true,
    childList: true,
    attributeFilter: ['inert'],
  });
  const stop = followVisibleArea(place);
  sync();
  return () => {
    stop();
    mutation.disconnect();
    resize?.disconnect();
  };
}
