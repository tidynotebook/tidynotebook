import { transitionScrollEdge } from './motion.ts';
export function fixedRegionClasses(edge: 'top' | 'bottom' | 'both'): string {
  // Hairlines stay visible without taking space from the fixed region.
  // Only the shadow follows the scroll sentinels.
  const base =
    'relative z-10 shrink-0 before:pointer-events-none before:absolute before:inset-x-0 before:h-px before:border-t before:border-edge-subtle';
  return `${base} ${transitionScrollEdge} ${edge === 'top' ? 'before:top-0 data-edge-top:before:shadow-edge-top' : edge === 'bottom' ? 'before:bottom-0 data-edge-bottom:before:shadow-edge-bottom' : 'before:top-0 after:pointer-events-none after:absolute after:inset-x-0 after:h-px after:border-t after:border-edge-subtle after:bottom-0 data-edge-top:before:shadow-edge-top data-edge-bottom:after:shadow-edge-bottom'}`;
}
