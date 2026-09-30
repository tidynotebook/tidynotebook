/**
 * The theme file that a person imports and downloads (decision 0141).
 *
 * A theme file is JSON: a `name`, and a `light` palette, a `dark` palette or
 * both. A palette holds `tokens` with every name of `ThemeTokens` and `syntax`
 * with every name of `SyntaxTokens`, each a six digit hex value. A member that
 * a theme does not use is left out, so a later token of the product never
 * makes an older file fail for the wrong reason: a token that the file lacks
 * is named as missing.
 *
 * `readThemeFile` answers the family, or every problem in the words a person
 * reads. `themeFileText` writes the same shape, so the theme in use becomes
 * the start of a new one.
 */
import {
  syntaxPropertyNames,
  themePropertyNames,
  type Appearance,
  type SyntaxPropertyName,
  type SyntaxTokens,
  type Theme,
  type ThemeFamily,
  type ThemePropertyName,
  type ThemeTokens,
} from './theme.ts';
import { themeColourLabels, themeProblems } from './theme-rules.ts';

/** The longest name of an imported theme, in characters. */
export const themeNameMaximumLength = 60;

/** The largest theme file that a person can import, in bytes. */
export const themeFileMaximumBytes = 64 * 1024;

/** The prefix of the family identifier of an imported theme. */
export const importedFamilyPrefix = 'custom-';

/** One palette of a theme file. */
export type ThemePalette = {
  readonly tokens: ThemeTokens;
  readonly syntax: SyntaxTokens;
};

/** The data of one theme file: a name and one or two palettes. */
export type ThemeFileData = {
  readonly name: string;
  readonly light?: ThemePalette | undefined;
  readonly dark?: ThemePalette | undefined;
};

/** The answer of reading one theme file. */
export type ThemeFileResult =
  | { readonly ok: true; readonly theme: ThemeFileData }
  | { readonly ok: false; readonly problems: readonly string[] };

const appearances: readonly Appearance[] = ['light', 'dark'];

/** The members of an object, or `null` when the value is no object. */
function membersOf(value: unknown): ReadonlyMap<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return null;
  return new Map(Object.entries(value));
}

/**
 * The tokens of a palette, from one reader of a colour by its name.
 *
 * The object names every token, so the compiler refuses a builder that
 * forgets one when `ThemeTokens` grows.
 */
function tokensOf(read: (name: ThemePropertyName) => string): ThemeTokens {
  return {
    background: read('background'),
    surface: read('surface'),
    surfaceCard: read('surfaceCard'),
    surfaceHover: read('surfaceHover'),
    surfaceActive: read('surfaceActive'),
    text: read('text'),
    textStrong: read('textStrong'),
    textMuted: read('textMuted'),
    accentText: read('accentText'),
    accentFill: read('accentFill'),
    accentOnFill: read('accentOnFill'),
    successText: read('successText'),
    dangerText: read('dangerText'),
    dangerFill: read('dangerFill'),
    onDanger: read('onDanger'),
    border: read('border'),
    borderSubtle: read('borderSubtle'),
    focus: read('focus'),
    scrim: read('scrim'),
  };
}

/** The code colours of a palette, from one reader of a colour by its name. */
function syntaxOf(read: (name: SyntaxPropertyName) => string): SyntaxTokens {
  return {
    keyword: read('keyword'),
    string: read('string'),
    comment: read('comment'),
    number: read('number'),
    tag: read('tag'),
    attribute: read('attribute'),
    heading: read('heading'),
    link: read('link'),
    punctuation: read('punctuation'),
  };
}

/** The colour names of one group that a value lacks, or `null` for no group. */
function missingColours<Name extends string>(
  value: unknown,
  names: readonly Name[],
): Name[] | null {
  const members = membersOf(value);
  if (members === null) return null;
  return names.filter((name) => typeof members.get(name) !== 'string');
}

/** One colour of a group, as the file writes it. */
function colourIn(value: unknown, name: string): string {
  const colour = membersOf(value)?.get(name);
  return typeof colour === 'string' ? colour.trim().toLowerCase() : '';
}

/**
 * The theme of one palette, as the registry states a variant.
 *
 * The family identifier and the name come from the caller, because the
 * account names an imported theme and the file only proposes the words.
 */
export function importedTheme(
  familyId: string,
  name: string,
  appearance: Appearance,
  palette: ThemePalette,
): Theme {
  return {
    id: `${familyId}-${appearance}`,
    family: familyId,
    name: `${name} ${appearance}`,
    appearance,
    source: { project: name, url: '', licence: '' },
    tokens: palette.tokens,
    syntax: palette.syntax,
  };
}

/** The family of one imported theme. */
export function importedThemeFamily(
  familyId: string,
  theme: ThemeFileData,
): ThemeFamily {
  const variants: Theme[] = [];
  for (const appearance of appearances) {
    const palette = theme[appearance];
    if (palette !== undefined)
      variants.push(importedTheme(familyId, theme.name, appearance, palette));
  }
  return {
    id: familyId,
    name: theme.name,
    source: { project: theme.name, url: '', licence: '' },
    variants,
  };
}

/** Every problem of one palette, each named with the palette it is in. */
function paletteProblems(
  appearance: Appearance,
  value: unknown,
): { readonly palette: ThemePalette | null; readonly problems: string[] } {
  const where = `In the ${appearance} palette`;
  const members = membersOf(value);
  const tokenGroup = members?.get('tokens');
  const syntaxGroup = members?.get('syntax');
  const missingTokens = missingColours(tokenGroup, themePropertyNames);
  const missingSyntax = missingColours(syntaxGroup, syntaxPropertyNames);
  if (missingTokens === null || missingSyntax === null)
    return {
      palette: null,
      problems: [
        `${where}, the colours are not in their two groups. Put them under tokens and syntax.`,
      ],
    };
  const missing = [...missingTokens, ...missingSyntax];
  if (missing.length > 0)
    return {
      palette: null,
      problems: missing.map(
        (name) =>
          `${where}, ${themeColourLabels[name].toLocaleLowerCase('en-US')} is missing. Add it as # and six hex digits.`,
      ),
    };
  const palette: ThemePalette = {
    tokens: tokensOf((name) => colourIn(tokenGroup, name)),
    syntax: syntaxOf((name) => colourIn(syntaxGroup, name)),
  };
  const problems = themeProblems(
    importedTheme('custom-check', 'Check', appearance, palette),
  ).map((problem) => `${where}: ${problem.message}`);
  return { palette: problems.length === 0 ? palette : null, problems };
}

/**
 * Reads the text of one theme file.
 *
 * The answer is the theme, or every problem that stops it, so the person can
 * correct them all at once.
 */
export function readThemeFile(text: string): ThemeFileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      problems: [
        'The file is not a theme file. Choose a JSON file that holds a theme.',
      ],
    };
  }
  const members = membersOf(parsed);
  if (members === null)
    return {
      ok: false,
      problems: [
        'The file is not a theme file. Choose a JSON file that holds a theme.',
      ],
    };
  const problems: string[] = [];
  const rawName = members.get('name');
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (name === '' || name.length > themeNameMaximumLength)
    problems.push(
      `The theme has no name that can be used. Give it a name of 1 to ${String(themeNameMaximumLength)} characters.`,
    );
  const palettes: Partial<Record<Appearance, ThemePalette>> = {};
  let found = 0;
  for (const appearance of appearances) {
    if (!members.has(appearance)) continue;
    found += 1;
    const read = paletteProblems(appearance, members.get(appearance));
    problems.push(...read.problems);
    if (read.palette !== null) palettes[appearance] = read.palette;
  }
  if (found === 0)
    problems.push(
      'The theme has no palette. Add a light palette, a dark palette or both.',
    );
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    theme: { name, light: palettes.light, dark: palettes.dark },
  };
}

/** The text of the theme file of one family, which `readThemeFile` reads. */
export function themeFileText(family: ThemeFamily): string {
  const file: Record<string, unknown> = { name: family.name };
  for (const variant of family.variants)
    file[variant.appearance] = {
      tokens: variant.tokens,
      syntax: variant.syntax,
    };
  return `${JSON.stringify(file, null, 2)}\n`;
}
