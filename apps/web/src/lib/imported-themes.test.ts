import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultThemeFamilyId,
  findThemeFamily,
  readThemeFile,
  themeFamilies,
  themeFileText,
  type ThemeFileData,
} from '@notesapp/ui';
import {
  inlineImportedFamily,
  inlinePropertyNames,
  keptImportedFamily,
} from './first-paint.ts';
import {
  cachedThemes,
  chooseableFamilies,
  familyAmong,
  importedFamilies,
  importedFamilyId,
  isImportedFamilyId,
  themeAmong,
  themeImportBody,
} from './imported-themes.ts';

const themeId = '0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d';

/** The file data of one registered family, under a new name. */
function dataOf(familyId: string, name: string): ThemeFileData {
  const family = findThemeFamily(familyId);
  assert.ok(family !== null);
  const read = readThemeFile(themeFileText(family));
  assert.ok(read.ok);
  return { ...read.theme, name };
}

/** One stored theme of the account, from file data. */
function stored(id: string, data: ThemeFileData) {
  return { themeId: id, ...themeImportBody(data) };
}

await test('a stored theme that meets the rules is a family to choose', () => {
  const [family, ...rest] = importedFamilies([
    stored(themeId, dataOf('nord', 'Harbour')),
  ]);
  assert.equal(rest.length, 0);
  assert.equal(family?.id, `custom-${themeId}`);
  assert.equal(family?.name, 'Harbour');
  assert.ok(isImportedFamilyId(family?.id ?? ''));
  assert.ok(!themeFamilies.some((entry) => isImportedFamilyId(entry.id)));
});

await test('a stored theme that breaks a rule is neither offered nor painted', () => {
  const data = dataOf('default', 'Unreadable');
  const dark = data.dark;
  assert.ok(dark !== undefined);
  const broken = {
    ...data,
    dark: {
      ...dark,
      tokens: { ...dark.tokens, textMuted: dark.tokens.background },
    },
  };
  const families = chooseableFamilies(
    importedFamilies([stored(themeId, broken)]),
  );
  assert.equal(families.length, themeFamilies.length);
  // The account still names it, so the page paints the default family.
  assert.equal(
    familyAmong(families, importedFamilyId(themeId)).id,
    defaultThemeFamilyId,
  );
});

await test('an imported family paints the variant of the appearance', () => {
  const families = chooseableFamilies(
    importedFamilies([stored(themeId, dataOf('github', 'Paper'))]),
  );
  const light = themeAmong(families, importedFamilyId(themeId), 'light');
  assert.equal(light.id, `custom-${themeId}-light`);
  assert.equal(light.appearance, 'light');
  assert.equal(themeAmong(families, 'nord', 'dark').family, 'nord');
});

await test('a cached theme passes the reader again and a forged one is left out', () => {
  const good = stored(themeId, dataOf('nord', 'Harbour'));
  const cached = cachedThemes([
    good,
    { themeId: 'x', name: 'Forged', dark: { tokens: {}, syntax: {} } },
    'not a theme',
    { name: 'No identifier', dark: good.dark },
  ]);
  assert.deepEqual(cached, [good]);
  assert.deepEqual(cachedThemes(undefined), []);
});

await test('the first paint entry names its family and every property in order', () => {
  const [family] = importedFamilies([
    stored(themeId, dataOf('nord', 'Harbour')),
  ]);
  assert.ok(family !== undefined);
  const entry: unknown = JSON.parse(inlineImportedFamily(family));
  assert.ok(entry !== null && typeof entry === 'object');
  assert.equal(Reflect.get(entry, 'family'), family.id);
  const variants: unknown = Reflect.get(entry, 'variants');
  assert.ok(variants !== null && typeof variants === 'object');
  for (const variant of family.variants) {
    const inline: unknown = Reflect.get(variants, variant.appearance);
    const values: unknown = Reflect.get(Object(inline), 'values');
    assert.ok(Array.isArray(values));
    assert.equal(values.length, inlinePropertyNames().length);
    assert.equal(values[0], variant.tokens.background);
  }
});

await test('the kept entry gives the chosen family back before the account answers', () => {
  const [family] = importedFamilies([
    stored(themeId, dataOf('nord', 'Harbour')),
  ]);
  assert.ok(family !== undefined);
  const text = inlineImportedFamily(family);
  assert.deepEqual(keptImportedFamily(text, family.id), family);
  // Another family, a registry family, no entry and a forged entry answer
  // nothing, so only the named family is ever kept.
  assert.equal(keptImportedFamily(text, importedFamilyId('other')), null);
  assert.equal(keptImportedFamily(text, 'nord'), null);
  assert.equal(keptImportedFamily(null, family.id), null);
  assert.equal(
    keptImportedFamily(
      JSON.stringify({ family: family.id, file: '{"name":"x"}' }),
      family.id,
    ),
    null,
  );
  assert.equal(keptImportedFamily('not json', family.id), null);
});
