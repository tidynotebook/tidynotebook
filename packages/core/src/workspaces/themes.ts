/**
 * The themes that an account imports (record 0141).
 *
 * A theme is data of the account. The contract checks the shape of each
 * colour, and these rules check what one account may keep: a name, one or two
 * palettes of hex colours, and at most `customThemeLimit` themes. The
 * contrast of a palette is a rule of the client theme registry, which this
 * package cannot read, so the client checks it before it sends a theme and
 * before it paints a stored one.
 */
import type { Actor } from '../identity/actor.ts';
import { fail, ok, type Result } from '../files/model.ts';
import type {
  AccountSettings,
  AccountTransaction,
  ImportedPalette,
  ThemeImport,
  WorkspaceAdminStore,
} from './ports.ts';

/**
 * The most themes that one account keeps.
 *
 * `Preferences.themes` in the contract states the same bound as `maxItems`,
 * and `tests/integration/account-themes.test.ts` holds the two together.
 */
export const customThemeLimit = 20;

/** A colour as the contract states it: a hash and six hexadecimal digits. */
const hexColour = /^#[0-9a-fA-F]{6}$/;

/** Whether one palette holds colours only, in both of its groups. */
function isPalette(palette: ImportedPalette): boolean {
  const groups = [palette.tokens, palette.syntax];
  return groups.every((group) => {
    const colours = Object.values(group);
    return (
      colours.length > 0 && colours.every((value) => hexColour.test(value))
    );
  });
}

/** The stored settings and the themes of an account, in one read. */
export async function settingsOf(
  tx: AccountTransaction,
): Promise<AccountSettings> {
  return { ...(await tx.preferences()), themes: await tx.themes() };
}

/**
 * Keeps one imported theme for the account.
 *
 * The name is trimmed and must hold a character, and the theme holds a light
 * palette, a dark palette or both. The count is read under the settings lock
 * of the account, so two imports at once cannot pass the limit together.
 */
export function importTheme(
  store: WorkspaceAdminStore,
  actor: Actor,
  input: ThemeImport,
  themeId: string,
): Promise<Result<AccountSettings>> {
  return store.account(actor, async (tx) => {
    const name = input.name.trim();
    const palettes = [input.light, input.dark].filter(
      (palette) => palette !== null,
    );
    if (name === '' || palettes.length === 0 || !palettes.every(isPalette))
      return fail<AccountSettings>('forbidden');
    await tx.lockSettings();
    if ((await tx.themes()).length >= customThemeLimit)
      return fail<AccountSettings>('theme_limit');
    await tx.addTheme({ themeId, name, light: input.light, dark: input.dark });
    return ok(await settingsOf(tx));
  });
}

/**
 * Deletes one imported theme of the account.
 *
 * A theme that the account does not hold answers `not_found`, so an answer
 * never tells one account about the themes of another.
 */
export function deleteTheme(
  store: WorkspaceAdminStore,
  actor: Actor,
  themeId: string,
): Promise<Result<AccountSettings>> {
  return store.account(actor, async (tx) => {
    await tx.lockSettings();
    if (!(await tx.removeTheme(themeId)))
      return fail<AccountSettings>('not_found');
    return ok(await settingsOf(tx));
  });
}
