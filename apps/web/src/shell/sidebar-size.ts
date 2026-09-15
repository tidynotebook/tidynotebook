/**
 * How wide the sidebar is, and whether it is on the screen at all.
 *
 * The person drags the edge of the sidebar, or presses the arrow keys on it,
 * and the width moves to the nearest step of the named Tailwind scale. A step
 * and not a pixel, because presentation comes from utility classes: a pixel
 * width would need an inline style, which the design rules refuse, and a
 * snapped edge also stops a drag from leaving the tree unreadable.
 *
 * The frame reads two class strings from this module, the width of the panel
 * and the matching inset of the content next to it. They are written out as
 * whole class names rather than built from the step, because Tailwind reads
 * the source text to decide which utilities to emit.
 *
 * Everything here is a pure function of one stored value, so the rules are
 * tested without a browser. `shell.tsx` owns the state and the pointer
 * handlers.
 */

/** The widths the sidebar can take, from the narrowest. */
export const sidebarSteps = ['narrow', 'medium', 'wide', 'widest'] as const;

/** One width of the sidebar. */
export type SidebarStep = (typeof sidebarSteps)[number];

/** What the person set for the sidebar on this device. */
export type SidebarSize = {
  readonly step: SidebarStep;
  /** The sidebar is off the screen from the medium width up. */
  readonly collapsed: boolean;
};

/** The width a new installation opens with. */
export const defaultSidebarSize: SidebarSize = {
  step: 'medium',
  collapsed: false,
};

/** The local settings key of the sidebar size. */
export const sidebarSizeStorageKey = 'notesapp.sidebar';

/** The width of each step, in pixels, for the drag and for the label. */
const stepWidths: Readonly<Record<SidebarStep, number>> = {
  narrow: 224,
  medium: 256,
  wide: 288,
  widest: 320,
};

/** The width class of each step. Whole names, so Tailwind emits them. */
const stepWidthClasses: Readonly<Record<SidebarStep, string>> = {
  narrow: 'w-56',
  medium: 'w-64',
  wide: 'w-72',
  widest: 'w-80',
};

/** The content inset of each step, from the medium width up. */
const stepInsetClasses: Readonly<Record<SidebarStep, string>> = {
  narrow: 'md:pl-56',
  medium: 'md:pl-64',
  wide: 'md:pl-72',
  widest: 'md:pl-80',
};

/** How wide one step is, in pixels. */
export function sidebarWidthPx(step: SidebarStep): number {
  return stepWidths[step];
}

/** The width class of the sidebar panel. */
export function sidebarWidthClass(step: SidebarStep): string {
  return stepWidthClasses[step];
}

/**
 * The class that keeps the content clear of the sidebar.
 *
 * A collapsed sidebar leaves no inset, so the note takes the whole frame.
 * Below the medium width the sidebar is an overlay, so no step insets there.
 */
export function sidebarInsetClass(size: SidebarSize): string {
  return size.collapsed ? 'md:pl-0' : stepInsetClasses[size.step];
}

/** The step whose width is closest to `width` in pixels. */
export function stepForWidth(width: number): SidebarStep {
  let closest: SidebarStep = sidebarSteps[0];
  let distance = Number.POSITIVE_INFINITY;
  for (const step of sidebarSteps) {
    const gap = Math.abs(stepWidths[step] - width);
    if (gap < distance) {
      distance = gap;
      closest = step;
    }
  }
  return closest;
}

/**
 * The step one keyboard press away, in the given direction.
 *
 * A press at either end stays where it is, so the key never wraps the panel
 * from the widest to the narrowest under the hand of the person.
 */
export function stepAfterKey(
  step: SidebarStep,
  direction: 1 | -1,
): SidebarStep {
  const at = sidebarSteps.indexOf(step);
  const next = Math.min(sidebarSteps.length - 1, Math.max(0, at + direction));
  return sidebarSteps[next] ?? step;
}

/** Reads one stored sidebar size without trusting its shape. */
export function parseSidebarSize(value: unknown): SidebarSize {
  if (typeof value !== 'string' || value === '') return defaultSidebarSize;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return defaultSidebarSize;
  }
  if (parsed === null || typeof parsed !== 'object') return defaultSidebarSize;
  const row: Record<string, unknown> = Object.fromEntries(
    Object.entries(parsed),
  );
  const step = sidebarSteps.find((known) => known === row['step']);
  return {
    step: step ?? defaultSidebarSize.step,
    collapsed: row['collapsed'] === true,
  };
}

/** Writes one sidebar size for {@link parseSidebarSize} to read back. */
export function formatSidebarSize(size: SidebarSize): string {
  return JSON.stringify({ step: size.step, collapsed: size.collapsed });
}
