/**
 * Sanitized KaTeX rendering of stored math.
 *
 * The Markdown parser reports `inlineMath` and `math` nodes with their source.
 * This module turns that source into HTML that the renderer can embed. It uses
 * KaTeX directly rather than through a rehype plugin, because the pinned
 * rehype plugin still selects an older KaTeX release. The HTML it returns is
 * already sanitized, so the renderer inserts it after its own sanitizer ran.
 *
 * What this module never does:
 *
 * - It never trusts the source. KaTeX runs with `trust: false`, so `\href`,
 *   `\includegraphics`, `\htmlData`, and similar commands render as red text
 *   rather than as links or markup. `strict: 'warn'` keeps Unicode text such
 *   as an accented word inside math mode, and warns instead of refusing.
 * - It never renders unbounded work. The source length, the macro count, the
 *   KaTeX `maxSize`, and the KaTeX `maxExpand` are all capped. A document that
 *   exceeds them throws `MathRenderError` and the caller keeps editable source.
 * - It never returns raw KaTeX output. The sanitizer below keeps only the
 *   elements KaTeX draws with: `span` for layout and `svg`, `path`, and
 *   `line` for the radical, the arrow, and the rule. Their attributes are on
 *   a per-element allow list of class tokens, sizes, number lists, keywords,
 *   and path command strings. A `style` value may only set a numeric size or
 *   the error red, so `url(`, `expression(`, and similar shapes cannot
 *   survive.
 *
 * The output uses `output: 'htmlAndMathml'`, so a screen reader reads the
 * MathML branch while the drawn branch stays `aria-hidden`. The KaTeX
 * stylesheet colors follow `currentColor` with Tokyo Night variables set by
 * the caller, for example `--notes-text` on the surrounding note. That
 * stylesheet is loaded by the module that renders the math, so the layout
 * sizes the KaTeX markup needs are present wherever a formula appears.
 */
import katex from 'katex';

/**
 * The fixed resource limits of math rendering.
 *
 * A math source is short by nature. Two thousand characters already hold a
 * long display equation. One hundred macros stop an expansion loop before
 * KaTeX itself must. `maxSize` caps a user set size such as
 * `\rule{500em}{500em}` at fifty ems. `maxExpand` caps macro expansion at two
 * hundred steps, below the KaTeX default of one thousand.
 */
export const mathLimits = {
  /** Largest accepted math source, in characters. */
  maxSourceChars: 2000,
  /** Largest accepted number of control sequences in one source. */
  maxMacros: 100,
  /** Largest accepted KaTeX user set size, in ems. */
  maxSize: 50,
  /** Largest accepted KaTeX macro expansion count. */
  maxExpand: 100,
} as const;

/** Why math rendering was refused. */
export type MathRenderReason = 'limit' | 'syntax';

/**
 * A math source that was refused.
 *
 * `limit` means the source exceeds `mathLimits`. `syntax` means KaTeX threw a
 * parse error. Both cases keep editable source: the caller shows the source
 * region instead of rendered math.
 */
export class MathRenderError extends Error {
  readonly reason: MathRenderReason;

  constructor(reason: MathRenderReason, detail: string) {
    super(`notesapp math ${reason}: ${detail}`);
    this.name = 'MathRenderError';
    this.reason = reason;
  }
}

/** Counts the control sequences of one source, for example `\frac`. */
function countMacros(source: string): number {
  const matches = source.match(/\\[a-zA-Z]+/g);
  return matches === null ? 0 : matches.length;
}

/** The inline style properties KaTeX HTML needs for layout. */
const allowedStyleProperties = new Set([
  'height',
  'top',
  'margin-right',
  'margin-left',
  'margin-top',
  'margin-bottom',
  'padding-left',
  'border-bottom-width',
  'border-right-width',
  'width',
  'min-width',
  'max-width',
  'vertical-align',
  'position',
  'left',
  'right',
  'color',
]);

/** A numeric KaTeX size such as `0.68em` or `-3.06em`. */
const sizeValue = /^-?[0-9]*\.?[0-9]+(?:em|ex|px|pt|%)$/;

/** The KaTeX error red, the only accepted color value. */
const errorColorValue = /^#(?:cc0000|[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Reports whether one `property: value` pair may stay in a style. */
function isSafeStyleDeclaration(property: string, value: string): boolean {
  const name = property.trim().toLowerCase();
  const text = value.trim().toLowerCase();
  if (!allowedStyleProperties.has(name)) return false;
  if (name === 'color') return errorColorValue.test(text);
  if (name === 'position') return text === 'relative';
  return sizeValue.test(text);
}

/**
 * Keeps only safe declarations of one style attribute value.
 *
 * Returns the cleaned value, or `null` when nothing may stay. A dropped
 * declaration only changes layout, never content: the text remains.
 */
function sanitizeStyleValue(raw: string): string | null {
  const kept: string[] = [];
  for (const part of raw.split(';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const property = part.slice(0, colon);
    const value = part.slice(colon + 1);
    if (isSafeStyleDeclaration(property, value))
      kept.push(
        `${property.trim().toLowerCase()}:${value.trim().toLowerCase()}`,
      );
  }
  return kept.length === 0 ? null : kept.join(';');
}

/**
 * Reports whether a whole style attribute value is one that the math
 * sanitizer writes.
 *
 * Every declaration must pass the same rule that `sanitizeStyleValue` keeps,
 * so a surface that lets a style attribute apply can hold its served result
 * to this sanitizer (decision 0140). An empty value, and a part with no
 * colon, is not one this sanitizer writes.
 */
export function isSafeMathStyle(value: string): boolean {
  const parts = value.split(';');
  return (
    value.trim() !== '' &&
    parts.every((part) => {
      const colon = part.indexOf(':');
      return (
        colon !== -1 &&
        isSafeStyleDeclaration(part.slice(0, colon), part.slice(colon + 1))
      );
    })
  );
}

/** A class token the KaTeX HTML emitter writes. */
const classToken = /^[a-zA-Z0-9_-]+$/;

/**
 * Reports whether a class attribute value may stay.
 *
 * A class cannot execute, so the check is a shape check only: non empty
 * tokens of letters, digits, underscore, and hyphen. An empty class is
 * dropped rather than kept as an empty attribute.
 */
function isSafeClassValue(raw: string): boolean {
  const tokens = raw.split(/[\s]+/).filter((token) => token !== '');
  return tokens.length > 0 && tokens.every((token) => classToken.test(token));
}

/** Parses the attributes of one tag into name and raw value pairs. */
function parseAttributes(raw: string): Array<{ name: string; value: string }> {
  const found: Array<{ name: string; value: string }> = [];
  const pattern =
    /([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
  for (;;) {
    const match = pattern.exec(raw);
    if (match === null) return found;
    const name = (match[1] ?? '').toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (name !== '') found.push({ name, value });
  }
}

/** The elements KaTeX draws with, and the attributes each one may carry. */
const allowedElements = new Map<string, ReadonlySet<string>>([
  ['span', new Set(['class', 'aria-hidden', 'style'])],
  [
    'svg',
    new Set([
      'class',
      'style',
      'width',
      'height',
      'viewbox',
      'preserveaspectratio',
      'xmlns',
    ]),
  ],
  ['path', new Set(['class', 'style', 'd'])],
  ['line', new Set(['class', 'style', 'x1', 'y1', 'x2', 'y2', 'stroke-width'])],
]);

/**
 * The element whose text is dropped with it.
 *
 * The MathML branch of the KaTeX output ends with an `annotation` element
 * that repeats the LaTeX source. Keeping that text would make a screen
 * reader read the formula and then read its source, so the sanitizer drops
 * the element and everything inside it.
 */
const droppedElement = 'annotation';

/** A number, with an optional unit, as an SVG attribute value. */
const numberValue = /^-?[0-9]*\.?[0-9]+(?:em|ex|px|pt|%)?$/;

/** A `viewBox` value: two to four numbers separated by spaces or commas. */
const viewBoxValue = /^-?[0-9.]+(?:[ ,]+-?[0-9.]+){1,3}$/;

/** A `preserveAspectRatio` value: alignment keywords only. */
const aspectRatioValue = /^[a-zA-Z]+(?: [a-zA-Z]+)?$/;

/** An SVG path command string: path commands, numbers, and separators only. */
const pathDataValue = /^[MmLlHhVvCcSsQqTtAaZz0-9,.\-+eE\s]+$/;

/** The one namespace KaTeX writes on its `svg` elements. */
const svgNamespace = 'http://www.w3.org/2000/svg';

/**
 * The SVG attribute names that are not all lower case.
 *
 * The parser above compares names in lower case. An HTML parser corrects the
 * case of these two on its own, but an XML parser does not, so the sanitizer
 * writes the canonical spelling back.
 */
const canonicalAttributeNames = new Map([
  ['viewbox', 'viewBox'],
  ['preserveaspectratio', 'preserveAspectRatio'],
]);

/**
 * Reports whether one attribute of a drawing element may stay.
 *
 * Every accepted value is a number, a list of numbers, an alignment keyword,
 * or a path command string. None of them can hold a URL, a script, or a CSS
 * expression, so no drawing attribute can reach outside the formula.
 */
function isSafeDrawingAttribute(name: string, value: string): boolean {
  if (name === 'viewbox') return viewBoxValue.test(value);
  if (name === 'preserveaspectratio') return aspectRatioValue.test(value);
  if (name === 'd') return pathDataValue.test(value);
  if (name === 'xmlns') return value === svgNamespace;
  return numberValue.test(value.trim());
}

/** Renders one accepted attribute back into the output. */
function keptAttribute(
  tagName: string,
  name: string,
  value: string,
): string | null {
  if (name === 'class')
    return isSafeClassValue(value) ? `class="${value}"` : null;
  if (name === 'aria-hidden')
    return value === 'true' || value === 'false'
      ? `aria-hidden="${value}"`
      : null;
  if (name === 'style') {
    const cleaned = sanitizeStyleValue(value);
    return cleaned === null ? null : `style="${cleaned}"`;
  }
  if (tagName === 'span') return null;
  if (!isSafeDrawingAttribute(name, value)) return null;
  const canonical = canonicalAttributeNames.get(name) ?? name;
  return `${canonical}="${value.trim()}"`;
}

/**
 * Sanitizes KaTeX HTML output.
 *
 * Only the elements KaTeX draws with survive: `span` for layout and `svg`,
 * `path`, and `line` for the radical, the arrow, and the rule. Every other
 * element is dropped but its text content is kept, so no content is lost.
 * The one exception is the MathML `annotation` element, whose text is the
 * LaTeX source and is dropped with it. Every attribute that is not on the
 * per-element allow list is dropped, and every accepted value must be a
 * class token, a size, a number list, a keyword, or a path command string.
 * The result holds no `script`, no event handler, no `href`, no `src`, and
 * no `url(`.
 */
export function sanitizeMathHtml(html: string): string {
  // The attribute group is lazy so that the trailing slash of a self closing
  // tag stays outside it and reaches the third group.
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(\s[^<>]*?)?\s*(\/?)>/g;
  let result = '';
  let index = 0;
  let dropDepth = 0;
  for (;;) {
    const match = tagPattern.exec(html);
    if (match === null) {
      if (dropDepth === 0) result += html.slice(index);
      return result;
    }
    const full = match[0] ?? '';
    const tagName = (match[1] ?? '').toLowerCase();
    const rawAttributes = match[2] ?? '';
    const selfClosing = (match[3] ?? '') === '/';
    const start = match.index ?? 0;
    if (dropDepth === 0) result += html.slice(index, start);
    index = start + full.length;
    const closing = full.startsWith('</');
    if (tagName === droppedElement) {
      if (closing) dropDepth = Math.max(0, dropDepth - 1);
      else if (!selfClosing) dropDepth += 1;
      continue;
    }
    if (dropDepth > 0) continue;
    const allowed = allowedElements.get(tagName);
    if (allowed === undefined) continue;
    if (closing) {
      result += `</${tagName}>`;
      continue;
    }
    const kept: string[] = [];
    for (const attribute of parseAttributes(rawAttributes)) {
      if (!allowed.has(attribute.name)) continue;
      const rendered = keptAttribute(tagName, attribute.name, attribute.value);
      if (rendered !== null) kept.push(rendered);
    }
    const open = kept.length === 0 ? tagName : `${tagName} ${kept.join(' ')}`;
    result += selfClosing ? `<${open}/>` : `<${open}>`;
  }
}

/**
 * Renders one math source into sanitized KaTeX markup.
 *
 * Throws `MathRenderError` with reason `limit` when the source exceeds
 * `mathLimits`, and with reason `syntax` when KaTeX refuses it. The caller
 * keeps the editable source in both cases. The returned string holds only
 * sanitized `span` elements and is safe to insert as HTML.
 */
export function renderMath(source: string, display: boolean): string {
  if (source.length > mathLimits.maxSourceChars)
    throw new MathRenderError(
      'limit',
      `math source is ${String(source.length)} characters and the limit is ${String(mathLimits.maxSourceChars)}`,
    );
  if (countMacros(source) > mathLimits.maxMacros)
    throw new MathRenderError(
      'limit',
      `math source holds more than ${String(mathLimits.maxMacros)} macros`,
    );
  let html: string;
  try {
    html = katex.renderToString(source, {
      displayMode: display,
      trust: false,
      strict: 'warn',
      throwOnError: true,
      output: 'htmlAndMathml',
      maxSize: mathLimits.maxSize,
      maxExpand: mathLimits.maxExpand,
    });
  } catch (error: unknown) {
    const detail =
      error instanceof Error ? error.message : 'KaTeX refused the source';
    throw new MathRenderError('syntax', detail);
  }
  return sanitizeMathHtml(html);
}
