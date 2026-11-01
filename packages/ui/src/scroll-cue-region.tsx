import { transitionScrollCue } from './motion.ts';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Region, type ScrollEdges } from './scroll-region.tsx';
/** A fixed overlay marks content that remains below the viewport. */
export function ScrollCueRegion(
  props: Omit<ComponentProps<typeof Region>, 'onEdgesChange'>,
): ReactNode {
  const [edges, setEdges] = useState<ScrollEdges>({ start: false, end: false });
  return (
    <div
      hidden={props.hidden}
      className="relative min-h-0 flex-1 overflow-hidden"
    >
      <Region
        {...props}
        onEdgesChange={setEdges}
        className={`h-full ${props.className ?? ''}`}
      />
      <div
        aria-hidden="true"
        data-scroll-cue=""
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 h-px border-t border-edge-subtle shadow-edge-top ${transitionScrollCue} ${edges.end ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
