/** Scroll sentinels report hidden content to adjacent fixed regions. */
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { scrollEdgesFrom, type ScrollEdges } from './scroll-edges.ts';
export type { ScrollEdges } from './scroll-edges.ts';
export function observeScrollEdges(
  root: HTMLElement,
  start: HTMLElement,
  end: HTMLElement,
  change: (edges: ScrollEdges) => void,
): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  let hidden: ScrollEdges = { start: false, end: false };
  const observer = new IntersectionObserver(
    (entries) => {
      hidden = scrollEdgesFrom(hidden, entries, start, end);
      change({ ...hidden });
    },
    { root, threshold: [1] },
  );
  observer.observe(start);
  observer.observe(end);
  return () => observer.disconnect();
}
const edgeOwners = new WeakMap<HTMLElement, Map<HTMLElement, boolean>>();
function ownEdge(
  edge: HTMLElement | undefined,
  root: HTMLElement,
  hidden: boolean,
): () => void {
  if (!edge) return () => {};
  const owners = edgeOwners.get(edge) ?? new Map<HTMLElement, boolean>();
  edgeOwners.set(edge, owners);
  owners.set(root, hidden && root.getBoundingClientRect().height > 0);
  const update = () =>
    edge.setAttribute(
      'data-scroll-hidden',
      String([...owners.values()].some(Boolean)),
    );
  update();
  return () => {
    owners.delete(root);
    update();
  };
}
export function ScrollRegion({
  children,
  className,
  above,
  below,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly above?: RefObject<HTMLElement | null>;
  readonly below?: RefObject<HTMLElement | null>;
}): ReactNode {
  const root = useRef<HTMLDivElement>(null),
    start = useRef<HTMLSpanElement>(null),
    end = useRef<HTMLSpanElement>(null);
  const [edges, setEdges] = useState<ScrollEdges>({ start: false, end: false });
  useEffect(() => {
    if (!root.current || !start.current || !end.current) return;
    return observeScrollEdges(
      root.current,
      start.current,
      end.current,
      setEdges,
    );
  }, []);
  useEffect(() => {
    const held = root.current;
    if (!held) return;
    const frame = held.closest('[data-scroll-frame]');
    const edgesInFrame = frame
      ? Array.from(
          frame.querySelectorAll<HTMLElement>('[data-scroll-edge]'),
        ).filter(
          (element) =>
            element.closest('[data-scroll-frame]') === frame &&
            !element.classList.contains('sr-only') &&
            element.getBoundingClientRect().height > 1 &&
            element.getBoundingClientRect().width > 1,
        )
      : [];
    const top =
        above?.current ??
        edgesInFrame.find((element) => element.dataset.scrollEdge === 'above'),
      bottom =
        below?.current ??
        edgesInFrame.find((element) => element.dataset.scrollEdge === 'below');
    const releaseTop = ownEdge(top, held, edges.start),
      releaseBottom = ownEdge(bottom, held, edges.end);
    return () => {
      releaseTop();
      releaseBottom();
    };
  }, [above, below, edges, className]);

  return (
    <div
      ref={root}
      className={`ui-scroll-region ${className ?? ''}`}
      data-scroll-start-hidden={edges.start}
      data-scroll-end-hidden={edges.end}
    >
      <div className="ui-scroll-content">
        <span ref={start} aria-hidden="true" className="ui-scroll-start" />
        {children}
        <span ref={end} aria-hidden="true" className="ui-scroll-end" />
      </div>
    </div>
  );
}
