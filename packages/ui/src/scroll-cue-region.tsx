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
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 h-0 ${transitionScrollCue} ${edges.end ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="absolute inset-x-0 bottom-0 h-px border-t border-edge-subtle" />
        <div
          data-scroll-shadow=""
          className="absolute inset-x-0 top-0 h-4 shadow-edge-top"
        />
      </div>
    </div>
  );
}
