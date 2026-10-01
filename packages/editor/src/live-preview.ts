/**
 * The live preview, built from the Markdown syntax tree.
 *
 * The document is always Markdown source. This module reads the Lezer
 * Markdown tree that `./language.ts` installs and turns it into CodeMirror
 * decorations: markers are hidden, content is styled, and the source stays
 * editable at every position. There is no second Markdown scanner here. The
 * tree already knows escapes, flanking rules, setext headings, thematic
 * breaks, fence state at any offset, table ranges, and autolinks, so this
 * module only decides how each node looks.
 *
 * The reveal rule follows Obsidian Live Preview and is per construct, never
 * per marker:
 *
 * - A block construct shows its source when the selection touches the line
 *   that carries its marker. A fenced block shows its fences when the
 *   selection is anywhere inside it.
 * - An inline construct shows its source when the selection touches the
 *   whole construct, so a cursor inside a bold word shows both `**` runs.
 * - A bullet and a task box are drawn at every caret. Their source comes back
 *   only while a range selection covers the marker, and no caret rests in
 *   them. See decision records 0033 and 0132, and `./list-marker.ts`.
 * - An ordered marker keeps its rendered label while the selection touches
 *   the item text. Its numeric source returns only when the selection touches
 *   the marker itself. See decision record 0092.
 *
 * Cost. Only the visible ranges are walked, and only the tree is read: no
 * `doc.toString()` and no regular expression over the document. The walk
 * reports how many tree nodes it entered so a test can bound it.
 *
 * Block level decorations are not here. A decoration that replaces a line
 * break or a whole line must come from a state field, which is what
 * `./widgets.ts` provides.
 */
import { syntaxTree } from '@codemirror/language';
import { EditorState, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';
import { glyph } from './icon-mark.ts';
import {
  alertMarkerLength,
  alertTitle,
  alertToneOf,
  orderedMarkerLabel,
  type AlertTone,
} from '@notesapp/markdown';
import { taskToggleAt } from './commands.ts';
import {
  drawnAtEveryCaret,
  listMarkerOf,
  selectionShowsMarker,
  taskBoxClassName,
  type ListMarker,
} from './list-marker.ts';
import { noteMarkdown, parsedWhole } from './language.ts';

/** One structural fact the preview decorated, in document order. */
export type PreviewNode =
  | { readonly kind: 'front-matter' }
  | { readonly kind: 'heading'; readonly level: number; readonly text: string }
  | {
      readonly kind: 'list-item';
      readonly depth: number;
      readonly ordered: boolean;
      /**
       * The value a reader shows for an ordered item, which is the start of
       * its list plus its place in it, or `null` for a bullet item.
       */
      readonly value: number | null;
    }
  | { readonly kind: 'task'; readonly checked: boolean }
  | { readonly kind: 'code-block'; readonly info: string }
  | {
      readonly kind: 'table';
      readonly rows: number;
      readonly columns: number;
    }
  | {
      readonly kind: 'quote';
      readonly depth: number;
      /** The alert tone the quote opens with, or `null` for a plain quote. */
      readonly tone: AlertTone | null;
    }
  | { readonly kind: 'thematic-break' };

/** The result of one preview build. */
export type PreviewBuild = {
  /** The decorations to render. */
  readonly decorations: DecorationSet;
  /**
   * The structure the decorations describe, in document order.
   *
   * Every entry is produced at the same place as the decoration for that
   * construct, so a construct that stops being decorated also disappears
   * here. The equivalence test compares this list with the reference
   * renderer output.
   */
  readonly structure: readonly PreviewNode[];
  /** How many tree nodes the walk entered. Used to bound the cost. */
  readonly visited: number;
};

/** One half-open document range. */
export type PreviewRange = { readonly from: number; readonly to: number };

/** Column alignment taken from the delimiter row of a table. */
export type ColumnAlign = 'left' | 'center' | 'right' | null;

/** Reads the per-column alignment of one GFM delimiter row. */
export function tableAlignments(row: string): readonly ColumnAlign[] {
  const trimmed = row.trim();
  const inner =
    trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 1
      ? trimmed.slice(1, -1)
      : trimmed;
  return inner.split('|').map((cell): ColumnAlign => {
    const text = cell.trim();
    const left = text.startsWith(':');
    const right = text.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

/** The hidden separator between two cells of a table row, as a cell. */
const tableGap = Decoration.mark({ class: 'cm-np-table-gap', inclusive: true });

/** One piece of the delimiter row of a table. */
export type DelimiterPart = {
  readonly from: number;
  readonly to: number;
  /** True for a `|` separator, false for the dashes of one column. */
  readonly pipe: boolean;
};

/**
 * The separators and the column runs of one GFM delimiter row.
 *
 * The parser reports the whole delimiter row as one node, so the pieces come
 * from the text of that node. This is the same source that
 * {@link tableAlignments} already reads, and it is the text of one tree node
 * rather than a scan of the document.
 *
 * The pieces cover the row without a gap, so every row of the table carries
 * the same number of boxes and the columns of the table line up.
 */
export function delimiterRowParts(
  text: string,
  offset: number,
): readonly DelimiterPart[] {
  const parts: DelimiterPart[] = [];
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    if (text[at] !== '|') continue;
    if (at > start)
      parts.push({ from: offset + start, to: offset + at, pipe: false });
    parts.push({ from: offset + at, to: offset + at + 1, pipe: true });
    start = at + 1;
  }
  if (text.length > start)
    parts.push({ from: offset + start, to: offset + text.length, pipe: false });
  return parts;
}

/** The heading level of an ATX or setext heading node name, or 0. */
export function headingLevel(name: string): number {
  const atx = /^ATXHeading([1-6])$/.exec(name);
  if (atx !== null) return Number(atx[1]);
  const setext = /^SetextHeading([12])$/.exec(name);
  if (setext !== null) return Number(setext[1]);
  return 0;
}

/** Replaces a bullet with one consistent mark at every depth. */
class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-np-bullet';
    span.textContent = '•';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  override eq(): boolean {
    return true;
  }
}

/**
 * Draws the label of an ordered item in place of its written number.
 *
 * The source keeps a numeric CommonMark marker at every depth, and a reader
 * numbers a list from its first item, so the written number of a later item
 * can say something that no reader shows. The label is what a reader shows:
 * the value of the item in the style of its depth (record 0089). It stays
 * readable to a screen reader, because the number is part of what the list
 * says.
 */
class OrderedMarkerWidget extends WidgetType {
  readonly label: string;

  constructor(label: string) {
    super();
    this.label = label;
  }

  override eq(other: OrderedMarkerWidget): boolean {
    return other.label === this.label;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-np-list-number';
    span.textContent = this.label;
    return span;
  }
}

/**
 * Draws the title of an alert in place of its marker.
 *
 * The marker names the tone and is not content, so it leaves the screen the
 * way a heading marker does. The word it leaves behind is the word the
 * reference renderer writes, so both readers of a note name the alert the
 * same way.
 */
class AlertTitleWidget extends WidgetType {
  readonly tone: AlertTone;

  constructor(tone: AlertTone) {
    super();
    this.tone = tone;
  }

  override eq(other: AlertTitleWidget): boolean {
    return other.tone === this.tone;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-np-alert-title';
    span.textContent = alertTitle(this.tone);
    return span;
  }
}

/** Draws a thematic break in place of its source characters. */
class RuleWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-np-rule';
    span.setAttribute('role', 'separator');
    return span;
  }

  override eq(): boolean {
    return true;
  }
}

/**
 * The check mark inside a task box that is done.
 *
 * The box is a native checkbox with its own appearance removed, so the mark
 * is an element beside it: an input can hold no child, and a generated
 * `::before` does not render on an input in every browser. The adapter shows
 * this element while the box beside it is checked and paints it in the label
 * colour of the ink fill.
 *
 * The drawing is the line of `CheckIcon` on the one grid of the icon set,
 * which `./icon-mark.ts` holds for the editor.
 */
function taskCheckMark(): SVGElement {
  return glyph('cm-np-task-mark', [
    { kind: 'polyline', points: '20 6 9 17 4 12' },
  ]);
}

/**
 * A real checkbox for one task item.
 *
 * The widget carries the document position of its own `[ ]`, so a click
 * toggles the task it belongs to and never the task of the current
 * selection.
 *
 * The box is a drawn control (record 0033): the native box paints the accent
 * of the operating system and nothing in the palette reaches it, so the
 * appearance is removed and `editor-theme.ts` draws the box and its mark from
 * the theme. The input itself stays, so the role, the state, the tab order
 * and the read only state all come from the platform.
 *
 * The box owns its events (record 0132). The editor ignores every event
 * inside it, so a press never starts a selection or moves the caret. The
 * toggle runs on `click`, which the platform fires for a pointer click, for a
 * tap, and for Space on the focused box, and never for a touch that becomes a
 * scroll. The shell around the input takes the click, because its hit area is
 * larger than the drawn box.
 */
class TaskCheckboxWidget extends WidgetType {
  readonly position: number;
  readonly checked: boolean;

  constructor(position: number, checked: boolean) {
    super();
    this.position = position;
    this.checked = checked;
  }

  override eq(other: TaskCheckboxWidget): boolean {
    return other.position === this.position && other.checked === this.checked;
  }

  override ignoreEvent(): boolean {
    return true;
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-np-task';
    box.checked = this.checked;
    box.setAttribute(
      'aria-label',
      this.checked ? 'Task done' : 'Task not done',
    );
    box.disabled = view.state.readOnly;
    const toggle = (): void => {
      if (view.state.readOnly) return;
      const spec = taskToggleAt(view.state, this.position);
      if (spec === null) return;
      view.dispatch(view.state.update(spec));
    };
    const shell = document.createElement('span');
    shell.className = taskBoxClassName;
    shell.append(box, taskCheckMark());
    // A press keeps the focus and the caret where they are, so a tap on the
    // box of a phone opens no keyboard and puts no caret beside the box.
    shell.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    // The document holds the state, so the platform never flips the input
    // itself. The new state arrives as a new widget.
    shell.addEventListener('click', (event) => {
      event.preventDefault();
      toggle();
    });
    // Enter does not click a checkbox, and a person expects it to act on the
    // focused box. Space already clicks it.
    box.addEventListener('keydown', (event: KeyboardEvent): void => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      toggle();
    });
    return shell;
  }
}

/**
 * The nodes whose text is syntax rather than content.
 *
 * Removing them from a heading gives the words a reader sees, which is what
 * the outline lists and what the reference renderer puts inside its heading
 * element.
 */
const syntaxOnlyNodes = new Set([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'LinkMark',
  'MathMark',
  'URL',
  'LinkTitle',
  'CodeInfo',
]);

/**
 * Whether a link or image hides its brackets.
 *
 * Only an inline link resolves from the tree alone. A bare `[word]` with no
 * definition is plain text in CommonMark, and the Lezer parser still wraps
 * it in a `Link` node, so hiding its brackets would remove characters that
 * are really in the file.
 */
function hidesItsMarkers(owner: SyntaxNode | null): boolean {
  if (owner === null) return false;
  if (owner.name === 'Autolink') return true;
  return (
    (owner.name === 'Link' || owner.name === 'Image') &&
    owner.getChild('URL') !== null
  );
}

/** The reader visible text of one node range. */
export function contentText(
  state: EditorState,
  from: number,
  to: number,
): string {
  let text = '';
  let at = from;
  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (!syntaxOnlyNodes.has(node.name)) return true;
      if (node.name === 'LinkMark' && !hidesItsMarkers(node.node.parent))
        return false;
      if (node.from >= at) {
        text += state.doc.sliceString(at, node.from);
        at = node.to;
      }
      return false;
    },
  });
  text += state.doc.sliceString(Math.max(at, from), to);
  return text.replace(/\s+/g, ' ').trim();
}

/** Merges overlapping ranges so a line is decorated once. */
function mergeRanges(ranges: readonly PreviewRange[]): PreviewRange[] {
  const sorted = [...ranges].sort((left, right) => left.from - right.from);
  const merged: PreviewRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range.from <= last.to) {
      merged[merged.length - 1] = {
        from: last.from,
        to: Math.max(last.to, range.to),
      };
      continue;
    }
    merged.push(range);
  }
  return merged;
}

/**
 * Builds the preview decorations of one state over the given ranges.
 *
 * `ranges` are document ranges, normally the visible ranges of a view. They
 * are expanded to whole lines and merged. `selection` decides which
 * constructs show their source.
 */
export function buildPreview(
  state: EditorState,
  ranges: readonly PreviewRange[],
  selection: PreviewRange,
): PreviewBuild {
  const doc = state.doc;
  const items: Range<Decoration>[] = [];
  const structure: PreviewNode[] = [];
  const lineClasses = new Set<string>();
  let visited = 0;

  /** Whether the selection touches a range, edges included. */
  const touches = (from: number, to: number): boolean =>
    selection.from <= to && selection.to >= from;

  /** Whether the selection touches the lines a range covers. */
  const touchesLines = (from: number, to: number): boolean =>
    touches(doc.lineAt(from).from, doc.lineAt(to).to);

  const hide = (from: number, to: number): void => {
    if (to > from) items.push(Decoration.replace({}).range(from, to));
  };
  const mark = (from: number, to: number, className: string): void => {
    if (to > from)
      items.push(Decoration.mark({ class: className }).range(from, to));
  };
  const dim = (from: number, to: number): void => {
    mark(from, to, 'cm-np-marker');
  };
  /**
   * Marks one link, and says whether a plain click on it opens it.
   *
   * A link the selection touches shows its source, so the person is editing
   * that link and a click there places the caret. The open class carries that
   * one fact to the theme, which turns the pointer back into a text cursor,
   * so the shape of the cursor and what the click does cannot disagree.
   */
  const linkMark = (from: number, to: number): void => {
    mark(
      from,
      to,
      touches(from, to) ? 'cm-np-link cm-np-link-open' : 'cm-np-link',
    );
  };
  const lineClass = (from: number, to: number, className: string): void => {
    let pos = from;
    for (;;) {
      const line = doc.lineAt(pos);
      const key = `${String(line.from)}:${className}`;
      if (!lineClasses.has(key)) {
        lineClasses.add(key);
        items.push(Decoration.line({ class: className }).range(line.from));
      }
      if (line.to >= to || line.number >= doc.lines) break;
      pos = line.to + 1;
    }
  };
  /**
   * Marks the lines of one block, and names the first and the last of them.
   *
   * A code block is one card on the note, and CodeMirror gives each of its
   * lines an element of its own with nothing around them. The two edge
   * classes are how the first line can carry the top of that card and the
   * last line the bottom of it. The syntax tree states where the block starts
   * and ends, so no rule reads the text to find out.
   */
  const blockLines = (from: number, to: number, className: string): void => {
    lineClass(from, to, className);
    lineClass(from, from, `${className}-open`);
    // A block that ends on the first offset of a line ends on the line above
    // it, so the bottom of the card never lands on the empty line after the
    // block.
    const last = to > from && doc.lineAt(to).from === to ? to - 1 : to;
    lineClass(last, last, `${className}-close`);
  };

  /** The text of one line with its quote marks removed. */
  const quotedText = (text: string): string =>
    text.replace(/^[ \t]*(?:>[ \t]?)+/, '');

  /**
   * The alert marker of one block quote, or `null`.
   *
   * The rule is the rule of `@notesapp/markdown`: the first quoted line that
   * holds any text carries the marker alone. An empty quoted line above it is
   * skipped, because the reference renderer reads the first paragraph and an
   * empty line makes no paragraph.
   */
  const alertMarkerAt = (
    from: number,
    to: number,
  ): {
    readonly from: number;
    readonly to: number;
    readonly tone: AlertTone;
  } | null => {
    for (let pos = from; pos <= to;) {
      const line = doc.lineAt(pos);
      const text = quotedText(line.text);
      if (text.trim() !== '') {
        const tone = alertToneOf(text);
        if (tone === null) return null;
        const start = line.from + (line.text.length - text.length);
        return { from: start, to: start + alertMarkerLength(text), tone };
      }
      if (line.to >= to || line.number >= doc.lines) return null;
      pos = line.to + 1;
    }
    return null;
  };

  const tree = syntaxTree(state);
  const stack: string[] = [];
  let alignments: readonly ColumnAlign[] = [];

  /**
   * Marks one whole cell of a table row, with the alignment of its column.
   *
   * The range runs from one separator to the next, so it holds the padding
   * spaces of the cell as well as its text. A row therefore has no text
   * outside a cell, which is what lets the columns line up.
   */
  const tableCellMark = (
    from: number,
    to: number,
    header: boolean,
    column: number,
  ): void => {
    const align = alignments[column] ?? null;
    // The cell that holds the caret carries the mark of the active cell, as
    // a spreadsheet marks it, so a person sees which cell the next key
    // writes into.
    const active = selection.from === selection.to && touches(from, to);
    // The mark is inclusive, so it opens before the hidden padding at its
    // start and closes after the hidden padding at its end, and the hidden
    // ranges land inside the cell. A hidden range outside it was a loose node
    // between two cells, which the browser wrapped in an anonymous cell of
    // its own, and that cell took the width of a column.
    if (to > from)
      items.push(
        Decoration.mark({
          class: [
            header ? 'cm-np-table-head' : 'cm-np-table-cell',
            align === null ? '' : `cm-np-align-${align}`,
            active ? 'cm-np-table-active' : '',
          ]
            .filter((part) => part !== '')
            .join(' '),
          inclusive: true,
        }).range(from, to),
      );
    tablePaddingHide(from, to);
  };

  /**
   * Hides the padding of one cell, so a column is as wide as its text and not
   * as wide as the spaces the writer pads it with (record 0147).
   *
   * The caret never stands in the padding (record 0095), so this changes
   * what a person sees and not where the caret goes. The spaces between the
   * text and an empty caret stay on the screen: a space that a person just
   * typed at the end of a cell is padding until the next letter, and it must
   * not vanish under the caret. An empty cell keeps one space after the
   * place of its caret, so it keeps a line box and its row keeps its height.
   */
  const tablePaddingHide = (from: number, to: number): void => {
    const text = doc.sliceString(from, to);
    const trimmed = text.trim();
    const caret = selection.from === selection.to ? selection.from : -1;
    if (trimmed === '') {
      if (to - from < 2) return;
      hide(from, from + 1);
      const kept = caret > from + 1 && caret <= to ? caret : from + 2;
      hide(kept, to);
      return;
    }
    const textFrom = from + (text.length - text.trimStart().length);
    const textTo = textFrom + trimmed.length;
    hide(from, textFrom);
    hide(caret > textTo && caret <= to ? caret : textTo, to);
  };

  /**
   * Marks what stands between the start of a line and the start of its row.
   *
   * A row of a table is a `display: table-row` box, and CSS gives such a box
   * no margin and no padding, so a table inside a list item or inside a quote
   * has no way to carry its inset. This one leading cell carries it: the
   * spaces of a list item keep their own width inside it, and the class below
   * adds the step of each quote level. Every row of the table gets one, so the
   * columns still line up.
   *
   * A table at the left edge of the note has nothing before its row, so it
   * gets no leading cell and nothing changes for it.
   */
  const tableLeadMark = (rowFrom: number, quoted: number): void => {
    const start = doc.lineAt(rowFrom).from;
    mark(
      start,
      rowFrom,
      [
        'cm-np-table-lead',
        quoted > 0 ? `cm-np-table-quoted-${String(Math.min(quoted, 4))}` : '',
      ]
        .filter((part) => part !== '')
        .join(' '),
    );
  };

  /**
   * Puts the marker of one list item beside its text instead of above it.
   *
   * The editor wraps every line, and a wrapped line starts again at the left
   * edge of the note. The second line of an item therefore stood under its
   * own box or bullet and read as a new item. The marker line becomes one row
   * of two boxes: the lead holds the indentation and the marker, and the body
   * holds the text. The body is a cell of its own, so every wrapped line
   * starts on the first letter of the item.
   *
   * The lead takes the width of what is in it, so the alignment follows the
   * real marker at any depth: the source spaces of a nested item, the drawn
   * bullet, the number of an ordered item, and the task box with the gap it
   * carries. No rule states a distance, and nothing here measures the text.
   *
   * Only the line that carries the marker is a row. A later line of the same
   * item already holds its own indentation in the source, and a table row
   * inside an item keeps the leading cell that `tableLeadMark` gives it.
   */
  const hangingIndent = (item: SyntaxNode): void => {
    const marker = listMarkerOf(state, item);
    if (marker === null) return;
    const line = doc.lineAt(marker.lineFrom);
    const content = marker.contentFrom;
    lineClass(line.from, line.from, 'cm-np-list-line');
    // A drawn marker at the start of the line starts where the lead starts.
    // A mark that is not inclusive at its start sorts after a widget at the
    // same position, so CodeMirror drew the widget outside the lead cell, the
    // lead collapsed, and a label such as `1.` broke over two lines. An
    // inclusive start keeps the drawn marker inside the lead.
    if (content > line.from)
      items.push(
        Decoration.mark({
          class: 'cm-np-list-lead',
          inclusiveStart: true,
        }).range(line.from, content),
      );
    mark(content, line.to, 'cm-np-list-body');
  };

  /**
   * Whether the selection shows the source of the drawn marker of one item.
   *
   * `./list-marker.ts` states the marker, so the range that the preview draws
   * is the range where no caret rests.
   */
  const drawnSource = (item: SyntaxNode | null): boolean => {
    const marker: ListMarker | null =
      item === null ? null : listMarkerOf(state, item);
    return (
      marker !== null &&
      drawnAtEveryCaret(marker) &&
      selectionShowsMarker(marker, selection)
    );
  };

  /** The values of the ordered items this build met, by item start. */
  const orderedValues = new Map<number, number>();

  /**
   * The value a reader shows for one ordered item.
   *
   * CommonMark numbers a list from the number of its first item and counts
   * every later item from there, whatever number the later item carries.
   * The walk goes back to the nearest item it already knows, so a long list
   * costs one step for each item and a build that starts inside the list
   * still counts from its first item.
   */
  const orderedValue = (item: SyntaxNode): number => {
    const unknown: SyntaxNode[] = [];
    let value: number | null = null;
    for (let at: SyntaxNode | null = item; at !== null; at = at.prevSibling) {
      if (at.name !== 'ListItem') continue;
      const known = orderedValues.get(at.from);
      if (known !== undefined) {
        value = known;
        break;
      }
      unknown.push(at);
    }
    for (const at of unknown.reverse()) {
      if (value === null) {
        const mark = at.getChild('ListMark');
        value =
          mark === null
            ? 1
            : Number.parseInt(doc.sliceString(mark.from, mark.to), 10);
      } else value += 1;
      orderedValues.set(at.from, value);
    }
    return value ?? 1;
  };

  /** The nesting depth of the given container kind on the current stack. */
  const depthOf = (...names: readonly string[]): number =>
    stack.reduce(
      (count, name) => (names.includes(name) ? count + 1 : count),
      0,
    );

  /**
   * Decides how one tree node looks.
   *
   * Returns true to walk into the children of the node, false to stop. Every
   * decoration and every structure entry of one construct is produced here,
   * so the two cannot describe different documents.
   */
  const visit = (node: SyntaxNodeRef, parent: string): boolean => {
    const name = node.name;
    if (name === 'Frontmatter') {
      lineClass(
        node.from,
        Math.max(node.from, node.to - 1),
        'cm-np-front-matter',
      );
      // The YAML language owns the nested highlighting. Front matter is one
      // metadata block and never a set of Markdown headings.
      structure.push({ kind: 'front-matter' });
      return false;
    }
    const level = headingLevel(name);
    if (level > 0) {
      const atx = name.startsWith('ATX');
      const markerLine = atx ? doc.lineAt(node.from) : doc.lineAt(node.to);
      const contentTo = atx ? node.to : doc.lineAt(markerLine.from - 1).to;
      // A setext underline decides the size of the line above it, so it is
      // the marker line of the construct. While the selection sits on that
      // line the construct shows its source: the underline stays visible and
      // the text above keeps paragraph size. Without this rule a single `-`
      // or `=` typed under a paragraph, which is what a list or a break
      // starts with, resizes the paragraph until the next character arrives.
      const revealed = !atx && touchesLines(markerLine.from, markerLine.to);
      if (!revealed)
        lineClass(
          node.from,
          contentTo,
          `cm-np-heading cm-np-h${String(level)}`,
        );
      structure.push({
        kind: 'heading',
        level,
        text: contentText(state, node.from, node.to),
      });
      return true;
    }

    if (name === 'HeaderMark') {
      if (!parent.startsWith('ATXHeading')) return false;
      if (touchesLines(node.from, node.to)) {
        dim(node.from, node.to);
        return false;
      }
      const line = doc.lineAt(node.from);
      if (
        node.from ===
        line.from + (line.text.length - line.text.trimStart().length)
      ) {
        let end = node.to;
        while (end < line.to && /[ \t]/.test(doc.sliceString(end, end + 1)))
          end += 1;
        hide(node.from, end);
      } else {
        let start = node.from;
        while (
          start > line.from &&
          /[ \t]/.test(doc.sliceString(start - 1, start))
        )
          start -= 1;
        hide(start, node.to);
      }
      return false;
    }

    if (
      name === 'Emphasis' ||
      name === 'StrongEmphasis' ||
      name === 'Strikethrough'
    ) {
      mark(
        node.from,
        node.to,
        name === 'Emphasis'
          ? 'cm-np-italic'
          : name === 'StrongEmphasis'
            ? 'cm-np-bold'
            : 'cm-np-strike',
      );
      return true;
    }

    if (name === 'EmphasisMark' || name === 'StrikethroughMark') {
      const owner = node.node.parent;
      if (owner !== null && touches(owner.from, owner.to))
        dim(node.from, node.to);
      else hide(node.from, node.to);
      return false;
    }

    if (name === 'InlineCode') {
      mark(node.from, node.to, 'cm-np-code');
      return true;
    }

    if (name === 'CodeMark') {
      if (parent === 'InlineCode') {
        const owner = node.node.parent;
        if (owner !== null && touches(owner.from, owner.to))
          dim(node.from, node.to);
        else hide(node.from, node.to);
        return false;
      }
      dim(node.from, node.to);
      return false;
    }

    if (name === 'CodeInfo') {
      mark(node.from, node.to, 'cm-np-code-info');
      return false;
    }

    if (name === 'FencedCode' || name === 'CodeBlock') {
      const info =
        name === 'FencedCode'
          ? (() => {
              const first = node.node.getChild('CodeInfo');
              return first === null
                ? ''
                : doc.sliceString(first.from, first.to).trim();
            })()
          : '';
      structure.push({ kind: 'code-block', info });
      blockLines(node.from, node.to, 'cm-np-code-block-line');
      return true;
    }

    if (name === 'HorizontalRule') {
      structure.push({ kind: 'thematic-break' });
      lineClass(node.from, node.to, 'cm-np-rule-line');
      if (!touchesLines(node.from, node.to))
        items.push(
          Decoration.replace({ widget: new RuleWidget() }).range(
            node.from,
            node.to,
          ),
        );
      return false;
    }

    if (name === 'Blockquote') {
      // The node is pushed on the stack only after this returns, so the
      // depth of the node itself is one more than the stack reports.
      const depth = depthOf('Blockquote') + 1;
      const marker = alertMarkerAt(node.from, node.to);
      const tone = marker === null ? null : marker.tone;
      structure.push({ kind: 'quote', depth, tone });
      lineClass(
        node.from,
        node.to,
        `cm-np-quote cm-np-quote-${String(Math.min(depth, 4))}`,
      );
      if (marker !== null) {
        lineClass(node.from, node.to, `cm-np-alert cm-np-alert-${marker.tone}`);
        // The marker follows the reveal rule of every other block marker: it
        // is the title of the alert until the selection reaches its line.
        if (touchesLines(marker.from, marker.to)) dim(marker.from, marker.to);
        else
          items.push(
            Decoration.replace({
              widget: new AlertTitleWidget(marker.tone),
            }).range(marker.from, marker.to),
          );
      }
      return true;
    }

    if (name === 'QuoteMark') {
      if (touchesLines(node.from, node.to)) dim(node.from, node.to);
      else {
        let end = node.to;
        const line = doc.lineAt(node.from);
        if (end < line.to && doc.sliceString(end, end + 1) === ' ') end += 1;
        hide(node.from, end);
      }
      return false;
    }

    if (name === 'ListItem') {
      const ordered = parent === 'OrderedList';
      structure.push({
        kind: 'list-item',
        depth: depthOf('BulletList', 'OrderedList'),
        ordered,
        value: ordered ? orderedValue(node.node) : null,
      });
      hangingIndent(node.node);
      return true;
    }

    if (name === 'ListMark') {
      const text = doc.sliceString(node.from, node.to);
      const item = node.node.parent;
      if (/^\d+[.)]$/.test(text)) {
        // The item keeps the final label while its text is edited. The numeric
        // source returns only when the selection touches the marker itself,
        // so it stays directly editable without making the hierarchy change
        // during ordinary typing (record 0092). The stack holds the list of
        // this item, so the ordered lists around it are one fewer than the
        // stack counts.
        if (item === null || touches(node.from, node.to)) {
          mark(node.from, node.to, 'cm-np-list-number');
          return false;
        }
        const label = orderedMarkerLabel(
          orderedValue(item),
          depthOf('OrderedList') - 1,
        );
        items.push(
          Decoration.replace({
            widget: new OrderedMarkerWidget(label),
          }).range(node.from, node.to),
        );
        return false;
      }
      // A bullet is drawn at every caret once a space follows it, and its
      // source comes back only while a range covers the marker (record
      // 0132). Until the space arrives it is the `-` the person typed.
      const marker = item === null ? null : listMarkerOf(state, item);
      if (marker === null || !drawnAtEveryCaret(marker)) return false;
      if (selectionShowsMarker(marker, selection)) {
        dim(node.from, node.to);
        return false;
      }
      // The bullet of a task item is the stem of its box, so it hides with
      // the box and the item never grows a second marker.
      if (marker.task !== null) {
        hide(node.from, node.to);
        return false;
      }
      items.push(
        Decoration.replace({ widget: new BulletWidget() }).range(
          node.from,
          node.to,
        ),
      );
      return false;
    }

    if (name === 'Task') {
      const marker = node.node.getChild('TaskMarker');
      const checked =
        marker !== null &&
        /[xX]/.test(doc.sliceString(marker.from + 1, marker.to - 1));
      structure.push({ kind: 'task', checked });
      return true;
    }

    if (name === 'TaskMarker') {
      const checked = /[xX]/.test(doc.sliceString(node.from + 1, node.to - 1));
      // A task box is a control and not a marker: a person opens the line to
      // write the item and ticks the box in the same moment, so the box stays
      // a box under the caret (record 0033). A range that covers it shows the
      // source that a copy takes (record 0132).
      if (drawnSource(node.node.parent?.parent ?? null)) {
        dim(node.from, node.to);
        return false;
      }
      items.push(
        Decoration.replace({
          widget: new TaskCheckboxWidget(node.from, checked),
        }).range(node.from, node.to),
      );
      return false;
    }

    if (name === 'Table') {
      const table = node.node;
      let rows = 0;
      let columns = 0;
      alignments = [];
      for (
        let child = table.firstChild;
        child !== null;
        child = child.nextSibling
      ) {
        if (child.name === 'TableHeader') {
          rows += 1;
          columns = child.getChildren('TableCell').length;
        } else if (child.name === 'TableRow') {
          rows += 1;
        } else if (child.name === 'TableDelimiter') {
          alignments = tableAlignments(doc.sliceString(child.from, child.to));
          lineClass(child.from, child.to, 'cm-np-table-align');
        }
      }
      structure.push({ kind: 'table', rows, columns });
      lineClass(node.from, node.to, 'cm-np-table-line');
      return true;
    }

    if (name === 'TableHeader' || name === 'TableRow') {
      const header = name === 'TableHeader';
      // A table is a grid over its text (record 0095). A separator never
      // shows: the cells draw the outline of the table, and the caret never
      // stands on a separator, so nothing asks for it.
      tableLeadMark(node.from, depthOf('Blockquote'));
      let column = 0;
      let at = node.from;
      for (
        let child = node.node.firstChild;
        child !== null;
        child = child.nextSibling
      ) {
        if (child.name !== 'TableDelimiter') continue;
        if (child.from > at) {
          tableCellMark(at, child.from, header, column);
          column += 1;
        }
        // The hidden separator still leaves a node in the row, and a node
        // between two cells becomes an anonymous cell of the browser. After
        // an edit that replaces some rows, a browser can split those
        // anonymous cells, so the rows stop lining up. The gap makes each
        // separator one real cell of no width, so every row holds the same
        // cells. The mark is inclusive, so it opens before the hidden range
        // and wraps it.
        items.push(tableGap.range(child.from, child.to));
        hide(child.from, child.to);
        at = child.to;
      }
      if (node.to > at) tableCellMark(at, node.to, header, column);
      return true;
    }

    // The row above already marked the whole cell, padding included, so the
    // cell node adds nothing. The walk still enters it, because the inline
    // text inside a cell carries its own decorations.
    if (name === 'TableCell') return true;

    // A pipe in a cell is text a person wrote, and its backslash exists only
    // because a bare pipe would start a new cell in the source. The grid
    // shows the pipe alone (record 0095), and the backslash comes back when
    // the selection touches it, as the source of every inline construct does.
    // An escape anywhere else keeps its backslash.
    if (
      name === 'Escape' &&
      parent === 'TableCell' &&
      doc.sliceString(node.from, node.to) === '\\|' &&
      !touches(node.from, node.to)
    ) {
      hide(node.from, node.from + 1);
      return false;
    }

    if (name === 'TableDelimiter') {
      // A separator inside a row is hidden by the row itself. Only the
      // delimiter row of the table reaches this point, and the parser reports
      // it as one node. The columns already state its alignment, and the
      // caret never stands on it, so the row never shows. Its line closes to
      // nothing, because an empty row still holds one line box.
      if (parent !== 'Table') return false;
      hide(node.from, node.to);
      lineClass(node.from, node.to, 'cm-np-table-closed');
      return false;
    }

    if (name === 'Image') {
      mark(node.from, node.to, 'cm-np-image');
      return true;
    }

    if (name === 'Link') {
      const text = doc.sliceString(node.from, Math.min(node.to, node.from + 2));
      if (text === '[^') {
        mark(node.from, node.to, 'cm-np-footnote');
        return false;
      }
      const link = node.node;
      // A bare `[word]` with no definition is plain text, so it is left
      // exactly as written.
      if (link.getChild('URL') === null && link.getChild('LinkLabel') === null)
        return false;
      linkMark(node.from, node.to);
      return true;
    }

    if (name === 'LinkReference') {
      lineClass(node.from, node.to, 'cm-np-link-definition');
      return true;
    }

    if (name === 'Autolink') {
      linkMark(node.from, node.to);
      return true;
    }

    if (name === 'LinkMark') {
      const owner = node.node.parent;
      if (owner === null || owner.name === 'LinkReference') return false;
      if (!hidesItsMarkers(owner) || touches(owner.from, owner.to))
        dim(node.from, node.to);
      else hide(node.from, node.to);
      return false;
    }

    if (name === 'URL' || name === 'LinkTitle' || name === 'LinkLabel') {
      const owner = node.node.parent;
      // Inside a link or an image the target is chrome and hides. Anywhere
      // else, including inside an autolink, the URL is the visible text.
      // Inside an autolink the URL is the visible text, and the mark on the
      // autolink node already styles it.
      if (owner !== null && owner.name === 'Autolink') return false;
      if (hidesItsMarkers(owner)) {
        if (owner !== null && touches(owner.from, owner.to))
          dim(node.from, node.to);
        else hide(node.from, node.to);
        return false;
      }
      if (owner !== null && (owner.name === 'Link' || owner.name === 'Image')) {
        dim(node.from, node.to);
        return false;
      }
      if (owner === null || owner.name !== 'LinkReference')
        linkMark(node.from, node.to);
      return false;
    }

    if (name === 'HardBreak') {
      mark(node.from, node.to, 'cm-np-hard-break');
      return false;
    }

    if (
      name === 'HTMLBlock' ||
      name === 'HTMLTag' ||
      name === 'Comment' ||
      name === 'CommentBlock' ||
      name === 'ProcessingInstruction' ||
      name === 'ProcessingInstructionBlock'
    ) {
      mark(node.from, node.to, 'cm-np-html');
      return false;
    }

    if (name === 'Paragraph') {
      const first = node.node.firstChild;
      if (
        first !== null &&
        first.name === 'Link' &&
        first.from === node.from &&
        doc.sliceString(node.from, node.from + 2) === '[^' &&
        doc.sliceString(first.to, first.to + 1) === ':'
      )
        lineClass(node.from, node.to, 'cm-np-footnote-definition');
      return true;
    }

    return true;
  };

  for (const range of mergeRanges(
    ranges.map((item) => ({
      from: doc.lineAt(item.from).from,
      to: doc.lineAt(Math.min(item.to, doc.length)).to,
    })),
  )) {
    tree.iterate({
      from: range.from,
      to: range.to,
      // The tree walk calls `leave` only for a node whose `enter` returned
      // true, so the stack is pushed at the one place that returns.
      enter: (node) => {
        visited += 1;
        const descend = visit(node, stack[stack.length - 1] ?? '');
        if (descend) stack.push(node.name);
        return descend;
      },
      leave: () => {
        stack.pop();
      },
    });
  }

  return { decorations: Decoration.set(items, true), structure, visited };
}

/**
 * The structure the preview would decorate for one Markdown document.
 *
 * This is the offline entry point of the preview: it builds a state with
 * the note language, parses the whole document, and returns the structure
 * the decoration builder reported. The equivalence gate compares the result
 * with the reference renderer, so both readers of a note must agree.
 *
 * `parsedWhole` refuses a partial parse rather than handing one back. A
 * document this function reported on is therefore always the whole
 * document: a caller that saw a mismatch here is looking at a real
 * disagreement between the two readers of a note, never at a parser that
 * ran out of time.
 */
export function previewStructureOf(doc: string): readonly PreviewNode[] {
  const state = parsedWhole(
    EditorState.create({ doc, extensions: [noteMarkdown()] }),
  );
  // A selection outside the document reveals nothing, so every construct is
  // reported in its rendered form.
  return buildPreview(state, [{ from: 0, to: state.doc.length }], {
    from: -1,
    to: -1,
  }).structure;
}

/** What one view update tells the preview about the need to rebuild. */
export type PreviewRebuildSignal = {
  readonly docChanged: boolean;
  readonly selectionSet: boolean;
  readonly viewportChanged: boolean;
  /** The parser produced more tree than the previous state held. */
  readonly treeChanged: boolean;
};

/**
 * Whether the decorations must be built again after one view update.
 *
 * The parser works in slices, so a long note reaches the view with a tree
 * that stops before the end of the document. The rest of the tree arrives
 * in a transaction that changes neither the document, the selection, nor
 * the viewport. Without the tree signal the preview would keep the
 * decorations of the partial tree until the next keystroke, which is what
 * makes a wrong construct look like it repairs itself later.
 */
export function previewNeedsRebuild(signal: PreviewRebuildSignal): boolean {
  return (
    signal.docChanged ||
    signal.selectionSet ||
    signal.viewportChanged ||
    signal.treeChanged
  );
}

/**
 * The live preview extension.
 *
 * Decorations are rebuilt when the document, the selection, the viewport, or
 * the syntax tree changes, and only for the visible ranges. Nothing here
 * dispatches a document change, so undo history, IME composition, and the
 * selection survive every rebuild.
 */
export function livePreview(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildPreview(
          view.state,
          view.visibleRanges,
          view.state.selection.main,
        ).decorations;
      }

      update(update: ViewUpdate): void {
        const rebuild = previewNeedsRebuild({
          docChanged: update.docChanged,
          selectionSet: update.selectionSet,
          viewportChanged: update.viewportChanged,
          treeChanged:
            syntaxTree(update.startState) !== syntaxTree(update.state),
        });
        if (!rebuild) return;
        this.decorations = buildPreview(
          update.view.state,
          update.view.visibleRanges,
          update.view.state.selection.main,
        ).decorations;
      }
    },
    { decorations: (value) => value.decorations },
  );
}
