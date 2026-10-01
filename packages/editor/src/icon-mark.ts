/**
 * The one way the editor draws a glyph of the icon set.
 *
 * The editor builds plain DOM and reads no React component, so it cannot
 * render an icon of `packages/ui/src/icons.tsx`. Every glyph it draws follows
 * the same grid there: the 24 viewport, the stroke of 1.5, and round ends,
 * as `packages/ui/src/icon-grid.ts` states. This module holds that grid once
 * for the editor. A shared geometry exported by `packages/ui` would remove the
 * second statement of the grid, and it needs a package entry of its own.
 */

/** The namespace of an SVG element. */
const svgNamespace = 'http://www.w3.org/2000/svg';

/** One part of a glyph: an SVG path, a line through points, or a dot. */
export type GlyphPart =
  | { readonly kind: 'path'; readonly d: string }
  | { readonly kind: 'polyline'; readonly points: string }
  | {
      readonly kind: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
    };

/** Draws one glyph of the icon grid, hidden from assistive software. */
export function glyph(
  className: string,
  parts: readonly GlyphPart[],
): SVGElement {
  const mark = document.createElementNS(svgNamespace, 'svg');
  mark.setAttribute('class', className);
  mark.setAttribute('viewBox', '0 0 24 24');
  mark.setAttribute('fill', 'none');
  mark.setAttribute('stroke', 'currentColor');
  mark.setAttribute('stroke-width', '1.5');
  mark.setAttribute('stroke-linecap', 'round');
  mark.setAttribute('stroke-linejoin', 'round');
  mark.setAttribute('aria-hidden', 'true');
  for (const part of parts) {
    const element = document.createElementNS(svgNamespace, part.kind);
    if (part.kind === 'path') element.setAttribute('d', part.d);
    else if (part.kind === 'polyline')
      element.setAttribute('points', part.points);
    else {
      element.setAttribute('cx', String(part.cx));
      element.setAttribute('cy', String(part.cy));
      element.setAttribute('r', String(part.r));
    }
    mark.append(element);
  }
  return mark;
}

/**
 * Three dots in each of two lines: the grip of a handle that a person drags.
 * A vertical grip stands beside a row or an item, and a flat one stands above
 * a column.
 */
export function gripParts(vertical: boolean): readonly GlyphPart[] {
  return [9, 15].flatMap((across) =>
    [6, 12, 18].map((along): GlyphPart => ({
      kind: 'circle',
      cx: vertical ? across : along,
      cy: vertical ? along : across,
      r: 1,
    })),
  );
}

/** A plus, the mark of a control that adds, as `PlusIcon` of the set draws it. */
export const plusParts: readonly GlyphPart[] = [
  { kind: 'path', d: 'M12 5v14' },
  { kind: 'path', d: 'M5 12h14' },
];
