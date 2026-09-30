/**
 * The palette data of the script that paints before React starts.
 *
 * The script of `apps/web/index.html` writes every custom property of one
 * theme before the first paint, so a reload never shows the wrong palette.
 * The build writes the registry into the script (`themeRegistry` in
 * `apps/web/vite.config.ts`), and the device keeps the chosen imported theme
 * under `importedPaletteStorageKey` (record 0141). Both write one shape from
 * the functions here, so the names and the values stay in one order.
 */
import {
  defaultThemeFor,
  importedFamilyPrefix,
  importedThemeFamily,
  readThemeFile,
  themeFileText,
  themeProperties,
  type Theme,
  type ThemeFamily,
} from '@notesapp/ui';

/** One variant as the script receives it: its identifier and its values. */
export type InlineThemeVariant = {
  readonly id: string;
  readonly values: readonly string[];
};

/** The variants of one family, by appearance. */
export type InlineThemeVariants = Readonly<Record<string, InlineThemeVariant>>;

/**
 * Where the device keeps the palette of the chosen imported theme.
 *
 * The script of `apps/web/index.html` names the same key, and
 * `tests/integration/theme-variables.test.ts` holds the two together.
 */
export const importedPaletteStorageKey = 'notesapp.theme-imported';

/** The custom property names, in the order that every variant follows. */
export function inlinePropertyNames(): readonly string[] {
  return themeProperties(defaultThemeFor('dark')).map(([name]) => name);
}

/** One variant, with its values in the order of `inlinePropertyNames`. */
export function inlineVariant(theme: Theme): InlineThemeVariant {
  return {
    id: theme.id,
    values: themeProperties(theme).map(([, value]) => value),
  };
}

/** Every variant of one family, by appearance. */
export function inlineVariants(family: ThemeFamily): InlineThemeVariants {
  const variants: Record<string, InlineThemeVariant> = {};
  for (const theme of family.variants)
    variants[theme.appearance] = inlineVariant(theme);
  return variants;
}

/**
 * The stored text of one imported family, for the script and for the device.
 *
 * The script paints `variants` only when the stored family names `family`,
 * so a stale entry of another family is never painted. `file` is the theme
 * file of the family, so the application knows the theme before the account
 * answers and does not repaint the default family over the first paint.
 */
export function inlineImportedFamily(family: ThemeFamily): string {
  return JSON.stringify({
    family: family.id,
    variants: inlineVariants(family),
    file: themeFileText(family),
  });
}

/**
 * The imported family that this device kept, when it is the one named.
 *
 * The text is storage that any script of the origin can write, so the file
 * passes the one reader of a theme file again, and anything else answers
 * `null`.
 */
export function keptImportedFamily(
  text: string | null,
  familyId: string,
): ThemeFamily | null {
  if (text === null || !familyId.startsWith(importedFamilyPrefix)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const members: ReadonlyMap<string, unknown> = new Map(Object.entries(parsed));
  const file = members.get('file');
  if (members.get('family') !== familyId || typeof file !== 'string')
    return null;
  const read = readThemeFile(file);
  return read.ok ? importedThemeFamily(familyId, read.theme) : null;
}
