/**
 * The layout invariants of the note surface style.
 *
 * These rules are geometry, not decoration. `.cm-content` is the editable
 * element of CodeMirror, so only padding on that element keeps the empty
 * strip under the last line inside the text. When the padding sits on
 * `.cm-scroller` instead, a click under the last line hits a plain division,
 * no caret is placed, and every keystroke after it is lost.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { noteSurfaceStyle } from './editor-theme.ts';

/** One rule of the surface style, read as a flat record. */
function rule(selector: string): Record<string, unknown> {
  const style = noteSurfaceStyle() as Record<string, unknown>;
  const found = style[selector];
  assert.ok(
    typeof found === 'object' && found !== null,
    `the surface style has no ${selector} rule`,
  );
  return found as Record<string, unknown>;
}

await test('the block padding of the surface sits on the editable element', () => {
  assert.equal(rule('.cm-scroller').paddingBlock, undefined);
  assert.equal(rule('.cm-scroller').padding, undefined);
  assert.equal(rule('.cm-content').paddingBlockEnd, 'calc(var(--spacing) * 6)');
});

await test('the text starts close under the note name', () => {
  // The note name titles the text under it, so the two group together. The
  // space under the last line stays large, because a click there must still
  // reach the editable element and place the caret.
  const content = rule('.cm-content');
  assert.equal(content.paddingBlock, undefined);
  assert.equal(content.paddingBlockStart, 'calc(var(--spacing) * 2)');
  assert.equal(content.paddingBlockEnd, 'calc(var(--spacing) * 6)');
});

await test('the scroller stretches its content over its full height', () => {
  assert.equal(rule('.cm-scroller').alignItems, 'stretch');
  assert.equal(rule('.cm-content').width, '100%');
});

await test('the reading measure sits on the line and not on the content', () => {
  // A measure on `.cm-content` leaves the strip left and right of the text
  // outside the editable element, and a click in that strip places no caret.
  assert.equal(rule('.cm-content').maxWidth, undefined);
  assert.equal(rule('.cm-content').marginInline, undefined);
  assert.equal(rule('.cm-content').paddingInline, 'calc(var(--spacing) * 2)');
  assert.equal(rule('.cm-line').maxWidth, 'var(--container-note)');
  assert.equal(rule('.cm-line').marginInline, '0');
  assert.equal(rule('.cm-np-widget-block').maxWidth, 'var(--container-note)');
  assert.equal(rule('.cm-np-widget-block').marginInline, '0');
});

await test('every heading level keeps the shared line edge', () => {
  for (let level = 1; level <= 6; level += 1) {
    const heading = rule(`.cm-np-h${String(level)}`);
    assert.equal(heading.maxWidth, undefined);
    assert.equal(heading.marginInline, undefined);
    assert.equal(heading.marginInlineStart, undefined);
    assert.equal(heading.paddingInline, undefined);
    assert.equal(heading.paddingInlineStart, undefined);
  }
});

await test('the note body reads in the strong text color', () => {
  assert.equal(rule('&').color, 'var(--notes-text-strong)');
});

await test('the caret mark is one text line high at every block kind', () => {
  // A line holds the space between two blocks as padding, because CodeMirror
  // measures a line by its padding box. That space belongs to the block and
  // not to the line, so the mark of the caret stops at the content box and a
  // heading never shows a tall empty band over its own text.
  assert.equal(rule('.cm-activeLine').backgroundClip, 'content-box');
  // A fill that states the block itself covers the whole line box.
  assert.equal(rule('.cm-np-code-block-line').backgroundClip, 'border-box');
  assert.equal(rule('.cm-np-quote').backgroundClip, 'border-box');
});

await test('the first line of a note starts at the top of the text', () => {
  // There is no block above the first line, so the heading rhythm would only
  // push the title of a note away from the name that titles it.
  assert.equal(rule('.cm-line:first-child').paddingBlockStart, '0');
  assert.equal(rule('.cm-np-heading').paddingTop, 'calc(var(--spacing) * 5)');
});

await test('the active code line has a focus outline', () => {
  const activeCodeLine = rule('.cm-activeLine.cm-np-code-block-line');
  assert.equal(activeCodeLine.outline, '1px solid var(--notes-focus)');
  assert.equal(activeCodeLine.outlineOffset, '-1px');
});

await test('a block quote reads in the muted text color', () => {
  assert.equal(rule('.cm-np-quote').color, 'var(--notes-text-muted)');
});

await test('a block quote draws a left bar and never a box', () => {
  // The GitHub style is one bar on the left. A fill, a radius, or an edge on
  // another side turns the quote back into the box this test guards against.
  for (const selector of [
    '.cm-np-quote',
    '.cm-np-quote-1',
    '.cm-np-quote-2',
    '.cm-np-quote-3',
    '.cm-np-quote-4',
  ]) {
    const quote = rule(selector);
    for (const property of [
      'background',
      'backgroundColor',
      'border',
      'borderTop',
      'borderBottom',
      'borderInlineEnd',
      'borderBlock',
      'borderRadius',
      'boxShadow',
      'outline',
    ])
      assert.equal(quote[property], undefined, `${selector} sets ${property}`);
  }
});

await test('each quote level adds one bar from the theme palette', () => {
  for (let level = 1; level <= 4; level += 1) {
    const quote = rule(`.cm-np-quote-${String(level)}`);
    const layers = String(quote.backgroundImage);
    assert.equal(layers.split('linear-gradient').length - 1, level);
    assert.ok(layers.includes('var(--notes-border)'));
    // Every color of the adapter is a palette variable, so a literal here
    // would put a color outside the theme registry.
    assert.ok(!/#[0-9a-fA-F]{3}|rgba?\(/.test(layers));
    assert.equal(String(quote.backgroundPosition).split(',').length, level);
    assert.equal(quote.backgroundSize, 'calc(var(--spacing) * 1) 100%');
    assert.equal(quote.backgroundRepeat, 'no-repeat');
    // The text clears the last bar by the same step that separates two bars.
    assert.equal(
      quote.paddingInlineStart,
      `calc(var(--spacing) * ${String(level * 4)})`,
    );
  }
});
