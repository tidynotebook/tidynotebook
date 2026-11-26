/**
 * Where an overlay sits, as a pure function of four rectangles.
 *
 * A menu opens next to the control that owns it, and the control can be
 * anywhere: at the foot of a list that scrolls, or in a deep row of a narrow
 * sidebar. An overlay that is laid out inside that scrolling box is cut by it,
 * because a box that scrolls on one axis clips on both. The menu therefore
 * leaves the box and takes a place in the coordinates of the screen.
 *
 * A place on the screen is two numbers that only the browser can measure, so
 * it cannot be a utility class. This module is the one place that decides
 * those numbers, and `./menu.tsx` is the one place that writes them. Every
 * other decision of an overlay, its colour, its edge, its radius, its padding
 * and its depth, stays in the named scales. See
 * [decision 0058](../../../docs/decisions/0058-an-overlay-is-placed-on-the-screen.md).
 *
 * The room is the visible part of the screen (`./visible-area.ts`), so a menu
 * that opens while the keyboard of a phone is up stays above the keyboard.
 *
 * Nothing here reads the document, so `./overlay-position.test.ts` holds every
 * rule without a browser.
 */
import type { ScreenArea } from './visible-area.ts';

/** A size in device independent pixels. */
export type OverlaySize = {
  readonly width: number;
  readonly height: number;
};

/** A rectangle in the coordinates of the screen. */
export type OverlayRect = OverlaySize & {
  readonly top: number;
  readonly left: number;
};

/** Which edge of the overlay lines up with which edge of its anchor. */
export type OverlayAlign = 'start' | 'end';

/** Where one overlay sits, in the coordinates of the screen. */
export type OverlayPlacement = {
  readonly top: number;
  readonly left: number;
  /** The tallest the overlay can be in the room it was given. */
  readonly maxHeight: number;
  /** True when the overlay sits above its anchor instead of below it. */
  readonly above: boolean;
};

/** The distance between the anchor and the overlay. */
export const overlayGap = 4;

/** The least distance between the overlay and the edge of the screen. */
export const overlayMargin = 8;

/**
 * The tallest an overlay is, whatever room it has.
 *
 * A list of every workspace or every action must not fill the screen. It
 * scrolls instead, which the person can see, because the bound cuts the last
 * row in half and never on a row boundary.
 */
export const overlayMaxHeight = 320;

/** Holds `value` between `low` and `high`, and prefers `low` when they cross. */
function clamp(value: number, low: number, high: number): number {
  return high < low ? low : Math.min(Math.max(value, low), high);
}

/**
 * Places one overlay against one anchor.
 *
 * The overlay opens below its anchor. It moves above when it does not fit
 * below and there is more room above, so the rows of a menu on the last line
 * of a list are all reachable. It never leaves the screen on either side: an
 * overlay wider than the room to its left is pulled back to the margin rather
 * than cut off, which is what a deep row of a narrow sidebar needs.
 */
export function placeOverlay(input: {
  readonly anchor: OverlayRect;
  /** The size the overlay wants, measured with no bound on its height. */
  readonly overlay: OverlaySize;
  /** The part of the screen that a person sees. */
  readonly screen: ScreenArea;
  readonly align: OverlayAlign;
  readonly heightLimit?: number;
  readonly bottomInset?: number;
}): OverlayPlacement {
  const {
    anchor,
    overlay,
    screen,
    align,
    heightLimit = overlayMaxHeight,
    bottomInset = 0,
  } = input;

  const bottom = screen.bottom - bottomInset;
  const below = anchor.top + anchor.height + overlayGap;
  const roomBelow = Math.max(bottom - below - overlayMargin, 0);
  // An overlay above its anchor ends at the anchor, or at the foot of the
  // visible area when the anchor stands under it, as under a keyboard.
  const aboveEnd = Math.min(anchor.top - overlayGap, bottom - overlayMargin);
  const roomAbove = Math.max(aboveEnd - overlayMargin - screen.top, 0);
  const fitsBelow = overlay.height <= roomBelow;
  const above = !fitsBelow && roomAbove > roomBelow;
  const room = Math.min(above ? roomAbove : roomBelow, heightLimit);
  const height = Math.min(overlay.height, room);
  const top = above ? aboveEnd - height : below;

  const wanted =
    align === 'end' ? anchor.left + anchor.width - overlay.width : anchor.left;
  const left = clamp(
    wanted,
    screen.left + overlayMargin,
    screen.right - overlay.width - overlayMargin,
  );

  return { top, left, maxHeight: room, above };
}
