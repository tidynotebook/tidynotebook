import { transitionScrollEdge } from './motion.ts';
export function fixedRegionClasses(edge: 'top' | 'bottom' | 'both'): string {
  const base =
    'relative z-10 shrink-0 before:pointer-events-none before:absolute before:inset-x-0 before:h-px before:bg-edge-subtle before:opacity-0 after:pointer-events-none after:absolute after:inset-x-0 after:h-px after:bg-edge-subtle after:opacity-0';
  return `${base} ${transitionScrollEdge} ${edge === 'top' ? 'before:top-0 data-edge-top:before:opacity-100 data-edge-top:before:shadow-edge-top' : edge === 'bottom' ? 'before:bottom-0 data-edge-bottom:before:opacity-100 data-edge-bottom:before:shadow-edge-bottom' : 'before:top-0 after:bottom-0 data-edge-top:before:opacity-100 data-edge-top:before:shadow-edge-top data-edge-bottom:after:opacity-100 data-edge-bottom:after:shadow-edge-bottom'}`;
}
