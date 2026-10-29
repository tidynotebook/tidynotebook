/**
 * The parts of the glyphs that plain DOM draws, as data.
 *
 * `./glyph.ts` draws them. They are the parts of the icon of the same name in
 * `./icons.tsx`, and `tools/source-text.test.mjs` reads that file as text and
 * holds each glyph to its icon, so a glyph of a plain DOM control is the glyph
 * of the same action everywhere else.
 */

/** One part of a glyph: an SVG path, a line through points, or a circle. */
export type GlyphPart =
  | { readonly kind: 'path'; readonly d: string }
  | { readonly kind: 'polyline'; readonly points: string }
  | {
      readonly kind: 'line';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    }
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly rx: number;
    }
  | {
      readonly kind: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
    };

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

/** The glyph of `PlusIcon`, the mark of a control that adds. */
export const plusParts: readonly GlyphPart[] = [
  { kind: 'line', x1: 12, y1: 5, x2: 12, y2: 19 },
  { kind: 'line', x1: 5, y1: 12, x2: 19, y2: 12 },
];

/** The glyph of `CopyIcon`. */
export const copyParts: readonly GlyphPart[] = [
  { kind: 'rect', x: 9, y: 9, width: 13, height: 13, rx: 2 },
  {
    kind: 'path',
    d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  },
];

/** The glyph of `CheckIcon`. */
export const checkParts: readonly GlyphPart[] = [
  { kind: 'polyline', points: '20 6 9 17 4 12' },
];

/** The glyph of `CloseIcon`. */
export const closeParts: readonly GlyphPart[] = [
  { kind: 'line', x1: 18, y1: 6, x2: 6, y2: 18 },
  { kind: 'line', x1: 6, y1: 6, x2: 18, y2: 18 },
];

/** The glyph of `ArrowUpIcon`. */
export const arrowUpParts: readonly GlyphPart[] = [
  { kind: 'path', d: 'M12 19V5' },
  { kind: 'polyline', points: '5 12 12 5 19 12' },
];

/** The glyph of `ArrowDownIcon`. */
export const arrowDownParts: readonly GlyphPart[] = [
  { kind: 'path', d: 'M12 5v14' },
  { kind: 'polyline', points: '5 12 12 19 19 12' },
];

/** The glyph of `ChevronDownIcon`. */
export const chevronDownParts: readonly GlyphPart[] = [
  { kind: 'polyline', points: '6 9 12 15 18 9' },
];
/** The glyph of `MoreIcon`. */
export const moreParts: readonly GlyphPart[] = [
  { kind: 'circle', cx: 12, cy: 5, r: 1.5 },
  { kind: 'circle', cx: 12, cy: 12, r: 1.5 },
  { kind: 'circle', cx: 12, cy: 19, r: 1.5 },
];
/** The glyph of `ReplaceIcon`. */
export const replaceParts: readonly GlyphPart[] = [
  { kind: 'path', d: 'M4 7h12l-3-3' },
  { kind: 'path', d: 'M20 17H8l3 3' },
];
