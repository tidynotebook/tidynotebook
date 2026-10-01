/**
 * The typed style adapter of the note surface.
 *
 * CodeMirror builds its own DOM, so a utility class cannot reach a line, a
 * marker, or a widget. This module is the one place that sets the
 * appearance of that generated DOM, and every value it writes is a central
 * theme variable declared in `apps/web/src/tailwind.css`. Nothing here
 * invents a color, a size, or a radius.
 *
 * The note surface is the design. Body text is 16 px on a 1.65 line height
 * at a measure of 40 rem, headings run on one clear ramp from one and a half
 * times the body size down to body size at level six, and monospaced text
 * sits at 0.9 em so a code span keeps the line height of the paragraph around
 * it.
 *
 * The vertical rhythm of the note comes from the note itself. A person who
 * writes Markdown separates two blocks with a blank line, and the live
 * preview renders that blank line at the full line height, so the space is
 * already on the screen. A line therefore adds no padding of its own: every
 * step the adapter added to a line was a second copy of that space, and a
 * paragraph stood two line heights from the next. A heading adds the one
 * distance the source cannot state, a little more space above its own text
 * than below it, so it groups with the text it titles.
 *
 * `editorThemeVariables` lists every custom property this module reads. A
 * unit test asserts that the built stylesheet declares all of them, which is
 * how a variable that Tailwind never emits gets caught before a release.
 */
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * Every custom property the adapter reads from the built stylesheet.
 *
 * The runtime palette (`--notes-*`) is written by `applyTheme` in
 * `@notesapp/ui` at run time and is deliberately not listed here.
 */
export const editorThemeVariables: readonly string[] = [
  '--font-sans',
  '--font-mono',
  '--spacing',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--text-ui',
  '--text-ui--line-height',
  '--text-control',
  '--text-base',
  '--text-note',
  '--text-note--line-height',
  '--container-note',
  '--spacing-note-block',
  '--text-note-mono',
  '--text-note-h1',
  '--text-note-h1--line-height',
  '--text-note-h2',
  '--text-note-h2--line-height',
  '--text-note-h3',
  '--text-note-h3--line-height',
  '--text-note-h4',
  '--text-note-h4--line-height',
  '--text-note-h5',
  '--text-note-h5--line-height',
  '--text-note-h6',
  '--text-note-h6--line-height',
  '--font-weight-note-heading',
  '--tracking-heading',
  '--tracking-display',
  '--shadow-raised',
];

/**
 * Where the grip of a list item shows: a pointer that can hover and is fine,
 * which is a mouse or a pen (record 0106).
 *
 * The column keeps room for the grip at its start under the same query, and
 * `list-controls.ts` reads this one string, so the room and the grip cannot
 * disagree. A finger gets no grip, because its room would move every line of
 * every note on a phone.
 */
export const gripPointerQuery = '(hover: hover) and (pointer: fine)';

/**
 * Where a field takes the touch step: a coarse pointer, which is a finger.
 *
 * Safari on iOS zooms the page into a field under 16 px on focus, so every
 * field of the product sets its text at 16 px under touch (`touchFieldText`
 * of `@notesapp/ui`). CodeMirror builds the search field itself, so the panel
 * theme states the rule under this query, and
 * `tests/integration/theme-variables.test.ts` holds it to the query that
 * Tailwind writes for the class of every other field.
 */
export const touchFieldQuery = '(pointer: coarse)';

/** The heading ramp, level by level. */
const headings: ReadonlyArray<readonly [string, string]> = [
  ['var(--text-note-h1)', 'var(--text-note-h1--line-height)'],
  ['var(--text-note-h2)', 'var(--text-note-h2--line-height)'],
  ['var(--text-note-h3)', 'var(--text-note-h3--line-height)'],
  ['var(--text-note-h4)', 'var(--text-note-h4--line-height)'],
  ['var(--text-note-h5)', 'var(--text-note-h5--line-height)'],
  ['var(--text-note-h6)', 'var(--text-note-h6--line-height)'],
];

/**
 * The letter spacing of one heading level.
 *
 * Large type at the default spacing reads loose, and the effect grows with
 * the size, so the top of the ramp pulls its letters in the most and a
 * heading near the body size leaves them alone. The two values are named in
 * the central theme of `apps/web/src/tailwind.css`.
 */
function headingTracking(index: number): string {
  if (index === 0) return 'var(--tracking-display)';
  if (index < 3) return 'var(--tracking-heading)';
  return 'normal';
}

/** The heading rules, one per level. */
function headingRules(): Record<string, Record<string, string>> {
  const rules: Record<string, Record<string, string>> = {};
  headings.forEach(([size, lineHeight], index) => {
    rules[`.cm-np-h${String(index + 1)}`] = {
      fontSize: size,
      lineHeight,
      // One weight for every level. The size of the step states the level,
      // and the note name above it is the only larger text on the screen
      // (decision 0065).
      fontWeight: 'var(--font-weight-note-heading)',
      letterSpacing: headingTracking(index),
      color: 'var(--notes-text-strong)',
    };
  });
  return rules;
}

/** The width of one quote bar. */
const quoteBarWidth = 'calc(var(--spacing) * 0.5)';

/** The distance from one quote bar to the next, and to the quoted text. */
const quoteBarStep = 4;

/**
 * The bars and the text inset of one block quote level.
 *
 * A block quote reads like the GitHub style: a solid bar on the left, the
 * text clear of that bar, and a quieter text color. It is not a box. There
 * is no fill, no radius, and no edge on the other three sides.
 *
 * CodeMirror gives each quoted line its own element, so a bar is a
 * background stripe of that line and the stripes of neighbour lines join
 * into one continuous bar. One flat line element cannot hold a nested
 * element, so a quote inside a quote adds one more stripe one step further
 * in, and the reader counts one bar for each level. Each stripe is a solid
 * background layer in the divider color of the palette, which record 0063
 * makes every rule of the product; the layer list, the layer size, and the
 * layer position are the only way to put a stripe at an offset without a
 * second element.
 */
function quoteLevel(level: number): Record<string, string> {
  const layers: string[] = [];
  const positions: string[] = [];
  for (let index = 0; index < level; index += 1) {
    // The bar reads one colour name, so an alert repaints every bar of its
    // quote by setting that name and nothing else.
    layers.push(
      'linear-gradient(var(--cm-np-quote-bar, var(--notes-border-line)), var(--cm-np-quote-bar, var(--notes-border-line)))',
    );
    positions.push(`calc(var(--spacing) * ${String(index * quoteBarStep)}) 0`);
  }
  return {
    backgroundImage: layers.join(', '),
    backgroundPosition: positions.join(', '),
    backgroundSize: `${quoteBarWidth} 100%`,
    backgroundRepeat: 'no-repeat',
    paddingInlineStart: `calc(var(--spacing) * ${String(level * quoteBarStep)})`,
  };
}

/**
 * The complete note surface style for one palette.
 *
 * The palette only decides whether CodeMirror treats the editor as dark;
 * every color comes from a runtime variable, so a palette change never
 * rebuilds this object.
 */
export function editorTheme(theme: 'light' | 'dark'): Extension {
  return EditorView.theme(noteSurfaceStyle(), { dark: theme === 'dark' });
}

/**
 * The style rules of the note surface, so a unit test can read them.
 *
 * The block padding of the surface belongs to `.cm-content` and never to
 * `.cm-scroller`. `.cm-content` is the editable element, so a click inside
 * its padding places the caret on the nearest line. Padding on the scroller
 * would put that same strip outside the editable element, and a click under
 * the last line would then place no caret and lose every keystroke after it.
 *
 * The reading measure is the inline padding of `.cm-content`, never a width
 * on it. The content element therefore keeps the full width of the scroller,
 * so the empty strip left and right of the text still belongs to the editable
 * element and a click there places the caret on that line. A measure as a
 * width would put both strips outside the text and a click in them would do
 * nothing.
 *
 * The padding centres the column as well, and it is the only place that can.
 * A centring margin on `.cm-line` moves every block except a table, because
 * a table row is an internal table box and CSS gives it no margin.
 */
export function noteSurfaceStyle(): Parameters<typeof EditorView.theme>[0] {
  return {
    // The note is the product, so its body reads in the strong text color
    // and not in the quieter interface body color.
    '&': {
      backgroundColor: 'var(--notes-bg)',
      color: 'var(--notes-text-strong)',
      fontSize: 'var(--text-note)',
      lineHeight: 'var(--text-note--line-height)',
    },
    // The scroller stretches its content, so the empty area under the last
    // line still belongs to the editable element and a click there places
    // the caret. The block padding therefore sits on the content and not on
    // the scroller.
    '.cm-scroller': {
      fontFamily: 'var(--font-sans)',
      lineHeight: 'var(--text-note--line-height)',
      alignItems: 'stretch',
    },
    // The space above the first line belongs here and never to the frame of
    // the note screen. The scroller moves this padding with the text, so the
    // strip under the frame header fills with the note as a person scrolls.
    // Padding on the frame would stay on the screen and read as a second bar
    // that says nothing. The space under the last line stays large, so there
    // is always a strip of the editable element to click on below the text.
    //
    // The inline padding carries the measure and centres it. It cannot be a
    // margin on the line: a table row is a `display: table-row` box, and CSS
    // gives an internal table box no margin, so a centring margin would move
    // every block of the note except a table and leave the table alone on the
    // left. Padding belongs to the containing block instead, so the anonymous
    // table box that the rows form lands on the same column as every line.
    //
    // Padding is also the only mechanism that keeps the empty strip left and
    // right of the text inside the editable element, which is why the measure
    // was never a width on this element. A click in that strip still places
    // the caret. Decision 0055.
    '.cm-content': {
      caretColor: 'var(--notes-focus)',
      width: '100%',
      paddingInline:
        'max(calc(var(--spacing) * 2), calc((100% - var(--container-note)) / 2))',
      paddingBlockStart: 'calc(var(--spacing) * 6)',
      paddingBlockEnd: 'calc(var(--spacing) * 6)',
    },
    // The measure caps the line as well, so a line can never grow past the
    // column that the padding of the content already sets. The line takes no
    // margin of its own: the padding above centres every block of the note,
    // including a table, which can carry no margin at all.
    //
    // It takes no block padding either. The blank line of the source is a line
    // of the note at the full line height, so it is the space between two
    // blocks, and padding on every line drew that space a second time.
    '.cm-line': {
      maxWidth: 'var(--container-note)',
      marginInline: '0',
      paddingInline: '0',
      paddingBlock: '0',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--notes-focus)' },
    '&.cm-focused': { outline: 'none' },
    // The line the caret sits on takes no fill. A band across the text makes
    // the note read as a table of rows, and the caret already states where a
    // person is. A code block is the one place that marks the line, with the
    // focus outline of the block below, because the block has a fill of its
    // own and a caret inside it is easy to lose.
    //
    // The declaration stays, and it is not dead: `highlightActiveLine` of
    // CodeMirror ships a base theme with a fill of its own, which is a color
    // from outside the palette, so the adapter has to turn it off by name.
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection':
      {
        backgroundColor:
          'color-mix(in srgb, var(--notes-focus) 22%, transparent)',
      },

    ...headingRules(),
    // A heading needs more space above than below, so it separates from the
    // block before it and groups with the text it introduces. This is the
    // one shared heading rhythm; the ramp above sets only size and weight.
    //
    // The blank line that the person wrote above the heading already carries
    // one line height of space, so the padding here is the step that makes
    // the space above larger than the space below and nothing more. A
    // heading with no blank line under it keeps the smaller step, so the
    // title never sits on the first word of its own text.
    '.cm-np-heading': {
      paddingTop: 'calc(var(--spacing) * 3)',
      paddingBottom: 'calc(var(--spacing) * 1)',
    },
    // The first line of a note has no block above it to separate from, and
    // `.cm-content` already holds the space under the note name. A heading
    // that opens a note therefore starts at the top of the text, which is
    // what every reader expects of a title line.
    '.cm-line:first-child': { paddingBlockStart: '0' },

    // Strong text and a heading read one weight. The editor and the published
    // page both take it from this name, so the two cannot drift apart.
    '.cm-np-bold': {
      fontWeight: 'var(--font-weight-note-heading)',
      color: 'var(--notes-text-strong)',
    },
    '.cm-np-italic': { fontStyle: 'italic' },
    '.cm-np-strike': {
      textDecoration: 'line-through',
      color: 'var(--notes-text-muted)',
    },
    '.cm-np-marker': { color: 'var(--notes-text-muted)', opacity: '0.6' },

    // A code span is a word inside a sentence, so it takes the quietest tint
    // of the palette, the small radius of a keyboard hint, and just enough
    // padding to clear the letters around it.
    '.cm-np-code': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-note-mono)',
      backgroundColor: 'var(--notes-surface-hover)',
      borderRadius: 'var(--radius-sm)',
      paddingInline: 'calc(var(--spacing) * 1.5)',
      paddingBlock: 'calc(var(--spacing) * 0.25)',
    },
    // A code block is one card of the note: the chrome fill, the hairline of
    // a raised surface and the card radius. CodeMirror gives each line of the
    // block its own element and no element wraps them, so the fill and the
    // two side edges belong to every line, and the first and the last line
    // close the box with the top and the bottom edge and the radius. The two
    // classes come from `live-preview.ts`, which reads the block from the
    // syntax tree and knows which line opens it and which line closes it.
    '.cm-np-code-block-line': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-note-mono)',
      backgroundColor: 'var(--notes-surface)',
      borderInline: '1px solid var(--notes-border-subtle)',
      paddingInline: 'calc(var(--spacing) * 4)',
    },
    '.cm-np-code-block-open': {
      borderTop: '1px solid var(--notes-border-subtle)',
      borderStartStartRadius: 'var(--radius-lg)',
      borderStartEndRadius: 'var(--radius-lg)',
      paddingBlockStart: 'calc(var(--spacing) * 3)',
    },
    '.cm-np-code-block-close': {
      borderBottom: '1px solid var(--notes-border-subtle)',
      borderEndStartRadius: 'var(--radius-lg)',
      borderEndEndRadius: 'var(--radius-lg)',
      paddingBlockEnd: 'calc(var(--spacing) * 3)',
    },
    '.cm-activeLine.cm-np-code-block-line': {
      outline: '1px solid var(--notes-focus)',
      outlineOffset: '-1px',
    },
    // The language of a fence is a value and not a label, so it keeps the
    // code face and the quiet color and takes no capitals and no tracking.
    '.cm-np-code-info': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-control)',
      color: 'var(--notes-text-muted)',
    },
    '.cm-np-front-matter': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-note-mono)',
      color: 'var(--notes-text-muted)',
      backgroundColor: 'var(--notes-surface-hover)',
      paddingInline: 'calc(var(--spacing) * 3)',
    },

    // A quoted line keeps the quieter text color of the palette. The bars
    // come from the level rules below, which follow this rule, so a deeper
    // level replaces the layers of the level above it.
    //
    // A bar is a background layer, so it must reach both edges of the line
    // box, which is where a background paints by default. A quote therefore
    // keeps one continuous bar whether the caret is on it or not.
    '.cm-np-quote': {
      color: 'var(--notes-text-muted)',
    },
    '.cm-np-quote-1': quoteLevel(1),
    '.cm-np-quote-2': quoteLevel(2),
    '.cm-np-quote-3': quoteLevel(3),
    '.cm-np-quote-4': quoteLevel(4),

    // An alert is a block quote that states a tone (decision 0067 of the
    // renderer and `alerts.ts` of `@notesapp/markdown`). It is content and not
    // a quotation, so it takes the ink of the note back, and its bar and its
    // title take the one colour of the tone.
    //
    // The palette names three tones, an accent, a success and a danger, so the
    // five alerts of GitHub map onto those three and the title word states
    // which one a person is reading.
    '.cm-np-alert': { color: 'var(--notes-text)' },
    '.cm-np-alert-note': { '--cm-np-quote-bar': 'var(--notes-accent-text)' },
    '.cm-np-alert-important': {
      '--cm-np-quote-bar': 'var(--notes-accent-text)',
    },
    '.cm-np-alert-tip': { '--cm-np-quote-bar': 'var(--notes-success-text)' },
    '.cm-np-alert-warning': { '--cm-np-quote-bar': 'var(--notes-danger-text)' },
    '.cm-np-alert-caution': { '--cm-np-quote-bar': 'var(--notes-danger-text)' },
    '.cm-np-alert-title': {
      color: 'var(--cm-np-quote-bar)',
      fontWeight: 'var(--font-weight-note-heading)',
    },

    // A list marker is notation and not an action, so it reads in the quiet
    // text color of the palette and never in the accent. The accent marks a
    // link, the caret and the selection, which carry a meaning no shape
    // states (record 0062).
    '.cm-np-bullet': { color: 'var(--notes-text-muted)' },
    // The number of an ordered item stands upright. The code highlighter of
    // `language.ts` gives the meta tag of a language the italic of a comment,
    // and the Markdown grammar marks a list number with that same tag, so the
    // number of every ordered item leaned until this rule set it back.
    '.cm-np-list-number': {
      color: 'var(--notes-text-muted)',
      fontStyle: 'normal',
    },

    // The marker of an item stands beside the text of the item and never
    // above it. The editor wraps every line, so the second line of a long
    // item started again at the left edge, under the box or the bullet, and
    // the item read as two items.
    //
    // The line that carries the marker is one row of two cells. The lead cell
    // takes the width of what it holds, which is the indentation of the item,
    // the marker, and the space after it, and the body cell takes the rest of
    // the measure. A cell wraps inside its own box, so every wrapped line of
    // the item starts on the first letter of its text.
    //
    // The alignment therefore follows the real marker and no rule states a
    // distance: the source spaces of a nested item, the drawn bullet, the
    // number of an ordered item at any width, and the task box with the gap
    // it carries all size the lead cell themselves. This is the same
    // mechanism that `.cm-np-table-lead` uses, and `live-preview.ts` marks
    // both ranges.
    '.cm-np-list-line': { display: 'table', width: '100%' },
    // The lead holds the source spaces of a nested item, so it keeps them at
    // their own width and never wraps between the indentation and the marker.
    '.cm-np-list-lead': { display: 'table-cell', whiteSpace: 'pre' },
    // The body takes every remaining pixel of the measure, which is what
    // makes the lead shrink to its own content.
    '.cm-np-list-body': { display: 'table-cell', width: '100%' },

    // The task box is a drawn control (record 0033). The native box paints
    // the accent of the operating system and nothing in the palette reaches
    // it, so the appearance is removed and the box is drawn again from the
    // theme: the component edge that record 0063 reserves for a control whose
    // state a person reads with no text, the page fill at rest, and the ink
    // fill with its own label color when the task is done.
    //
    // The box stays a native checkbox, so the role, the state, the tab order
    // and the disabled state come from the platform. The check mark is the
    // sibling element that `live-preview.ts` puts next to it, because an
    // input can hold no child and a generated `::before` does not render on
    // an input in every browser. The mark appears through the sibling
    // selector below, so nothing has to write it a second time.
    '.cm-np-task-box': {
      position: 'relative',
      display: 'inline-flex',
      // One name holds the edge of the box, so the size and the alignment
      // below cannot state two different boxes.
      '--cm-np-task-size': 'calc(var(--spacing) * 4)',
      width: 'var(--cm-np-task-size)',
      height: 'var(--cm-np-task-size)',
      marginInlineEnd: 'calc(var(--spacing) * 1.5)',
      // The box centres on the capital band of the text beside it, which is
      // the band a person reads the line by. `cap` is the cap height of the
      // font in use, so the centre follows the face and the note type step
      // and no number states a metric of Geist a second time. `text-bottom`
      // set the foot of the box on the foot of the descender instead, which
      // put the centre of a 16 px box about 2 px under the centre of the
      // word and read as a box that had slipped off the line.
      verticalAlign: 'calc(0.5cap - var(--cm-np-task-size) / 2)',
      cursor: 'pointer',
    },
    // The drawn box is 16 px, which is small for a finger. The shell takes
    // the click (record 0132), so this layer grows the area that reaches it
    // to 24 px, the minimum target of WCAG 2.5.8, and the box stays its size.
    '.cm-np-task-box::after': {
      content: '""',
      position: 'absolute',
      inset: 'calc(var(--spacing) * -1)',
    },
    '.cm-np-task': {
      appearance: 'none',
      width: '100%',
      height: '100%',
      margin: '0',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--notes-border)',
      backgroundColor: 'var(--notes-bg)',
      cursor: 'pointer',
    },
    '.cm-np-task:checked': {
      backgroundColor: 'var(--notes-accent-fill)',
      borderColor: 'var(--notes-accent-fill)',
    },
    '.cm-np-task:disabled': { cursor: 'default' },
    '.cm-np-task:focus-visible': {
      outline: '2px solid var(--notes-focus)',
      outlineOffset: '2px',
    },
    '.cm-np-task-mark': {
      position: 'absolute',
      inset: '0',
      display: 'none',
      color: 'var(--notes-accent-on-fill)',
      pointerEvents: 'none',
    },
    '.cm-np-task:checked + .cm-np-task-mark': { display: 'block' },

    // A link states itself with the accent text color and a quiet underline.
    // The underline at full strength competes with the word, so it takes a
    // share of the same color, which is one value derived from the palette
    // and never a color of its own.
    '.cm-np-link': {
      color: 'var(--notes-accent-text)',
      textDecorationLine: 'underline',
      textDecorationColor:
        'color-mix(in srgb, var(--notes-accent-text) 35%, transparent)',
      textUnderlineOffset: '3px',
      // A plain click on a link opens it, so the pointer says so before the
      // click. It is the one place in a note that leaves the text cursor.
      cursor: 'pointer',
    },
    // A link the selection touches shows its source. The person is editing
    // that link now, so a click places the caret and the cursor says so.
    // `live-preview.ts` adds this class from the same reveal rule that shows
    // the source, so the cursor and the click cannot disagree.
    '.cm-np-link-open': { cursor: 'text' },
    '.cm-np-footnote': {
      color: 'var(--notes-accent-text)',
      fontSize: 'var(--text-control)',
      verticalAlign: 'super',
    },
    '.cm-np-footnote-definition': {
      color: 'var(--notes-text-muted)',
      fontSize: 'var(--text-ui)',
    },
    '.cm-np-link-definition': {
      color: 'var(--notes-text-muted)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-note-mono)',
    },

    '.cm-np-rule-line': { paddingBlock: 'var(--spacing-note-block)' },
    '.cm-np-rule': {
      display: 'inline-block',
      width: '100%',
      verticalAlign: 'middle',
      borderTop: '1px solid var(--notes-border-line)',
    },

    // A table is a grid over its text (record 0095). A block wrapper of
    // `table-grid.ts` puts one element around the lines of each table. The
    // element scrolls sideways on its own, so a wide table moves inside its
    // outline and never moves the rest of the note, and its collapsed
    // borders pass to the anonymous table the rows form inside it. The rows
    // are lines of the editor, so the source stays editable text and no
    // widget replaces the table.
    //
    // The table starts where every other line starts. Its grips straddle its
    // edge (record 0147), so it keeps no room beside it or above it.
    '.cm-np-table': {
      display: 'block',
      overflowX: 'auto',
      borderCollapse: 'collapse',
      // The space above and below the table is a padding, because the editor
      // measures the padding of a wrapper into the height of its lines and
      // never its margin. A margin put every row lower than the editor knew,
      // so a click or the Home key found the wrong row.
      paddingBlock: 'var(--spacing-note-block)',
    },
    '.cm-np-table-line': {
      display: 'table-row',
      fontSize: 'var(--text-note-mono)',
      paddingBlock: '0',
    },
    // Every cell draws its outline in the one divider of the palette, so the
    // table reads as a grid of cells a person writes into. A cell wraps at a
    // word, as a cell of Notion and of Obsidian does, so the browser sizes
    // each column from its text up to the note column, and the table scrolls
    // sideways only when its columns cannot fit (record 0147). `pre-wrap` and
    // not `normal`, because the spaces inside a cell belong to the source.
    //
    // A word never breaks. `.cm-content` lets a long word break anywhere, and
    // a table cell that inherits that counts every letter as a place to
    // break when it sizes its column, so a column shrank to a few letters and
    // cut its words in two. A word longer than the note column scrolls the
    // table instead.
    '.cm-np-table-cell': {
      display: 'table-cell',
      paddingInline: 'calc(var(--spacing) * 3)',
      paddingBlock: 'calc(var(--spacing) * 1.5)',
      verticalAlign: 'top',
      border: '1px solid var(--notes-border-line)',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'normal',
      wordBreak: 'normal',
    },
    // An empty cell keeps a width a pointer can reach. A browser ignores
    // `min-width` on a table cell, so a block of no height inside the cell
    // holds the width instead: it is the narrowest the column can be, and it
    // never caps how wide the text makes it.
    '.cm-np-table-cell::before, .cm-np-table-head::before': {
      content: "''",
      display: 'block',
      width: 'calc(var(--spacing) * 12)',
      height: '0',
    },
    // The header row takes the hover fill and the heading weight, so the head
    // of the table differs by fill before it differs by a line.
    '.cm-np-table-head': {
      display: 'table-cell',
      paddingInline: 'calc(var(--spacing) * 3)',
      paddingBlock: 'calc(var(--spacing) * 1.5)',
      verticalAlign: 'top',
      border: '1px solid var(--notes-border-line)',
      backgroundColor: 'var(--notes-surface-hover)',
      fontWeight: 'var(--font-weight-note-heading)',
      color: 'var(--notes-text-strong)',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'normal',
      wordBreak: 'normal',
    },
    // The cell that holds the caret carries the one focus treatment, drawn
    // inside its edge so the outline of its neighbours stays whole.
    '.cm-np-table-active': {
      outline: '2px solid var(--notes-focus)',
      outlineOffset: '-2px',
    },
    // What stands between the start of a line and the start of its row: the
    // indentation of a list item and the marks of a quote. A row is a
    // `display: table-row` box and takes no padding, so this cell is where the
    // inset of a nested table lives. `live-preview.ts` marks the range.
    // The hidden separator between two cells: a real cell that draws
    // nothing and takes no width (`live-preview.ts`).
    '.cm-np-table-gap': { display: 'table-cell', padding: '0', width: '0' },
    '.cm-np-table-lead': { display: 'table-cell', padding: '0' },
    '.cm-np-table-quoted-1': {
      paddingInlineStart: `calc(var(--spacing) * ${String(quoteBarStep)})`,
    },
    '.cm-np-table-quoted-2': {
      paddingInlineStart: `calc(var(--spacing) * ${String(quoteBarStep * 2)})`,
    },
    '.cm-np-table-quoted-3': {
      paddingInlineStart: `calc(var(--spacing) * ${String(quoteBarStep * 3)})`,
    },
    '.cm-np-table-quoted-4': {
      paddingInlineStart: `calc(var(--spacing) * ${String(quoteBarStep * 4)})`,
    },
    // The delimiter row keeps no height of its own.
    '.cm-np-table-closed': { fontSize: '0', lineHeight: '0' },
    // The controls of a table (records 0097, 0098 and 0147) stand in one
    // layer over the text, which lets every press but a press on a control
    // reach the text below.
    '.cm-np-table-controls': {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      zIndex: '2',
      pointerEvents: 'none',
    },
    // A handle is the hit area of one grip. It draws nothing itself, and its
    // middle stands on the edge of the table, as the grip inside it does, so
    // a larger hit area reaches as far into the cell as it reaches out of
    // the table. A handle that does not show keeps its box and hides it, so
    // the layer can read its size to place it. A drag on it is the drag of
    // the handle and never a scroll of the page.
    '.cm-np-table-handle': {
      position: 'absolute',
      display: 'flex',
      visibility: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      margin: '0',
      border: 'none',
      backgroundColor: 'transparent',
      cursor: 'grab',
      pointerEvents: 'auto',
      touchAction: 'none',
    },
    '.cm-np-table-handle-row': {
      width: 'calc(var(--spacing) * 4)',
      height: 'calc(var(--spacing) * 6)',
    },
    '.cm-np-table-handle-column': {
      width: 'calc(var(--spacing) * 6)',
      height: 'calc(var(--spacing) * 4)',
    },
    // The grip is a small raised pill of six dots, as the grip of Notion and
    // of Obsidian is: the card plane, the subtle edge of a raised surface and
    // its one shadow step (record 0052). It fills on hover and while its row
    // or its column is marked.
    '.cm-np-table-grip': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: '0',
      overflow: 'hidden',
      boxSizing: 'border-box',
      border: '1px solid var(--notes-border-subtle)',
      borderRadius: 'var(--radius-sm)',
      backgroundColor: 'var(--notes-surface-card)',
      boxShadow: 'var(--shadow-raised)',
      color: 'var(--notes-text-muted)',
    },
    '.cm-np-table-handle-row .cm-np-table-grip': {
      width: 'calc(var(--spacing) * 4)',
      height: 'calc(var(--spacing) * 6)',
    },
    '.cm-np-table-handle-column .cm-np-table-grip': {
      width: 'calc(var(--spacing) * 6)',
      height: 'calc(var(--spacing) * 4)',
    },
    '.cm-np-table-handle:hover .cm-np-table-grip, .cm-np-table-handle-on .cm-np-table-grip':
      {
        backgroundColor: 'var(--notes-surface-hover)',
        color: 'var(--notes-text-strong)',
      },
    '.cm-np-table-controls-shown .cm-np-table-handle, .cm-np-table-controls-shown .cm-np-table-add':
      { visibility: 'visible' },
    '.cm-np-table-controls-shown .cm-np-table-control-off': {
      visibility: 'hidden',
    },
    '.cm-np-table-control-mark': {
      width: 'calc(var(--spacing) * 4)',
      height: 'calc(var(--spacing) * 4)',
      flexShrink: '0',
    },
    // An add bar is a ghost control: no edge and no fill at rest, a muted
    // plus, and the hover fill under the pointer (record 0147).
    '.cm-np-table-add': {
      position: 'absolute',
      display: 'flex',
      visibility: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      margin: '0',
      border: 'none',
      borderRadius: 'var(--radius-sm)',
      backgroundColor: 'transparent',
      color: 'var(--notes-text-muted)',
      cursor: 'pointer',
      pointerEvents: 'auto',
    },
    '.cm-np-table-add-row': { height: 'calc(var(--spacing) * 4)' },
    '.cm-np-table-add-column': { width: 'calc(var(--spacing) * 4)' },
    '.cm-np-table-add:hover': {
      backgroundColor: 'var(--notes-surface-hover)',
      color: 'var(--notes-text-strong)',
    },
    // The row or the column that a pressed grip acts on takes the tint and
    // the edge of a selection, which is what it is (record 0062).
    '.cm-np-table-marked': {
      position: 'absolute',
      visibility: 'hidden',
      backgroundColor:
        'color-mix(in srgb, var(--notes-focus) 12%, transparent)',
      outline: '2px solid var(--notes-focus)',
      outlineOffset: '-1px',
      pointerEvents: 'none',
    },
    // The line that shows where a dragged row or column lands takes the
    // focus colour, which marks where the next edit goes (record 0062).
    '.cm-np-table-drop': {
      position: 'absolute',
      visibility: 'hidden',
      backgroundColor: 'var(--notes-focus)',
      pointerEvents: 'none',
    },
    '.cm-np-table-controls-shown .cm-np-table-drop, .cm-np-table-controls-shown .cm-np-table-marked':
      { visibility: 'visible' },
    '.cm-np-table-controls-shown .cm-np-table-drop.cm-np-table-control-off, .cm-np-table-controls-shown .cm-np-table-marked.cm-np-table-control-off':
      { visibility: 'hidden' },
    // A finger gets a larger hit area around the same grip. It reaches a
    // little way into the cell, so a tap on the text of a short header cell
    // still reaches the text.
    '@media (pointer: coarse)': {
      '.cm-np-table-handle-row': {
        width: 'calc(var(--spacing) * 6)',
        height: 'calc(var(--spacing) * 10)',
      },
      '.cm-np-table-handle-column': {
        width: 'calc(var(--spacing) * 10)',
        height: 'calc(var(--spacing) * 6)',
      },
      '.cm-np-table-add-row': { height: 'calc(var(--spacing) * 6)' },
      '.cm-np-table-add-column': { width: 'calc(var(--spacing) * 6)' },
    },
    // The grip of a list item (record 0106) stands in one layer over the
    // text, as the handles of a table do, so every press but a press on the
    // grip reaches the text below.
    '.cm-np-list-controls': {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      zIndex: '2',
      pointerEvents: 'none',
    },
    // The grip is a ghost control: no edge and no fill at rest, the quiet
    // text colour, and the hover fill of the palette under the pointer. A
    // grip that does not show keeps its box and hides it, so the layer can
    // read its size to place it. A drag on it is never a scroll of the page.
    '.cm-np-list-grip': {
      position: 'absolute',
      display: 'flex',
      visibility: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      width: 'calc(var(--spacing) * 4)',
      padding: '0',
      margin: '0',
      border: 'none',
      borderRadius: 'var(--radius-sm)',
      backgroundColor: 'transparent',
      color: 'var(--notes-text-muted)',
      cursor: 'grab',
      pointerEvents: 'auto',
      touchAction: 'none',
    },
    '.cm-np-list-controls-shown .cm-np-list-grip': { visibility: 'visible' },
    '.cm-np-list-grip:hover': {
      backgroundColor: 'var(--notes-surface-hover)',
      color: 'var(--notes-text-strong)',
    },
    '.cm-np-list-grip-mark': {
      width: 'calc(var(--spacing) * 4)',
      height: 'calc(var(--spacing) * 4)',
      flexShrink: '0',
    },
    // The line that shows where a dragged item lands takes the focus colour,
    // as the drop line of a table row does (record 0062).
    '.cm-np-list-drop': {
      position: 'absolute',
      visibility: 'hidden',
      backgroundColor: 'var(--notes-focus)',
      pointerEvents: 'none',
    },
    '.cm-np-list-controls-shown .cm-np-list-drop': { visibility: 'visible' },
    '.cm-np-list-controls-shown .cm-np-list-drop.cm-np-list-control-off': {
      visibility: 'hidden',
    },
    // The column keeps room for the grip at its start where the grip shows,
    // so the grip of a top-level item is never cut at the edge of the
    // column. The room is one grip wide and one step more, and a wide screen
    // already has more than that from the centring of the measure.
    [`@media ${gripPointerQuery}`]: {
      '.cm-content': {
        paddingInlineStart:
          'max(calc(var(--spacing) * 5), calc((100% - var(--container-note)) / 2))',
      },
    },
    '.cm-np-align-left': { textAlign: 'left' },
    '.cm-np-align-center': { textAlign: 'center' },
    '.cm-np-align-right': { textAlign: 'right' },

    '.cm-np-hard-break': {
      borderBottom: '1px dotted var(--notes-border-line)',
    },
    '.cm-np-html': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-note-mono)',
      color: 'var(--notes-text-muted)',
    },

    // The space above and below a picture, a diagram and display math is a
    // padding of the widget and never a margin. The editor measures the box
    // of a block widget and not its margin, so a margin put every line below
    // the widget lower on the screen than the editor knew, and a click in the
    // lower part of a line, or of a table row, landed on the line below.
    '.cm-np-widget-block': {
      display: 'block',
      maxWidth: 'var(--container-note)',
      marginInline: '0',
      marginBlock: '0',
      paddingBlock: 'var(--spacing-note-block)',
    },
    '.cm-np-widget-inline': { display: 'inline' },
    '.cm-np-widget-image': {
      maxWidth: '100%',
      borderRadius: 'var(--radius-md)',
    },
    // A picture that the host can open is a button around the picture
    // (record 0145). It draws nothing of its own but the pointer that says a
    // click zooms, and the one focus treatment of the product.
    '.cm-np-widget-image-open': {
      display: 'inline-block',
      maxWidth: '100%',
      padding: '0',
      border: '0',
      font: 'inherit',
      color: 'inherit',
      textAlign: 'start',
      verticalAlign: 'bottom',
      background: 'transparent',
      borderRadius: 'var(--radius-md)',
      cursor: 'zoom-in',
    },
    // The picture is a block inside its button, so no line box adds a gap
    // under it, and the words of a picture that did not load keep the line
    // height of the note.
    '.cm-np-widget-image-open > .cm-np-widget-image': { display: 'block' },
    '.cm-np-widget-image-open:focus-visible': {
      outline: '2px solid var(--notes-focus)',
      outlineOffset: '2px',
    },
    '.cm-np-widget-note': {
      display: 'block',
      margin: '0',
      color: 'var(--notes-text-muted)',
      fontSize: 'var(--text-ui)',
    },
    '.cm-np-widget-error': { color: 'var(--notes-danger-text)' },
    '.cm-np-widget-source': {
      display: 'block',
      margin: '0',
      marginBlockStart: 'calc(var(--spacing) * 1)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-note-mono)',
      whiteSpace: 'pre-wrap',
    },
    // The action of a widget, such as the one that shows the source of a
    // diagram that did not draw. It is a control, so it rests on the divider
    // and carries the radius of a control (records 0063 and 0065).
    '.cm-np-widget-action': {
      font: 'inherit',
      marginBlockStart: 'calc(var(--spacing) * 2)',
      fontSize: 'var(--text-control)',
      marginInlineStart: 'calc(var(--spacing) * 2)',
      paddingInline: 'calc(var(--spacing) * 2)',
      minHeight: 'calc(var(--spacing) * 7)',
      color: 'var(--notes-accent-text)',
      backgroundColor: 'var(--notes-surface-card)',
      border: '1px solid var(--notes-border-line)',
      borderRadius: 'var(--radius-md)',
      cursor: 'pointer',
    },
    '.cm-np-math-display': {
      display: 'block',
      textAlign: 'center',
      paddingBlock: 'var(--spacing-note-block)',
      borderRadius: 'var(--radius-lg)',
    },
    '.cm-np-math-inline': { display: 'inline' },
  };
}
