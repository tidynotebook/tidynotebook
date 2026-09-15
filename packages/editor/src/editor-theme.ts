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
 * at a measure of about 68 characters, headings run on one clear ramp from
 * twice the body size down to body size at level six, blocks breathe with
 * one shared vertical rhythm, and monospaced text sits at 0.9 em so a code
 * span keeps the line height of the paragraph around it.
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
  '--text-note',
  '--text-note--line-height',
  '--container-note',
  '--spacing-note-line',
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
  '--font-weight-note-heading-strong',
  '--font-weight-note-heading',
];

/** The heading ramp, level by level. */
const headings: ReadonlyArray<readonly [string, string]> = [
  ['var(--text-note-h1)', 'var(--text-note-h1--line-height)'],
  ['var(--text-note-h2)', 'var(--text-note-h2--line-height)'],
  ['var(--text-note-h3)', 'var(--text-note-h3--line-height)'],
  ['var(--text-note-h4)', 'var(--text-note-h4--line-height)'],
  ['var(--text-note-h5)', 'var(--text-note-h5--line-height)'],
  ['var(--text-note-h6)', 'var(--text-note-h6--line-height)'],
];

/** The heading rules, one per level. */
function headingRules(): Record<string, Record<string, string>> {
  const rules: Record<string, Record<string, string>> = {};
  headings.forEach(([size, lineHeight], index) => {
    rules[`.cm-np-h${String(index + 1)}`] = {
      fontSize: size,
      lineHeight,
      fontWeight:
        index < 3
          ? 'var(--font-weight-note-heading-strong)'
          : 'var(--font-weight-note-heading)',
      color: 'var(--notes-text-strong)',
    };
  });
  return rules;
}

/** The width of one quote bar. */
const quoteBarWidth = 'calc(var(--spacing) * 1)';

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
 * background layer in the theme border color; the layer list, the layer
 * size, and the layer position are the only way to put a stripe at an
 * offset without a second element.
 */
function quoteLevel(level: number): Record<string, string> {
  const layers: string[] = [];
  const positions: string[] = [];
  for (let index = 0; index < level; index += 1) {
    layers.push('linear-gradient(var(--notes-border), var(--notes-border))');
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
 * The reading measure belongs to `.cm-line` and to a block widget, not to
 * `.cm-content`. The content element therefore keeps the full width of the
 * scroller, so the empty strip left and right of the text still belongs to
 * the editable element and a click there places the caret on that line. A
 * measure on `.cm-content` would put both strips outside the text and a
 * click in them would do nothing.
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
    // The text starts close under the note name, because the name titles the
    // text and the two read as one page. The space under the last line stays
    // large, so there is always a strip of the editable element to click on
    // below the text.
    '.cm-content': {
      caretColor: 'var(--notes-focus)',
      width: '100%',
      paddingInline: 'calc(var(--spacing) * 2)',
      paddingBlockStart: 'calc(var(--spacing) * 2)',
      paddingBlockEnd: 'calc(var(--spacing) * 6)',
    },
    '.cm-line': {
      maxWidth: 'var(--container-note)',
      marginInline: '0',
      paddingInline: '0',
      paddingBlock: 'var(--spacing-note-line)',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--notes-focus)' },
    '&.cm-focused': { outline: 'none' },
    // The hover surface of the palette, which is the quietest tint the
    // theme owns. The line the caret sits on is findable, and the note
    // still reads as one page of text instead of a banded table.
    //
    // The fill stops at the content box. A line carries the vertical rhythm
    // of its block as padding, because CodeMirror measures a line by its
    // padding box and a margin would put the height map out of step with the
    // screen. That padding is the space between two blocks and not a part of
    // the line, so a heading with five steps of space above it would show a
    // tall empty band over its own text. Clipping the fill to the content box
    // makes the mark one text line high at every block kind.
    '.cm-activeLine': {
      backgroundColor: 'var(--notes-surface-hover)',
      backgroundClip: 'content-box',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection':
      {
        backgroundColor:
          'color-mix(in srgb, var(--notes-focus) 22%, transparent)',
      },

    ...headingRules(),
    // A heading needs more space above than below, so it separates from the
    // block before it and groups with the text it introduces. This is the
    // one shared heading rhythm; the ramp above sets only size and weight.
    '.cm-np-heading': {
      paddingTop: 'calc(var(--spacing) * 5)',
      paddingBottom: 'calc(var(--spacing) * 1)',
    },
    // The first line of a note has no block above it to separate from, and
    // `.cm-content` already holds the space under the note name. A heading
    // that opens a note therefore starts at the top of the text, which is
    // what every reader expects of a title line.
    '.cm-line:first-child': { paddingBlockStart: '0' },

    '.cm-np-bold': { fontWeight: '700', color: 'var(--notes-text-strong)' },
    '.cm-np-italic': { fontStyle: 'italic' },
    '.cm-np-strike': {
      textDecoration: 'line-through',
      color: 'var(--notes-text-muted)',
    },
    '.cm-np-marker': { color: 'var(--notes-text-muted)', opacity: '0.6' },

    '.cm-np-code': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-note-mono)',
      backgroundColor: 'var(--notes-surface-hover)',
      borderRadius: 'var(--radius-sm)',
      paddingInline: 'calc(var(--spacing) * 1)',
      paddingBlock: 'calc(var(--spacing) * 0.5)',
    },
    // The fill of a code line is the block, not the caret, so it covers the
    // whole line box and overrides the content box clip of the active line.
    '.cm-np-code-block-line': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-note-mono)',
      backgroundColor: 'var(--notes-surface-hover)',
      backgroundClip: 'border-box',
      paddingInline: 'calc(var(--spacing) * 3)',
    },
    '.cm-activeLine.cm-np-code-block-line': {
      outline: '1px solid var(--notes-focus)',
      outlineOffset: '-1px',
    },
    '.cm-np-code-info': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-control)',
      color: 'var(--notes-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    },

    // A quoted line keeps the quieter text color of the palette. The bars
    // come from the level rules below, which follow this rule, so a deeper
    // level replaces the layers of the level above it.
    //
    // A bar is a background layer, so it must reach both edges of the line
    // box. The clip is therefore restored here, and it applies to the fill of
    // the active line on the same element: a quote keeps one continuous bar
    // whether the caret is on it or not.
    '.cm-np-quote': {
      color: 'var(--notes-text-muted)',
      backgroundClip: 'border-box',
    },
    '.cm-np-quote-1': quoteLevel(1),
    '.cm-np-quote-2': quoteLevel(2),
    '.cm-np-quote-3': quoteLevel(3),
    '.cm-np-quote-4': quoteLevel(4),

    '.cm-np-bullet': {
      color: 'var(--notes-accent-fill)',
      fontWeight: '700',
    },
    '.cm-np-list-number': {
      color: 'var(--notes-text-muted)',
      fontWeight: '600',
    },
    '.cm-np-task': {
      width: 'calc(var(--spacing) * 4)',
      height: 'calc(var(--spacing) * 4)',
      margin: '0',
      marginInlineEnd: 'calc(var(--spacing) * 1)',
      // `text-bottom` sets the foot of the box on the foot of the text, so
      // the box sits on the writing line instead of floating above it.
      verticalAlign: 'text-bottom',
      accentColor: 'var(--notes-accent-fill)',
      cursor: 'pointer',
    },

    '.cm-np-link': {
      color: 'var(--notes-accent-text)',
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
    },
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
      borderTop: '1px solid var(--notes-border)',
    },

    // A table reads as a table. Each line of the table is a table row and
    // each cell is a table cell, so the browser sizes the columns and every
    // row lines up under the header. The rows of one table are neighbouring
    // line elements, so the browser groups them into one anonymous table
    // without a wrapper element, and the source stays editable text: no
    // widget replaces the table and nothing of it is hidden.
    '.cm-np-table-line': {
      display: 'table-row',
      fontSize: 'var(--text-note-mono)',
      paddingBlock: '0',
    },
    '.cm-np-table-cell': {
      display: 'table-cell',
      paddingInline: 'calc(var(--spacing) * 2)',
      paddingBlock: 'calc(var(--spacing) * 1)',
      verticalAlign: 'top',
      borderBottom: '1px solid var(--notes-border-subtle)',
    },
    '.cm-np-table-head': {
      display: 'table-cell',
      paddingInline: 'calc(var(--spacing) * 2)',
      paddingBlock: 'calc(var(--spacing) * 1)',
      verticalAlign: 'top',
      borderBottom: '1px solid var(--notes-border)',
      fontWeight: '700',
      color: 'var(--notes-text-strong)',
    },
    // The cell separators of a table carry no meaning once the columns show
    // it, so they keep their box and lose their ink. They come back on the
    // row that the selection touches, and the box never changes, so the
    // columns do not move while a person edits a row.
    '.cm-np-table-pipe': {
      display: 'table-cell',
      color: 'var(--notes-text-muted)',
      opacity: '0',
    },
    '.cm-np-table-rule': {
      display: 'table-cell',
      paddingInline: 'calc(var(--spacing) * 2)',
      color: 'var(--notes-text-muted)',
      opacity: '0.45',
    },
    '.cm-np-table-shown': { opacity: '0.45' },
    '.cm-np-table-align': { color: 'var(--notes-text-muted)' },
    // The delimiter row that stepped aside keeps no height of its own.
    '.cm-np-table-closed': { fontSize: '0', lineHeight: '0' },
    '.cm-np-align-left': { textAlign: 'left' },
    '.cm-np-align-center': { textAlign: 'center' },
    '.cm-np-align-right': { textAlign: 'right' },

    '.cm-np-hard-break': {
      borderBottom: '1px dotted var(--notes-border)',
    },
    '.cm-np-html': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-note-mono)',
      color: 'var(--notes-text-muted)',
    },

    '.cm-np-widget-block': {
      display: 'block',
      maxWidth: 'var(--container-note)',
      marginInline: '0',
      marginBlock: 'var(--spacing-note-block)',
    },
    '.cm-np-widget-inline': { display: 'inline' },
    '.cm-np-widget-image': {
      maxWidth: '100%',
      borderRadius: 'var(--radius-md)',
    },
    '.cm-np-widget-note': {
      color: 'var(--notes-text-muted)',
      fontSize: 'var(--text-ui)',
    },
    '.cm-np-widget-error': { color: 'var(--notes-danger-text)' },
    '.cm-np-widget-source': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-note-mono)',
      whiteSpace: 'pre-wrap',
    },
    '.cm-np-widget-action': {
      font: 'inherit',
      fontSize: 'var(--text-control)',
      marginInlineStart: 'calc(var(--spacing) * 2)',
      paddingInline: 'calc(var(--spacing) * 2)',
      minHeight: 'calc(var(--spacing) * 6)',
      color: 'var(--notes-accent-text)',
      backgroundColor: 'var(--notes-surface-hover)',
      border: '1px solid var(--notes-border)',
      borderRadius: 'var(--radius-sm)',
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
