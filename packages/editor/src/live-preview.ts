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
 * - A task box is the one exception. It is a control, so it stays a checkbox
 *   whatever the selection does, and its `- [ ]` source never comes back on
 *   screen. See decision record 0033.
 *
 * Cost. Only the visible ranges are walked, and only the tree is read: no
 * `doc.toString()` and no regular expression over the document. The walk
 * reports how many tree nodes it entered so a test can bound it.
 *
 * Block level decorations are not here. A decoration that replaces a line
 * break or a whole line must come from a state field, which is what
 * `./widgets.ts` provides.
 */
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
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
import { taskToggleAt } from './commands.ts';
import { noteMarkdown } from './language.ts';

/** One structural fact the preview decorated, in document order. */
export type PreviewNode =
  | { readonly kind: 'heading'; readonly level: number; readonly text: string }
  | {
      readonly kind: 'list-item';
      readonly depth: number;
      readonly ordered: boolean;
    }
  | { readonly kind: 'task'; readonly checked: boolean }
  | { readonly kind: 'code-block'; readonly info: string }
  | {
      readonly kind: 'table';
      readonly rows: number;
      readonly columns: number;
    }
  | { readonly kind: 'quote'; readonly depth: number }
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
type ColumnAlign = 'left' | 'center' | 'right' | null;

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
 * A real checkbox for one task item.
 *
 * The widget carries the document position of its own `[ ]`, so a click
 * toggles the task it belongs to and never the task of the current
 * selection. A pointer, a touch, and the keyboard all reach the same
 * command.
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
    return false;
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
    const toggle = (event: Event): void => {
      event.preventDefault();
      const spec = taskToggleAt(view.state, this.position);
      if (spec === null) return;
      view.dispatch(view.state.update(spec));
    };
    box.addEventListener('mousedown', toggle);
    box.addEventListener('touchstart', toggle, { passive: false });
    box.addEventListener('keydown', (event: KeyboardEvent): void => {
      if (event.key === ' ' || event.key === 'Enter') toggle(event);
    });
    return box;
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

  const tree = syntaxTree(state);
  const stack: string[] = [];
  let alignments: readonly ColumnAlign[] = [];

  /**
   * Marks one whole cell of a table row, with the alignment of its column.
   *
   * The range runs from one separator to the next, so it holds the padding
   * spaces of the cell as well as its text. A row therefore has no text
   * outside a cell and every row of the table carries the same boxes, which
   * is what lets the columns line up.
   */
  const tableCellMark = (
    from: number,
    to: number,
    header: boolean,
    column: number,
  ): void => {
    const align = alignments[column] ?? null;
    mark(
      from,
      to,
      [
        header ? 'cm-np-table-head' : 'cm-np-table-cell',
        align === null ? '' : `cm-np-align-${align}`,
      ]
        .filter((part) => part !== '')
        .join(' '),
    );
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
      lineClass(node.from, node.to, 'cm-np-code-block-line');
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
      structure.push({ kind: 'quote', depth });
      lineClass(
        node.from,
        node.to,
        `cm-np-quote cm-np-quote-${String(Math.min(depth, 4))}`,
      );
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
      structure.push({
        kind: 'list-item',
        depth: depthOf('BulletList', 'OrderedList'),
        ordered: parent === 'OrderedList',
      });
      return true;
    }

    if (name === 'ListMark') {
      const text = doc.sliceString(node.from, node.to);
      if (/^\d+[.)]$/.test(text)) {
        mark(node.from, node.to, 'cm-np-list-number');
        return false;
      }
      // The bullet of a task item is the stem of its box. The box stays a box
      // while the line is edited, so the bullet stays hidden with it and the
      // item never grows a second marker under the caret.
      const item = node.node.parent;
      if (item !== null && item.getChild('Task') !== null) {
        hide(node.from, node.to);
        return false;
      }
      if (touchesLines(node.from, node.to)) {
        dim(node.from, node.to);
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
      // A task box is the one construct that does not follow the reveal rule.
      // It is a control and not a marker: a person opens the line to write the
      // item and ticks the box in the same moment, so the box must stay a box
      // under the caret. See decision record 0033.
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
      // A separator keeps its box at every moment and only changes how
      // visible it is, so the columns never move when a row shows its
      // source.
      const pipeClass = touchesLines(node.from, node.to)
        ? 'cm-np-table-pipe cm-np-table-shown'
        : 'cm-np-table-pipe';
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
        mark(child.from, child.to, pipeClass);
        at = child.to;
      }
      if (node.to > at) tableCellMark(at, node.to, header, column);
      return true;
    }

    // The row above already marked the whole cell, padding included, so the
    // cell node adds nothing. The walk still enters it, because the inline
    // text inside a cell carries its own decorations.
    if (name === 'TableCell') return true;

    if (name === 'TableDelimiter') {
      // A separator inside a row is marked by the row itself. Only the
      // delimiter row of the table reaches this point, and the parser reports
      // it as one node, so its columns come from its own text.
      if (parent !== 'Table') return false;
      // The dashes state the alignment, which the columns already show, so
      // the row stays out of the way until the selection reaches its line.
      if (!touchesLines(node.from, node.to)) {
        hide(node.from, node.to);
        // An empty row still holds one line box, which would leave a band
        // under the header. The line closes to nothing and opens again with
        // the source when the selection reaches it.
        lineClass(node.from, node.to, 'cm-np-table-closed');
        return false;
      }
      for (const part of delimiterRowParts(
        doc.sliceString(node.from, node.to),
        node.from,
      ))
        mark(
          part.from,
          part.to,
          part.pipe ? 'cm-np-table-pipe cm-np-table-shown' : 'cm-np-table-rule',
        );
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
      mark(node.from, node.to, 'cm-np-link');
      return true;
    }

    if (name === 'LinkReference') {
      lineClass(node.from, node.to, 'cm-np-link-definition');
      return true;
    }

    if (name === 'Autolink') {
      mark(node.from, node.to, 'cm-np-link');
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
        mark(node.from, node.to, 'cm-np-link');
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
 * A view parses at least its viewport before it renders. A headless state
 * parses in slices and keeps the result in its parse context, so the loop
 * below pumps that work into the state field until the tree covers the
 * document.
 */
export function previewStructureOf(doc: string): readonly PreviewNode[] {
  let state = EditorState.create({ doc, extensions: [noteMarkdown()] });
  for (
    let attempt = 0;
    attempt < 500 && syntaxTree(state).length < state.doc.length;
    attempt += 1
  ) {
    ensureSyntaxTree(state, state.doc.length, 5000);
    state = state.update({}).state;
  }
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
