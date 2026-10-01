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
import { gripPointerQuery, noteSurfaceStyle } from './editor-theme.ts';

/** One rule of the surface style, as CodeMirror declares it. */
type SurfaceRule = ReturnType<typeof noteSurfaceStyle>[string];

/** One declaration of a rule, which the test reads as text. */
function text(rule: SurfaceRule, property: string): string {
  const value = rule[property];
  assert.equal(typeof value, 'string', `${property} is not a declaration`);
  return typeof value === 'string' ? value : '';
}

/** One rule of the surface style, or a test failure. */
function rule(selector: string): SurfaceRule {
  const found = noteSurfaceStyle()[selector];
  assert.ok(found !== undefined, `the surface style has no ${selector} rule`);
  return found;
}

await test('the block padding of the surface sits on the editable element', () => {
  assert.equal(rule('.cm-scroller').paddingBlock, undefined);
  assert.equal(rule('.cm-scroller').padding, undefined);
  assert.equal(rule('.cm-content').paddingBlockEnd, 'calc(var(--spacing) * 6)');
});

await test('the space above the first line scrolls with the text', () => {
  // The whole space above the first line sits on the editable element, so it
  // moves with the text and leaves no fixed strip under the frame header. The
  // space under the last line stays large, because a click there must still
  // reach the editable element and place the caret.
  const content = rule('.cm-content');
  assert.equal(content.paddingBlock, undefined);
  assert.equal(content.paddingBlockStart, 'calc(var(--spacing) * 6)');
  assert.equal(content.paddingBlockEnd, 'calc(var(--spacing) * 6)');
});

await test('the scroller stretches its content over its full height', () => {
  assert.equal(rule('.cm-scroller').alignItems, 'stretch');
  assert.equal(rule('.cm-content').width, '100%');
});

await test('the reading measure is padding and never a width', () => {
  // A width on `.cm-content` leaves the strip left and right of the text
  // outside the editable element, and a click in that strip places no caret.
  assert.equal(rule('.cm-content').maxWidth, undefined);
  assert.equal(rule('.cm-content').width, '100%');
  assert.equal(rule('.cm-line').maxWidth, 'var(--container-note)');
  assert.equal(rule('.cm-np-widget-block').maxWidth, 'var(--container-note)');
});

await test('the note column is centred by the padding of the content', () => {
  // Decision 0055. The padding centres the column, and it is the only place
  // that can: a centring margin on the line moves every block except a table,
  // because a table row is an internal table box and CSS gives it no margin.
  // The padding never falls under the smallest step, so a narrow screen keeps
  // a strip to click on.
  assert.equal(
    rule('.cm-content').paddingInline,
    'max(calc(var(--spacing) * 2), calc((100% - var(--container-note)) / 2))',
  );
  assert.equal(rule('.cm-line').marginInline, '0');
  assert.equal(rule('.cm-np-widget-block').marginInline, '0');
});

await test('a table row carries no margin, so none decides its column', () => {
  // The regression this holds: the table was the one construct that a
  // centring margin could not move, so it sat a hundred pixels left of every
  // other block of the note.
  assert.equal(rule('.cm-np-table-line').display, 'table-row');
  assert.equal(rule('.cm-np-table-line').marginInline, undefined);
  assert.equal(rule('.cm-np-table-line').marginLeft, undefined);
});

await test('the heading ramp tightens its letters at the large steps', () => {
  assert.equal(rule('.cm-np-h1').letterSpacing, 'var(--tracking-display)');
  assert.equal(rule('.cm-np-h2').letterSpacing, 'var(--tracking-heading)');
  assert.equal(rule('.cm-np-h3').letterSpacing, 'var(--tracking-heading)');
  for (const level of [4, 5, 6])
    assert.equal(rule(`.cm-np-h${String(level)}`).letterSpacing, 'normal');
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

await test('the line the caret sits on takes no fill', () => {
  // A band across the text makes the note read as a table of rows. The
  // declaration stays, because `highlightActiveLine` of CodeMirror ships a
  // fill of its own from outside the palette and only a name turns it off.
  assert.equal(rule('.cm-activeLine').backgroundColor, 'transparent');
  assert.equal(rule('.cm-activeLine').backgroundClip, undefined);
});

await test('the rhythm of the note comes from the blank lines of the note', () => {
  // The defect this holds: a line carried one step of padding at the top and
  // one at the bottom, and the blank line between two paragraphs carried both
  // as well, so one paragraph stood two line heights from the next.
  assert.equal(rule('.cm-line').paddingBlock, '0');
});

await test('the first line of a note starts at the top of the text', () => {
  // There is no block above the first line, so the heading rhythm would only
  // push the title of a note away from the name that titles it.
  assert.equal(rule('.cm-line:first-child').paddingBlockStart, '0');
  // A heading keeps more space above its own text than below it, so it
  // groups with the text it titles. The blank line of the source carries the
  // rest of that space.
  const heading = rule('.cm-np-heading');
  assert.equal(heading.paddingTop, 'calc(var(--spacing) * 3)');
  assert.equal(heading.paddingBottom, 'calc(var(--spacing) * 1)');
});

await test('a code block is one card with a closed edge', () => {
  // Each line of the block is an element of its own and nothing wraps them,
  // so the fill and the two side edges belong to every line and the first and
  // the last line close the box.
  const line = rule('.cm-np-code-block-line');
  assert.equal(line.backgroundColor, 'var(--notes-surface)');
  assert.equal(line.borderInline, '1px solid var(--notes-border-subtle)');
  assert.equal(
    rule('.cm-np-code-block-open').borderStartStartRadius,
    'var(--radius-lg)',
  );
  assert.equal(
    rule('.cm-np-code-block-close').borderEndEndRadius,
    'var(--radius-lg)',
  );
});

await test('the task box is drawn from the theme and never by the system', () => {
  // Record 0033. The native box paints the accent of the operating system,
  // which no palette reaches, so the appearance is removed and the box, its
  // fill and its mark all read theme names.
  const box = rule('.cm-np-task');
  assert.equal(box.appearance, 'none');
  assert.equal(box.border, '1px solid var(--notes-border)');
  assert.equal(box.backgroundColor, 'var(--notes-bg)');
  assert.equal(box.borderRadius, 'var(--radius-sm)');
  assert.equal(
    rule('.cm-np-task:checked').backgroundColor,
    'var(--notes-accent-fill)',
  );
  assert.equal(rule('.cm-np-task-mark').color, 'var(--notes-accent-on-fill)');
  assert.equal(rule('.cm-np-task-mark').display, 'none');
  assert.equal(rule('.cm-np-task:checked + .cm-np-task-mark').display, 'block');
});

await test('the task box centres on the capital band of its line', () => {
  // The box is a control inside a line of text, so a person reads the two as
  // one line. `text-bottom` set the foot of the box on the foot of the
  // descender, which put the centre of the box about 2 px below the centre of
  // the word beside it, and the box read as one that had slipped off the
  // line. The alignment therefore lifts the box by half the capital height of
  // the face in use, `cap`, less half its own edge, so the centre of the box
  // meets the centre of the capital band. No number of Geist appears here:
  // the browser reads the metric of whatever face the line renders in.
  const shell = rule('.cm-np-task-box');
  const size = 'var(--cm-np-task-size)';
  assert.equal(shell['--cm-np-task-size'], 'calc(var(--spacing) * 4)');
  assert.equal(shell.width, size, 'the box reads one name for its edge');
  assert.equal(shell.height, size, 'the box reads one name for its edge');
  assert.equal(shell.verticalAlign, `calc(0.5cap - ${size} / 2)`);
});

await test('a list marker is quiet and never the accent', () => {
  // Record 0062. The accent marks a link, the caret and the selection, and
  // a bullet states none of those.
  assert.equal(rule('.cm-np-bullet').color, 'var(--notes-text-muted)');
  assert.equal(rule('.cm-np-bullet').fontWeight, undefined);
  assert.equal(rule('.cm-np-list-number').color, 'var(--notes-text-muted)');
});

await test('a wrapped item starts on the first letter of its own text', () => {
  // The defect this covers: the editor wraps every line, so the second line
  // of a long item started again at the left edge, under the box or the
  // bullet, and one item read as two.
  //
  // The lead states no width, so it takes the width of the indentation, the
  // marker and the space it holds. The body claims the whole measure, which
  // is what makes the lead shrink to its own content. No rule here states a
  // distance, so the alignment follows the real marker at every depth.
  const line = rule('.cm-np-list-line');
  const lead = rule('.cm-np-list-lead');
  const body = rule('.cm-np-list-body');
  assert.equal(line.display, 'table');
  assert.equal(line.width, '100%');
  assert.equal(lead.display, 'table-cell');
  assert.equal(lead.width, undefined);
  // The source spaces of a nested item keep their own width in the lead.
  assert.equal(lead.whiteSpace, 'pre');
  assert.equal(body.display, 'table-cell');
  assert.equal(body.width, '100%');
});

await test('the pointer over a link says that a click opens it', () => {
  // A plain click on a link opens it, so the cursor states that before the
  // click. A link the selection touches shows its source and is being edited,
  // so it takes the text cursor back. `live-preview.ts` adds the open class
  // from the same reveal rule that shows the source.
  assert.equal(rule('.cm-np-link').cursor, 'pointer');
  assert.equal(rule('.cm-np-link-open').cursor, 'text');
});

await test('strong text and a heading read one weight', () => {
  // One name for one fact, so the note and the published page cannot drift.
  assert.equal(
    rule('.cm-np-bold').fontWeight,
    'var(--font-weight-note-heading)',
  );
  assert.equal(
    rule('.cm-np-table-head').fontWeight,
    'var(--font-weight-note-heading)',
  );
  for (let level = 1; level <= 6; level += 1)
    assert.equal(
      rule(`.cm-np-h${String(level)}`).fontWeight,
      'var(--font-weight-note-heading)',
    );
});

await test('a link states itself with the accent and a quiet underline', () => {
  const link = rule('.cm-np-link');
  assert.equal(link.color, 'var(--notes-accent-text)');
  assert.equal(link.textDecorationLine, 'underline');
  assert.equal(
    link.textDecorationColor,
    'color-mix(in srgb, var(--notes-accent-text) 35%, transparent)',
  );
  assert.equal(link.textUnderlineOffset, '3px');
});

await test('a table is a grid of outlined cells that scrolls on its own', () => {
  // Record 0095. One element wraps the lines of a table, so the table moves
  // inside its outline and the rest of the note stays where it is.
  const wrapper = rule('.cm-np-table');
  assert.equal(wrapper.overflowX, 'auto');
  assert.equal(wrapper.borderCollapse, 'collapse');
  // Regression: the editor measures the padding of a wrapper and never its
  // margin, so a margin above the table put each row lower than the editor
  // knew, and a click or Home found the wrong row.
  assert.equal(wrapper.marginBlock, undefined);
  assert.equal(wrapper.marginBlockStart, undefined);
  assert.equal(wrapper.marginBlockEnd, undefined);
  assert.equal(wrapper.paddingBlock, 'var(--spacing-note-block)');
  // Regression: the table kept a margin at its start and room above it for
  // the handles, so it stood to the right of every other line of the note.
  // The grips straddle its edge now (record 0147).
  assert.equal(wrapper.marginInlineStart, undefined);
  assert.equal(wrapper.paddingBlockStart, undefined);
  const coarse = noteSurfaceStyle()['@media (pointer: coarse)'];
  assert.ok(
    coarse === undefined || !Object.keys(coarse).includes('.cm-np-table'),
  );
  // A hidden separator is a real cell that draws nothing, so a row holds no
  // loose node that the browser wraps in an anonymous cell of its own.
  const gap = rule('.cm-np-table-gap');
  assert.equal(gap.display, 'table-cell');
  assert.equal(gap.width, '0');
  assert.equal(gap.padding, '0');
  assert.equal(gap.border, undefined);
  const head = rule('.cm-np-table-head');
  const cell = rule('.cm-np-table-cell');
  for (const box of [head, cell]) {
    // The outline is the one divider of the palette (record 0063).
    assert.equal(box.border, '1px solid var(--notes-border-line)');
    // A cell wraps at a word and never inside one, so a column takes the
    // width of its text up to the note column (record 0147). Regression: a
    // cell inherited the break anywhere of the content, and the browser sized
    // a column by single letters and cut its words in two.
    assert.equal(box.whiteSpace, 'pre-wrap');
    assert.equal(box.overflowWrap, 'normal');
    assert.equal(box.wordBreak, 'normal');
    // A browser ignores a minimum width on a table cell, so a block of no
    // height inside the cell holds the width of an empty one.
    assert.equal(box.minWidth, undefined);
  }
  const floor = rule('.cm-np-table-cell::before, .cm-np-table-head::before');
  assert.equal(floor.display, 'block');
  assert.equal(floor.height, '0');
  assert.ok(floor.width !== undefined, 'an empty cell keeps a width');
  // The head differs by fill before it differs by a line.
  assert.equal(head.backgroundColor, 'var(--notes-surface-hover)');
  // The active cell takes the one focus treatment, inside its own edge.
  assert.equal(
    rule('.cm-np-table-active').outline,
    '2px solid var(--notes-focus)',
  );
  // No rule draws a separator, because no separator is on the screen.
  const style = noteSurfaceStyle();
  assert.ok(
    !Object.keys(style).some((selector) => selector.includes('table-pipe')),
  );
});

await test('the language of a fence is a value and not a label', () => {
  const info = rule('.cm-np-code-info');
  assert.equal(info.textTransform, undefined);
  assert.equal(info.letterSpacing, undefined);
  assert.equal(info.fontFamily, 'var(--font-mono)');
});

await test('the active code line has a focus outline', () => {
  const activeCodeLine = rule('.cm-activeLine.cm-np-code-block-line');
  assert.equal(activeCodeLine.outline, '1px solid var(--notes-focus)');
  assert.equal(activeCodeLine.outlineOffset, '-1px');
});

await test('front matter uses the metadata style from the theme', () => {
  const frontMatter = rule('.cm-np-front-matter');
  assert.equal(frontMatter.fontFamily, 'var(--font-mono)');
  assert.equal(frontMatter.color, 'var(--notes-text-muted)');
  assert.equal(frontMatter.backgroundColor, 'var(--notes-surface-hover)');
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
    const layers = text(quote, 'backgroundImage');
    assert.equal(layers.split('linear-gradient').length - 1, level);
    // The bar is the one divider of record 0063 and not the component edge,
    // which the product keeps for a control whose state a person reads.
    assert.ok(layers.includes('var(--notes-border-line)'));
    // Every color of the adapter is a palette variable, so a literal here
    // would put a color outside the theme registry.
    assert.ok(!/#[0-9a-fA-F]{3}|rgba?\(/.test(layers));
    assert.equal(text(quote, 'backgroundPosition').split(',').length, level);
    // Two pixels of bar. A quote is quiet text with a mark beside it, not a
    // block with a rail.
    assert.equal(quote.backgroundSize, 'calc(var(--spacing) * 0.5) 100%');
    assert.equal(quote.backgroundRepeat, 'no-repeat');
    // The text clears the last bar by the same step that separates two bars.
    assert.equal(
      quote.paddingInlineStart,
      `calc(var(--spacing) * ${String(level * 4)})`,
    );
  }
});

await test('the column keeps room for the grip of a list item where it shows', () => {
  // Record 0106. The grip shows under one media query, and the same query
  // gives the column its room, so a grip is never cut at the edge.
  const media = rule(`@media ${gripPointerQuery}`);
  const content = media['.cm-content'];
  assert.ok(typeof content === 'object' && content !== null);
  if (typeof content !== 'object' || content === null) return;
  assert.equal(
    text(content, 'paddingInlineStart'),
    'max(calc(var(--spacing) * 5), calc((100% - var(--container-note)) / 2))',
  );
  // The room is one step wider than the grip.
  assert.equal(
    text(rule('.cm-np-list-grip'), 'width'),
    'calc(var(--spacing) * 4)',
  );
  // A finger gets no grip, and the grip takes no scroll of the page.
  assert.match(gripPointerQuery, /hover: hover/);
  assert.match(gripPointerQuery, /pointer: fine/);
  assert.equal(rule('.cm-np-list-grip').touchAction, 'none');
});
