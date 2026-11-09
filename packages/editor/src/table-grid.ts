/**
 * A table of a note as a grid over its text (record 0095).
 *
 * The Markdown source stays the document, and a table stays text of the one
 * editor. This module makes that text behave as a grid: a person moves from
 * cell to cell, adds and removes rows and columns, and never meets a pipe or
 * the delimiter row. Everything a person does in a cell is an edit of the one
 * document, so undo, IME composition, find and replace, and the work of
 * another device reach a cell as they reach a paragraph (record 0082).
 *
 * The rules that shape this module:
 *
 * - The table comes from the Lezer tree, like every decoration. A cell is the
 *   stretch between two pipes, padding included, as `live-preview.ts` cuts
 *   it, because an empty cell has no node of its own.
 * - A table command reads the table into a model, changes the model, and
 *   writes the whole table again as aligned GFM. The difference is applied as
 *   the smallest character changes, so the text of a cell that the command
 *   did not change is never rewritten, and a remote edit of it survives.
 * - A caret stands in the text of a cell, never in the padding, on a pipe,
 *   or on the delimiter row. A range that a person selects is left alone.
 * - The edit of a person never removes a pipe, the delimiter row, or the
 *   line break between two rows, unless it removes the whole table.
 * - A typed pipe is escaped and a pasted line break becomes a space, so text
 *   written into a cell stays in that cell.
 */
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import {
  ChangeSet,
  EditorSelection,
  EditorState,
  StateEffect,
  type ChangeSpec,
  type Extension,
  Transaction,
  type Range,
  type SelectionRange,
  type TransactionSpec,
} from '@codemirror/state';
import {
  BlockWrapper,
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { getSearchQuery } from '@codemirror/search';
import type { SyntaxNode, Tree } from '@lezer/common';
import { readVisibleArea } from '@notesapp/ui';
import { diffArrays, diffChars } from 'diff';
import { TableScrollRecords } from './table-scroll.ts';
import { fitTableColumns } from './table-widths.ts';
import { isEditOfAPerson } from './commands.ts';
import {
  delimiterRowParts,
  contentText,
  tableAlignments,
  type ColumnAlign,
} from './live-preview.ts';

/**
 * How long one command may parse the note to find its table, in
 * milliseconds. The parse reuses the tree of the state, so this is spent only
 * on text the parser has not read yet.
 */
const parseBudget = 25;

/** One half-open range of the document. */
type Span = { readonly from: number; readonly to: number };

/**
 * One cell of a row: the stretch between two separators, padding included,
 * and the text inside it. An empty cell has no text, so its text range is one
 * point just after the separator before it.
 */
export type TableCellBox = {
  readonly from: number;
  readonly to: number;
  readonly textFrom: number;
  readonly textTo: number;
};

/** One line of a table. */
export type TableRowBox = {
  readonly kind: 'header' | 'delimiter' | 'body';
  /** The start of the line, before any quote mark or indentation. */
  readonly lineFrom: number;
  /** The start of the row node, after any quote mark or indentation. */
  readonly from: number;
  readonly to: number;
  readonly pipes: readonly Span[];
  readonly cells: readonly TableCellBox[];
};

/** One table of the document, as the tree states it. */
export type TableBox = {
  readonly from: number;
  readonly to: number;
  /** Every line of the table in order: the header, the delimiter, the body. */
  readonly rows: readonly TableRowBox[];
};

/** The place of one cell: row 0 is the header, then the body rows in order. */
export type CellRef = { readonly row: number; readonly column: number };

/** The tree of a state, parsed up to `pos` within the budget. */
function treeOf(state: EditorState, pos: number): Tree {
  return ensureSyntaxTree(state, pos, parseBudget) ?? syntaxTree(state);
}

/** One cell from its range, with the range of its text. */
function cellBox(state: EditorState, from: number, to: number): TableCellBox {
  const text = state.doc.sliceString(from, to);
  const trimmed = text.trim();
  if (trimmed === '') {
    // Keep the caret before a visible space, inside the cell mark. At the
    // end of a one-space cell it would land on the hidden pipe instead.
    const at = from + Math.min(1, Math.max(0, to - from - 1));
    return { from, to, textFrom: at, textTo: at };
  }
  const lead = text.length - text.trimStart().length;
  return {
    from,
    to,
    textFrom: from + lead,
    textTo: from + lead + trimmed.length,
  };
}

/** The cells between the separators of one row. */
function cellsBetween(
  state: EditorState,
  from: number,
  to: number,
  pipes: readonly Span[],
): readonly TableCellBox[] {
  const cells: TableCellBox[] = [];
  let at = from;
  for (const pipe of pipes) {
    if (pipe.from > at || at > from) cells.push(cellBox(state, at, pipe.from));
    at = pipe.to;
  }
  if (to > at) cells.push(cellBox(state, at, to));
  return cells;
}

/** The model of one `Table` node. */
function tableFromNode(state: EditorState, table: SyntaxNode): TableBox {
  const rows: TableRowBox[] = [];
  for (
    let child = table.firstChild;
    child !== null;
    child = child.nextSibling
  ) {
    const lineFrom = state.doc.lineAt(child.from).from;
    if (child.name === 'TableHeader' || child.name === 'TableRow') {
      const pipes: Span[] = [];
      for (let part = child.firstChild; part !== null; part = part.nextSibling)
        if (part.name === 'TableDelimiter')
          pipes.push({ from: part.from, to: part.to });
      rows.push({
        kind: child.name === 'TableHeader' ? 'header' : 'body',
        lineFrom,
        from: child.from,
        to: child.to,
        pipes,
        cells: cellsBetween(state, child.from, child.to, pipes),
      });
      continue;
    }
    if (child.name !== 'TableDelimiter') continue;
    const parts = delimiterRowParts(
      state.doc.sliceString(child.from, child.to),
      child.from,
    );
    rows.push({
      kind: 'delimiter',
      lineFrom,
      from: child.from,
      to: child.to,
      pipes: parts.filter((part) => part.pipe),
      cells: parts
        .filter((part) => !part.pipe)
        .map((part) => cellBox(state, part.from, part.to)),
    });
  }
  return { from: table.from, to: table.to, rows };
}

/** The table that holds `pos`, or null. */
export function tableAt(state: EditorState, pos: number): TableBox | null {
  const tree = treeOf(state, pos);
  for (const side of [1, -1] as const)
    for (
      let node: SyntaxNode | null = tree.resolveInner(pos, side);
      node !== null;
      node = node.parent
    )
      if (node.name === 'Table') return tableFromNode(state, node);
  return null;
}

/** Finish a table that crosses the current parser boundary. */
function tableTree(state: EditorState, from: number, to: number): Tree {
  let tree = ensureSyntaxTree(state, to, 250) ?? syntaxTree(state);
  for (;;) {
    let end = to;
    let found = false;
    tree.iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'Table') return true;
        found = true;
        end = Math.max(end, node.to);
        return false;
      },
    });
    if (!found || end >= state.doc.length) return tree;
    // Parsing a little beyond the table proves its end. A partial table
    // grows until the parser reaches its last row. No source scan is used.
    const next = ensureSyntaxTree(
      state,
      Math.min(state.doc.length, end + 4096),
      // A table can have up to 10,000 cells. Finish this bounded block
      // before sizing it, including when other tests or views use the CPU.
      250,
    );
    if (next === null || next === tree) return tree;
    let nextEnd = to;
    next.iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'Table') return true;
        nextEnd = Math.max(nextEnd, node.to);
        return false;
      },
    });
    tree = next;
    if (nextEnd <= end) return tree;
  }
}

/** Every table that meets the range from `from` to `to`. */
export function tablesIn(
  state: EditorState,
  from: number,
  to: number,
): readonly TableBox[] {
  const tables: TableBox[] = [];
  tableTree(state, from, to).iterate({
    from,
    to,
    enter: (node) => {
      if (node.name !== 'Table') return true;
      tables.push(tableFromNode(state, node.node));
      return false;
    },
  });
  return tables;
}

/** The rows a person edits: the header and the body, not the delimiter. */
function gridRows(table: TableBox): readonly TableRowBox[] {
  return table.rows.filter((row) => row.kind !== 'delimiter');
}

/** The line of the table that holds `pos`, or null. */
function rowAt(table: TableBox, pos: number): TableRowBox | null {
  return table.rows.find((row) => pos >= row.lineFrom && pos <= row.to) ?? null;
}

/** The index of the cell of `row` that holds `pos`. */
function columnAt(row: TableRowBox, pos: number): number {
  let column = 0;
  row.cells.forEach((cell, index) => {
    if (pos >= cell.from) column = index;
  });
  return column;
}

/** The cell that holds `pos`, or null outside the header and the body. */
export function cellAt(table: TableBox, pos: number): CellRef | null {
  const rows = gridRows(table);
  const row = rowAt(table, pos);
  if (row === null || row.kind === 'delimiter' || row.cells.length === 0)
    return null;
  return { row: rows.indexOf(row), column: columnAt(row, pos) };
}

/**
 * One end of a range moved off hidden table syntax to the text beside it.
 *
 * A pipe, the padding around a cell and the delimiter row draw nothing that
 * holds a caret, so the editor cannot scroll to a range that ends there. A
 * position inside the text of a cell stays where it is. Any other position
 * in a row moves to the end of the text before it (`backward`) or the start
 * of the text after it, in the same row; a delimiter row moves to the row
 * before or after it. An empty cell holds no text and is passed over. A row
 * with no text keeps the position, and the editor keeps its own result.
 */
function measurableEnd(
  table: TableBox,
  pos: number,
  backward: boolean,
): number {
  const row = rowAt(table, pos);
  if (row === null) return pos;
  if (row.kind === 'delimiter') {
    const index = table.rows.indexOf(row);
    const near = table.rows[backward ? index - 1 : index + 1];
    const far = table.rows[backward ? index + 1 : index - 1];
    const ends = (other: TableRowBox | undefined, last: boolean) => {
      const texts = other?.cells.filter((cell) => cell.textTo > cell.textFrom);
      const cell = last ? texts?.at(-1) : texts?.[0];
      return cell === undefined ? null : last ? cell.textTo : cell.textFrom;
    };
    return ends(near, backward) ?? ends(far, !backward) ?? pos;
  }
  const texts = row.cells.filter((cell) => cell.textTo > cell.textFrom);
  if (texts.some((cell) => pos >= cell.textFrom && pos <= cell.textTo))
    return pos;
  const before = texts.filter((cell) => cell.textTo <= pos).at(-1)?.textTo;
  const after = texts.find((cell) => cell.textFrom >= pos)?.textFrom;
  return (backward ? (before ?? after) : (after ?? before)) ?? pos;
}

/**
 * The range to scroll to for `range`, with each end that stands on hidden
 * table syntax moved to the cell text beside it, inward.
 *
 * It changes only where the editor scrolls, never a selection or the text.
 * The direction of the range is kept, and an empty range stays empty. A
 * range that covers hidden syntax alone becomes the caret at the end of the
 * text before it. Each end reads the spans of its own row alone.
 */
export function measurableRange(
  state: EditorState,
  range: SelectionRange,
): SelectionRange {
  const from = Math.min(range.anchor, range.head);
  const to = Math.max(range.anchor, range.head);
  const at = (pos: number, backward: boolean): number => {
    const table = tableAt(state, pos);
    return table === null ? pos : measurableEnd(table, pos, backward);
  };
  if (from === to) {
    const pos = at(from, true);
    return pos === from ? range : EditorSelection.cursor(pos, range.assoc);
  }
  const end = at(to, true);
  const start = Math.min(at(from, false), end);
  if (start === from && end === to) return range;
  return range.head >= range.anchor
    ? EditorSelection.range(start, end)
    : EditorSelection.range(end, start);
}

/** Whether `pos` stands in a cell a person can write in. */
export function inTableCell(state: EditorState, pos: number): boolean {
  const table = tableAt(state, pos);
  if (table === null) return false;
  const row = rowAt(table, pos);
  return row !== null && row.kind !== 'delimiter' && pos >= row.from;
}

/** What a person reads in a table: the text of each cell, and the columns. */
export type TableData = {
  /** What stands before each line after the first: quote marks or spaces. */
  readonly lead: string;
  readonly alignments: readonly ColumnAlign[];
  readonly header: readonly string[];
  readonly body: readonly (readonly string[])[];
};

/**
 * The data of one table.
 *
 * The table takes as many columns as its widest row, so a cell that a row
 * holds beyond the header is kept and not dropped when the table is written.
 */
export function tableData(state: EditorState, table: TableBox): TableData {
  const rows = gridRows(table);
  const delimiter = table.rows.find((row) => row.kind === 'delimiter');
  const alignments =
    delimiter === undefined
      ? []
      : tableAlignments(state.doc.sliceString(delimiter.from, delimiter.to));
  const columns = Math.max(
    1,
    alignments.length,
    ...rows.map((row) => row.cells.length),
  );
  const texts = (row: TableRowBox): readonly string[] =>
    Array.from({ length: columns }, (_, index) => {
      const cell = row.cells[index];
      return cell === undefined
        ? ''
        : state.doc.sliceString(cell.textFrom, cell.textTo);
    });
  const second = table.rows[1];
  return {
    lead:
      second === undefined
        ? ''
        : state.doc.sliceString(second.lineFrom, second.from),
    alignments: Array.from(
      { length: columns },
      (_, index) => alignments[index] ?? null,
    ),
    header: rows[0] === undefined ? [] : texts(rows[0]),
    body: rows.slice(1).map(texts),
  };
}

type TableTextPart = Span & { readonly key: string };
type TableTextRow = TableTextPart & {
  readonly cells: readonly TableTextPart[];
};

/** One table written as text, and where each cell lands in it. */
export type WrittenTable = {
  readonly text: string;
  readonly rows: readonly TableTextRow[];
  /** The text range of one cell, as offsets into `text`. */
  readonly cell: (ref: CellRef) => Span;
};

/** The dashes of one delimiter cell, with the colons of its alignment. */
function delimiterCell(align: ColumnAlign, width: number): string {
  if (align === 'left') return `:${'-'.repeat(width - 1)}`;
  if (align === 'right') return `${'-'.repeat(width - 1)}:`;
  if (align === 'center') return `:${'-'.repeat(width - 2)}:`;
  return '-'.repeat(width);
}

/**
 * Writes one table as aligned GFM.
 *
 * Every row has a pipe at each edge, one space of padding on each side of a
 * cell, and every cell of a column is as wide as the widest, at least three,
 * so the delimiter row keeps its dashes. The lines after the first repeat the
 * lead of the table, so a table in a quote stays in the quote.
 */
export function writeTable(data: TableData): WrittenTable {
  const columns = data.alignments.length;
  const rows = [data.header, ...data.body];
  const widths = Array.from({ length: columns }, (_, column) =>
    Math.max(3, ...rows.map((row) => (row[column] ?? '').length)),
  );
  const line = (cells: readonly string[]): string =>
    `|${widths
      .map((width, column) => ` ${(cells[column] ?? '').padEnd(width)} `)
      .join('|')}|`;
  const delimiterCells = widths.map((width, column) =>
    delimiterCell(data.alignments[column] ?? null, width),
  );
  const delimiter = `|${delimiterCells.map((text) => ` ${text} `).join('|')}|`;
  const lines = [line(data.header), delimiter, ...data.body.map(line)];
  const separator = `\n${data.lead}`;
  let offset = 0;
  const writtenRows = lines.map((text, index): TableTextRow => {
    const values =
      index === 1 ? delimiterCells : (rows[index === 0 ? 0 : index - 1] ?? []);
    const from = offset;
    let cellFrom = from + 2;
    const cells = widths.map((width, column): TableTextPart => {
      const value = values[column] ?? '';
      const part = { from: cellFrom, to: cellFrom + value.length, key: value };
      cellFrom += width + 3;
      return part;
    });
    offset += text.length + separator.length;
    return {
      from,
      to: from + text.length,
      key:
        index === 0
          ? 'header'
          : index === 1
            ? 'delimiter'
            : JSON.stringify(cells.map((cell) => cell.key)),
      cells,
    };
  });
  const lineStart = (index: number): number =>
    writtenRows[index]?.from ?? offset;
  return {
    text: lines.join(separator),
    rows: writtenRows,
    cell: ({ row, column }): Span => {
      const from =
        lineStart(row === 0 ? 0 : row + 1) +
        2 +
        widths.slice(0, column).reduce((sum, width) => sum + width + 3, 0);
      const text = rows[row]?.[column] ?? '';
      return { from, to: from + text.length };
    },
  };
}

// Bound each structural search. When many parts change, pair that unmatched
// region in source order. Character searches run only inside those parts.
const tableDiffDistance = 128;

function pairedTableParts<T extends TableTextPart>(
  before: readonly T[],
  after: readonly T[],
): readonly [T, T][] {
  const plan = diffArrays([...before], [...after], {
    comparator: (left, right) => left.key === right.key,
    maxEditLength: tableDiffDistance,
  });
  const pairs: [T, T][] = [];
  const pair = (
    fromA: number,
    toA: number,
    fromB: number,
    toB: number,
  ): void => {
    for (let index = 0; index < Math.min(toA - fromA, toB - fromB); index++) {
      const left = before[fromA + index],
        right = after[fromB + index];
      if (left !== undefined && right !== undefined) pairs.push([left, right]);
    }
  };
  if (plan === undefined) {
    pair(0, before.length, 0, after.length);
    return pairs;
  }
  let oldAt = 0,
    newAt = 0,
    oldPending = 0,
    newPending = 0;
  for (const part of plan) {
    const length = part.value.length;
    if (part.added) newAt += length;
    else if (part.removed) oldAt += length;
    else {
      pair(oldPending, oldAt, newPending, newAt);
      pair(oldAt, oldAt + length, newAt, newAt + length);
      oldAt += length;
      newAt += length;
      oldPending = oldAt;
      newPending = newAt;
    }
  }
  pair(oldPending, before.length, newPending, after.length);
  return pairs;
}

/** Exact changes within one gap or changed cell, never across kept cells. */
function tablePartChanges(
  changes: ChangeSpec[],
  from: number,
  before: string,
  after: string,
): void {
  if (before === after) return;
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before.charCodeAt(prefix) === after.charCodeAt(prefix)
  )
    prefix++;
  // Keep UTF-16 pairs together when only one half matches.
  if (
    prefix > 0 &&
    before.charCodeAt(prefix - 1) >= 0xd800 &&
    before.charCodeAt(prefix - 1) <= 0xdbff &&
    before.charCodeAt(prefix) >= 0xdc00 &&
    before.charCodeAt(prefix) <= 0xdfff
  )
    prefix--;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before.charCodeAt(before.length - suffix - 1) ===
      after.charCodeAt(after.length - suffix - 1)
  )
    suffix++;
  if (
    suffix > 0 &&
    before.charCodeAt(before.length - suffix) >= 0xdc00 &&
    before.charCodeAt(before.length - suffix) <= 0xdfff &&
    before.charCodeAt(before.length - suffix - 1) >= 0xd800 &&
    before.charCodeAt(before.length - suffix - 1) <= 0xdbff
  )
    suffix--;
  const oldText = before.slice(prefix, before.length - suffix);
  const newText = after.slice(prefix, after.length - suffix);
  const start = from + prefix;
  if (oldText === '' || newText === '') {
    changes.push({ from: start, to: start + oldText.length, insert: newText });
    return;
  }
  const parts = diffChars(oldText, newText, {
    maxEditLength: tableDiffDistance,
  });
  if (parts === undefined) {
    changes.push({ from: start, to: start + oldText.length, insert: newText });
    return;
  }
  let at = start;
  for (const part of parts) {
    if (part.added) changes.push({ from: at, insert: part.value });
    else if (part.removed) {
      changes.push({ from: at, to: at + part.value.length });
      at += part.value.length;
    } else at += part.value.length;
  }
}

/** Diff grammar rows and cells before their padding, preserving exact output. */
function tableChanges(
  state: EditorState,
  table: TableBox,
  written: WrittenTable,
): readonly ChangeSpec[] {
  const before = state.doc.sliceString(table.from, table.to),
    after = written.text;
  const columns = Math.max(0, ...table.rows.map((row) => row.cells.length));
  const oldRows = table.rows.map((row): TableTextRow => {
    const cells = row.cells.map((cell): TableTextPart => ({
      from: cell.textFrom - table.from,
      to: cell.textTo - table.from,
      key: state.doc.sliceString(cell.textFrom, cell.textTo),
    }));
    return {
      from: row.from - table.from,
      to: row.to - table.from,
      cells,
      key:
        row.kind === 'header'
          ? 'header'
          : row.kind === 'delimiter'
            ? 'delimiter'
            : JSON.stringify(
                Array.from(
                  { length: columns },
                  (_, column) => cells[column]?.key ?? '',
                ),
              ),
    };
  });
  const changes: ChangeSpec[] = [];
  const gap = (fromA: number, toA: number, fromB: number, toB: number): void =>
    tablePartChanges(
      changes,
      table.from + fromA,
      before.slice(fromA, toA),
      after.slice(fromB, toB),
    );
  let oldAt = 0,
    newAt = 0;
  for (const [oldRow, newRow] of pairedTableParts(oldRows, written.rows)) {
    gap(oldAt, oldRow.from, newAt, newRow.from);
    let oldCellAt = oldRow.from,
      newCellAt = newRow.from;
    for (const [oldCell, newCell] of pairedTableParts(
      oldRow.cells,
      newRow.cells,
    )) {
      gap(oldCellAt, oldCell.from, newCellAt, newCell.from);
      gap(oldCell.from, oldCell.to, newCell.from, newCell.to);
      oldCellAt = oldCell.to;
      newCellAt = newCell.to;
    }
    gap(oldCellAt, oldRow.to, newCellAt, newRow.to);
    oldAt = oldRow.to;
    newAt = newRow.to;
  }
  gap(oldAt, before.length, newAt, after.length);
  return changes;
}

/** What a table command leaves: the new data and the cell it moves to. */
type TableEditResult = {
  readonly data: TableData;
  readonly target: CellRef;
  /** `text` selects the text of the target cell; `end` puts the caret after it. */
  readonly select: 'text' | 'end';
};

/** One table command, as a change of the data at one cell. */
export type TableEdit = (
  data: TableData,
  at: CellRef,
) => TableEditResult | null;

/**
 * The transaction of one table command at the main selection.
 *
 * It runs with `filter: false`, because the command is the one edit that may
 * move a pipe, and the caret it sets is already inside a cell.
 */
function tableCommandSpec(
  state: EditorState,
  edit: TableEdit,
  pos: number = state.selection.main.head,
): TransactionSpec | null {
  const table = tableAt(state, pos);
  if (table === null) return null;
  const at = cellAt(table, pos) ?? { row: 0, column: 0 };
  if (at === null) return null;
  const data = tableData(state, table);
  const result = edit(data, at);
  if (result === null) return null;
  // Moving within existing cells changes selection only. Reformatting here
  // can turn a long table into a large padding diff on every Tab press.
  if (result.data === data) {
    const row = table.rows.filter((row) => row.kind !== 'delimiter')[
      result.target.row
    ];
    const cell = row?.cells[result.target.column];
    if (cell !== undefined && cell.to > cell.from)
      return {
        selection:
          result.select === 'text'
            ? EditorSelection.range(cell.textFrom, cell.textTo)
            : EditorSelection.cursor(cell.textTo),
        filter: false,
      };
  }
  const written = writeTable(result.data);
  const cell = written.cell(result.target);
  const from = table.from + cell.from;
  const to = table.from + cell.to;
  return {
    changes: tableChanges(state, table, written),
    selection:
      result.select === 'text'
        ? EditorSelection.range(from, to)
        : EditorSelection.cursor(to),
    filter: false,
  };
}

/** A body row of empty cells. */
function emptyRow(data: TableData): readonly string[] {
  return data.alignments.map(() => '');
}

/** The data with one more empty body row at body index `index`. */
function withRow(data: TableData, index: number): TableData {
  const body = [...data.body];
  body.splice(index, 0, emptyRow(data));
  return { ...data, body };
}

/** The number of rows a person moves through: the header and the body. */
function rowCount(data: TableData): number {
  return data.body.length + 1;
}

/** Moves to the next cell, and adds a row after the last one. */
export const nextCellEdit: TableEdit = (data, at) => {
  const columns = data.alignments.length;
  if (at.column + 1 < columns)
    return { data, target: { ...at, column: at.column + 1 }, select: 'text' };
  const next = { row: at.row + 1, column: 0 };
  if (next.row < rowCount(data)) return { data, target: next, select: 'text' };
  return {
    data: withRow(data, data.body.length),
    target: next,
    select: 'text',
  };
};

/** Moves to the previous cell. Declines in the first cell. */
export const previousCellEdit: TableEdit = (data, at) => {
  if (at.column > 0)
    return { data, target: { ...at, column: at.column - 1 }, select: 'text' };
  if (at.row === 0) return null;
  return {
    data,
    target: { row: at.row - 1, column: data.alignments.length - 1 },
    select: 'text',
  };
};

/** Moves to the cell below, and adds a row under the last one. */
export const cellBelowEdit: TableEdit = (data, at) => {
  const below = { ...at, row: at.row + 1 };
  if (below.row < rowCount(data)) return { data, target: below, select: 'end' };
  return {
    data: withRow(data, data.body.length),
    target: below,
    select: 'end',
  };
};

/** Moves to the cell above. In the header it stays where it is. */
export const cellAboveEdit: TableEdit = (data, at) => ({
  data,
  target: at.row === 0 ? at : { ...at, row: at.row - 1 },
  select: 'end',
});

/** Adds an empty row under the row of the caret. */
export const addRowEdit: TableEdit = (data, at) => ({
  data: withRow(data, at.row),
  target: { row: at.row + 1, column: at.column },
  select: 'end',
});

/** Removes the body row of the caret. The header row stays. */
export const removeRowEdit: TableEdit = (data, at) => {
  if (at.row === 0) return null;
  const body = data.body.filter((_, index) => index !== at.row - 1);
  return {
    data: { ...data, body },
    target: { row: Math.min(at.row, body.length), column: at.column },
    select: 'end',
  };
};

/** The data with one more empty column at `index`. */
function withColumn(data: TableData, index: number): TableData {
  const insert = <T>(cells: readonly T[], value: T): readonly T[] => [
    ...cells.slice(0, index),
    value,
    ...cells.slice(index),
  ];
  return {
    ...data,
    alignments: insert(data.alignments, null),
    header: insert(data.header, ''),
    body: data.body.map((row) => insert(row, '')),
  };
}

/** Adds an empty column after the column of the caret. */
export const addColumnEdit: TableEdit = (data, at) => ({
  data: withColumn(data, at.column + 1),
  target: { row: 0, column: at.column + 1 },
  select: 'end',
});

/**
 * Adds an empty row at the end of the table, for the add bar under it
 * (record 0147). The caret goes to the first cell of the new row.
 */
export const appendRowEdit: TableEdit = (data) => ({
  data: withRow(data, data.body.length),
  target: { row: data.body.length + 1, column: 0 },
  select: 'end',
});

/**
 * Adds an empty column at the end of the table, for the add bar at its right
 * edge (record 0147). The caret goes to the header cell of the new column.
 */
export const appendColumnEdit: TableEdit = (data) => ({
  data: withColumn(data, data.alignments.length),
  target: { row: 0, column: data.alignments.length },
  select: 'end',
});

/** Adds an empty row over the body row of the caret. The header stays first. */
export const insertRowAboveEdit: TableEdit = (data, at) => {
  if (at.row === 0) return null;
  return {
    data: withRow(data, at.row - 1),
    target: { row: at.row, column: at.column },
    select: 'end',
  };
};

/** Adds an empty column before the column of the caret. */
export const insertColumnLeftEdit: TableEdit = (data, at) => ({
  data: withColumn(data, at.column),
  target: { row: 0, column: at.column },
  select: 'end',
});

/** Sets the alignment of the column of the caret. */
export function alignColumnEdit(align: ColumnAlign): TableEdit {
  return (data, at) => ({
    data: {
      ...data,
      alignments: data.alignments.map((current, column) =>
        column === at.column ? align : current,
      ),
    },
    target: at,
    select: 'end',
  });
}

/** Removes the column of the caret. The last column stays. */
export const removeColumnEdit: TableEdit = (data, at) => {
  const columns = data.alignments.length;
  if (columns <= 1) return null;
  const without = <T>(cells: readonly T[]): readonly T[] =>
    cells.filter((_, index) => index !== at.column);
  return {
    data: {
      ...data,
      alignments: without(data.alignments),
      header: without(data.header),
      body: data.body.map(without),
    },
    target: { row: at.row, column: Math.min(at.column, columns - 2) },
    select: 'end',
  };
};

/**
 * Moves the body row of the caret to body place `to`, where row 1 is the
 * first body row. The header row stays first, because a GFM table has its
 * header at the top.
 */
export function moveRowEdit(to: number): TableEdit {
  return (data, at) => {
    if (at.row === 0 || to < 1 || to > data.body.length || to === at.row)
      return null;
    const body = [...data.body];
    const [row] = body.splice(at.row - 1, 1);
    if (row === undefined) return null;
    body.splice(to - 1, 0, row);
    return {
      data: { ...data, body },
      target: { row: to, column: at.column },
      select: 'end',
    };
  };
}

/** Moves the column of the caret, with its alignment, to column place `to`. */
export function moveColumnEdit(to: number): TableEdit {
  return (data, at) => {
    const columns = data.alignments.length;
    if (to < 0 || to >= columns || to === at.column) return null;
    const move = <T>(cells: readonly T[]): readonly T[] => {
      const next = [...cells];
      const [cell] = next.splice(at.column, 1);
      if (cell === undefined) return cells;
      next.splice(to, 0, cell);
      return next;
    };
    return {
      data: {
        ...data,
        alignments: move(data.alignments),
        header: move(data.header),
        body: data.body.map(move),
      },
      target: { row: at.row, column: to },
      select: 'end',
    };
  };
}

/** Moves the body row of the caret one place up. */
export const moveRowUpEdit: TableEdit = (data, at) =>
  moveRowEdit(at.row - 1)(data, at);

/** Moves the body row of the caret one place down. */
export const moveRowDownEdit: TableEdit = (data, at) =>
  moveRowEdit(at.row + 1)(data, at);

/** Moves the column of the caret one place left. */
export const moveColumnLeftEdit: TableEdit = (data, at) =>
  moveColumnEdit(at.column - 1)(data, at);

/** Moves the column of the caret one place right. */
export const moveColumnRightEdit: TableEdit = (data, at) =>
  moveColumnEdit(at.column + 1)(data, at);

/**
 * The transaction that removes the whole table at `pos`, or null outside a
 * table.
 *
 * Every line of the table goes, with its line break. One blank line beside
 * the table goes as well, so the text before and the text after stand one
 * blank line apart, as they did before the table was written. The caret
 * stands where the table was.
 */
export function deleteTableSpec(
  state: EditorState,
  pos: number = state.selection.main.head,
): TransactionSpec | null {
  const table = tableAt(state, pos);
  if (table === null) return null;
  const doc = state.doc;
  const first = doc.lineAt(table.from);
  const last = doc.lineAt(table.to);
  let from = first.from;
  let to = last.to;
  if (to < doc.length) {
    to += 1;
    const next = doc.lineAt(to);
    if (next.text.trim() === '' && next.to < doc.length) to = next.to + 1;
  } else if (from > 0) {
    from -= 1;
    const previous = doc.lineAt(from);
    if (previous.text.trim() === '' && previous.from > 0)
      from = previous.from - 1;
  }
  return {
    changes: { from, to },
    selection: EditorSelection.cursor(from),
    filter: false,
  };
}

/**
 * The transaction of one table edit, or null outside a table.
 *
 * The edit acts at the main selection, or at `pos` for a control that names
 * its cell, such as the handle of a row.
 */
export function tableEditSpec(
  state: EditorState,
  edit: TableEdit,
  pos?: number,
): TransactionSpec | null {
  return tableCommandSpec(state, edit, pos);
}

/**
 * Where a caret goes that a move put at `pos`.
 *
 * A vertical move and a pointer land in the cell under them, at the edge of
 * its text that is nearest. A move along a line steps from one cell text to
 * the next: out of the last cell of a row into the first cell of the next,
 * and out of the table at its first and its last cell. A move that jumps to
 * the end or the start of a line stops at the last or the first cell of it.
 */
function caretPlace(
  state: EditorState,
  pos: number,
  from: number,
  pointer: boolean,
): number {
  const table = tableAt(state, pos);
  if (table === null) return pos;
  const row = rowAt(table, pos);
  if (row === null) return pos;
  const rows = gridRows(table);
  const inside = (cell: TableCellBox): boolean =>
    pos >= cell.textFrom && pos <= cell.textTo;

  if (row.kind === 'delimiter') {
    const column = columnAt(row, pos);
    const down = pos >= from;
    const header = rows[0];
    const target = down ? (rows[1] ?? header) : header;
    const cell =
      target?.cells[Math.min(column, (target?.cells.length ?? 1) - 1)];
    return cell === undefined ? pos : cell.textTo;
  }
  const cells = row.cells;
  if (cells.length === 0) return pos;
  if (cells.some(inside)) return pos;

  const vertical =
    pointer || state.doc.lineAt(from).number !== state.doc.lineAt(pos).number;
  if (vertical) {
    const cell = cells[columnAt(row, pos)];
    if (cell === undefined) return pos;
    return pos < cell.textFrom ? cell.textFrom : cell.textTo;
  }

  const first = cells[0];
  const last = cells[cells.length - 1];
  if (first === undefined || last === undefined) return pos;
  const index = rows.indexOf(row);
  if (pos > from) {
    const ahead = cells.find((cell) => cell.textFrom >= pos);
    if (ahead !== undefined) return ahead.textFrom;
    if (from !== last.textTo) return last.textTo;
    const next = rows[index + 1]?.cells[0];
    if (next !== undefined) return next.textFrom;
    return table.to < state.doc.length ? table.to + 1 : last.textTo;
  }
  const behind = [...cells].reverse().find((cell) => cell.textTo <= pos);
  if (behind !== undefined) return behind.textTo;
  if (from !== first.textFrom) return first.textFrom;
  const previous = rows[index - 1]?.cells.at(-1);
  if (previous !== undefined) return previous.textTo;
  const start = rows[0]?.lineFrom ?? table.from;
  return start > 0 ? start - 1 : first.textFrom;
}

/** Holds each caret that a move of a person put in a table inside a cell. */
function caretFilter(
  transaction: Transaction,
): TransactionSpec | readonly TransactionSpec[] {
  const selection = transaction.selection;
  if (selection === undefined || !transaction.isUserEvent('select'))
    return transaction;
  const before = transaction.startState.selection;
  const pointer = transaction.isUserEvent('select.pointer');
  let moved = false;
  const ranges = selection.ranges.map((range, index) => {
    if (!range.empty) return range;
    const from = (before.ranges[index] ?? before.main).head;
    const place = caretPlace(transaction.state, range.head, from, pointer);
    if (place === range.head) return range;
    moved = true;
    return EditorSelection.cursor(place);
  });
  if (!moved) return transaction;
  return [
    transaction,
    {
      selection: EditorSelection.create(ranges, selection.mainIndex),
      sequential: true,
    },
  ];
}

/**
 * The text a person writes into a cell, made to stay in that cell.
 *
 * A pipe that no backslash escapes would start a new cell, so it gets one. A
 * line break would end the row, so it becomes a space.
 */
export function cellText(text: string, escaped: boolean): string {
  let out = '';
  let previousBackslash = escaped;
  for (const char of text.replaceAll(/\r?\n/g, ' ')) {
    out += char === '|' && !previousBackslash ? '\\|' : char;
    previousBackslash = char === '\\' && !previousBackslash;
  }
  return out;
}

/** A delimiter row of a pasted table, which states no cell of its own. */
const pastedDelimiterRow = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** The cells of one pasted line: tab separated, or pipe separated. */
function pastedLine(line: string): readonly string[] {
  if (line.includes('\t')) return line.split('\t').map((cell) => cell.trim());
  const cells: string[] = [];
  let cell = '';
  let escaped = false;
  for (const char of line) {
    if (char === '|' && !escaped) {
      cells.push(cell);
      cell = '';
    } else cell += char;
    escaped = char === '\\' && !escaped;
  }
  cells.push(cell);
  // The pipes at the edges of a row start and end it and hold no cell.
  const trimmed = line.trim();
  if (trimmed.startsWith('|') && cells.length > 1) cells.shift();
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|') && cells.length > 1)
    cells.pop();
  return cells.map((text) => text.trim());
}

/**
 * The rows of cells that pasted text holds, or null for the text of one cell.
 *
 * Text holds cells when it has a tab or a pipe that no backslash escapes.
 * That is a row copied from a table of a note, a whole table, and a range
 * copied from a spreadsheet, which separates its cells with tabs. Plain text
 * with line breaks holds no cells: it is text for the one cell, and its lines
 * join there. The delimiter row of a pasted table is left out, because the
 * columns of the table it lands in already have one.
 */
export function pastedCells(
  text: string,
): readonly (readonly string[])[] | null {
  const lines = text
    .replaceAll(/\r\n?/g, '\n')
    .replace(/\n+$/, '')
    .split('\n')
    .filter((line) => !pastedDelimiterRow.test(line) || !line.includes('-'));
  const rows = lines.map(pastedLine);
  if (!rows.some((row) => row.length > 1)) return null;
  return rows;
}

/**
 * Writes pasted rows of cells into a table from one cell to the right and
 * down, as a spreadsheet pastes a range. The table grows by the rows and the
 * columns the paste needs, and the caret stands after the last cell written.
 */
function pasteIntoTable(
  data: TableData,
  at: CellRef,
  cells: readonly (readonly string[])[],
): { readonly data: TableData; readonly target: CellRef } {
  const width = Math.max(...cells.map((row) => row.length));
  const columns = Math.max(data.alignments.length, at.column + width);
  const rows = [data.header, ...data.body].map((row) =>
    Array.from({ length: columns }, (_, column) => row[column] ?? ''),
  );
  while (rows.length < at.row + cells.length)
    rows.push(Array.from({ length: columns }, () => ''));
  cells.forEach((row, offset) => {
    const target = rows[at.row + offset];
    if (target === undefined) return;
    row.forEach((text, column) => {
      target[at.column + column] = cellText(text, false);
    });
  });
  const last = cells[cells.length - 1] ?? [];
  return {
    data: {
      ...data,
      alignments: Array.from(
        { length: columns },
        (_, column) => data.alignments[column] ?? null,
      ),
      header: rows[0] ?? data.header,
      body: rows.slice(1),
    },
    target: {
      row: at.row + cells.length - 1,
      column: at.column + Math.max(0, last.length - 1),
    },
  };
}

/** One change of a transaction, in the start document. */
type EditChange = {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
};

/** The first line and the end of one table: the range its structure holds. */
function tableRegion(table: TableBox): Span {
  return { from: table.rows[0]?.lineFrom ?? table.from, to: table.to };
}

/** Whether a change stays inside the text of one cell and keeps it a cell. */
function changeInCellText(
  state: EditorState,
  table: TableBox,
  change: EditChange,
): boolean {
  const cell = gridRows(table)
    .flatMap((row) => row.cells)
    .find((box) => change.from >= box.textFrom && change.to <= box.textTo);
  if (cell === undefined) return false;
  const escaped = state.doc.sliceString(change.from - 1, change.from) === '\\';
  if (cellText(change.insert, escaped) !== change.insert) return false;
  // A cell that loses every character between its separators has no width,
  // and the parser no longer reads it as a cell.
  return (
    cell.to - cell.from - (change.to - change.from) + change.insert.length > 0
  );
}

/** The cell of a grid row that a position belongs to, for an insertion. */
function ownerCell(
  table: TableBox,
  pos: number,
): { readonly ref: CellRef; readonly cell: TableCellBox } | null {
  const rows = gridRows(table);
  const row = rowAt(table, pos);
  if (row === null || row.kind === 'delimiter' || row.cells.length === 0)
    return null;
  const column = columnAt(row, pos);
  const cell = row.cells[column];
  if (cell === undefined) return null;
  return { ref: { row: rows.indexOf(row), column }, cell };
}

/** The text of a cell without the one space of padding at each side. */
function innerRange(state: EditorState, cell: TableCellBox): Span {
  const from =
    state.doc.sliceString(cell.from, cell.from + 1) === ' '
      ? cell.from + 1
      : cell.from;
  const to =
    cell.to > from && state.doc.sliceString(cell.to - 1, cell.to) === ' '
      ? cell.to - 1
      : cell.to;
  return { from, to: Math.max(from, to) };
}

/** The edit of one table, as new cell texts and the place of the caret. */
type TableRewrite = {
  readonly data: TableData;
  /** The cell and the offset in its new text where the caret stands. */
  readonly caret: { readonly ref: CellRef; readonly offset: number } | null;
};

/**
 * The new text of every cell after changes that touch the structure.
 *
 * A change deletes the text of each cell it covers and nothing else, so the
 * rows and the columns of the table stay. Its insertion lands in the cell of
 * its start. The caret follows the main change.
 */
function rewriteCells(
  state: EditorState,
  table: TableBox,
  changes: readonly EditChange[],
  main: EditChange | null,
): TableRewrite {
  const data = tableData(state, table);
  const rows = gridRows(table);
  let caret: TableRewrite['caret'] = null;
  const texts = rows.map((row, rowIndex) =>
    data.alignments.map((_, column) => {
      const cell = row.cells[column];
      if (cell === undefined) return '';
      // The text of a cell for an edit is all of it but the one space of
      // padding at each side, so a space that a person just typed at the end
      // of the text stays text.
      const inner = innerRange(state, cell);
      let out = '';
      let at = inner.from;
      for (const change of changes) {
        const owner = ownerCell(table, change.from);
        const owns =
          owner !== null &&
          owner.ref.row === rowIndex &&
          owner.ref.column === column;
        const deletes = change.to > inner.from && change.from < inner.to;
        if (!owns && !deletes) continue;
        const from = Math.min(Math.max(change.from, inner.from), inner.to);
        const to = Math.min(Math.max(change.to, inner.from), inner.to);
        if (from > at) {
          out += state.doc.sliceString(at, from);
          at = from;
        }
        if (owns) out += cellText(change.insert, out.endsWith('\\'));
        if (owns && change === main)
          caret = { ref: { row: rowIndex, column }, offset: out.length };
        at = Math.max(at, to);
      }
      out += state.doc.sliceString(at, inner.to);
      // Spaces at either end are padding and not text of the cell.
      if (
        caret !== null &&
        caret.ref.row === rowIndex &&
        caret.ref.column === column
      )
        caret = {
          ...caret,
          offset: Math.min(
            Math.max(0, caret.offset - (out.length - out.trimStart().length)),
            out.trim().length,
          ),
        };
      return out.trim();
    }),
  );
  return {
    data: { ...data, header: texts[0] ?? data.header, body: texts.slice(1) },
    caret,
  };
}

/**
 * The line breaks that keep a blank line under each table.
 *
 * GFM reads a line of text right under a table as one more row of it. An
 * edit that removes the blank line under a table, or writes on it, would so
 * add a row that nobody asked for. Each table that had a blank line under it
 * keeps one: a line break goes back before the text. The positions are in
 * the document after `changes`.
 */
function blankLinesKept(
  start: EditorState,
  tables: readonly TableBox[],
  changes: ChangeSet,
): ChangeSet {
  const doc = changes.apply(start.doc);
  const breaks: number[] = [];
  for (const table of tables) {
    const last = start.doc.lineAt(table.to);
    if (last.number === start.doc.lines) continue;
    if (start.doc.line(last.number + 1).text.trim() !== '') continue;
    // A table that the edit removed has no line under it to keep.
    const end = changes.mapPos(table.to, 1);
    if (changes.mapPos(tableRegion(table).from, 1) >= end) continue;
    const line = doc.lineAt(end);
    if (line.number === doc.lines) continue;
    const next = doc.line(line.number + 1);
    if (next.text.trim() !== '') breaks.push(next.from);
  }
  return ChangeSet.of(
    breaks.map((at) => ({ from: at, insert: '\n' })),
    doc.length,
  );
}

/**
 * Keeps the structure of every table under the edit of a person.
 *
 * An edit inside the text of one cell passes as it is. An edit that reaches
 * the padding, a separator, a line break of the table, the delimiter row, or
 * more than one cell is expressed on the model instead: the text of the cells
 * it covers changes, and the table is written again. A backspace can
 * therefore empty a cell and never remove it, and a selection across cells
 * clears them and keeps every row and column. Only a table command adds or
 * removes a row or a column (record 0096).
 *
 * A change that covers a whole table removes it, as a person expects. The
 * part of a change that lies outside a table applies as it is, except the line
 * break that separates the table from the text beside it, which stays.
 */
function tableEditFilter(
  transaction: Transaction,
): TransactionSpec | readonly TransactionSpec[] {
  if (!isEditOfAPerson(transaction) || transaction.changes.empty)
    return transaction;
  const start = transaction.startState;
  const all: EditChange[] = [];
  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    all.push({ from: fromA, to: toA, insert: inserted.toString() });
  });
  const low = Math.min(...all.map((change) => change.from));
  const high = Math.max(...all.map((change) => change.to));
  const tables = tablesIn(start, Math.max(0, low - 1), high);
  if (tables.length === 0) return transaction;

  const head = start.selection.main.head;
  const mainChange =
    all.find((change) => head >= change.from && head <= change.to) ??
    all[0] ??
    null;
  // Typing with several carets writes into the cell of the main one alone, as
  // a spreadsheet writes into the active cell.
  const typing = transaction.isUserEvent('input.type') && all.length > 1;

  const kept: EditChange[] = [];
  const rewrites = new Map<TableBox, EditChange[]>();
  for (const change of all) {
    if (typing && change !== mainChange) continue;
    const table = tables.find((candidate) => {
      const region = tableRegion(candidate);
      return change.to >= region.from && change.from <= region.to;
    });
    if (table === undefined) {
      kept.push(change);
      continue;
    }
    const region = tableRegion(table);
    if (
      change.from <= region.from &&
      change.to >= region.to &&
      change.to > change.from
    ) {
      kept.push(change);
      continue;
    }
    if (change.from < region.from) {
      // Keep the line break before the table, so no text joins its header.
      const to = Math.max(change.from, region.from - 1);
      kept.push({ from: change.from, to, insert: change.insert });
      const inside = { from: region.from, to: change.to, insert: '' };
      rewrites.set(table, [...(rewrites.get(table) ?? []), inside]);
      continue;
    }
    if (change.to > region.to) {
      // Keep the line break after the table, so no text joins its last row.
      const inside = {
        from: change.from,
        to: region.to,
        insert: change.insert,
      };
      rewrites.set(table, [...(rewrites.get(table) ?? []), inside]);
      const from = Math.min(change.to, region.to + 1);
      if (change.to > from) kept.push({ from, to: change.to, insert: '' });
      continue;
    }
    rewrites.set(table, [...(rewrites.get(table) ?? []), change]);
  }

  // The common case: every change of every table stays inside the text of
  // one cell, so nothing is rewritten.
  const plain = [...rewrites].every(([table, changes]) =>
    changes.every((change) => changeInCellText(start, table, change)),
  );
  const userEvent = transaction.annotation(Transaction.userEvent);
  if (
    plain &&
    !typing &&
    kept.length + [...rewrites.values()].flat().length === all.length
  ) {
    const breaks = blankLinesKept(start, tables, transaction.changes);
    if (breaks.empty) return transaction;
    // The caret stays before the line break that comes back, so a Backspace
    // at the start of the text under a table lands on the blank line.
    return {
      changes: transaction.changes.compose(breaks),
      selection: transaction.newSelection.map(breaks, -1),
      ...(userEvent === undefined ? {} : { userEvent }),
      scrollIntoView: transaction.scrollIntoView,
    };
  }

  const specs: ChangeSpec[] = [...kept];
  // Where the caret lands: an offset from the start of its table, which the
  // changes before the table then move.
  let caret: { readonly tableFrom: number; readonly offset: number } | null =
    null;
  for (const [table, changes] of rewrites) {
    // The caret follows the main change into the table only when that change
    // starts in the table. A change from the text above keeps its caret in
    // that text.
    const main =
      mainChange !== null && mainChange.from >= tableRegion(table).from
        ? changes.find(
            (change) =>
              change.from >= mainChange.from && change.to <= mainChange.to,
          )
        : undefined;
    // A paste of rows of cells fills the cells from the cell of the caret,
    // as a spreadsheet pastes a range. Its own text then takes no part in the
    // rewrite of the cells it covers.
    const cells =
      main !== undefined && transaction.isUserEvent('input.paste')
        ? pastedCells(main.insert)
        : null;
    const owner = main === undefined ? null : ownerCell(table, main.from);
    const grid = cells !== null && owner !== null ? cells : null;
    const rewrite = rewriteCells(
      start,
      table,
      grid === null
        ? changes
        : changes.map((change) =>
            change === main ? { ...change, insert: '' } : change,
          ),
      grid === null ? (main ?? null) : null,
    );
    if (grid !== null && owner !== null) {
      const pasted = pasteIntoTable(rewrite.data, owner.ref, grid);
      const written = writeTable(pasted.data);
      specs.push(...tableChanges(start, table, written));
      caret = { tableFrom: table.from, offset: written.cell(pasted.target).to };
      continue;
    }
    const written = writeTable(rewrite.data);
    specs.push(...tableChanges(start, table, written));
    if (rewrite.caret !== null)
      caret = {
        tableFrom: table.from,
        offset: written.cell(rewrite.caret.ref).from + rewrite.caret.offset,
      };
  }
  const rewritten = start.changes(specs);
  const set = rewritten.compose(blankLinesKept(start, tables, rewritten));
  return {
    changes: set,
    // A caret in a rewritten table stands where the model put it. The start
    // of the table moves with the changes before it, and those are all kept
    // changes outside it, so the start maps with them. A caret outside every
    // table stands where the main change ends.
    selection:
      caret === null
        ? mainChange === null
          ? start.selection.map(set, 1)
          : EditorSelection.create([
              EditorSelection.cursor(set.mapPos(mainChange.from, 1)),
            ])
        : EditorSelection.create([
            EditorSelection.cursor(
              set.mapPos(caret.tableFrom, -1) + caret.offset,
            ),
          ]),
    ...(userEvent === undefined ? {} : { userEvent }),
    scrollIntoView: transaction.scrollIntoView,
  };
}

/**
 * Where the caret of a state stands in a table, for the formatting row.
 *
 * `table` is true in a cell. `bodyRow` is true in a row that can be removed,
 * which the header is not, and `columns` counts the columns of the table, so
 * the last one is never offered for removal.
 */
export type TableContext = {
  readonly table: boolean;
  readonly bodyRow: boolean;
  /** The row of the cell, where 0 is the header, and the count of rows. */
  readonly row: number;
  readonly rows: number;
  /** The column of the cell, and the count of columns. */
  readonly column: number;
  readonly columns: number;
  /** The alignment of the column, which a menu marks as the one in force. */
  readonly align: ColumnAlign;
};

/** The table context of a caret outside every table. */
export const outsideTable: TableContext = {
  table: false,
  bodyRow: false,
  row: 0,
  rows: 0,
  column: 0,
  columns: 0,
  align: null,
};

/** The table context of one position of a state. */
export function tableContextAt(state: EditorState, pos: number): TableContext {
  if (!inTableCell(state, pos)) return outsideTable;
  const table = tableAt(state, pos);
  const cell = table === null ? null : cellAt(table, pos);
  if (table === null || cell === null) return outsideTable;
  const data = tableData(state, table);
  return {
    table: true,
    bodyRow: cell.row > 0,
    row: cell.row,
    rows: data.body.length + 1,
    column: cell.column,
    columns: data.alignments.length,
    align: data.alignments[cell.column] ?? null,
  };
}

/** What the grid adds to the view of the tables it can see. */
type GridParts = {
  readonly wrappers: ReturnType<typeof BlockWrapper.set>;
  readonly atomic: DecorationSet;
};

type TableLayout = {
  readonly columns: number;
  readonly tracks: string;
  readonly rules: string;
};

/** Read all source rows with an injected text measurement. */
export function tableColumnWidths(
  state: EditorState,
  table: TableBox,
  measure: (text: string, header: boolean) => number,
): readonly number[] {
  const columns =
    table.rows.find((row) => row.kind === 'delimiter')?.cells.length ?? 0;
  const widths = Array.from({ length: columns }, () => 0);
  for (const row of table.rows) {
    if (row.kind === 'delimiter') continue;
    row.cells.slice(0, columns).forEach((cell, column) => {
      const text = contentText(state, cell.textFrom, cell.textTo, true);
      widths[column] = Math.max(
        widths[column] ?? 0,
        measure(text, row.kind === 'header'),
      );
    });
  }
  return widths;
}

/** Fixed pixel tracks and the borders of omitted trailing cells. */
function tableLayout(widths: readonly number[]): TableLayout {
  let total = 0;
  return {
    columns: widths.length,
    tracks: widths.map((width) => `${String(width)}px`).join(' '),
    rules:
      widths
        .slice(0, -1)
        .map((width) => {
          total += width;
          return `linear-gradient(to right, transparent ${String(total - 1)}px, var(--notes-border-line) ${String(total - 1)}px, var(--notes-border-line) ${String(total)}px, transparent ${String(total)}px)`;
        })
        .join(', ') || 'none',
  };
}

/** The ranges that a caret and a deletion treat as one unit. */
const atomicMark = Decoration.mark({});

/**
 * The wrappers and the atomic ranges of every table in the visible ranges.
 *
 * A wrapper runs from the start of the first line of a table to its end, so
 * the rows of a table in a quote are wrapped with their quote marks. The pipes
 * and the delimiter row are atomic, so an arrow key steps over them.
 */
export function gridParts(
  state: EditorState,
  ranges: readonly Span[],
  layouts: ReadonlyMap<number, TableLayout> = new Map(),
  identity?: (table: TableBox) => string,
): GridParts {
  const wrappers: Range<BlockWrapper>[] = [];
  const atomic: Range<Decoration>[] = [];
  const seen = new Set<number>();
  for (const range of ranges)
    for (const table of tablesIn(state, range.from, range.to)) {
      if (seen.has(table.from)) continue;
      seen.add(table.from);
      const start = table.rows[0]?.lineFrom ?? table.from;
      const measured = layouts.get(table.from);
      const columns =
        table.rows.find((row) => row.kind === 'delimiter')?.cells.length ?? 0;
      const layout = measured?.columns === columns ? measured : undefined;
      wrappers.push(
        BlockWrapper.create({
          tagName: 'div',
          attributes: {
            class: 'cm-np-table',
            ...(identity === undefined
              ? {}
              : { 'data-notes-table': identity(table) }),
            style:
              layout === undefined
                ? `--notes-table-columns: repeat(${String(columns)}, var(--container-table-cell-min)); --notes-table-rules: none`
                : `--notes-table-columns: ${layout.tracks}; --notes-table-rules: ${layout.rules}`,
          },
        }).range(start, table.to),
      );
      for (const row of table.rows) {
        if (row.kind === 'delimiter') {
          if (row.to > row.from)
            atomic.push(atomicMark.range(row.from, row.to));
          continue;
        }
        for (const pipe of row.pipes)
          atomic.push(atomicMark.range(pipe.from, pipe.to));
      }
    }
  return {
    wrappers: BlockWrapper.set(wrappers, true),
    atomic: Decoration.set(atomic, true),
  };
}

const tableWords = new Intl.Segmenter(undefined, {
  granularity: 'word',
});

const measuredTables = StateEffect.define<ReadonlyMap<number, TableLayout>>();

/**
 * The horizontal extent of the text that a range renders in one table.
 *
 * Both ends must be rendered inside `wrapper`, so a range that leaves the
 * table, or one that is not drawn yet, has no extent. Only the text nodes
 * of the range count, each clamped to the range: the box of a cell or a
 * row that the range covers whole is wider than its text, and the padding
 * or the empty width of a column is not part of a match. The walk starts
 * at the first node of the range and stops after its last, so it reads the
 * rendered nodes of the match alone. `start` is the left edge of the first
 * text in document order, where the match starts.
 */
function renderedExtent(
  view: EditorView,
  wrapper: HTMLElement,
  anchor: number,
  head: number,
): {
  readonly left: number;
  readonly right: number;
  readonly start: number;
  readonly top: number;
  readonly bottom: number;
  /** The document position where the highest text of the range starts. */
  readonly topPos: number;
  /** The document position where the lowest text of the range ends. */
  readonly bottomPos: number;
} | null {
  const from = Math.min(anchor, head);
  const to = Math.max(anchor, head);
  const first = view.domAtPos(from, 1);
  const last = view.domAtPos(to, -1);
  if (!wrapper.contains(first.node) || !wrapper.contains(last.node))
    return null;
  const doc = view.dom.ownerDocument;
  const range = doc.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset);
  const walker = doc.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
  );
  // An element offset is a child index. Skip all preceding child subtrees.
  const child = range.startContainer.childNodes[range.startOffset];
  walker.currentNode = child ?? range.startContainer;
  let node: Node | null = walker.currentNode;
  if (node.nodeType !== Node.TEXT_NODE)
    node = child ? walker.nextNode() : walker.nextSibling();
  const part = doc.createRange();
  let left = Infinity;
  let right = -Infinity;
  let start = Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  let topPos = from;
  let bottomPos = to;
  for (; node !== null; node = walker.nextNode()) {
    if (range.comparePoint(node, 0) > 0) break;
    if (!(node instanceof Text) || !range.intersectsNode(node)) continue;
    const startOffset = node === range.startContainer ? range.startOffset : 0;
    const endOffset =
      node === range.endContainer ? range.endOffset : node.length;
    part.setStart(node, startOffset);
    part.setEnd(node, endOffset);
    for (const rect of part.getClientRects()) {
      if (rect.bottom <= rect.top) continue;
      if (start === Infinity) start = rect.left;
      left = Math.min(left, rect.left);
      right = Math.max(right, rect.right);
      // A text node that wraps draws its first line highest and its last
      // line lowest, so its start and its end are the positions to show.
      if (rect.top < top) {
        top = rect.top;
        topPos = view.posAtDOM(node, startOffset);
      }
      if (rect.bottom > bottom) {
        bottom = rect.bottom;
        bottomPos = view.posAtDOM(node, endOffset);
      }
    }
  }
  return left <= right
    ? { left, right, start, top, bottom, topPos, bottomPos }
    : null;
}

/**
 * Whether a transaction moved the selection to one match of Find.
 *
 * Find keeps the focus in its own field, so the reveal below cannot wait for
 * the focus of the text. Selecting every match and replacing every match
 * name no single match, so neither moves a table.
 */
function selectsSearchMatch(transaction: Transaction): boolean {
  return (
    (transaction.isUserEvent('select.search') &&
      !transaction.isUserEvent('select.search.matches')) ||
    (transaction.isUserEvent('input.replace') &&
      !transaction.isUserEvent('input.replace.all'))
  );
}

/**
 * Reveal only the active table after input and its column measurement.
 *
 * A match that Find selects is revealed whole in its own table, even while
 * the focus is in the find field: the Replace button acts on that match, so
 * a person must see it. Every other table keeps its own offset.
 */
class TableCaretReveal {
  private readonly view: EditorView;
  private pendingDoc: EditorState['doc'] | null = null;
  private pendingSearch = false;
  private sequence = 0;
  // A match of Find far down the note has no table yet when the text first
  // scrolls to it, and a new table takes its remembered offset when it
  // renders. The reveal tries again after each render of the grid, four
  // times at most, and a person who acts ends the tries.
  private searchRetry = -1;
  private searchTries = 0;
  private alive = true;

  constructor(view: EditorView) {
    this.view = view;
  }

  destroy(): void {
    this.alive = false;
    this.sequence++;
  }

  update(update: ViewUpdate): void {
    const local = update.transactions.some(
      (transaction) =>
        transaction.isUserEvent('input') ||
        transaction.isUserEvent('undo') ||
        transaction.isUserEvent('redo'),
    );
    const search = update.transactions.some(selectsSearchMatch);
    if (update.docChanged) {
      this.sequence++;
      this.pendingDoc =
        local && inTableCell(update.state, update.state.selection.main.head)
          ? update.state.doc
          : null;
      this.pendingSearch = search;
      return;
    }
    if (
      (update.focusChanged || update.selectionSet || local) &&
      this.pendingDoc !== update.state.doc
    )
      this.schedule(search);
  }

  columnsReady(): void {
    if (this.pendingDoc === this.view.state.doc) {
      this.pendingDoc = null;
      this.schedule(this.pendingSearch);
      return;
    }
    if (this.searchRetry === this.sequence && this.searchTries < 4) {
      this.searchTries++;
      this.schedule(true, true);
    }
  }

  cancel(): void {
    this.pendingDoc = null;
    this.sequence++;
  }

  private schedule(search = false, retry = false): void {
    const sequence = ++this.sequence;
    if (search) {
      this.searchRetry = sequence;
      if (!retry) this.searchTries = 0;
    }
    this.view.requestMeasure({
      key: this,
      read: (view) => {
        if (sequence !== this.sequence || (!view.hasFocus && !search))
          return null;
        const { head, anchor } = view.state.selection.main;
        const table = tableAt(view.state, head);
        const at = table === null ? null : cellAt(table, head);
        if (table === null || at === null) return null;
        const vertical = search ? this.hiddenHead(view) : null;
        const horizontal = this.horizontal(
          view,
          table,
          at,
          head,
          anchor,
          search,
        );
        return horizontal === null && vertical === null
          ? null
          : { horizontal, vertical };
      },
      write: (result) => {
        if (sequence !== this.sequence || result === null) return;
        // A table that renders in this pass takes its remembered offset in
        // a later write of the grid, so a match that shows now can hide
        // then. The reveal keeps its few tries after a render, and a person
        // who acts ends them.
        const horizontal = result.horizontal;
        if (horizontal !== null && horizontal.delta !== 0) {
          horizontal.wrapper.scrollLeft += horizontal.delta;
          this.view.requestMeasure();
        }
        if (result.vertical !== null && this.searchRetry === sequence)
          this.scrollTo(sequence, result.vertical);
      },
    });
  }

  /**
   * The scroll target of a match of Find whose head is out of view, or
   * `null` when it shows.
   *
   * The grid measures its columns after the text scrolled to the match, and
   * a row can then grow or shrink under it. The head of the match, moved off
   * hidden syntax, is measured again here, inside the editor, the visible
   * area and the margins of the editor, such as the floating find card.
   */
  private hiddenHead(view: EditorView): SelectionRange | null {
    const selection = view.state.selection.main;
    const target = measurableRange(view.state, selection);
    const side = target.head > target.anchor ? -1 : 1;
    const caret =
      view.coordsAtPos(target.head, side) ??
      view.coordsAtPos(target.head, side === 1 ? -1 : 1);
    // A head that is not drawn yet is out of view: the editor draws it when
    // it scrolls there.
    if (caret === null) return target;
    if (caret.bottom <= caret.top) return null;
    let marginTop = 0;
    let marginBottom = 0;
    for (const source of view.state.facet(EditorView.scrollMargins)) {
      const margins = source(view);
      marginTop = Math.max(marginTop, margins?.top ?? 0);
      marginBottom = Math.max(marginBottom, margins?.bottom ?? 0);
    }
    const scroller = view.scrollDOM.getBoundingClientRect();
    const screen = readVisibleArea();
    const top = Math.max(scroller.top, screen.top) + marginTop;
    const bottom = Math.min(scroller.bottom, screen.bottom) - marginBottom;
    // A match that fits the room shows all of its text, also the lines that
    // wrap between its ends, which the caret of an end does not cover. A
    // taller match keeps the rule of the editor: its head shows.
    const extent = selection.empty
      ? null
      : renderedExtent(view, view.contentDOM, selection.anchor, selection.head);
    if (extent !== null && extent.bottom - extent.top <= bottom - top)
      return extent.top < top || extent.bottom > bottom
        ? EditorSelection.range(extent.topPos, extent.bottomPos)
        : null;
    return caret.top < top || caret.bottom > bottom ? target : null;
  }

  /**
   * Scrolls to `target` once, after the update that measured it.
   *
   * The editor allows no update inside a measure, so the scroll goes out in
   * a microtask. It goes only when nothing moved since: the same try, text,
   * selection and query, and a view that still stands. The editor then
   * scrolls by its own rules, on both axes and in every box that scrolls.
   * Only Find asks for this, with the nearest alignment.
   */
  private scrollTo(sequence: number, target: SelectionRange): void {
    const state = this.view.state;
    const query = getSearchQuery(state);
    queueMicrotask(() => {
      const now = this.view.state;
      if (
        !this.alive ||
        sequence !== this.sequence ||
        now.doc !== state.doc ||
        !now.selection.eq(state.selection) ||
        !getSearchQuery(now).eq(query)
      )
        return;
      this.view.dispatch({
        effects: EditorView.scrollIntoView(target, { y: 'nearest' }),
      });
    });
  }

  /** The horizontal reveal of the active table, or `null`. */
  private horizontal(
    view: EditorView,
    table: TableBox,
    at: CellRef,
    head: number,
    anchor: number,
    search: boolean,
  ): { readonly wrapper: HTMLElement; readonly delta: number } | null {
    const row = table.rows.filter((row) => row.kind !== 'delimiter')[at.row];
    const cell = row?.cells[at.column];
    if (row === undefined || cell === undefined) return null;
    const node = view.domAtPos(row.lineFrom).node;
    const element = node instanceof Element ? node : node.parentElement;
    const line = element?.closest('.cm-np-table-line');
    if (
      !(line instanceof HTMLElement) ||
      view.posAtDOM(line, 0) !== row.lineFrom
    )
      return null;
    const cellElement = Array.from(
      line.querySelectorAll('.cm-np-table-cell, .cm-np-table-head'),
    ).find(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element.style.gridColumnStart === String(at.column + 2),
    );
    const wrapper = line.closest('.cm-np-table');
    if (!(wrapper instanceof HTMLElement) || cellElement === undefined)
      return null;
    let caret = view.coordsAtPos(head);
    if (caret === null || caret.bottom <= caret.top)
      caret = view.coordsAtPos(head, -1);
    let left: number;
    let right: number;
    let start: number;
    // A match of Find is revealed by the text that it renders in this
    // table, in one cell or across cells and rows. A match that ends in
    // another table, or that is not rendered yet, reveals its head, as
    // the caret does.
    const extent =
      search && anchor !== head
        ? renderedExtent(view, wrapper, anchor, head)
        : null;
    if (extent !== null) {
      left = extent.left;
      right = extent.right;
      start = extent.start;
    } else if (caret !== null && caret.bottom > caret.top) {
      left = caret.left;
      right = caret.right;
      start = left;
    } else {
      // Hidden syntax can have no caret rectangle. Only an empty cell
      // can use its uniquely mapped content edge as a view-only anchor.
      if (cell.textFrom !== cell.textTo) return null;
      const style = getComputedStyle(cellElement);
      left =
        cellElement.getBoundingClientRect().left +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.paddingLeft);
      right = left;
      start = left;
    }
    const bounds = wrapper.getBoundingClientRect();
    const margin = view.defaultCharacterWidth;
    // A match that fits shows whole. A wider match shows where it
    // starts, a margin from the left edge, so its first words read in
    // place.
    const delta =
      right - left > bounds.width - 2 * margin
        ? start - bounds.left - margin
        : left < bounds.left
          ? left - bounds.left - margin
          : right > bounds.right
            ? right - bounds.right + margin
            : 0;
    return { wrapper, delta };
  }
}

const tableCaretView = ViewPlugin.fromClass(TableCaretReveal, {
  eventHandlers: {
    pointerdown() {
      this.cancel();
      return false;
    },
    wheel() {
      this.cancel();
      return false;
    },
    touchmove() {
      this.cancel();
      return false;
    },
  },
});

/** Measures text with the loaded editor fonts, independently of visible rows. */
const gridView = ViewPlugin.fromClass(
  class {
    parts: GridParts;
    private layouts: ReadonlyMap<number, TableLayout> = new Map();
    private readonly tables = new TableScrollRecords();
    private readonly scrollKey = {};
    private readonly rememberScroll = (event: Event): void => {
      const element = event.target;
      if (!(element instanceof HTMLElement) || !element.matches('.cm-np-table'))
        return;
      const record = this.tables.get(
        element.getAttribute('data-notes-table') ?? '',
      );
      if (record?.element === element && !record.needsRestore)
        record.left = element.scrollLeft;
    };
    private readonly manualScroll = (event: Event): void => {
      const element =
        event.target instanceof Element
          ? event.target.closest('.cm-np-table')
          : null;
      if (!(element instanceof HTMLElement)) return;
      const record = this.tables.get(
        element.getAttribute('data-notes-table') ?? '',
      );
      if (record === undefined) return;
      record.element = element;
      record.left = element.scrollLeft;
      record.needsRestore = false;
    };
    private readonly widths = new Map<string, number>();
    private readonly context: CanvasRenderingContext2D | null;
    private alive = true;
    private readonly fontsChanged = (): void => {
      this.widths.clear();
      if (this.alive) this.schedule();
    };

    private readonly view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      this.context = view.dom.ownerDocument
        .createElement('canvas')
        .getContext('2d');
      this.parts = gridParts(
        view.state,
        view.visibleRanges,
        this.layouts,
        (table) => this.tables.register(table),
      );
      view.contentDOM.addEventListener('scroll', this.rememberScroll, true);
      for (const name of ['pointerdown', 'wheel', 'touchmove'])
        view.contentDOM.addEventListener(name, this.manualScroll, {
          capture: true,
          passive: true,
        });
      view.dom.ownerDocument.fonts.addEventListener(
        'loadingdone',
        this.fontsChanged,
      );
      void view.dom.ownerDocument.fonts.ready.then(this.fontsChanged);
      this.schedule();
    }

    update(update: ViewUpdate): void {
      if (update.docChanged) {
        for (const element of update.view.contentDOM.querySelectorAll(
          '.cm-np-table',
        )) {
          if (!(element instanceof HTMLElement)) continue;
          const record = this.tables.get(
            element.getAttribute('data-notes-table') ?? '',
          );
          if (record === undefined) continue;
          if (record.element === element && !record.needsRestore)
            record.left = element.scrollLeft;
          record.needsRestore = true;
        }
        const ids = new Map(
          Array.from(this.tables.values(), (record) => [
            record.from,
            record.id,
          ]),
        );
        const tree = syntaxTree(update.state);
        this.tables.map(update.changes, (from) => {
          const line = update.state.doc.lineAt(from);
          const delimiterEnd = update.state.doc.line(
            Math.min(line.number + 1, update.state.doc.lines),
          ).to;
          if (delimiterEnd > tree.length) return undefined;
          let node: SyntaxNode | null = tree.resolveInner(from, 1);
          while (node !== null && node.name !== 'Table') node = node.parent;
          const header = node?.getChild('TableHeader');
          return node !== null &&
            header !== null &&
            header !== undefined &&
            from >= header.from &&
            from <= header.to
            ? { from: node.from, to: node.to }
            : null;
        });
        const layouts = new Map<number, TableLayout>();
        for (const [from, layout] of this.layouts) {
          const id = ids.get(from);
          const record = id === undefined ? undefined : this.tables.get(id);
          if (record !== undefined) layouts.set(record.from, layout);
        }
        this.layouts = layouts;
      }
      let measured = false;
      for (const effect of update.transactions.flatMap(
        (transaction) => transaction.effects,
      )) {
        if (!effect.is(measuredTables)) continue;
        this.layouts = effect.value;
        measured = true;
      }
      if (
        measured ||
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      )
        this.parts = gridParts(
          update.state,
          update.view.visibleRanges,
          this.layouts,
          (table) => this.tables.register(table),
        );
      if (
        !measured &&
        (update.docChanged ||
          update.viewportChanged ||
          update.geometryChanged ||
          syntaxTree(update.startState) !== syntaxTree(update.state))
      )
        this.schedule();
    }

    destroy(): void {
      this.alive = false;
      this.view.contentDOM.removeEventListener(
        'scroll',
        this.rememberScroll,
        true,
      );
      for (const name of ['pointerdown', 'wheel', 'touchmove'])
        this.view.contentDOM.removeEventListener(name, this.manualScroll, true);
      this.tables.clear();
      this.layouts = new Map();
      this.widths.clear();
      this.view.dom.ownerDocument.fonts.removeEventListener(
        'loadingdone',
        this.fontsChanged,
      );
    }

    private restoreScroll(): void {
      this.view.requestMeasure({
        key: this.scrollKey,
        read: (view) => {
          if (!this.alive) return null;
          const visible = [];
          for (const element of view.contentDOM.querySelectorAll(
            '.cm-np-table',
          )) {
            if (!(element instanceof HTMLElement)) continue;
            const record = this.tables.get(
              element.getAttribute('data-notes-table') ?? '',
            );
            if (record !== undefined)
              visible.push({
                element,
                record,
                left: Math.min(
                  record.left,
                  Math.max(0, element.scrollWidth - element.clientWidth),
                ),
              });
          }
          return visible;
        },
        write: (visible, view) => {
          if (!this.alive || visible === null) return;
          const seen = new Set(visible.map(({ record }) => record.id));
          for (const record of this.tables.values())
            if (!seen.has(record.id)) record.element = null;
          for (const { element, record, left } of visible) {
            if (
              this.tables.get(record.id) !== record ||
              !view.contentDOM.contains(element)
            )
              continue;
            // A new wrapper's default zero is not reader intent. Real input
            // binds its current element and clears needsRestore before here.
            if (record.element !== element || record.needsRestore)
              element.scrollLeft = left;
            record.element = element;
            record.left = element.scrollLeft;
            record.needsRestore = false;
          }
          view.plugin(tableCaretView)?.columnsReady();
        },
      });
    }

    private schedule(): void {
      this.view.requestMeasure({
        key: this,
        read: (view) => {
          const context = this.context;
          const head = view.contentDOM.querySelector('.cm-np-table-head');
          const bodyCell = view.contentDOM.querySelector('.cm-np-table-cell');
          const body = bodyCell ?? head;
          if (
            context === null ||
            body === null ||
            view.dom.ownerDocument.fonts.status === 'loading'
          )
            return null;
          const bodyStyle = getComputedStyle(body);
          const headStyle = head === null ? bodyStyle : getComputedStyle(head);
          const bodyWeight =
            bodyCell === null
              ? getComputedStyle(view.contentDOM).fontWeight
              : bodyStyle.fontWeight;
          const font = (style: CSSStyleDeclaration): string =>
            `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const measure = (text: string, header: boolean): number => {
            const style = header ? headStyle : bodyStyle;
            const actualFont = header
              ? head === null
                ? `${style.fontStyle} ${style.getPropertyValue('--font-weight-note-heading')} ${style.fontSize} ${style.fontFamily}`
                : font(style)
              : `${style.fontStyle} ${bodyWeight} ${style.fontSize} ${style.fontFamily}`;
            const key = `${actualFont}:${style.letterSpacing}:${text}`;
            const cached = this.widths.get(key);
            if (cached !== undefined) return cached;
            context.font = actualFont;
            context.letterSpacing =
              style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
            const width = context.measureText(text).width;
            if (this.widths.size >= 50_000) this.widths.clear();
            this.widths.set(key, width);
            return width;
          };
          const padding =
            parseFloat(bodyStyle.paddingLeft) +
            parseFloat(bodyStyle.paddingRight) +
            parseFloat(bodyStyle.borderLeftWidth) +
            parseFloat(bodyStyle.borderRightWidth);
          const maximum = parseFloat(bodyStyle.maxWidth);
          const floor = parseFloat(bodyStyle.minWidth);
          const layouts = new Map<number, TableLayout>();
          for (const range of view.visibleRanges)
            for (const table of tablesIn(view.state, range.from, range.to)) {
              if (layouts.has(table.from)) continue;
              const natural = tableColumnWidths(view.state, table, measure).map(
                (width) =>
                  Math.max(
                    floor,
                    Math.min(Math.ceil(width) + padding, maximum),
                  ),
              );
              const minimum = tableColumnWidths(
                view.state,
                table,
                (text, header) => {
                  let width = 0;
                  for (const part of tableWords.segment(text))
                    width = Math.max(width, measure(part.segment, header));
                  return width;
                },
              ).map((width, column) =>
                Math.max(
                  floor,
                  Math.min(
                    natural[column] ?? floor,
                    Math.ceil(width) + padding,
                  ),
                ),
              );
              const wrapper = view.contentDOM.querySelector('.cm-np-table');
              const available =
                wrapper instanceof HTMLElement
                  ? wrapper.clientWidth
                  : view.contentDOM.clientWidth;
              layouts.set(
                table.from,
                tableLayout(fitTableColumns(natural, minimum, available)),
              );
            }
          return { doc: view.state.doc, layouts };
        },
        write: (result, view) => {
          if (result === null || result.doc !== view.state.doc) return;
          const changed = [...result.layouts].filter(([from, layout]) => {
            const previous = this.layouts.get(from);
            return (
              previous?.columns !== layout.columns ||
              previous.tracks !== layout.tracks ||
              previous.rules !== layout.rules
            );
          });
          if (changed.length === 0) {
            this.restoreScroll();
            return;
          }
          queueMicrotask(() => {
            if (this.alive && result.doc === view.state.doc) {
              // A viewport measurement updates only the tables it saw. Keep
              // surviving tables ready for body-only reentry after scrolling.
              const layouts = new Map(this.layouts);
              for (const [from, layout] of changed) layouts.set(from, layout);
              view.dispatch({ effects: measuredTables.of(layouts) });
              this.restoreScroll();
            }
          });
        },
      });
    }
  },
  {
    provide: (plugin) => [
      EditorView.blockWrappers.of(
        (view) => view.plugin(plugin)?.parts.wrappers ?? BlockWrapper.set([]),
      ),
      EditorView.atomicRanges.of(
        (view) => view.plugin(plugin)?.parts.atomic ?? Decoration.none,
      ),
    ],
  },
);

/** How a table looks: one scrolling grid for each table (record 0095). */
export function tableGridView(): Extension {
  return [gridView, tableCaretView];
}

/** How a table is edited: the caret, the protected text, and the input. */
export function tableGridEditing(): Extension {
  return [
    EditorState.transactionFilter.of(caretFilter),
    EditorState.transactionFilter.of(tableEditFilter),
  ];
}
