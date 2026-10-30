import { transitionScrollEdge } from './motion.ts';
export function fixedRegionClasses(edge: 'top' | 'bottom' | 'both'): string {
  // Hairlines mark overflow, or a persistent sidebar edge, without taking space.
  // Only the shadow follows the scroll sentinels.
  // Transition utilities create both pseudo elements. Keep both outside the
  // layout even when this region paints only one edge.
  const base =
    'relative z-10 shrink-0 after:pointer-events-none after:absolute before:pointer-events-none before:absolute before:inset-x-0 before:h-px before:border-t before:border-edge-subtle before:opacity-0 data-scroll-overflow:before:opacity-100 data-edge-always:before:opacity-100';
  return `${base} ${transitionScrollEdge} ${edge === 'top' ? 'before:top-0 data-edge-top:before:shadow-edge-top' : edge === 'bottom' ? 'before:bottom-0 data-edge-bottom:before:shadow-edge-bottom' : 'before:top-0 after:pointer-events-none after:absolute after:inset-x-0 after:h-px after:border-t after:border-edge-subtle after:opacity-0 data-scroll-overflow:after:opacity-100 data-edge-always:after:opacity-100 after:bottom-0 data-edge-top:before:shadow-edge-top data-edge-bottom:after:shadow-edge-bottom'}`;
}
