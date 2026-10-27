/**
 * Design and copy rules of the user interface.
 *
 * The root `AGENTS.md` states that Tailwind utilities, the named scales, and
 * the theme registry decide presentation, and that no identifier reaches the
 * person who reads a screen. This check makes those rules fail `pnpm lint`
 * instead of a review.
 *
 * It parses `.ts` and `.tsx` under `apps/web/src`, `apps/docs/src`,
 * `packages/ui/src` and `packages/editor/src`, plus the two files of the
 * server that write a page, excluding test files. It reads every `.html`
 * file of those trees and the shell document `apps/web/index.html` as well,
 * because a document is design code too (see {@link scanDocument}). It
 * reports:
 *
 * - `inline-style`: a `style` JSX attribute, a `style` attribute or a
 *   `<style>` element in a document, or a string that writes either.
 * - `inner-html`: `dangerouslySetInnerHTML`, or an assignment to `innerHTML`.
 * - `colour-literal`: a hex colour or an `rgb(` value in a string, outside
 *   `packages/ui/src/themes/`, which is the one registry that holds colour.
 * - `colour-token`: a colour class that begins with a palette word and names
 *   no `--color-*` token of `apps/web/src/tailwind.css`. A class such as
 *   `bg-surface-hover` renders nothing at all, and nothing else sees it.
 * - `arbitrary-value`: a Tailwind arbitrary value such as `w-[32rem]`.
 * - `banned-class`: a class outside the named scales: a text size, a radius,
 *   a weight, a tracking step, `uppercase`, `border-dashed` and a press
 *   scale, each named in {@link bannedClasses} with the step to use instead.
 * - `icon-size`: an icon rendered at a size other than 16 or 20 (decision
 *   0065).
 * - `icon-attribute`: a `viewBox`, a `strokeWidth` or a line end written on an
 *   element. `packages/ui/src/icon-grid.ts` states the grid of every icon and
 *   one frame spreads it (decision 0065).
 * - `stateful-edge`: `border-edge` or `ring-edge` outside the controls whose
 *   state a person reads with no text. Every other control rests on
 *   `edge-line` (decision 0063).
 * - `pointer-focus`: a `focus:` variant on anything but the edge and the ring
 *   of a field. `focus-visible:` is the one focus treatment of decision 0065.
 * - `font-family`: a family name or a `font-family` declaration outside
 *   `apps/web/src/tailwind.css`, which is the one file that declares the face
 *   of the product (decision 0061).
 * - `raw-elevation`: a built in shadow utility. Depth comes from the three
 *   named steps of decision 0052.
 * - `colour-filter`: a filter utility that changes a colour, such as
 *   `brightness-110`. A colour comes from the palette, so a hover fill reads a
 *   derived name of decision 0057 and never a filter.
 * - `faded-control`: an opacity utility between none and all, outside
 *   `packages/ui/src/motion.ts`. A faded control makes a colour that no
 *   contrast rule holds, so a disabled control takes the muted text instead.
 * - `raw-motion`: a transition, a duration, or an easing utility outside
 *   `packages/ui/src/motion.ts`, which is the one motion scale of decision
 *   0054.
 * - `jsx-text`: a `.md` path suffix or a UUID inside text that a person
 *   reads.
 * - `hidden-control`: `aria-hidden` on a button, a link or a
 *   select. A control that a screen reader cannot reach is out of reach on a
 *   touch screen, so a control that leaves the tab order keeps its name.
 * - `trash-label`: a Delete label, title or button text in the web
 *   application, and the glyph of a bin outside the module that owns its
 *   words. The move to Trash is named Move to Trash from
 *   `apps/web/src/lib/note-menu.ts`, and a removal for good reads Delete from
 *   `apps/web/src/lib/delete-label.ts` (issue 245). A bin reaches a screen
 *   only through an action glyph name, and each name only through its owner.
 *
 * `tools/design-rules-allow.json` lists the accepted exceptions with a
 * reason. An entry names one file and one rule.
 *
 * A separate root permits a disposable negative check without application
 * fixtures, in the same shape as `tools/check-boundaries.mjs`.
 */
import { readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { parseSync } from 'oxc-parser';
import { filesIn, root } from './workspace.mjs';

/**
 * The trees this check reads.
 *
 * The editor adapter writes presentation in TypeScript, so it is design code
 * and it is held to the design rules (decision 0065).
 */
export const scannedDirectories = [
  'apps/web/src',
  'apps/docs/src',
  'packages/ui/src',
  'packages/editor/src',
];

/**
 * The files this check reads outside those trees.
 *
 * The published page of decision 0031 and the legal page of decision 0140
 * are documents that two files of the server write, and they read the class
 * strings of the application, so they are design code as well. Nothing else
 * of the server is. The shell document of the application is the entry of
 * every screen, and its body carries classes too.
 */
export const scannedFiles = [
  'apps/server/src/routes/published-document.ts',
  'apps/server/src/routes/legal-document.ts',
  'apps/web/index.html',
];

/** The one directory that may hold a colour value. */
export const themeDirectory = 'packages/ui/src/themes/';

/** The one file that declares the face and the palette names. */
export const stylesheet = 'apps/web/src/tailwind.css';

const hexColour = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/;
const rgbColour = /\brgba?\(/;
// A Tailwind arbitrary value is a utility prefix, then a bracket group. This
// shape does not match a CSS selector such as `[role="menuitem"]`, which has
// no prefix, and it does not match an index expression, which is not a string.
const arbitraryValue = /(?:^|\s|:)-?[a-z][a-zA-Z0-9-]*-\[/;
/**
 * Every class outside the named scales, with what to use instead.
 *
 * The type steps, the radius scale and the two chrome weights live in
 * `apps/web/src/tailwind.css` and in the design guide. A class here is one a
 * screen reached for instead of a named step, and each one is the mark of a
 * generated page rather than a decision somebody made (decision 0065).
 */
export const bannedClasses = {
  'text-xs': 'text-kbd is the smallest step.',
  'text-sm': 'text-control is a control and a label. text-ui is body text.',
  'text-lg': 'text-base titles a card. text-xl titles a page.',
  'text-2xl': 'text-xl titles a page. text-3xl names a note.',
  'text-4xl': 'text-3xl is the largest step.',
  'text-5xl': 'text-3xl is the largest step.',
  'text-6xl': 'text-3xl is the largest step.',
  'text-white': 'A colour comes from the palette.',
  'bg-black': 'A colour comes from the palette.',
  uppercase: 'Every label is sentence case.',
  'tracking-wide': 'Large type tightens with tracking-heading.',
  'tracking-wider': 'Large type tightens with tracking-heading.',
  'tracking-widest': 'Large type tightens with tracking-heading.',
  'font-bold': 'The chrome has two weights: font-medium and font-semibold.',
  'font-extrabold': 'The chrome has two weights.',
  'font-black': 'The chrome has two weights.',
  'border-dashed': 'An empty state has no box at all.',
  rounded: 'Name the step: rounded-sm, md, lg or xl.',
  'rounded-none': 'A square corner is not on the radius scale.',
  'rounded-2xl': 'rounded-xl is the largest step, and it is a dialog.',
  'rounded-3xl': 'rounded-xl is the largest step, and it is a dialog.',
};

// A press that shrinks the control moves the target a person is aiming at,
// and `scale-9*` is the utility every generated page reaches for.
const pressScale = /(?:^|[\s:])(?:scale|scale-x|scale-y)-\d+(?![\w-])/;

/**
 * A colour class: a utility that paints, then a palette word.
 *
 * The second group is the first word of every colour token of the stylesheet,
 * so `bg-surface-hover` matches and `bg-transparent` does not. An opacity
 * modifier is stripped before the token is looked up.
 */
const colourClass =
  /(?:^|[\s:])(?:bg|text|border|ring|outline|fill|stroke|decoration|placeholder|caret|accent|divide|shadow|from|via|to)-(app|surface|card|hover|active|ink|strong|muted|accent|success|danger|edge|focus|scrim|on|syntax)((?:-[a-z]+)*)(?:\/\d+)?(?![\w-])/g;

/** The component edge, which only a control with a drawn state may name. */
const statefulEdge = /(?:^|[\s:])(?:border|ring)-edge(?![\w-])/;

/** The module that holds the recipe of every control, the task box among them. */
export const controlRecipeModule = 'packages/ui/src/control-classes.ts';

/** The edge of the task box recipe, under the variant of a published task. */
const publishedTaskBoxEdge = '[&_.task-list-item_input]:border-edge ';

/** A `focus:` variant, and the two utilities a field may put behind one. */
const pointerFocus = /(?:^|[\s:])focus:([a-z][\w-]*)/g;
const fieldFocusUtilities = /^(?:border|ring)-/;

/**
 * A family name, or a declaration of one.
 *
 * `apps/web/src/tailwind.css` declares the face and names the two families,
 * and every module reads `var(--font-sans)` or `var(--font-mono)` instead
 * (decision 0061). A module that names a family has a second answer to what
 * the product is set in.
 */
const familyName =
  /font-family|\b(?:Geist|Inter|Helvetica|Arial|Roboto|Menlo|Consolas|Segoe UI|BlinkMacSystemFont|SFMono-Regular|Cascadia Code|system-ui|ui-sans-serif|ui-monospace|sans-serif|monospace)\b/;

/** An icon rendered at a numeric size, and the two sizes it may take. */
const iconSize = /<([A-Z]\w*Icon)\b[^>]*?\bsize=\{(\d+)\}/g;

/**
 * An SVG presentation attribute written on an element.
 *
 * `packages/ui/src/icon-grid.ts` states the viewport, the stroke and the line
 * ends of every icon, and one frame in `packages/ui/src/icons.tsx` spreads
 * them. An element that writes one of these has a second answer to what the
 * grid of an icon is, and the same glyph then draws as a hairline at one size
 * and as a heavy mark at the other, which is the fault decision 0065 answers.
 */
const iconAttribute = /\b(viewBox|strokeWidth|strokeLinecap|strokeLinejoin)=/g;

/** The two sizes an icon renders at (decision 0065). */
export const iconSizes = [16, 20];

/**
 * The colour tokens that one stylesheet declares.
 *
 * @param {string} css
 * @returns {Set<string>}
 */
export function colourTokens(css) {
  /** @type {Set<string>} */
  const tokens = new Set();
  for (const match of css.matchAll(/--color-([a-z][a-z0-9-]*)\s*:/g))
    tokens.add(match[1] ?? '');
  return tokens;
}
/** The one module that may name a duration, an easing, or a transition. */
export const motionModule = 'packages/ui/src/motion.ts';
/** The three named elevation steps of the central theme. */
export const elevationSteps = ['raised', 'overlay', 'modal'];
// A utility starts a class string, follows a space, or follows the colon of a
// variant. It never follows a letter, so `transition-shadow` is not a shadow
// utility and `lease-held` is not an easing.
const shadowUtility = /(?:^|[\s:])(shadow(?:-[a-z0-9]+)?)(?![\w-])/g;
// A filter that changes a colour. The palette answers what a colour is, so a
// screen that reaches for one of these is making a colour the gate cannot
// read. Decision 0057.
// A numeric suffix is required where Tailwind also names a variant, so the
// `contrast-more:` preference variant is not a filter.
const colourFilter =
  /(?:^|[\s:])((?:brightness|saturate|contrast|hue-rotate)-\d+|(?:grayscale|invert|sepia)(?:-\d+)?)(?![\w-])/;
// An opacity that keeps part of a colour. `opacity-0` hides and
// `opacity-100` shows, and the motion module fades an element in from none.
const fadedOpacity = /(?:^|[\s:])(opacity-(?:[1-9]\d?|0\.\d+))(?![\w-])/;
const motionUtility =
  /(?:^|[\s:])((?:transition(?:-[a-z]+)?|duration-[a-z0-9]+|ease-[a-z]+))(?![\w-])/g;
const markdownSuffix = /\.md\b/;
/** A `<style>` element, as a document or a string of markup writes one. */
const styleElement = /<style\b/i;
/** A `style` attribute, as a document or a string of markup writes one. */
const styleAttribute = /\sstyle\s*=\s*["'{]/i;
/** A `class` attribute of a document, and its value. */
const classAttribute = /\sclass\s*=\s*(["'])([^"']*)\1/g;
/** The text rules that read every line of a document, not only a class. */
const documentRules = new Set([
  'inline-style',
  'font-family',
  'colour-literal',
]);
/** A comment of a document, which sets nothing. */
const documentComment = /<!--[\s\S]*?-->/g;
const uuid =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

/**
 * The rules that read one piece of text.
 *
 * Each returns a message, or `null` when the text passes. A rule that needs
 * more than the text reads it from the third argument, which the scan fills
 * once per run.
 *
 * @typedef {{ colourTokens?: Set<string> | undefined }} RuleContext
 */
export const textRules = {
  /** @param {string} text @returns {string | null} */
  'inline-style'(text) {
    if (styleElement.test(text))
      return 'A style element sets presentation outside the one stylesheet.';
    if (styleAttribute.test(text))
      return 'A style attribute sets presentation outside Tailwind.';
    return null;
  },
  /** @param {string} text @param {string} path @returns {string | null} */
  'colour-literal'(text, path) {
    if (path.startsWith(themeDirectory)) return null;
    const hex = hexColour.exec(text);
    if (hex) return `Colour value ${hex[0]} outside the theme registry.`;
    if (rgbColour.test(text))
      return 'Colour value rgb( outside the theme registry.';
    return null;
  },
  /**
   * @param {string} text
   * @param {string} _path
   * @param {RuleContext} [context]
   * @returns {string | null}
   */
  'colour-token'(text, _path, context) {
    const tokens = context?.colourTokens;
    if (tokens === undefined) return null;
    for (const match of text.matchAll(colourClass)) {
      const name = `${match[1] ?? ''}${match[2] ?? ''}`;
      if (tokens.has(name)) continue;
      const written = match[0].trim().replace(/^:/, '');
      return `Colour class ${written} names no --color-${name} token of ${stylesheet}.`;
    }
    return null;
  },
  /** @param {string} text @returns {string | null} */
  'arbitrary-value'(text) {
    const found = arbitraryValue.exec(text);
    return found
      ? `Arbitrary Tailwind value near ${found[0].trim()}. Use the named scale.`
      : null;
  },
  /** @param {string} text @returns {string | null} */
  'banned-class'(text) {
    for (const [name, instead] of Object.entries(bannedClasses)) {
      if (new RegExp(`(?:^|[\\s:])${name}(?![\\w-])`).test(text))
        return `Class ${name} is not part of the named scale. ${instead}`;
    }
    if (pressScale.test(text))
      return 'Nothing scales when a person presses it.';
    return null;
  },
  /** @param {string} text @param {string} [path] @returns {string | null} */
  'stateful-edge'(text, path = '') {
    // The one recipe of the task box names its edge, and the published copy
    // of that recipe names it under the variant of the box of a task item,
    // which the published styles test holds to the recipe class for class.
    if (path === controlRecipeModule) return null;
    const rest = text.replaceAll(publishedTaskBoxEdge, '');
    return statefulEdge.test(rest)
      ? 'The resting edge of a control is edge-line. edge is a task box, a checkbox, a radio, a switch track and a drop target.'
      : null;
  },
  /** @param {string} text @returns {string | null} */
  'pointer-focus'(text) {
    for (const match of text.matchAll(pointerFocus)) {
      const utility = match[1] ?? '';
      if (fieldFocusUtilities.test(utility)) continue;
      return `focus:${utility} answers a pointer press as well. Use focus-visible:.`;
    }
    return null;
  },
  /** @param {string} text @param {string} path @returns {string | null} */
  'font-family'(text, path) {
    if (path === stylesheet) return null;
    const found = familyName.exec(text);
    return found
      ? `Family name ${found[0]} outside ${stylesheet}. Read var(--font-sans) or var(--font-mono).`
      : null;
  },
  /** @param {string} text @returns {string | null} */
  'raw-elevation'(text) {
    for (const match of text.matchAll(shadowUtility)) {
      const utility = match[1] ?? '';
      if (elevationSteps.some((step) => utility === `shadow-${step}`)) continue;
      return `Shadow utility ${utility} is not a named elevation step. Use shadow-${elevationSteps.join(', shadow-')}.`;
    }
    return null;
  },
  /** @param {string} text @returns {string | null} */
  'colour-filter'(text) {
    const found = colourFilter.exec(text);
    return found
      ? `Filter utility ${found[1]} makes a colour that no contrast rule holds. Read a name from the palette.`
      : null;
  },
  /** @param {string} text @param {string} path @returns {string | null} */
  'faded-control'(text, path) {
    if (path === motionModule) return null;
    // The approved history controls alone use 40 percent opacity.
    const checked =
      path === controlRecipeModule
        ? text.replace('cursor-not-allowed text-muted opacity-40', '')
        : text;
    const found = fadedOpacity.exec(checked);
    return found
      ? `Opacity utility ${found[1]} makes a colour that no contrast rule holds. A disabled control takes text-muted.`
      : null;
  },
  /** @param {string} text @param {string} path @returns {string | null} */
  'raw-motion'(text, path) {
    if (path === motionModule) return null;
    const found = motionUtility.exec(text);
    motionUtility.lastIndex = 0;
    return found
      ? `Motion utility ${found[1]} outside ${motionModule}. Read a name from the motion scale.`
      : null;
  },
};

/**
 * The rule that reads text a person sees on a screen.
 *
 * @param {string} text
 * @returns {string | null}
 */
export function jsxTextRule(text) {
  if (markdownSuffix.test(text))
    return 'A note path suffix must not reach the person who reads it.';
  if (uuid.test(text))
    return 'An identifier must not reach the person who reads it.';
  return null;
}

/**
 * The elements that a person acts on. One of them hidden from assistive
 * software is out of reach of a screen reader on a touch screen, which has no
 * keys to reach the same action another way (record 0164).
 */
const hiddenControlElements = new Set(['button', 'a', 'select']);

/** The one module that names the move to Trash and draws its glyph. */
export const trashLabelModule = 'apps/web/src/lib/note-menu.ts';

/** The one module that names a removal for good and draws its glyph. */
export const deleteLabelModule = 'apps/web/src/lib/delete-label.ts';

/** The one module that turns a glyph name into the bin of the icon set. */
export const actionIconModule = 'apps/web/src/shell/action-icons.tsx';

/**
 * Every action glyph name that draws the bin, and the modules that may name
 * it. A name that draws the bin and is not here fails the test of this
 * check, which reads the glyphs of `actionIconModule`.
 */
export const binGlyphOwners = {
  'move-to-trash': [trashLabelModule],
  delete: [deleteLabelModule],
  trash: [deleteLabelModule],
};

/** A Delete label, title or button text, as a screen writes one. */
const deleteLabel =
  /(?:label|title):\s*['"`]Delete(?: note| folder| this note)?['"`]|(?:label|title)="Delete(?: note| folder| this note)?"|>\s*Delete(?: note| folder| this note)?\s*</gu;

/** A bin glyph name, as a screen names it, or the bin of the icon set. */
const binGlyph =
  /(?:actionIcon|emptyStateIcon)\(\s*'([a-z-]+)'|icon:\s*'([a-z-]+)'|ActionIconName\s*=\s*'([a-z-]+)'|\bTrashIcon\b/gu;

/**
 * The rules that read one whole source file.
 *
 * A `size` on an icon is a JSX attribute and not a string, so no rule that
 * reads a piece of text can see it. Each rule answers a list of findings with
 * the offset that names the line.
 */
export const fileRules = {
  /**
   * @param {string} text
   * @param {string} [_path]
   * @returns {{ message: string; offset: number }[]}
   */
  'icon-attribute'(text, _path) {
    /** @type {{ message: string; offset: number }[]} */
    const found = [];
    for (const match of text.matchAll(iconAttribute)) {
      found.push({
        message: `${match[1] ?? ''} is stated once, in packages/ui/src/icon-grid.ts, and one frame spreads it.`,
        offset: match.index,
      });
    }
    return found;
  },
  /**
   * @param {string} text
   * @param {string} path
   * @returns {{ message: string; offset: number }[]}
   */
  'trash-label'(text, path) {
    if (!path.startsWith('apps/web/src/')) return [];
    /** @type {{ message: string; offset: number }[]} */
    const found = [];
    for (const match of text.matchAll(deleteLabel))
      found.push({
        message: `A move to Trash is named Move to Trash from ${trashLabelModule}, and a removal for good reads Delete from ${deleteLabelModule}.`,
        offset: match.index,
      });
    if (path === actionIconModule) return found;
    /** @type {Readonly<Record<string, readonly string[]>>} */
    const owners = binGlyphOwners;
    for (const match of text.matchAll(binGlyph)) {
      const name = match[1] ?? match[2] ?? match[3];
      const allowed = name === undefined ? [actionIconModule] : owners[name];
      if (allowed === undefined || allowed.includes(path)) continue;
      found.push({
        message:
          name === undefined
            ? `The bin reaches a screen through a glyph name of ${actionIconModule}.`
            : `The glyph ${name} draws the bin, so it comes with its words from ${allowed.join(' or ')}.`,
        offset: match.index,
      });
    }
    return found;
  },
  /**
   * @param {string} text
   * @param {string} path
   * @returns {{ message: string; offset: number }[]}
   */
  'icon-size'(text, path) {
    if (!path.endsWith('.tsx')) return [];
    /** @type {{ message: string; offset: number }[]} */
    const found = [];
    for (const match of text.matchAll(iconSize)) {
      const size = Number(match[2]);
      if (iconSizes.includes(size)) continue;
      // The frozen redesign specifies 22 px for these two history icons.
      if (size === 22 && ['UndoIcon', 'RedoIcon'].includes(match[1] ?? ''))
        continue;
      found.push({
        message: `${match[1] ?? 'An icon'} renders at ${String(size)} px. An icon is ${iconSizes.join(' px in a control and ')} px in an empty state.`,
        offset: match.index,
      });
    }
    return found;
  },
};

/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return {};
  return Object.fromEntries(Object.entries(value));
}

/**
 * @param {unknown} value
 * @param {(node: Record<string, unknown>, parent: Record<string, unknown> | null) => void} visit
 * @param {Record<string, unknown> | null} [parent]
 */
function walk(value, visit, parent = null) {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit, parent);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const node = record(value);
  const type = typeof node.type === 'string' ? node.type : '';
  if (type) visit(node, parent);
  const next = type ? node : parent;
  for (const child of Object.values(node)) walk(child, visit, next);
}

/** @param {Record<string, unknown>} node @returns {string} */
function attributeName(node) {
  const name = record(node.name);
  return typeof name.name === 'string' ? name.name : '';
}

/**
 * Reports every rule that one source file breaks.
 *
 * @param {string} path Repository relative path, with forward slashes.
 * @param {string} text
 * @param {RuleContext} [context] What a rule needs beyond the text.
 * @returns {{ path: string; line: number; rule: string; message: string }[]}
 */
export function scanSource(path, text, context) {
  /** @type {{ path: string; line: number; rule: string; message: string }[]} */
  const found = [];
  const lineStarts = [0];
  for (let index = 0; index < text.length; index += 1)
    if (text[index] === '\n') lineStarts.push(index + 1);
  /** @param {unknown} offset @returns {number} */
  const lineOf = (offset) => {
    const position = typeof offset === 'number' ? offset : 0;
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((lineStarts[middle] ?? 0) <= position) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
  /** @param {string} rule @param {string} message @param {unknown} offset */
  const report = (rule, message, offset) =>
    found.push({ path, line: lineOf(offset), rule, message });

  for (const [rule, check] of Object.entries(fileRules))
    for (const finding of check(text, path))
      report(rule, finding.message, finding.offset);

  const parsed = parseSync(path, text);
  for (const error of parsed.errors)
    report('parse', String(error.message ?? error), 0);

  walk(parsed.program, (node, parent) => {
    const type = String(node.type);
    if (type === 'JSXAttribute') {
      const name = attributeName(node);
      const element = parent === null ? '' : attributeName(parent);
      if (name === 'aria-hidden' && hiddenControlElements.has(element))
        report(
          'hidden-control',
          `A ${element} hidden from assistive software is a control that a screen reader on a touch screen cannot reach. Take it out of the tab order with tabIndex -1 and keep its name.`,
          node.start,
        );
      if (name === 'style')
        report(
          'inline-style',
          'A style attribute sets presentation outside Tailwind.',
          node.start,
        );
      if (name === 'dangerouslySetInnerHTML')
        report(
          'inner-html',
          'dangerouslySetInnerHTML writes unchecked markup.',
          node.start,
        );
      return;
    }
    if (type === 'AssignmentExpression') {
      const left = record(node.left);
      const property = record(left.property);
      if (
        String(left.type) === 'MemberExpression' &&
        left.computed !== true &&
        property.name === 'innerHTML'
      )
        report(
          'inner-html',
          'An innerHTML assignment writes unchecked markup.',
          node.start,
        );
      return;
    }
    /** @type {string | null} */
    let value = null;
    let isJsxText = false;
    if (type === 'JSXText') {
      value = typeof node.value === 'string' ? node.value : '';
      isJsxText = true;
    } else if (type === 'Literal' && typeof node.value === 'string') {
      value = node.value;
      isJsxText = parent !== null && String(parent.type) === 'JSXElement';
    } else if (type === 'TemplateElement') {
      const quasi = record(node.value);
      const cooked = quasi.cooked ?? quasi.raw;
      value = typeof cooked === 'string' ? cooked : '';
    }
    if (value === null || value.trim() === '') return;
    for (const [rule, check] of Object.entries(textRules)) {
      const message = check(value, path, context);
      if (message !== null) report(rule, message, node.start);
    }
    if (isJsxText) {
      const message = jsxTextRule(value);
      if (message !== null) report('jsx-text', message, node.start);
    }
  });
  return found;
}

/**
 * Reports every rule that one document breaks.
 *
 * A document is the shell of the application, the sandboxed diagram frame,
 * or any other `.html` file of the scanned trees. A parser of TypeScript
 * cannot read it, so the rules read its text. A comment sets nothing, so it
 * is blanked first, with its length kept so a line number stays true.
 *
 * - The rules of one piece of text read the whole document, so a `<style>`
 *   element, a `style` attribute, a family name and a colour value fail as
 *   they fail in a module. The diagram frame held a style block of its own
 *   with a family of its own, and nothing read it (record 0061).
 * - The value of each `class` attribute is a class string, so every class
 *   rule reads it as it reads a class string of a module.
 *
 * @param {string} path Repository relative path, with forward slashes.
 * @param {string} text
 * @param {RuleContext} [context] What a rule needs beyond the text.
 * @returns {{ path: string; line: number; rule: string; message: string }[]}
 */
export function scanDocument(path, text, context) {
  const source = text.replace(documentComment, (comment) =>
    comment.replace(/[^\n]/g, ' '),
  );
  /** @type {{ path: string; line: number; rule: string; message: string }[]} */
  const found = [];
  /** @param {number} offset @returns {number} */
  const lineOf = (offset) => source.slice(0, offset).split('\n').length;
  /** @param {string} rule @param {string | null} message @param {number} offset */
  const report = (rule, message, offset) => {
    if (message !== null)
      found.push({ path, line: lineOf(offset), rule, message });
  };
  const rules = Object.entries(textRules);
  let offset = 0;
  for (const line of source.split('\n')) {
    for (const [rule, check] of rules)
      if (documentRules.has(rule))
        report(rule, check(line, path, context), offset);
    offset += line.length + 1;
  }
  for (const match of source.matchAll(classAttribute))
    for (const [rule, check] of rules)
      if (!documentRules.has(rule))
        report(rule, check(match[2] ?? '', path, context), match.index);
  return found;
}

/**
 * Reads the accepted exceptions.
 *
 * @param {string} directory
 * @returns {Promise<{ file: string; rule: string; reason: string }[]>}
 */
export async function readAllowlist(directory) {
  const file = resolve(directory, 'tools/design-rules-allow.json');
  const text = await readFile(file, 'utf8').catch(() => '{"allow":[]}');
  const parsed = record(JSON.parse(text));
  if (!Array.isArray(parsed.allow)) return [];
  /** @param {unknown} value @returns {string} */
  const text_ = (value) => (typeof value === 'string' ? value : '');
  return parsed.allow.map((entry) => {
    const item = record(entry);
    return {
      file: text_(item.file),
      rule: text_(item.rule),
      reason: text_(item.reason),
    };
  });
}

/**
 * Runs the check over one repository tree.
 *
 * @param {string} directory
 * @returns {Promise<number>} The process status.
 */
export async function main(directory) {
  if (resolve(directory) === resolve(root)) {
    const { generateIcons } = await import('./generate-icons.mjs');
    await generateIcons(true);
  }
  const allowed = await readAllowlist(directory);
  // The palette names come from the one stylesheet, so the colour rule reads
  // the same list that the build compiles. A missing stylesheet is a broken
  // tree and not a reason to stop checking colour.
  const css = await readFile(resolve(directory, stylesheet), 'utf8').catch(
    () => null,
  );
  if (css === null) {
    process.stderr.write(
      `Design rule check failed: ${stylesheet} is missing, so no colour token can be read.\n`,
    );
    return 1;
  }
  const context = { colourTokens: colourTokens(css) };
  const named = await Promise.all(
    scannedFiles.map(async (file) => {
      const full = resolve(directory, file);
      return (await readFile(full, 'utf8').catch(() => null)) === null
        ? []
        : [full];
    }),
  );
  const files = (
    await Promise.all(
      scannedDirectories.map((folder) => filesIn(resolve(directory, folder))),
    )
  )
    .concat(named)
    .flat()
    .filter(
      (file) => /\.(?:tsx?|html)$/.test(file) && !/\.test\.tsx?$/.test(file),
    );
  /** @type {{ path: string; line: number; rule: string; message: string }[]} */
  const failures = [];
  for (const file of files) {
    const path = relative(directory, file).split(sep).join('/');
    const text = await readFile(file, 'utf8');
    const scan = path.endsWith('.html') ? scanDocument : scanSource;
    for (const issue of scan(path, text, context)) {
      if (
        allowed.some(
          (entry) => entry.file === issue.path && entry.rule === issue.rule,
        )
      )
        continue;
      failures.push(issue);
    }
  }
  if (failures.length > 0) {
    process.stderr.write(
      [
        'Design rule check failed:',
        ...failures.map(
          (failure) =>
            `  ${failure.path}:${failure.line}: ${failure.rule}: ${failure.message}`,
        ),
        'Add the exception with its reason to tools/design-rules-allow.json only when the rule cannot hold.',
      ].join('\n') + '\n',
    );
    return 1;
  }
  process.stdout.write(
    `Design rules: ${files.length} files checked, ${allowed.length} accepted exceptions.\n`,
  );
  return 0;
}

// The rule functions above are imported by the unit test, so the check itself
// runs only when this file is the program.
if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--root')) {
    process.stderr.write(
      'Usage: node tools/check-design-rules.mjs [--root <directory>]\n',
    );
    process.exit(1);
  }
  process.exit(await main(resolve(args[1] ?? root)));
}
