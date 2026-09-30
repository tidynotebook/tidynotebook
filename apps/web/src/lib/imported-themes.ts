/**
 * The themes that an account imported, as families a person can choose
 * (record 0141).
 *
 * The account answers its themes with its settings. The server checks the
 * shape of each colour but not its contrast, so every stored theme goes
 * through the one reader of the theme file, `readThemeFile` of
 * `@notesapp/ui`, and a theme that it refuses is neither offered nor painted.
 * A family of an imported theme is `custom-` and the identifier of the
 * theme, so it never meets a family of the registry.
 */
import type { ImportedTheme, ThemeImportInput } from '@notesapp/api-client';
import {
  defaultThemeFamilyId,
  importedFamilyPrefix,
  importedThemeFamily,
  readThemeFile,
  themeFamilies,
  themeOfFamily,
  type Appearance,
  type Theme,
  type ThemeFamily,
  type ThemeFileData,
} from '@notesapp/ui';

/** The family identifier of one imported theme. */
export function importedFamilyId(themeId: string): string {
  return `${importedFamilyPrefix}${themeId}`;
}

/** The identifier of the imported theme that one family names. */
export function importedThemeIdOf(familyId: string): string {
  return familyId.slice(importedFamilyPrefix.length);
}

/** Whether a family identifier names an imported theme. */
export function isImportedFamilyId(familyId: string): boolean {
  return familyId.startsWith(importedFamilyPrefix);
}

/** Reads one stored theme through the one reader of a theme file. */
function readStored(theme: {
  readonly name: unknown;
  readonly light?: unknown;
  readonly dark?: unknown;
}): ThemeFileData | null {
  const read = readThemeFile(
    JSON.stringify({ name: theme.name, light: theme.light, dark: theme.dark }),
  );
  return read.ok ? read.theme : null;
}

/** One stored theme in the shape of the account, from checked file data. */
function accountTheme(themeId: string, data: ThemeFileData): ImportedTheme {
  return {
    themeId,
    name: data.name,
    ...(data.light === undefined ? {} : { light: data.light }),
    ...(data.dark === undefined ? {} : { dark: data.dark }),
  };
}

/**
 * The families of the imported themes that meet every rule of a palette, in
 * the order of the account.
 */
export function importedFamilies(
  themes: readonly ImportedTheme[],
): readonly ThemeFamily[] {
  return themes.flatMap((theme) => {
    const data = readStored(theme);
    return data === null
      ? []
      : [importedThemeFamily(importedFamilyId(theme.themeId), data)];
  });
}

/**
 * The imported themes of an account that this device cached.
 *
 * The cache is text that any script of the origin could write, so each entry
 * passes the reader again, and an entry that fails is left out.
 */
export function cachedThemes(value: unknown): ImportedTheme[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (entry === null || typeof entry !== 'object') return [];
    const members: ReadonlyMap<string, unknown> = new Map(
      Object.entries(entry),
    );
    const themeId = members.get('themeId');
    if (typeof themeId !== 'string' || themeId === '') return [];
    const data = readStored({
      name: members.get('name'),
      light: members.get('light'),
      dark: members.get('dark'),
    });
    return data === null ? [] : [accountTheme(themeId, data)];
  });
}

/** Every family that a person can choose: the registry, then the imported. */
export function chooseableFamilies(
  imported: readonly ThemeFamily[],
): readonly ThemeFamily[] {
  return [...themeFamilies, ...imported];
}

/**
 * The family of one identifier among the chooseable ones.
 *
 * An identifier that names no family, such as a theme that was deleted on
 * another device, answers the default family, so the page always paints.
 */
export function familyAmong(
  families: readonly ThemeFamily[],
  familyId: string,
): ThemeFamily {
  const found =
    families.find((family) => family.id === familyId) ??
    families.find((family) => family.id === defaultThemeFamilyId) ??
    themeFamilies[0];
  if (found === undefined) throw new Error('The theme registry is empty.');
  return found;
}

/** The theme to paint for a family identifier and an appearance. */
export function themeAmong(
  families: readonly ThemeFamily[],
  familyId: string,
  appearance: Appearance,
): Theme {
  return themeOfFamily(familyAmong(families, familyId), appearance);
}

/** The body of the import of one checked theme file. */
export function themeImportBody(data: ThemeFileData): ThemeImportInput {
  return {
    name: data.name,
    ...(data.light === undefined ? {} : { light: data.light }),
    ...(data.dark === undefined ? {} : { dark: data.dark }),
  };
}
