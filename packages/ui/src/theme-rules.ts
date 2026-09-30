/**
 * The rules that every palette meets before it reaches a screen.
 *
 * `themeProblems` is the one set of them. `theme.test.ts` holds every family
 * of the registry to it, and the import of a theme file refuses a palette that
 * breaks one and names each problem (decision 0141). Contrast is checked per
 * surface, for the pairs the application actually renders: the page
 * background, the sidebar surface, the card, and the hover and active states
 * of a row.
 *
 * A problem names the colours by the words of `themeColourLabels`, so a person
 * reads what to change and never a property name.
 */
import {
  contrastRatio,
  derivedValue,
  parseHexColor,
  relativeLuminance,
  syntaxPropertyNames,
  textContrastMinimum,
  themePropertyNames,
  uiContrastMinimum,
  type SyntaxPropertyName,
  type Theme,
  type ThemePropertyName,
  type ThemeTokens,
} from './theme.ts';

/** The name a person reads for each colour of a palette. */
export const themeColourLabels: Readonly<
  Record<ThemePropertyName | SyntaxPropertyName, string>
> = {
  background: 'Page background',
  surface: 'Sidebar background',
  surfaceCard: 'Card background',
  surfaceHover: 'Row hover background',
  surfaceActive: 'Chosen row background',
  text: 'Body text',
  textStrong: 'Strong text',
  textMuted: 'Muted text',
  accentText: 'Link text',
  accentFill: 'Button fill',
  accentOnFill: 'Button label',
  successText: 'Success text',
  dangerText: 'Danger text',
  dangerFill: 'Danger button fill',
  onDanger: 'Danger button label',
  border: 'Control edge',
  borderSubtle: 'Quiet edge',
  focus: 'Focus ring',
  scrim: 'Shade behind a dialog',
  keyword: 'Code keyword',
  string: 'Code string',
  comment: 'Code comment',
  number: 'Code number',
  tag: 'Code tag',
  attribute: 'Code attribute',
  heading: 'Code heading',
  link: 'Code link',
  punctuation: 'Code punctuation',
};

/** One rule that a palette breaks, in the words a person reads. */
export type ThemeProblem = {
  /** The colour to change. */
  readonly colour: ThemePropertyName | SyntaxPropertyName;
  /** One or two sentences that state the problem and the fix. */
  readonly message: string;
};

/** Every fill a screen paints behind text. */
const surfaceNames = [
  'background',
  'surface',
  'surfaceCard',
  'surfaceHover',
  'surfaceActive',
] as const;

/** The derived fills of the three tones, with the tone that writes on each. */
const toneSurfaces = [
  ['accentText', 'accentSurface', 'Link tone surface'],
  ['successText', 'successSurface', 'Success tone surface'],
  ['dangerText', 'dangerSurface', 'Danger tone surface'],
] as const;

/** A list of names as a person reads it: `a`, `a and b`, `a, b and c`. */
function listOf(names: readonly string[]): string {
  const lower = names.map((name) => `the ${name.toLocaleLowerCase('en-US')}`);
  if (lower.length <= 1) return lower.join('');
  return `${lower.slice(0, -1).join(', ')} and ${lower.at(-1) ?? ''}`;
}

/** The words of one contrast problem, over every fill it fails on. */
function hardToRead(
  colour: ThemePropertyName | SyntaxPropertyName,
  fills: readonly string[],
): ThemeProblem {
  return {
    colour,
    message: `${themeColourLabels[colour]} is hard to read on ${listOf(fills)}. Make these colours differ more.`,
  };
}

/** The problems of the colours that must be readable on a fill. */
function contrastProblems(theme: Theme): ThemeProblem[] {
  const tokens: ThemeTokens = theme.tokens;
  const problems: ThemeProblem[] = [];
  // One colour gets one message that names every fill it fails on.
  const failing = new Map<ThemePropertyName | SyntaxPropertyName, string[]>();
  const need = (
    colour: ThemePropertyName | SyntaxPropertyName,
    value: string,
    fill: string,
    fillName: string,
    minimum: number,
  ): void => {
    if (contrastRatio(value, fill) >= minimum) return;
    const fills = failing.get(colour) ?? [];
    if (!fills.includes(fillName)) fills.push(fillName);
    failing.set(colour, fills);
  };
  for (const surface of ['background', 'surfaceCard'] as const)
    need(
      'text',
      tokens.text,
      tokens[surface],
      themeColourLabels[surface],
      textContrastMinimum,
    );
  for (const surface of surfaceNames)
    for (const colour of [
      'textStrong',
      'textMuted',
      'accentText',
      'successText',
      'dangerText',
    ] as const)
      need(
        colour,
        tokens[colour],
        tokens[surface],
        themeColourLabels[surface],
        textContrastMinimum,
      );
  // A notice paints the surface of its tone and writes on it (record 0065).
  for (const [tone, surface, surfaceLabel] of toneSurfaces) {
    const fill = derivedValue(tokens, surface);
    for (const colour of [tone, 'textStrong', 'textMuted'] as const)
      need(colour, tokens[colour], fill, surfaceLabel, textContrastMinimum);
  }
  for (const [label, fill, hover, fillLabel] of [
    ['accentOnFill', 'accentFill', 'accentFillHover', 'Button fill'],
    ['onDanger', 'dangerFill', 'dangerFillHover', 'Danger button fill'],
  ] as const) {
    need(label, tokens[label], tokens[fill], fillLabel, textContrastMinimum);
    need(
      label,
      tokens[label],
      derivedValue(tokens, hover),
      `${fillLabel} under the pointer`,
      textContrastMinimum,
    );
    // The hover fill of a control comes forward from the page (record 0057).
    if (
      !(
        contrastRatio(derivedValue(tokens, hover), tokens.background) >
        contrastRatio(tokens[fill], tokens.background)
      )
    )
      problems.push({
        colour: fill,
        message: `${themeColourLabels[fill]} cannot come forward from the page background under the pointer. Move it further from the page background.`,
      });
    need(
      fill,
      tokens[fill],
      tokens.background,
      themeColourLabels.background,
      uiContrastMinimum,
    );
  }
  for (const surface of surfaceNames)
    for (const colour of ['border', 'focus'] as const)
      need(
        colour,
        tokens[colour],
        tokens[surface],
        themeColourLabels[surface],
        uiContrastMinimum,
      );
  for (const colour of syntaxPropertyNames)
    for (const surface of ['background', 'surfaceHover'] as const)
      need(
        colour,
        theme.syntax[colour],
        tokens[surface],
        surface === 'background' ? themeColourLabels.background : 'Code block',
        textContrastMinimum,
      );
  return [
    ...[...failing].map(([colour, fills]) => hardToRead(colour, fills)),
    ...problems,
  ];
}

/** The problems of the edges, the divider and the shade. */
function structureProblems(tokens: ThemeTokens): ThemeProblem[] {
  const problems: ThemeProblem[] = [];
  const scrim = relativeLuminance(tokens.scrim);
  if (surfaceNames.some((name) => !(scrim < relativeLuminance(tokens[name]))))
    problems.push({
      colour: 'scrim',
      message: `${themeColourLabels.scrim} must be darker than every background. Make it darker.`,
    });
  const subtle = contrastRatio(tokens.borderSubtle, tokens.background);
  const edge = contrastRatio(tokens.border, tokens.background);
  if (!(subtle < edge))
    problems.push({
      colour: 'borderSubtle',
      message: `${themeColourLabels.borderSubtle} must be quieter than the control edge. Move it nearer to the page background.`,
    });
  const divider = contrastRatio(
    derivedValue(tokens, 'borderLine'),
    tokens.background,
  );
  if (subtle < edge && !(divider > subtle && divider < edge))
    problems.push({
      colour: 'border',
      message: `${themeColourLabels.border} and ${themeColourLabels.borderSubtle.toLocaleLowerCase('en-US')} are too near to make a divider between them. Make the two colours differ more.`,
    });
  return problems;
}

/**
 * Every rule that one palette breaks, or an empty list.
 *
 * A colour that is not a six digit hex value is the only problem reported,
 * because no contrast can be read from it.
 */
export function themeProblems(theme: Theme): readonly ThemeProblem[] {
  const unreadable: ThemeProblem[] = [];
  for (const name of themePropertyNames)
    if (parseHexColor(theme.tokens[name]) === null)
      unreadable.push({
        colour: name,
        message: `${themeColourLabels[name]} is not a colour. Write it as # and six hex digits.`,
      });
  for (const name of syntaxPropertyNames)
    if (parseHexColor(theme.syntax[name]) === null)
      unreadable.push({
        colour: name,
        message: `${themeColourLabels[name]} is not a colour. Write it as # and six hex digits.`,
      });
  if (unreadable.length > 0) return unreadable;
  return [...contrastProblems(theme), ...structureProblems(theme.tokens)];
}
