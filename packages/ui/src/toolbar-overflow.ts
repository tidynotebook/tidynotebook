import { useLayoutEffect, useRef, useState } from 'react';
/** Keep a toolbar on one line. Measure its controls instead of a viewport breakpoint. */
export function useToolbarOverflow(count: number) {
  const ref = useRef<HTMLDivElement>(null),
    [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const button = root.querySelector('button'),
        line = root.firstElementChild;
      if (!button || !line) return;
      const gap = parseFloat(getComputedStyle(line).columnGap) || 0;
      setCompact(
        root.clientWidth <
          count * button.getBoundingClientRect().width + (count - 1) * gap,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    measure();
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [count]);
  return { ref, compact };
}
