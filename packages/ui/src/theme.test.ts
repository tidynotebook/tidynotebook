/**
 * UI theme unit tests.
 *
 * Appearance resolution is a pure truth table. Contrast is checked per
 * surface, for the pairs the application actually renders, so the rules in
 * the module doc and the code agree. The surface list holds the five fills a
 * screen can paint: the page background, the sidebar surface, the card, and
 * the hover and active states of a row.
 *
 * Every check runs for every theme in the registry, so a new theme file is
 * held to the same rules as the ones that ship today and no variant can
 * reach a screen without meeting them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyTheme,
  colourSchemeProperty,
  contrastRatio,
  derivedPropertyName,
  derivedPropertyNames,
  derivedValue,
  fillHoverShift,
  mixHexColors,
  parseAppearanceChoice,
  parseHexColor,
  relativeLuminance,
  resolveAppearance,
  scrollbarProperty,
  scrollbarValue,
  shiftAwayFrom,
  syntaxPropertyName,
  syntaxPropertyNames,
  themePropertyName,
  themePropertyNames,
  toneSurfaceBlend,
  type Theme,
} from './theme.ts';
import { themeProblems } from './theme-rules.ts';
import {
  defaultThemeFamilyId,
  defaultThemeFor,
  findTheme,
  findThemeFamily,
  parseThemeFamilyId,
  themeFamilies,
  themeFor,
  themes,
} from './themes/index.ts';

await test('system choice follows the device preference', () => {
  assert.equal(resolveAppearance('system', true), 'dark');
  assert.equal(resolveAppearance('system', false), 'light');
});

await test('explicit choice wins over the device preference', () => {
  assert.equal(resolveAppearance('light', true), 'light');
  assert.equal(resolveAppearance('light', false), 'light');
  assert.equal(resolveAppearance('dark', true), 'dark');
  assert.equal(resolveAppearance('dark', false), 'dark');
});

await test('unknown stored values fall back to system', () => {
  assert.equal(parseAppearanceChoice('light'), 'light');
  assert.equal(parseAppearanceChoice('dark'), 'dark');
  assert.equal(parseAppearanceChoice('system'), 'system');
  assert.equal(parseAppearanceChoice(undefined), 'system');
  assert.equal(parseAppearanceChoice('midnight'), 'system');
  assert.equal(parseAppearanceChoice(42), 'system');
});

await test('hex parsing accepts only six digit colors', () => {
  assert.deepEqual(parseHexColor('#1a1b26'), [26 / 255, 27 / 255, 38 / 255]);
  assert.equal(parseHexColor('#fff'), null);
  assert.equal(parseHexColor('1a1b26'), null);
  assert.equal(parseHexColor('#zzzzzz'), null);
});

await test('luminance and contrast match known anchors', () => {
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(relativeLuminance('#ffffff'), 1);
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#1a1b26', '#1a1b26'), 1);
  assert.ok(Number.isNaN(contrastRatio('#fff', '#ffffff')));
});

for (const theme of themes) {
  await test(`${theme.id} meets every rule of a palette`, () => {
    // One rule set holds the registry and every imported theme (decision
    // 0141), so a failure here names the colour and the fill in the words a
    // person reads on import.
    assert.deepEqual(
      themeProblems(theme).map((problem) => problem.message),
      [],
    );
  });

  await test(`${theme.id} states every colour as a six digit hex value`, () => {
    for (const property of themePropertyNames)
      assert.ok(
        parseHexColor(theme.tokens[property]) !== null,
        `${property} in ${theme.id}`,
      );
    for (const property of derivedPropertyNames)
      assert.ok(
        parseHexColor(derivedValue(theme.tokens, property)) !== null,
        `${property} in ${theme.id}`,
      );
    for (const property of syntaxPropertyNames)
      assert.ok(
        parseHexColor(theme.syntax[property]) !== null,
        `${property} in ${theme.id}`,
      );
  });
}

await test('day and night keep the values of the design table', () => {
  const day = findTheme('tokyo-night-day');
  const night = findTheme('tokyo-night-night');
  assert.ok(day !== null && night !== null);
  assert.equal(day.tokens.text, '#3760bf');
  assert.equal(day.tokens.background, '#e1e2e7');
  assert.equal(day.tokens.surface, '#d0d5e3');
  assert.equal(night.tokens.background, '#1a1b26');
  assert.equal(night.tokens.surface, '#16161e');
  assert.equal(night.tokens.text, '#c0caf5');
});

await test('every family is identified once and names its source', () => {
  const seen = new Set<string>();
  for (const family of themeFamilies) {
    assert.ok(!seen.has(family.id), `${family.id} is registered twice`);
    seen.add(family.id);
    assert.ok(family.name !== '');
    assert.ok(family.source.project !== '');
    assert.ok(family.source.url.startsWith('https://'));
    assert.ok(family.source.licence !== '');
    assert.ok(family.variants.length > 0);
    assert.ok(family.variants.length <= 2);
  }
});

await test('every variant belongs to its family and is identified once', () => {
  const seen = new Set<string>();
  for (const family of themeFamilies) {
    const appearances = new Set<string>();
    for (const variant of family.variants) {
      assert.ok(!seen.has(variant.id), `${variant.id} is registered twice`);
      seen.add(variant.id);
      assert.equal(variant.family, family.id);
      assert.ok(!appearances.has(variant.appearance), `${family.id} repeats`);
      appearances.add(variant.appearance);
    }
  }
  assert.equal(seen.size, themes.length);
});

await test('a family answers both appearances', () => {
  for (const family of themeFamilies) {
    for (const appearance of ['light', 'dark'] as const) {
      const theme = themeFor(family.id, appearance);
      assert.equal(theme.family, family.id);
    }
  }
});

await test('an unknown family falls back to the default one', () => {
  assert.equal(themeFor('neon', 'dark').family, defaultThemeFamilyId);
  assert.equal(parseThemeFamilyId('neon'), defaultThemeFamilyId);
  assert.equal(parseThemeFamilyId(42), defaultThemeFamilyId);
  assert.equal(parseThemeFamilyId('nord'), 'nord');
  assert.equal(findThemeFamily('neon'), null);
  assert.equal(findTheme('neon'), null);
  assert.equal(defaultThemeFor('dark').id, 'default-dark');
  assert.equal(defaultThemeFor('light').id, 'default-light');
});

await test('a blend takes the stated share of the first colour', () => {
  assert.equal(mixHexColors('#000000', '#ffffff', 0), '#ffffff');
  assert.equal(mixHexColors('#000000', '#ffffff', 1), '#000000');
  assert.equal(mixHexColors('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mixHexColors('#fff', '#ffffff', 0.5), null);
  assert.equal(mixHexColors('#ffffff', 'white', 0.5), null);
});

await test('a palette with an unreadable edge falls back to the quiet edge', () => {
  const tokens = { ...defaultThemeFor('dark').tokens, border: 'rebeccapurple' };
  assert.equal(derivedValue(tokens, 'borderLine'), tokens.borderSubtle);
});

await test('a shift moves a colour away from its background', () => {
  // A light background darkens, a dark background lightens, and the share is
  // taken out of what is left, so neither direction can leave the range.
  assert.equal(shiftAwayFrom('#808080', '#ffffff', 0.5), '#404040');
  assert.equal(shiftAwayFrom('#808080', '#000000', 0.5), '#c0c0c0');
  assert.equal(shiftAwayFrom('#000000', '#ffffff', 0.5), '#000000');
  assert.equal(shiftAwayFrom('#ffffff', '#000000', 0.5), '#ffffff');
  assert.equal(shiftAwayFrom('#808080', '#ffffff', 0), '#808080');
  assert.equal(shiftAwayFrom('#fff', '#000000', 0.5), null);
  assert.equal(shiftAwayFrom('#808080', 'white', 0.5), null);
});

await test('a palette with an unreadable fill keeps that fill on hover', () => {
  const base = defaultThemeFor('dark').tokens;
  const tokens = { ...base, accentFill: 'rebeccapurple' };
  assert.equal(derivedValue(tokens, 'accentFillHover'), 'rebeccapurple');
});

await test('the hover shift is the one step of every control fill', () => {
  const tokens = defaultThemeFor('light').tokens;
  assert.equal(
    derivedValue(tokens, 'accentFillHover'),
    shiftAwayFrom(tokens.accentFill, tokens.background, fillHoverShift),
  );
  assert.equal(
    derivedValue(tokens, 'dangerFillHover'),
    shiftAwayFrom(tokens.dangerFill, tokens.background, fillHoverShift),
  );
});

await test('the tone blend is the one step of every tone surface', () => {
  const tokens = defaultThemeFor('light').tokens;
  for (const [tone, surface] of [
    ['accentText', 'accentSurface'],
    ['successText', 'successSurface'],
    ['dangerText', 'dangerSurface'],
  ] as const) {
    assert.equal(
      derivedValue(tokens, surface),
      mixHexColors(tokens[tone], tokens.background, toneSurfaceBlend),
    );
  }
});

await test('a palette with an unreadable tone keeps the page behind it', () => {
  const base = defaultThemeFor('dark').tokens;
  const tokens = { ...base, dangerText: 'rebeccapurple' };
  assert.equal(derivedValue(tokens, 'dangerSurface'), tokens.background);
});

await test('the default action is ink and the blue carries meaning', () => {
  // Decision 0062. The fill of the one action is near black on the light page
  // and near white on the dark page, and the blue stays where colour states a
  // meaning that no shape states: the link and the focus ring.
  const light = defaultThemeFor('light').tokens;
  const dark = defaultThemeFor('dark').tokens;
  assert.ok(relativeLuminance(light.accentFill) < 0.05, 'the light ink fill');
  assert.ok(relativeLuminance(dark.accentFill) > 0.8, 'the dark ink fill');
  assert.notEqual(light.accentFill, light.focus);
  assert.notEqual(dark.accentFill, dark.focus);
  assert.equal(light.accentText, '#1a63c4');
  assert.equal(dark.accentText, '#6fa8f5');
});

await test('themePropertyName maps every token to one property', () => {
  assert.equal(themePropertyName('surface'), '--notes-surface');
  assert.equal(themePropertyName('background'), '--notes-bg');
  assert.equal(themePropertyName('focus'), '--notes-focus');
  assert.equal(themePropertyName('scrim'), '--notes-scrim');
  assert.equal(themePropertyName('dangerFill'), '--notes-danger-fill');
  assert.equal(themePropertyName('onDanger'), '--notes-on-danger');
  assert.equal(syntaxPropertyName('keyword'), '--notes-syntax-keyword');
  const seen = new Set<string>();
  for (const name of themePropertyNames) {
    const property = themePropertyName(name);
    assert.ok(property.startsWith('--notes-'));
    assert.ok(!seen.has(property), `${property} is written twice`);
    seen.add(property);
  }
  assert.equal(derivedPropertyName('borderLine'), '--notes-border-line');
  assert.equal(
    derivedPropertyName('accentFillHover'),
    '--notes-accent-fill-hover',
  );
  assert.equal(
    derivedPropertyName('dangerFillHover'),
    '--notes-danger-fill-hover',
  );
  assert.equal(derivedPropertyName('accentSurface'), '--notes-accent-surface');
  assert.equal(
    derivedPropertyName('successSurface'),
    '--notes-success-surface',
  );
  assert.equal(derivedPropertyName('dangerSurface'), '--notes-danger-surface');
  for (const name of derivedPropertyNames) {
    const property = derivedPropertyName(name);
    assert.ok(property.startsWith('--notes-'));
    assert.ok(!seen.has(property), `${property} is written twice`);
    seen.add(property);
  }
  for (const name of syntaxPropertyNames) {
    const property = syntaxPropertyName(name);
    assert.ok(!seen.has(property), `${property} is written twice`);
    seen.add(property);
  }
});

await test('applying a theme writes every property and both attributes', () => {
  const theme: Theme = defaultThemeFor('dark');
  const attributes = new Map<string, string>();
  const properties = new Map<string, string>();
  applyTheme(
    {
      setAttribute: (key, value) => attributes.set(key, value),
      setProperty: (key, value) => properties.set(key, value),
    },
    theme,
  );
  assert.equal(attributes.get('data-theme'), 'dark');
  assert.equal(attributes.get('data-theme-id'), theme.id);
  assert.equal(
    properties.size,
    themePropertyNames.length +
      derivedPropertyNames.length +
      syntaxPropertyNames.length +
      2,
  );
  assert.equal(properties.get('--notes-bg'), theme.tokens.background);
  assert.equal(
    properties.get('--notes-border-line'),
    derivedValue(theme.tokens, 'borderLine'),
  );
  assert.equal(properties.get('--notes-syntax-comment'), theme.syntax.comment);
});

await test('the scrollbar takes the component edge of the palette', () => {
  // A scrollbar is a control that a person must see and grab, so its thumb is
  // the edge token that every palette holds to the non-text minimum. The
  // value names the property instead of copying a colour, so one write
  // follows every theme change.
  assert.equal(scrollbarValue, 'var(--notes-border) transparent');
  const properties = new Map<string, string>();
  applyTheme(
    {
      setAttribute: () => undefined,
      setProperty: (key, value) => properties.set(key, value),
    },
    defaultThemeFor('dark'),
  );
  assert.equal(properties.get(scrollbarProperty), scrollbarValue);
});

await test('every theme states its appearance as the colour scheme', () => {
  // The browser draws the scrollbar of every region that scrolls from this
  // one property. A dark palette with no colour scheme takes the light
  // scrollbar of the browser, which is what a person saw before this rule.
  for (const theme of themes) {
    const properties = new Map<string, string>();
    applyTheme(
      {
        setAttribute: () => undefined,
        setProperty: (key, value) => properties.set(key, value),
      },
      theme,
    );
    assert.equal(
      properties.get(colourSchemeProperty),
      theme.appearance,
      theme.id,
    );
  }
});
