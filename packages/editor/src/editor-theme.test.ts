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
  assert.equal(rule('.cm-content').paddingBlock, 'calc(var(--spacing) * 6)');
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
  assert.equal(rule('.cm-line').maxWidth, 'var(--note-measure)');
  assert.equal(rule('.cm-line').marginInline, 'auto');
  assert.equal(rule('.cm-np-widget-block').maxWidth, 'var(--note-measure)');
  assert.equal(rule('.cm-np-widget-block').marginInline, 'auto');
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
