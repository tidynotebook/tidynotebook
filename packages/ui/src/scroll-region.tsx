import { fixedRegionClasses } from './scroll-classes.ts';
/** Scroll sentinels report hidden content to adjacent fixed regions. */
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type HTMLAttributes,
} from 'react';
import {
  compositionData,
  insetClasses,
  spaceClasses,
  type InsetProps,
  type SpaceValue,
} from './primitives.tsx';
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
  const update = () => {
    const hidden = [...owners.values()].some(Boolean);
    edge.setAttribute('data-scroll-hidden', String(hidden));
    edge.toggleAttribute(
      edge.dataset.scrollEdge === 'above'
        ? 'data-edge-bottom'
        : 'data-edge-top',
      hidden,
    );
  };
  update();
  return () => {
    owners.delete(root);
    update();
  };
}
export function Region({
  children,
  className,
  scroll = 'y',
  edge = 'both',
  gap = 0,
  pad,
  padX,
  padY,
  elementRef,
  safeArea = false,
  above,
  below,
  ...nativeProps
}: Omit<HTMLAttributes<HTMLDivElement>, 'children'> &
  InsetProps & {
    readonly safeArea?: boolean;
    readonly children: ReactNode;
    readonly scroll?: 'none' | 'y';
    readonly edge?: 'top' | 'bottom' | 'both';
    readonly gap?: SpaceValue;
    readonly elementRef?: RefObject<HTMLDivElement | null>;
    readonly className?: string;
    readonly above?: RefObject<HTMLElement | null>;
    readonly below?: RefObject<HTMLElement | null>;
  }): ReactNode {
  const root = useRef<HTMLDivElement>(null),
    start = useRef<HTMLSpanElement>(null),
    end = useRef<HTMLSpanElement>(null);
  const [edges, setEdges] = useState<ScrollEdges>({ start: false, end: false });
  useEffect(() => {
    if (scroll !== 'y' || !root.current || !start.current || !end.current)
      return;
    return observeScrollEdges(
      root.current,
      start.current,
      end.current,
      setEdges,
    );
  }, [scroll]);
  useEffect(() => {
    const held = root.current;
    if (!held || scroll !== 'y') return;
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
  }, [above, below, edges, className, scroll]);

  return (
    <div
      {...nativeProps}
      {...compositionData('region', { pad, padX, padY })}
      ref={(element) => {
        root.current = element;
        if (elementRef) elementRef.current = element;
      }}
      className={`${scroll === 'y' ? 'ui-scroll-region flex-1 overflow-y-auto overscroll-contain' : `flex flex-col ${spaceClasses('gap', gap)} ${fixedRegionClasses(edge)}`} ${insetClasses({ pad, padX, padY })} ${className ?? ''}`}
      data-scroll-edge={
        scroll === 'none' ? (edge === 'top' ? 'below' : 'above') : undefined
      }
      data-scroll-start-hidden={edges.start}
      data-scroll-end-hidden={edges.end}
    >
      {scroll === 'none' ? (
        <>
          {children}
          {safeArea ? (
            <div aria-hidden="true" className="h-0 coarse:h-safe" />
          ) : null}
        </>
      ) : (
        <div
          {...compositionData('stack', { gap })}
          className={`ui-scroll-content relative flex min-h-full shrink-0 flex-col ${spaceClasses('gap', gap)}`}
        >
          <span
            ref={start}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
          />
          {children}
          <span
            ref={end}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
          />
        </div>
      )}
    </div>
  );
}

export { fixedRegionClasses } from './scroll-classes.ts';
