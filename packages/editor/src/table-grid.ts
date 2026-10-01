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
  type ChangeSpec,
  type Extension,
  Transaction,
  type Range,
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
import type { SyntaxNode, Tree } from '@lezer/common';
import { diffChars } from 'diff';
import { isEditOfAPerson } from './commands.ts';
import {
  delimiterRowParts,
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
    const at = from + Math.min(1, to - from);
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
    if (pipe.from > at) cells.push(cellBox(state, at, pipe.from));
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

/** Every table that meets the range from `from` to `to`. */
export function tablesIn(
  state: EditorState,
  from: number,
  to: number,
): readonly TableBox[] {
  const tables: TableBox[] = [];
  treeOf(state, to).iterate({
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

/** One table written as text, and where each cell lands in it. */
export type WrittenTable = {
  readonly text: string;
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
  const delimiter = `|${widths
    .map(
      (width, column) =>
        ` ${delimiterCell(data.alignments[column] ?? null, width)} `,
    )
    .join('|')}|`;
  const lines = [line(data.header), delimiter, ...data.body.map(line)];
  const separator = `\n${data.lead}`;
  const lineStart = (index: number): number =>
    lines
      .slice(0, index)
      .reduce((sum, text) => sum + text.length + separator.length, 0);
  return {
    text: lines.join(separator),
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

/**
 * The smallest character changes that turn one table into its new text.
 *
 * A command writes the whole table again, and most of it is the same. The
 * changes keep every unchanged character where it is, so the text of a cell
 * that the command did not touch is never replaced.
 */
function tableChanges(
  state: EditorState,
  table: TableBox,
  text: string,
): readonly ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  let at = table.from;
  for (const part of diffChars(
    state.doc.sliceString(table.from, table.to),
    text,
  )) {
    if (part.added === true) changes.push({ from: at, insert: part.value });
    else if (part.removed === true) {
      changes.push({ from: at, to: at + part.value.length });
      at += part.value.length;
    } else at += part.value.length;
  }
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
  const result = edit(tableData(state, table), at);
  if (result === null) return null;
  const written = writeTable(result.data);
  const cell = written.cell(result.target);
  const from = table.from + cell.from;
  const to = table.from + cell.to;
  return {
    changes: tableChanges(state, table, written.text),
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
      specs.push(...tableChanges(start, table, written.text));
      caret = { tableFrom: table.from, offset: written.cell(pasted.target).to };
      continue;
    }
    const written = writeTable(rewrite.data);
    specs.push(...tableChanges(start, table, written.text));
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

/** The element that wraps the lines of one table. */
const tableWrapper = BlockWrapper.create({
  tagName: 'div',
  attributes: { class: 'cm-np-table' },
});

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
): GridParts {
  const wrappers: Range<BlockWrapper>[] = [];
  const atomic: Range<Decoration>[] = [];
  const seen = new Set<number>();
  for (const range of ranges)
    for (const table of tablesIn(state, range.from, range.to)) {
      if (seen.has(table.from)) continue;
      seen.add(table.from);
      const start = table.rows[0]?.lineFrom ?? table.from;
      wrappers.push(tableWrapper.range(start, table.to));
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

/** Builds the grid parts of the view and keeps them current. */
const gridView = ViewPlugin.fromClass(
  class {
    parts: GridParts;

    constructor(view: EditorView) {
      this.parts = gridParts(view.state, view.visibleRanges);
    }

    update(update: ViewUpdate): void {
      if (
        !update.docChanged &&
        !update.viewportChanged &&
        syntaxTree(update.startState) === syntaxTree(update.state)
      )
        return;
      this.parts = gridParts(update.view.state, update.view.visibleRanges);
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
  return gridView;
}

/** How a table is edited: the caret, the protected text, and the input. */
export function tableGridEditing(): Extension {
  return [
    EditorState.transactionFilter.of(caretFilter),
    EditorState.transactionFilter.of(tableEditFilter),
  ];
}
