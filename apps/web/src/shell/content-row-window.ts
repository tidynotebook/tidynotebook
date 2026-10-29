/** A virtual tree that measures each row, including wrapped names and edits. */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  contentRowOffsets,
  contentRowWindow,
} from '../lib/content-row-window.ts';
import { pinRow, sameRowWindow, type RowWindow } from '../lib/row-window.ts';
import {
  defaultOverscan,
  scrollerOf,
  type RowWindowControl,
} from './row-window.ts';

export function useContentRowWindow(
  keys: readonly string[],
  pinned: number | null,
  kind: 'tree' | 'list' = 'tree',
): RowWindowControl {
  const listRef = useRef<HTMLElement | null>(null);
  const sizes = useRef(new Map<string, number>());
  const width = useRef(0);
  const estimate = useRef(44);
  const gap = useRef(4);
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const [window, setWindow] = useState<RowWindow>(() =>
    contentRowWindow(
      contentRowOffsets(
        keys.map(() => 44),
        4,
      ),
      0,
      1000,
      defaultOverscan,
    ),
  );
  const offsets = () =>
    contentRowOffsets(
      keysRef.current.map((key) => sizes.current.get(key) ?? estimate.current),
      gap.current,
    );
  const pinnedHeight =
    pinned === null
      ? estimate.current
      : (sizes.current.get(keys[pinned] ?? '') ?? estimate.current);
  const kept = pinRow(window, pinned, keys.length, pinnedHeight + gap.current);
  const rendered = useRef(kept.indexes);
  rendered.current = kept.indexes;

  const update = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const scroller = scrollerOf(list);
    const newWidth = list.getBoundingClientRect().width;
    if (newWidth !== width.current) {
      sizes.current.clear();
      width.current = newWidth;
    }
    const coarse = globalThis.window.matchMedia(
      '(max-width: 1023px) and (pointer: coarse)',
    ).matches;
    estimate.current = coarse
      ? 44
      : parseFloat(
          getComputedStyle(list).getPropertyValue(
            kind === 'tree' ? '--ui-tree-height' : '--ui-list-height',
          ),
        ) || 28;
    const oldOffsets = offsets();
    const listTop = () =>
      list.getBoundingClientRect().top -
      (scroller?.getBoundingClientRect().top ?? 0);
    const anchor = contentRowWindow(oldOffsets, -listTop(), 0, 0).start;
    for (const [position, element] of [...list.children].entries()) {
      const index = rendered.current[position];
      const key = index === undefined ? undefined : keysRef.current[index];
      const height = element.getBoundingClientRect().height;
      // Hidden or not-yet-laid-out rows do not replace a useful estimate.
      if (height > 0) {
        if (key !== undefined) sizes.current.set(key, height);
        if (position > 0)
          gap.current = parseFloat(getComputedStyle(element).marginTop) || 0;
      }
    }
    const measured = offsets();
    // Measurements above the visible row must not move that row on screen.
    if (scroller && scroller.scrollTop > 0) {
      const delta = (measured[anchor] ?? 0) - (oldOffsets[anchor] ?? 0);
      if (delta !== 0) scroller.scrollTop += delta;
    }
    const next = contentRowWindow(
      measured,
      -listTop(),
      scroller?.clientHeight ?? globalThis.window.innerHeight,
      defaultOverscan,
    );
    setWindow((current) => (sameRowWindow(current, next) ? current : next));
    // Refs hold the current order and measurements across scroll events.
  }, [kind]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.style.paddingTop = `${kept.before}px`;
    list.style.paddingBottom = `${kept.after}px`;
    update();
  }, [keys, kept.before, kept.after, update]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const scroller = scrollerOf(list);
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        update();
      });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(list);
    for (const child of list.children) observer.observe(child);
    if (scroller) observer.observe(scroller);
    const target = scroller ?? globalThis.window;
    target.addEventListener('scroll', schedule, { passive: true });
    globalThis.window.addEventListener('resize', schedule);
    return () => {
      observer.disconnect();
      target.removeEventListener('scroll', schedule);
      globalThis.window.removeEventListener('resize', schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [window.start, window.end, keys, update]);

  const reveal = useCallback((index: number) => {
    const list = listRef.current;
    if (!list) return;
    const scroller = scrollerOf(list);
    if (!scroller) return;
    const measured = offsets();
    const top =
      list.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop +
      (measured[index] ?? 0);
    const bottom =
      top +
      ((measured[index + 1] ?? top) - (measured[index] ?? 0)) -
      gap.current;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (bottom > scroller.scrollTop + scroller.clientHeight)
      scroller.scrollTop = bottom - scroller.clientHeight;
  }, []);
  const attach = useCallback((element: HTMLElement | null) => {
    listRef.current = element;
  }, []);
  return { indexes: kept.indexes, listRef: attach, reveal };
}
