/** State colours follow the nearest surface, including nested cards and portals. */
export const overlayStateClasses =
  '[--notes-surface-hover:var(--notes-overlay-hover)] [--notes-surface-active:var(--notes-overlay-selected)]';
export const raisedStateClasses =
  '[--notes-surface-hover:var(--notes-card-raised-hover)] [--notes-surface-active:var(--notes-card-raised-selected)]';
export const responsiveRaisedStateClasses =
  'coarse:[--notes-surface-hover:var(--notes-card-raised-hover)] coarse:[--notes-surface-active:var(--notes-card-raised-selected)]';
