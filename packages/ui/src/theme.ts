/**
 * The theme contract: token names, the theme record, and contrast helpers.
 *
 * A theme is data. This module owns the shape of that data and the rules
 * every theme must meet; the palettes themselves live one per family in
 * `src/themes/`. Nothing outside that folder holds a colour value, so a new
 * theme is one new data file and one line in the registry index.
 *
 * Contrast rules that `theme.test.ts` enforces per surface, for every theme
 * in the registry:
 *
 * - `text` is the body colour of the main background and the card surface
 *   only. On the sidebar surface, and on the hover and active states, a
 *   container sets `textStrong` or `textMuted`, which pass on all five
 *   surfaces. No screen lets `text` inherit onto a sidebar row.
 * - `textStrong`, `textMuted`, `accentText`, `successText`, and `dangerText`
 *   meet 4.5 to 1 on every surface of the palette.
 * - `border` and `focus` meet the 3 to 1 non-text minimum on every surface,
 *   so a component edge uses `border`. `borderSubtle` is decorative only: it
 *   separates regions that already differ in fill and never identifies a
 *   control.
 * - The divider is not a token. It is derived from `border` and `background`,
 *   and it lands between `borderSubtle` and `border` in every palette. See
 *   {@link derivedPropertyNames} and
 *   [decision 0053](../../../docs/decisions/0053-the-divider-is-derived-from-the-palette.md).
 * - A control fill carries its own label token: `accentOnFill` on
 *   `accentFill`, and `onDanger` on `dangerFill`.
 * - The hover state of a control fill is not a token either. It is derived by
 *   moving the fill away from the page background, and the label of the fill
 *   still meets 4.5 to 1 on it. See {@link fillHoverShift} and
 *   [decision 0057](../../../docs/decisions/0057-a-control-fill-states-its-hover-in-the-palette.md).
 * - The surface of a tone is derived as well, from the tone text and the page
 *   background. `textStrong`, `textMuted` and the tone text all meet 4.5 to 1
 *   on it, so a notice can state its tone with a fill and still be read. See
 *   {@link toneSurfaceBlend}.
 * - Every syntax colour meets 4.5 to 1 on the page background and on the
 *   code block fill, which is the hover surface.
 *
 * `applyTheme` writes the values as custom properties for the central
 * Tailwind theme and for the typed CodeMirror adapter.
 */

/** The stored appearance choice of an account. Matches the API type. */
export type AppearanceChoice = 'system' | 'light' | 'dark';

/** The appearance that is actually rendered. */
export type Appearance = 'light' | 'dark';

/** The local settings key of the appearance choice. */
export const appearanceStorageKey = 'notesapp.theme';

/** The local settings key of the theme family. */
export const themeFamilyStorageKey = 'notesapp.theme-family';

/**
 * Selects the appearance for a stored choice and the device preference.
 *
 * `system` follows the device: dark when `prefersDark` is true, light
 * otherwise. An explicit choice always wins over the device preference.
 */
export function resolveAppearance(
  choice: AppearanceChoice,
  prefersDark: boolean,
): Appearance {
  if (choice === 'light') return 'light';
  if (choice === 'dark') return 'dark';
  return prefersDark ? 'dark' : 'light';
}

/**
 * Reads an appearance choice from an untrusted stored value.
 *
 * Anything that is not one of the three known choices falls back to
 * `system`, so a corrupt setting cannot break rendering.
 */
export function parseAppearanceChoice(value: unknown): AppearanceChoice {
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return 'system';
}

/**
 * Every colour that the application shell needs, for one theme.
 *
 * `text` is the body colour of the main background and the card surface.
 * `textStrong` and `textMuted` pass on every surface, so a sidebar row, a
 * hover state, and an active state always use one of those two. `accentText`,
 * `successText`, and `dangerText` are the small text variants. `accentFill`
 * and `dangerFill` are control fills whose labels use `accentOnFill` and
 * `onDanger`. `scrim` is the fill behind a dialog; a page applies it with an
 * opacity utility.
 */
export type ThemeTokens = {
  readonly background: string;
  readonly surface: string;
  readonly surfaceCard: string;
  readonly surfaceHover: string;
  readonly surfaceActive: string;
  readonly text: string;
  readonly textStrong: string;
  readonly textMuted: string;
  readonly accentText: string;
  readonly accentFill: string;
  readonly accentOnFill: string;
  readonly successText: string;
  readonly dangerText: string;
  readonly dangerFill: string;
  readonly onDanger: string;
  readonly border: string;
  readonly borderSubtle: string;
  readonly focus: string;
  readonly scrim: string;
};

/**
 * The colours of code inside a fenced block.
 *
 * The live preview styles Markdown itself, so this group covers only the
 * highlighted code of a fence. The editor adapter reads these through their
 * custom properties, which is why a theme change needs no editor rebuild.
 */
export type SyntaxTokens = {
  readonly keyword: string;
  readonly string: string;
  readonly comment: string;
  readonly number: string;
  readonly tag: string;
  readonly attribute: string;
  readonly heading: string;
  readonly link: string;
  readonly punctuation: string;
};

/** Where a palette comes from, for the attribution file and the settings. */
export type ThemeSource = {
  /** The upstream project name. */
  readonly project: string;
  /** The upstream address of the published palette. */
  readonly url: string;
  /** The upstream licence, for example `MIT`. */
  readonly licence: string;
};

/** One rendered palette: a light or a dark variant of one family. */
export type Theme = {
  /** Stable identifier, for example `tokyo-night-day`. */
  readonly id: string;
  /** The family this variant belongs to, for example `tokyo-night`. */
  readonly family: string;
  /** The name a person reads, for example `Tokyo Night Day`. */
  readonly name: string;
  /** Which device preference this variant answers. */
  readonly appearance: Appearance;
  readonly source: ThemeSource;
  readonly tokens: ThemeTokens;
  readonly syntax: SyntaxTokens;
};

/** One named family with its light and dark variants. */
export type ThemeFamily = {
  /** Stable identifier, for example `tokyo-night`. */
  readonly id: string;
  /** The name a person reads, for example `Tokyo Night`. */
  readonly name: string;
  readonly source: ThemeSource;
  /** One or two variants. A family with one variant uses it for both. */
  readonly variants: readonly Theme[];
};

/** Minimum WCAG contrast for normal text. */
export const textContrastMinimum = 4.5;

/** Minimum WCAG contrast for controls, borders, and focus indicators. */
export const uiContrastMinimum = 3;

/**
 * Parses a six digit hex colour such as `#1a1b26`.
 *
 * Returns the red, green, and blue channels on a 0 to 1 scale, or `null`
 * when the input is not a six digit hex colour.
 */
export function parseHexColor(
  hex: string,
): readonly [number, number, number] | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  return [red, green, blue];
}

/** Linearizes one sRGB channel for a luminance calculation. */
function linearize(channel: number): number {
  if (channel <= 0.03928) return channel / 12.92;
  return ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * Computes the WCAG relative luminance of a hex colour.
 *
 * Returns `NaN` when the input is not a six digit hex colour.
 */
export function relativeLuminance(hex: string): number {
  const channels = parseHexColor(hex);
  if (channels === null) return NaN;
  const [red, green, blue] = channels;
  return (
    0.2126 * linearize(red) +
    0.7152 * linearize(green) +
    0.0722 * linearize(blue)
  );
}

/**
 * Computes the WCAG contrast ratio of two hex colours, from 1 to 21.
 *
 * Returns `NaN` when either input is not a six digit hex colour.
 */
export function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  if (Number.isNaN(firstLuminance) || Number.isNaN(secondLuminance)) return NaN;
  const lower = Math.min(firstLuminance, secondLuminance);
  const upper = Math.max(firstLuminance, secondLuminance);
  return (upper + 0.05) / (lower + 0.05);
}

/** The token names that `applyTheme` writes, in a fixed order. */
export const themePropertyNames = [
  'background',
  'surface',
  'surfaceCard',
  'surfaceHover',
  'surfaceActive',
  'text',
  'textStrong',
  'textMuted',
  'accentText',
  'accentFill',
  'accentOnFill',
  'successText',
  'dangerText',
  'dangerFill',
  'onDanger',
  'border',
  'borderSubtle',
  'focus',
  'scrim',
] as const;

/** One of the token names of {@link themePropertyNames}. */
export type ThemePropertyName = (typeof themePropertyNames)[number];

/**
 * How much of the component edge a divider takes.
 *
 * A divider is the midpoint of the component edge and the page background.
 * Half is the whole rule: it is loud enough that a person sees the structure
 * of a list on every palette, and quiet enough that a row of text never reads
 * as a cell of a table. `theme.test.ts` proves the resulting value lands
 * between `borderSubtle` and `border` for every theme in the registry.
 */
export const dividerBlend = 0.5;

/**
 * How far the hover state of a control fill moves off the fill.
 *
 * A person who points at a control expects it to come forward, so the hover
 * fill moves away from the page background: a light page darkens the fill and
 * a dark page lightens it. The step is stated once, because a fill that a
 * screen brightens with a filter moves the same way on every palette and is
 * therefore wrong on half of them.
 *
 * `theme.test.ts` proves for every theme in the registry that the hover fill
 * stands further from the page background than the fill, and that the label of
 * the fill still meets 4.5 to 1 on it.
 */
export const fillHoverShift = 0.12;

/**
 * How much of a tone the surface behind that tone takes.
 *
 * A notice states its tone with a fill as well as with a colour, so a person
 * who does not separate the hues still reads it. The fill is a small share of
 * the tone text blended into the page background.
 *
 * Eight parts in a hundred is enough to read as a fill and small enough that
 * `textStrong`, `textMuted` and the tone itself all keep 4.5 to 1 on it in
 * every palette of the registry. A tone surface is a fill and not the page,
 * so a notice sets `textStrong` on it, the same way a sidebar row does: `text`
 * is the body colour of the page background and the card alone, and three
 * borrowed palettes hold it at barely over the minimum there, so any tint of
 * the page would take it under. `theme.test.ts` proves the rule for every
 * theme.
 */
export const toneSurfaceBlend = 0.08;

/**
 * Moves one colour away from a background, by a share of what is left.
 *
 * A background that is lighter than the colour darkens it, and a background
 * that is darker lightens it, so the result always stands further from that
 * background than the colour did. The channels move by arithmetic and no
 * colour value is named, which is why this module holds the rule and the
 * registry still holds every colour.
 *
 * Returns `null` when either input is not a six digit hex colour.
 */
export function shiftAwayFrom(
  colour: string,
  background: string,
  share: number,
): string | null {
  const channels = parseHexColor(colour);
  if (channels === null) return null;
  const backgroundLuminance = relativeLuminance(background);
  if (Number.isNaN(backgroundLuminance)) return null;
  const darken = backgroundLuminance > relativeLuminance(colour);
  const moved = channels.map((channel) =>
    darken ? channel * (1 - share) : channel + (1 - channel) * share,
  );
  return `#${moved.map(channelHex).join('')}`;
}

/**
 * The custom properties that are computed from the tokens of a palette.
 *
 * A derived property is not theme data, so a new theme file states none of
 * them and cannot get one wrong. `themeProperties` writes them with the
 * tokens, so the central Tailwind theme, the typed editor adapter, and the
 * script that paints before React starts all receive them.
 */
export const derivedPropertyNames = [
  'borderLine',
  'surfaceOverlay',
  'cardRaised',
  'borderOverlay',
  'overlayHover',
  'overlaySelected',
  'cardRaisedHover',
  'cardRaisedSelected',
  'accentFillHover',
  'dangerFillHover',
  'accentSurface',
  'successSurface',
  'dangerSurface',
] as const;

/** One of the derived names of {@link derivedPropertyNames}. */
export type DerivedPropertyName = (typeof derivedPropertyNames)[number];

/** The syntax token names that `applyTheme` writes, in a fixed order. */
export const syntaxPropertyNames = [
  'keyword',
  'string',
  'comment',
  'number',
  'tag',
  'attribute',
  'heading',
  'link',
  'punctuation',
] as const;

/** One of the syntax token names of {@link syntaxPropertyNames}. */
export type SyntaxPropertyName = (typeof syntaxPropertyNames)[number];

/**
 * Maps token names to stylesheet custom property names.
 *
 * For example `background` becomes `--notes-bg`.
 */
export function themePropertyName(name: ThemePropertyName): string {
  if (name === 'background') return '--notes-bg';
  if (name === 'surface') return '--notes-surface';
  if (name === 'surfaceCard') return '--notes-surface-card';
  if (name === 'surfaceHover') return '--notes-surface-hover';
  if (name === 'surfaceActive') return '--notes-surface-active';
  if (name === 'textStrong') return '--notes-text-strong';
  if (name === 'textMuted') return '--notes-text-muted';
  if (name === 'accentText') return '--notes-accent-text';
  if (name === 'accentFill') return '--notes-accent-fill';
  if (name === 'accentOnFill') return '--notes-accent-on-fill';
  if (name === 'successText') return '--notes-success-text';
  if (name === 'dangerText') return '--notes-danger-text';
  if (name === 'dangerFill') return '--notes-danger-fill';
  if (name === 'onDanger') return '--notes-on-danger';
  if (name === 'text') return '--notes-text';
  if (name === 'border') return '--notes-border';
  if (name === 'borderSubtle') return '--notes-border-subtle';
  if (name === 'scrim') return '--notes-scrim';
  return '--notes-focus';
}

/**
 * Maps syntax token names to stylesheet custom property names.
 *
 * For example `keyword` becomes `--notes-syntax-keyword`.
 */
export function syntaxPropertyName(name: SyntaxPropertyName): string {
  return `--notes-syntax-${name}`;
}

/** The stylesheet custom property of each derived name. */
const derivedProperties: Readonly<Record<DerivedPropertyName, string>> = {
  borderLine: '--notes-border-line',
  surfaceOverlay: '--notes-surface-overlay',
  cardRaised: '--notes-card-raised',
  borderOverlay: '--notes-border-overlay',
  overlayHover: '--notes-overlay-hover',
  overlaySelected: '--notes-overlay-selected',
  cardRaisedHover: '--notes-card-raised-hover',
  cardRaisedSelected: '--notes-card-raised-selected',
  accentFillHover: '--notes-accent-fill-hover',
  dangerFillHover: '--notes-danger-fill-hover',
  accentSurface: '--notes-accent-surface',
  successSurface: '--notes-success-surface',
  dangerSurface: '--notes-danger-surface',
};

/**
 * Maps derived names to stylesheet custom property names.
 *
 * For example `borderLine` becomes `--notes-border-line`.
 */
export function derivedPropertyName(name: DerivedPropertyName): string {
  return derivedProperties[name];
}

/** One channel on a 0 to 1 scale, as two hex digits. */
function channelHex(channel: number): string {
  return Math.round(channel * 255)
    .toString(16)
    .padStart(2, '0');
}

/** One channel of a blend, as two hex digits. */
function mixChannel(from: number, to: number, fraction: number): string {
  return channelHex(from * fraction + to * (1 - fraction));
}

/**
 * Blends two six digit hex colours in sRGB.
 *
 * `fraction` is how much of `first` the result takes, from 0 to 1. Returns
 * `null` when either input is not a six digit hex colour, so a caller cannot
 * turn a broken palette into a value that looks correct.
 */
export function mixHexColors(
  first: string,
  second: string,
  fraction: number,
): string | null {
  const from = parseHexColor(first);
  const to = parseHexColor(second);
  if (from === null || to === null) return null;
  const [fromRed, fromGreen, fromBlue] = from;
  const [toRed, toGreen, toBlue] = to;
  return `#${mixChannel(fromRed, toRed, fraction)}${mixChannel(
    fromGreen,
    toGreen,
    fraction,
  )}${mixChannel(fromBlue, toBlue, fraction)}`;
}

/**
 * How each derived value is computed from the tokens of a palette.
 *
 * A palette that states a colour this module cannot read falls back to the
 * decorative edge, which is always a colour and is never louder than the
 * value it replaces. `theme.test.ts` refuses such a palette before it ships.
 */
const derivedValues: Readonly<
  Record<DerivedPropertyName, (tokens: ThemeTokens) => string>
> = {
  overlayHover: (tokens) => surfaceState(tokens, overlaySurface(tokens), 1.22),
  overlaySelected: (tokens) =>
    surfaceState(tokens, overlaySurface(tokens), 1.35),
  cardRaisedHover: (tokens) =>
    surfaceState(tokens, raisedSurface(tokens), 1.22),
  cardRaisedSelected: (tokens) =>
    surfaceState(tokens, raisedSurface(tokens), 1.35),
  surfaceOverlay: overlaySurface,
  cardRaised: raisedSurface,
  borderOverlay: (tokens) =>
    relativeLuminance(tokens.surfaceCard) < relativeLuminance(tokens.textStrong)
      ? (mixHexColors(tokens.border, tokens.surfaceCard, 0.26) ?? tokens.border)
      : tokens.borderSubtle,
  borderLine: (tokens) =>
    mixHexColors(tokens.border, tokens.background, dividerBlend) ??
    tokens.borderSubtle,
  accentFillHover: (tokens) =>
    shiftAwayFrom(tokens.accentFill, tokens.background, fillHoverShift) ??
    tokens.accentFill,
  dangerFillHover: (tokens) =>
    shiftAwayFrom(tokens.dangerFill, tokens.background, fillHoverShift) ??
    tokens.dangerFill,
  accentSurface: (tokens) =>
    mixHexColors(tokens.accentText, tokens.background, toneSurfaceBlend) ??
    tokens.background,
  successSurface: (tokens) =>
    mixHexColors(tokens.successText, tokens.background, toneSurfaceBlend) ??
    tokens.background,
  dangerSurface: (tokens) =>
    mixHexColors(tokens.dangerText, tokens.background, toneSurfaceBlend) ??
    tokens.background,
};

/** State fills are computed from their own surface for every palette. */
function raisedSurface(tokens: ThemeTokens): string {
  return (
    mixHexColors(tokens.textStrong, tokens.surfaceCard, 0.03) ??
    tokens.surfaceCard
  );
}
function surfaceState(
  tokens: ThemeTokens,
  surface: string,
  minimum: number,
): string {
  const target = relativeLuminance(surface) < 0.5 ? '#ffffff' : '#000000';
  for (let step = 1; step <= 100; step += 1) {
    const fill = mixHexColors(target, surface, step / 100) ?? surface;
    if (contrastRatio(fill, surface) >= minimum) return fill;
  }
  return tokens.surfaceActive;
}

/** Raise a dark overlay while retaining readable text in imported palettes. */
function overlaySurface(tokens: ThemeTokens): string {
  if (
    relativeLuminance(tokens.surfaceCard) >=
    relativeLuminance(tokens.textStrong)
  )
    return tokens.surfaceCard;
  for (let fraction = 0.04; fraction > 0; fraction -= 0.005) {
    const surface = mixHexColors(
      tokens.textStrong,
      tokens.surfaceCard,
      fraction,
    );
    if (
      surface &&
      [
        tokens.textStrong,
        tokens.textMuted,
        tokens.accentText,
        tokens.dangerText,
      ].every((text) => contrastRatio(text, surface) >= 4.5)
    )
      return surface;
  }
  return tokens.surfaceCard;
}

/** Computes one derived value from the tokens of a palette. */
export function derivedValue(
  tokens: ThemeTokens,
  name: DerivedPropertyName,
): string {
  return derivedValues[name](tokens);
}

/** Every custom property of one theme, as name and value pairs. */
export function themeProperties(
  theme: Theme,
): readonly (readonly [string, string])[] {
  const pairs: (readonly [string, string])[] = [];
  for (const name of themePropertyNames)
    pairs.push([themePropertyName(name), theme.tokens[name]]);
  for (const name of derivedPropertyNames)
    if (
      name !== 'surfaceOverlay' &&
      name !== 'cardRaised' &&
      name !== 'borderOverlay'
    )
      pairs.push([derivedPropertyName(name), derivedValue(theme.tokens, name)]);
  for (const name of syntaxPropertyNames)
    pairs.push([syntaxPropertyName(name), theme.syntax[name]]);
  // Append new values so a cached imported palette keeps its existing order.
  for (const name of ['surfaceOverlay', 'cardRaised', 'borderOverlay'] as const)
    pairs.push([derivedPropertyName(name), derivedValue(theme.tokens, name)]);
  return pairs;
}

/**
 * The property that states the appearance to the browser itself.
 *
 * It sits beside the palette because the appearance decides it, and one
 * write keeps the two in step. The first paint script of
 * `apps/web/index.html` writes the same property before this module loads.
 */
export const colourSchemeProperty = 'color-scheme';

/**
 * The property that colours the scrollbar of every region that scrolls.
 *
 * The colour scheme alone leaves the browser to choose, and its choice is a
 * bar with a track that reads louder than anything the product draws. This
 * property states the two parts instead: the thumb and the track.
 */
export const scrollbarProperty = 'scrollbar-color';

/**
 * The thumb and the track of every scrollbar.
 *
 * The thumb is the component edge of the palette, which `theme.test.ts` holds
 * to the non-text minimum on every surface, because a scrollbar is a control
 * that a person must see and grab. The track is nothing, so the page shows
 * through and a region that scrolls gains no second edge.
 *
 * The value names the property that `applyTheme` writes on the same element,
 * so one write follows every theme change and no colour is copied.
 */
export const scrollbarValue = `var(${themePropertyName('border')}) transparent`;

/** The smallest surface that `applyTheme` can write to, for tests. */
export type ThemeRoot = {
  setAttribute(name: string, value: string): void;
  setProperty(name: string, value: string): void;
};

/**
 * Applies one theme to a root surface.
 *
 * Sets the `data-theme` attribute to the appearance, names the theme in
 * `data-theme-id`, writes the appearance as the colour scheme of the root,
 * and writes every token as a custom property, so the central Tailwind theme
 * and the editor adapter receive the active palette.
 *
 * The colour scheme is not a palette token and it is not a class. It is the
 * one statement that reaches the parts of the page that the palette cannot:
 * the scrollbar of every region that scrolls, a native select, a date field,
 * and the fill that a browser paints into a remembered field. Without it a
 * browser assumes a light page and draws a light scrollbar over a dark
 * palette. `Appearance` holds the two keywords that CSS names, so the
 * appearance of the theme is the value. Record 0071.
 *
 * The scrollbar takes one step more. A browser that knows the page is dark
 * still draws its own bar, and that bar is louder than the note it sits
 * beside, so the palette states the thumb and drops the track. Record 0072.
 */
export function applyTheme(root: ThemeRoot, theme: Theme): void {
  root.setAttribute('data-theme', theme.appearance);
  root.setAttribute('data-theme-id', theme.id);
  root.setProperty(colourSchemeProperty, theme.appearance);
  root.setProperty(scrollbarProperty, scrollbarValue);
  for (const [property, value] of themeProperties(theme))
    root.setProperty(property, value);
}

/**
 * Applies one theme to the page document.
 *
 * Call this from the application entry point after the inline page script
 * already set the initial theme, so React state and the document stay in
 * sync without a visible flash. The browser interface colour follows the
 * page background, so an installed window keeps one palette.
 */
export function applyThemeToDocument(theme: Theme): void {
  const element = document.documentElement;
  applyTheme(
    {
      setAttribute: (name, value): void => {
        element.setAttribute(name, value);
      },
      setProperty: (name, value): void => {
        element.style.setProperty(name, value);
      },
    },
    theme,
  );
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta !== null) meta.setAttribute('content', theme.tokens.background);
}
