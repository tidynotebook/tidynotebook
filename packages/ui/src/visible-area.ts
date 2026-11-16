/**
 * The part of the screen that a person sees, in the coordinates of the page.
 *
 * The keyboard of a phone covers the foot of the screen, but iOS Safari and
 * Android Chrome keep the layout viewport at the full height and shrink only
 * the visual viewport. An overlay placed in the layout viewport therefore
 * opens under the keyboard. Every overlay, a menu of `./menu.tsx` and a list
 * of the editor alike, reads this one area, so each opens where a person can
 * see it (record 0058).
 *
 * {@link visibleArea} is pure, so `./visible-area.test.ts` holds the rule
 * without a browser. {@link readVisibleArea} reads it from the window.
 */

/** A rectangle of the page, by its four edges. */
export type ScreenArea = {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
};

/** The facts of `window.visualViewport` that the area reads. */
export type VisualViewportBox = {
  readonly offsetTop: number;
  readonly offsetLeft: number;
  readonly width: number;
  readonly height: number;
};

/**
 * The visible part of a layout viewport of `layout`, under a visual viewport.
 *
 * The visual viewport, cut to the layout viewport. A browser with no visual
 * viewport, or one that answers an empty box, shows the whole layout
 * viewport.
 */
export function visibleArea(
  visual: VisualViewportBox | null,
  layout: { readonly width: number; readonly height: number },
): ScreenArea {
  const whole = { top: 0, left: 0, bottom: layout.height, right: layout.width };
  if (visual === null) return whole;
  const area = {
    top: Math.max(0, visual.offsetTop),
    left: Math.max(0, visual.offsetLeft),
    bottom: Math.min(layout.height, visual.offsetTop + visual.height),
    right: Math.min(layout.width, visual.offsetLeft + visual.width),
  };
  return area.bottom > area.top && area.right > area.left ? area : whole;
}

/** The visible part of the screen now. */
export function readVisibleArea(): ScreenArea {
  const root = document.documentElement;
  return visibleArea(window.visualViewport ?? null, {
    width: root.clientWidth,
    height: root.clientHeight,
  });
}

/**
 * Calls `follow` each time the visible area moves, and answers the stop.
 *
 * The keyboard of a phone changes the visual viewport alone, and the window
 * sends no `resize` for it. The visual viewport also moves with every resize
 * of the window, so it is the one source, and a browser without it falls
 * back to the window.
 */
export function followVisibleArea(follow: () => void): () => void {
  const visual = window.visualViewport ?? null;
  if (visual === null) {
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('resize', follow);
    };
  }
  visual.addEventListener('resize', follow);
  visual.addEventListener('scroll', follow);
  return () => {
    visual.removeEventListener('resize', follow);
    visual.removeEventListener('scroll', follow);
  };
}
