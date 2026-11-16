import { ownScrollEdge } from './scroll-region.tsx';
/** Connect a native scroller to fixed regions without changing its document. */
export function observeElementScrollEdges(root: HTMLElement): () => void {
  const frame =
    root.closest('[data-scroll-frame]') ?? root.parentElement?.parentElement;
  const edges = frame
    ? Array.from(
        frame.querySelectorAll<HTMLElement>('[data-scroll-edge]'),
      ).filter((edge) => edge.closest('[data-scroll-frame]') === frame)
    : [];
  let releases: (() => void)[] = [];
  const update = () => {
    releases = edges.map((edge) =>
      ownScrollEdge(
        edge,
        root,
        edge.dataset.scrollEdge === 'above'
          ? root.scrollTop > 1
          : root.scrollTop + root.clientHeight < root.scrollHeight - 1,
      ),
    );
  };
  root.addEventListener('scroll', update, { passive: true });
  const observer =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
  observer?.observe(root);
  if (root.firstElementChild) observer?.observe(root.firstElementChild);
  update();
  return () => {
    root.removeEventListener('scroll', update);
    observer?.disconnect();
    for (const release of releases) release();
  };
}
