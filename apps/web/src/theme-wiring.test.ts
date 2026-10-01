/**
 * One palette source for the whole shell.
 *
 * The theme registry of `@notesapp/ui` is the only place a colour value may
 * live (audit UI-48). The shell document, the installed manifest, and the
 * editor all derive from it, and each of those paths used to hold its own
 * copy of the palette. These tests fail as soon as one of them stops
 * covering the whole registry. The companion check that no document holds a
 * colour value of its own lives in `tests/integration/theme-variables.test.ts`,
 * which may read the repository files.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { syntaxTokenNames } from '@notesapp/editor';
import {
  defaultThemeFamilyId,
  defaultThemeFor,
  derivedPropertyName,
  derivedPropertyNames,
  derivedValue,
  syntaxPropertyNames,
  themeFamilies,
  themePropertyNames,
  themes,
} from '@notesapp/ui';
import {
  appIcons,
  iconSourceAddresses,
  type IconAddresses,
} from './pwa/icons.ts';
import {
  themeRegistry,
  themeRegistryData,
  type InlineThemeVariant,
} from './lib/first-paint.ts';
import { webManifest, webManifestDocument } from '../vite.config.ts';

const inline = themeRegistry();

/** The source address of every icon, as the development server answers it. */
const sourceAddresses: IconAddresses = iconSourceAddresses();

await test('the inline script text carries the registry it was built from', () => {
  assert.deepEqual(JSON.parse(themeRegistryData()), inline);
});

await test('the manifest text carries the document it was built from', () => {
  assert.deepEqual(
    JSON.parse(webManifest(sourceAddresses)),
    webManifestDocument(sourceAddresses),
  );
});

await test('the inline script carries every theme of the registry', () => {
  assert.equal(inline.fallback, defaultThemeFamilyId);
  assert.equal(
    inline.properties.length,
    themePropertyNames.length +
      derivedPropertyNames.length +
      syntaxPropertyNames.length,
  );
  assert.deepEqual(
    Object.keys(inline.families).sort(),
    [...themeFamilies.map((family) => family.id)].sort(),
  );
  let counted = 0;
  for (const family of themeFamilies) {
    const variants = inline.families[family.id];
    assert.ok(variants !== undefined, family.id);
    for (const theme of family.variants) {
      const variant: InlineThemeVariant | undefined =
        variants[theme.appearance];
      assert.ok(variant !== undefined, theme.id);
      assert.equal(variant.id, theme.id);
      assert.equal(variant.values.length, inline.properties.length);
      assert.equal(variant.values[0], theme.tokens.background);
      counted += 1;
    }
  }
  assert.equal(counted, themes.length);
});

await test('the inline script carries the derived divider of every theme', () => {
  const at = inline.properties.indexOf(derivedPropertyName('borderLine'));
  assert.ok(at >= 0, 'the divider is missing from the inline script');
  for (const family of themeFamilies) {
    const variants = inline.families[family.id];
    assert.ok(variants !== undefined, family.id);
    for (const theme of family.variants) {
      const variant: InlineThemeVariant | undefined =
        variants[theme.appearance];
      assert.ok(variant !== undefined, theme.id);
      assert.equal(
        variant.values[at],
        derivedValue(theme.tokens, 'borderLine'),
        theme.id,
      );
    }
  }
});

await test('the manifest takes its interface colour from the registry', () => {
  const manifest = webManifestDocument(sourceAddresses);
  const theme = defaultThemeFor('dark');
  assert.equal(manifest.theme_color, theme.tokens.background);
  assert.equal(manifest.background_color, theme.tokens.background);
  assert.equal(manifest.name, 'Notesapp');
});

await test('the editor reads exactly the syntax group of a theme', () => {
  assert.deepEqual([...syntaxTokenNames], [...syntaxPropertyNames]);
});

await test('every icon of the manifest is one the build emits', () => {
  const manifest = webManifestDocument(sourceAddresses);
  const listed = appIcons.filter((icon) => icon.purpose !== null);
  assert.equal(manifest.icons.length, listed.length);
  for (const [at, icon] of listed.entries()) {
    const entry = manifest.icons[at];
    assert.ok(entry !== undefined, icon.file);
    assert.equal(entry.src, sourceAddresses[icon.file], icon.file);
    assert.equal(entry.type, icon.type, icon.file);
    assert.equal(entry.purpose, icon.purpose, icon.file);
  }
});
