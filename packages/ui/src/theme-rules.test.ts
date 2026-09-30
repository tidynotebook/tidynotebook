/**
 * Each rule of a palette refuses the neighbouring bad palette.
 *
 * The registry passes every rule (`theme.test.ts`), so each case here starts
 * from a registered palette and breaks one colour.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Theme, ThemeTokens } from './theme.ts';
import { themeColourLabels, themeProblems } from './theme-rules.ts';
import { defaultThemeFor } from './themes/index.ts';

const light = defaultThemeFor('light');

/** The light default palette with some tokens replaced. */
function withTokens(tokens: Partial<ThemeTokens>): Theme {
  return { ...light, tokens: { ...light.tokens, ...tokens } };
}

/** The colours that the problems of one palette name. */
function colours(theme: Theme): string[] {
  return themeProblems(theme).map((problem) => problem.colour);
}

await test('a registered palette has no problem', () => {
  assert.deepEqual(themeProblems(light), []);
  assert.deepEqual(themeProblems(defaultThemeFor('dark')), []);
});

await test('text that matches its fill is one problem that names each fill', () => {
  const problems = themeProblems(
    withTokens({ textMuted: light.tokens.surfaceCard }),
  );
  const muted = problems.filter((problem) => problem.colour === 'textMuted');
  assert.equal(muted.length, 1);
  assert.match(
    muted[0]?.message ?? '',
    /^Muted text is hard to read on .*the card background.*\. Make these colours differ more\.$/,
  );
});

await test('a button label that the fill hides is refused', () => {
  assert.ok(
    colours(withTokens({ accentOnFill: light.tokens.accentFill })).includes(
      'accentOnFill',
    ),
  );
});

await test('an edge and a focus ring that vanish are refused', () => {
  const found = colours(
    withTokens({
      border: light.tokens.background,
      focus: light.tokens.background,
    }),
  );
  assert.ok(found.includes('border'));
  assert.ok(found.includes('focus'));
});

await test('a shade lighter than a background is refused', () => {
  assert.ok(colours(withTokens({ scrim: '#ffffff' })).includes('scrim'));
});

await test('a quiet edge as loud as the control edge is refused', () => {
  assert.ok(
    colours(withTokens({ borderSubtle: light.tokens.border })).includes(
      'borderSubtle',
    ),
  );
});

await test('a code colour that the page hides is refused', () => {
  const theme: Theme = {
    ...light,
    syntax: { ...light.syntax, comment: light.tokens.background },
  };
  const problem = themeProblems(theme).find(
    (item) => item.colour === 'comment',
  );
  assert.match(problem?.message ?? '', /^Code comment is hard to read/);
});

await test('a value that is not a colour is the only problem reported', () => {
  const problems = themeProblems(withTokens({ text: 'red' }));
  assert.deepEqual(problems, [
    {
      colour: 'text',
      message: 'Body text is not a colour. Write it as # and six hex digits.',
    },
  ]);
});

await test('every colour has a label and no label is a property name', () => {
  for (const [name, label] of Object.entries(themeColourLabels)) {
    assert.notEqual(label, name);
    assert.match(label, /^[A-Z][a-z]+(?: [a-z]+)*$/);
  }
});
