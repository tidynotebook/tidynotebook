/**
 * The theme file reads what it writes and names every problem it refuses.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  importedThemeFamily,
  readThemeFile,
  themeFileText,
  themeNameMaximumLength,
  type ThemeFileData,
} from './theme-file.ts';
import { themeProblems } from './theme-rules.ts';
import { findThemeFamily, themeFamilies } from './themes/index.ts';

/** The data of one registered family, read back from its own file. */
function dataOf(id: string): ThemeFileData {
  const family = findThemeFamily(id);
  assert.ok(family !== null);
  const read = readThemeFile(themeFileText(family));
  assert.ok(read.ok);
  return read.theme;
}

/** The file of one registered family, as the download writes it. */
function fileOf(id: string): Record<string, unknown> {
  const family = findThemeFamily(id);
  assert.ok(family !== null);
  const parsed: unknown = JSON.parse(themeFileText(family));
  assert.ok(parsed !== null && typeof parsed === 'object');
  return { ...parsed };
}

await test('every registered family reads back from its own file', () => {
  for (const family of themeFamilies) {
    const read = readThemeFile(themeFileText(family));
    assert.ok(read.ok, family.id);
    const theme: ThemeFileData = read.theme;
    assert.equal(theme.name, family.name);
    for (const variant of family.variants) {
      const palette = theme[variant.appearance];
      assert.deepEqual(palette?.tokens, variant.tokens, variant.id);
      assert.deepEqual(palette?.syntax, variant.syntax, variant.id);
    }
  }
});

await test('an imported family names its variants from its identifier', () => {
  const source = findThemeFamily('default');
  assert.ok(source !== null);
  const read = readThemeFile(themeFileText(source));
  assert.ok(read.ok);
  const family = importedThemeFamily('custom-1', {
    ...read.theme,
    name: 'Harbour',
  });
  assert.equal(family.id, 'custom-1');
  assert.equal(family.name, 'Harbour');
  assert.deepEqual(
    family.variants.map((variant) => [
      variant.id,
      variant.family,
      variant.appearance,
    ]),
    [
      ['custom-1-light', 'custom-1', 'light'],
      ['custom-1-dark', 'custom-1', 'dark'],
    ],
  );
  for (const variant of family.variants)
    assert.deepEqual(themeProblems(variant), []);
});

await test('text that is not JSON is not a theme file', () => {
  assert.deepEqual(readThemeFile('{ "name": '), {
    ok: false,
    problems: [
      'The file is not a theme file. Choose a JSON file that holds a theme.',
    ],
  });
  assert.equal(readThemeFile('[1, 2]').ok, false);
});

await test('a theme with no name and no palette names both problems', () => {
  assert.deepEqual(readThemeFile('{}'), {
    ok: false,
    problems: [
      `The theme has no name that can be used. Give it a name of 1 to ${String(themeNameMaximumLength)} characters.`,
      'The theme has no palette. Add a light palette, a dark palette or both.',
    ],
  });
});

await test('a missing colour is named in the words of the settings', () => {
  const { light } = dataOf('default');
  assert.ok(light !== undefined);
  const { textMuted: _dropped, ...rest } = light.tokens;
  const read = readThemeFile(
    JSON.stringify({ name: 'Missing', light: { ...light, tokens: rest } }),
  );
  assert.equal(read.ok, false);
  if (!read.ok)
    assert.deepEqual(read.problems, [
      'In the light palette, muted text is missing. Add it as # and six hex digits.',
    ]);
});

await test('a palette that breaks a contrast rule names the colour and the fill', () => {
  const { dark } = dataOf('default');
  assert.ok(dark !== undefined);
  const read = readThemeFile(
    JSON.stringify({
      name: 'Unreadable',
      dark: {
        ...dark,
        tokens: { ...dark.tokens, textMuted: dark.tokens.background },
      },
    }),
  );
  assert.equal(read.ok, false);
  if (!read.ok) {
    assert.equal(read.problems.length, 1);
    assert.match(
      read.problems[0] ?? '',
      /^In the dark palette: Muted text is hard to read on the page background/,
    );
  }
});

await test('one palette is enough, and a member a theme does not use is left out', () => {
  const file = fileOf('default');
  const read = readThemeFile(
    JSON.stringify({ name: '  Night only  ', dark: file['dark'], extra: 1 }),
  );
  assert.ok(read.ok);
  assert.equal(read.theme.name, 'Night only');
  assert.equal(read.theme.light, undefined);
  assert.ok(read.theme.dark !== undefined);
});

await test('a name longer than the limit is refused', () => {
  const file = fileOf('default');
  const read = readThemeFile(
    JSON.stringify({ ...file, name: 'x'.repeat(themeNameMaximumLength + 1) }),
  );
  assert.equal(read.ok, false);
});
