/**
 * The controls that a table carries (records 0097, 0098 and 0147).
 *
 * A grip stands on the edge of the table for the active row and the active
 * column: the row and the column of the cell under the pointer, or of the
 * caret. The row grip sits on the left edge, centred on its row, and the
 * column grip sits on the top edge, centred on its column, as the grips of
 * Notion and of Obsidian do. A grip straddles the edge, so the table keeps no
 * room for it. A press on a grip opens the menu of its row or its column and
 * marks what the menu acts on. A drag of a grip moves its row or its column,
 * and a line shows where it lands.
 *
 * An add bar stands under the table and at its right edge while the pointer
 * is over the table, and the bar under the table also stands while the caret
 * is in it. A press adds a row or a column at the end.
 *
 * The controls stand in one layer over the text, inside the scroller of the
 * editor, so they replace no text and the set of widget kinds of record 0002
 * stays closed. The layer is the way CodeMirror draws its own selection and
 * its tooltips: an element beside the content, placed from what the view
 * measures. A move and an add are edits of `table-grid.ts`. The menu is a
 * control of `packages/ui`, which the editor does not render, so a grip asks
 * the application for it through `tableMenuOpener`.
 *
 * A control takes no focus from the editor. The keyboard reaches every action
 * of the menu, moves included, from the command palette, and Tab and Enter add
 * a row.
 */
import { Facet, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { editingTransaction } from './commands.ts';
import { glyph, gripParts, plusParts } from './icon-mark.ts';
import { dragStep, followPointer, type DragInput } from './pointer-drag.ts';
import { cellFormatContext, type FormatContext } from './format-context.ts';
import {
  appendColumnEdit,
  appendRowEdit,
  moveColumnEdit,
  moveRowEdit,
  tableAt,
  tableContextAt,
  tableEditSpec,
  type TableEdit,
} from './table-grid.ts';

/** The names of the controls, which a person hears and reads. */
export const tableControlLabels = {
  rowMenu: 'Row actions',
  columnMenu: 'Column actions',
  addRow: 'Add a row',
  addColumn: 'Add a column',
} as const;

/** A place on the screen, in the coordinates of the viewport. */
export type ScreenRect = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

/** What a grip asks for: the menu of its row or its column. */
export type TableMenuRequest = {
  readonly kind: 'row' | 'column';
  /** A position in the cell of the grip, which the actions act on. */
  readonly pos: number;
  /** The grip, where the menu opens. */
  readonly anchor: ScreenRect;
  /** What the cell allows: a header row, one column, its alignment. */
  readonly context: FormatContext;
  /**
   * Tells the editor that the menu closed, so the row or the column that it
   * marked for the menu goes back to rest.
   */
  readonly onClose: () => void;
};

/** Opens the menu of one row or one column. The application renders it. */
export type TableMenuOpener = (request: TableMenuRequest) => void;

/** The opener of the menu of a table, which the application states. */
export const tableMenuOpener = Facet.define<
  TableMenuOpener,
  TableMenuOpener | null
>({ combine: (values) => values.at(-1) ?? null });

/** The width of the line that shows where a row or a column lands. */
const dropLineWidth = 2;

/** One grip: a hit area that holds the drawn pill of six dots. */
function handle(kind: 'row' | 'column'): HTMLButtonElement {
  const button = document.createElement('button');
  const label =
    kind === 'row' ? tableControlLabels.rowMenu : tableControlLabels.columnMenu;
  button.type = 'button';
  button.className = `cm-np-table-handle cm-np-table-handle-${kind}`;
  button.tabIndex = -1;
  button.setAttribute('aria-label', label);
  button.title = label;
  const grip = document.createElement('span');
  grip.className = 'cm-np-table-grip';
  grip.append(glyph('cm-np-table-control-mark', gripParts(kind === 'row')));
  button.append(grip);
  return button;
}

/** One add bar. */
function addBar(kind: 'row' | 'column'): HTMLButtonElement {
  const button = document.createElement('button');
  const label =
    kind === 'row' ? tableControlLabels.addRow : tableControlLabels.addColumn;
  button.type = 'button';
  button.className = `cm-np-table-add cm-np-table-add-${kind}`;
  button.tabIndex = -1;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(glyph('cm-np-table-control-mark', plusParts));
  return button;
}

/** The rows of a table element that a person sees: every line but the delimiter. */
function gridLines(table: HTMLElement): readonly HTMLElement[] {
  return [
    ...table.querySelectorAll<HTMLElement>(
      '.cm-np-table-line:not(.cm-np-table-closed)',
    ),
  ];
}

/** The cells of one row element. */
function rowCells(line: Element): readonly HTMLElement[] {
  return [
    ...line.querySelectorAll<HTMLElement>(
      '.cm-np-table-cell, .cm-np-table-head',
    ),
  ];
}

/** A place in the coordinates of the scroller. */
type Place = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

/** Where every control of the layer stands, or null where it does not. */
type ControlPlaces = {
  readonly rowHandle: Place | null;
  readonly columnHandle: Place | null;
  readonly dropLine: Place | null;
  readonly marked: Place | null;
  readonly addRow: Place | null;
  readonly addColumn: Place | null;
  /** The grip that is pressed: its menu is open or it drags. */
  readonly pressed: 'row' | 'column' | null;
};

/** No control at all. */
const noPlaces: ControlPlaces = {
  rowHandle: null,
  columnHandle: null,
  dropLine: null,
  marked: null,
  addRow: null,
  addColumn: null,
  pressed: null,
};

/** The outline of the grid of one table, in the coordinates of the viewport. */
type GridBox = {
  readonly lines: readonly HTMLElement[];
  /** The top of the header row and the bottom of the last row. */
  readonly top: number;
  readonly bottom: number;
  /** The left and the right edge of the part of the grid that shows. */
  readonly left: number;
  readonly right: number;
  /** True when the grid ends inside its scroll box, with nothing cut. */
  readonly endShows: boolean;
};

/** Measures the grid of one table element. */
function gridBox(table: HTMLElement): GridBox | null {
  const lines = gridLines(table);
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (first === undefined || last === undefined) return null;
  const cells = rowCells(first);
  const start = cells[0]?.getBoundingClientRect();
  const end = cells[cells.length - 1]?.getBoundingClientRect();
  if (start === undefined || end === undefined) return null;
  const box = table.getBoundingClientRect();
  return {
    lines,
    top: first.getBoundingClientRect().top,
    bottom: last.getBoundingClientRect().bottom,
    left: Math.max(start.left, box.left),
    right: Math.min(end.right, box.right),
    endShows: end.right <= box.right + 1,
  };
}

/**
 * One cell of a table by its place: the start of the first line of the
 * table, its row as the grid counts them, and its column.
 *
 * The controls keep a place and never an element. A click restyles the cell
 * it lands in and the cell it leaves, and the editor draws those cells again,
 * so an element that the controls kept stopped being the cell on the screen
 * and the grips stayed on the row that the caret had left.
 */
type GridRef = {
  readonly tableFrom: number;
  readonly row: number;
  readonly column: number;
};

/** The start of the first line of a table element, or null. */
function tableStart(view: EditorView, table: HTMLElement): number | null {
  const first = gridLines(table)[0];
  if (first === undefined) return null;
  return view.state.doc.lineAt(view.posAtDOM(first, 0)).from;
}

/** The table element that starts at `tableFrom`, if the editor draws it. */
function tableOf(view: EditorView, tableFrom: number): HTMLElement | null {
  for (const table of view.contentDOM.querySelectorAll<HTMLElement>(
    '.cm-np-table',
  ))
    if (tableStart(view, table) === tableFrom) return table;
  return null;
}

/** The cell element of a place in a table element, or null. */
function cellIn(table: HTMLElement, ref: GridRef): HTMLElement | null {
  const line = gridLines(table)[ref.row];
  return line === undefined ? null : (rowCells(line)[ref.column] ?? null);
}

/** The cell element of a place, or null. */
function cellOf(view: EditorView, ref: GridRef): HTMLElement | null {
  const table = tableOf(view, ref.tableFrom);
  return table === null ? null : cellIn(table, ref);
}

/** The place of the cell that holds the caret, read from the document. */
function caretRef(view: EditorView): GridRef | null {
  const head = view.state.selection.main.head;
  const context = tableContextAt(view.state, head);
  if (!context.table) return null;
  const table = tableAt(view.state, head);
  if (table === null) return null;
  return {
    tableFrom: view.state.doc.lineAt(table.from).from,
    row: context.row,
    column: context.column,
  };
}

/**
 * The row and the column that the pointer names, from what it is over.
 *
 * `found` holds the row and the column under the pointer, or -1 where the
 * pointer is beside the grid, over the room of a grip or an add bar. There
 * the row or the column that the pointer last named in the same table
 * stays, so a pointer that moves onto a grip keeps the grip where it is.
 * With no earlier place, the pointer names the nearest edge of the grid.
 */
export function pointedPlace(
  found: { readonly row: number; readonly column: number },
  size: { readonly rows: number; readonly columns: number },
  side: { readonly above: boolean; readonly before: boolean },
  previous: { readonly row: number; readonly column: number } | null,
): { readonly row: number; readonly column: number } {
  return {
    row:
      found.row !== -1
        ? found.row
        : (previous?.row ?? (side.above ? 0 : size.rows - 1)),
    column:
      found.column !== -1
        ? found.column
        : (previous?.column ?? (side.before ? 0 : size.columns - 1)),
  };
}

/** The room around a grid where the pointer still belongs to its table. */
type Slack = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

/**
 * The table and the cell under the pointer.
 *
 * The pointer belongs to a table over its grid and over the room where the
 * grips and the add bars stand, so a pointer that moves onto a control keeps
 * the controls where they are. Over that room the pointer is over no cell,
 * and the row or the column it last pointed at stays.
 */
function pointerRef(
  view: EditorView,
  x: number,
  y: number,
  previous: GridRef | null,
  slack: Slack,
): { readonly table: HTMLElement; readonly ref: GridRef } | null {
  for (const table of view.contentDOM.querySelectorAll<HTMLElement>(
    '.cm-np-table',
  )) {
    const grid = gridBox(table);
    if (grid === null) continue;
    if (
      x < grid.left - slack.left ||
      x > grid.right + slack.right ||
      y < grid.top - slack.top ||
      y > grid.bottom + slack.bottom
    )
      continue;
    const tableFrom = tableStart(view, table);
    if (tableFrom === null) continue;
    const same = previous !== null && previous.tableFrom === tableFrom;
    const lines = grid.lines;
    const columns = lines[0] === undefined ? [] : rowCells(lines[0]);
    const row = lines.findIndex((line) => {
      const box = line.getBoundingClientRect();
      return y >= box.top && y < box.bottom;
    });
    const column = columns.findIndex((cell) => {
      const box = cell.getBoundingClientRect();
      return x >= box.left && x < box.right;
    });
    return {
      table,
      ref: {
        tableFrom,
        ...pointedPlace(
          { row, column },
          { rows: lines.length, columns: columns.length },
          { above: y < grid.top, before: x < grid.left },
          same ? previous : null,
        ),
      },
    };
  }
  return null;
}

/** A press on a grip, which becomes a drag once the pointer travels. */
type Drag = {
  readonly kind: 'row' | 'column';
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  /** A position in the cell of the grip, which names what moves. */
  pos: number;
  /** The row or the column that moves, as the grid counts them. */
  readonly from: number;
  /** The cell of the grip, whose row or column the drag marks. */
  ref: GridRef;
  /** The grip that was pressed, where a press opens its menu. */
  readonly button: HTMLElement;
  /** True once the pointer travelled far enough to be a drag. */
  moving: boolean;
  /** Where the row or the column lands, as the grid counts them. */
  to: number;
};

/** The menu that a grip opened, while it is open. */
type OpenMenu = {
  readonly kind: 'row' | 'column';
  ref: GridRef;
};

/** Builds the layer of the controls and keeps it on the active table. */
class TableControls {
  private readonly layer: HTMLElement;
  private readonly rowHandle: HTMLButtonElement;
  private readonly columnHandle: HTMLButtonElement;
  private readonly addRow: HTMLButtonElement;
  private readonly addColumn: HTMLButtonElement;
  private readonly dropLine: HTMLElement;
  private readonly marked: HTMLElement;
  /** Where the pointer is, or null while it is away or is a finger. */
  private pointer: { readonly x: number; readonly y: number } | null = null;
  /** The cell the pointer last pointed at, which wins over the caret. */
  private hoverRef: GridRef | null = null;
  /** The table and the cell the controls stand on now. */
  private activeTableFrom: number | null = null;
  private activeRef: GridRef | null = null;
  private drag: Drag | null = null;
  private menu: OpenMenu | null = null;
  /** Stops the listening of the window that one drag started. */
  private stopListening: (() => void) | null = null;
  private readonly onPointer: (event: PointerEvent) => void;
  private readonly onLeave: () => void;
  private readonly onScroll: () => void;

  private readonly view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
    this.layer = document.createElement('div');
    this.layer.className = 'cm-np-table-controls';
    this.rowHandle = handle('row');
    this.columnHandle = handle('column');
    this.addRow = addBar('row');
    this.addColumn = addBar('column');
    this.dropLine = document.createElement('div');
    this.dropLine.className = 'cm-np-table-drop';
    this.marked = document.createElement('div');
    this.marked.className = 'cm-np-table-marked';
    this.layer.append(
      this.marked,
      this.addRow,
      this.addColumn,
      this.rowHandle,
      this.columnHandle,
      this.dropLine,
    );
    view.scrollDOM.append(this.layer);

    for (const [button, kind] of [
      [this.rowHandle, 'row'],
      [this.columnHandle, 'column'],
    ] as const) {
      // A press keeps the focus and the selection in the editor.
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      button.addEventListener('pointerdown', (event) => {
        this.startDrag(kind, event, button);
      });
      // Assistive software and a keyboard press a button with a click that
      // no pointer made, which carries no count of presses. It opens the menu,
      // as a press of the pointer that does not drag does.
      button.addEventListener('click', (event) => {
        const ref = this.activeRef;
        if (event.detail !== 0 || ref === null) return;
        this.openMenu(kind, ref, button);
      });
    }
    for (const [button, edit] of [
      [this.addRow, appendRowEdit],
      [this.addColumn, appendColumnEdit],
    ] as const) {
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      button.addEventListener('click', () => {
        this.append(edit);
      });
    }

    // The pointer is kept as a place on the screen, and the cell under it is
    // found again at each measure, so a cell that the editor draws again, a
    // scroll and an edit all leave the grips on the cell that is there now.
    this.onPointer = (event: PointerEvent): void => {
      // A finger has no hover. Its controls follow the caret alone, so a tap
      // on another table does not move them before the caret gets there.
      if (event.pointerType === 'touch') return;
      this.pointer = { x: event.clientX, y: event.clientY };
      if (this.drag !== null || this.menu !== null) return;
      this.schedule();
    };
    this.onLeave = (): void => {
      this.pointer = null;
      if (this.drag !== null || this.menu !== null) return;
      this.schedule();
    };
    // A table scrolls sideways on its own, and a scroll does not bubble, so
    // the layer hears it in the capture phase and follows it.
    this.onScroll = (): void => {
      this.schedule();
    };
    view.dom.addEventListener('pointermove', this.onPointer);
    view.dom.addEventListener('pointerleave', this.onLeave);
    view.scrollDOM.addEventListener('scroll', this.onScroll, true);
    this.schedule();
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      // A place names its table by where it starts, which an edit above the
      // table moves.
      const map = (ref: GridRef): GridRef => ({
        ...ref,
        tableFrom: update.changes.mapPos(ref.tableFrom),
      });
      if (this.hoverRef !== null) this.hoverRef = map(this.hoverRef);
      if (this.activeRef !== null) this.activeRef = map(this.activeRef);
      if (this.menu !== null) this.menu.ref = map(this.menu.ref);
      if (this.drag !== null) {
        this.drag.ref = map(this.drag.ref);
        this.drag.pos = update.changes.mapPos(this.drag.pos);
      }
    }
    if (
      update.docChanged ||
      update.selectionSet ||
      update.geometryChanged ||
      update.focusChanged
    )
      this.schedule();
  }

  destroy(): void {
    this.view.dom.removeEventListener('pointermove', this.onPointer);
    this.view.dom.removeEventListener('pointerleave', this.onLeave);
    this.view.scrollDOM.removeEventListener('scroll', this.onScroll, true);
    this.stopListening?.();
    this.layer.remove();
  }

  /** Adds a row or a column at the end of the active table. */
  private append(edit: TableEdit): void {
    const tableFrom = this.activeTableFrom;
    if (tableFrom === null || this.view.state.readOnly) return;
    const first = cellOf(this.view, { tableFrom, row: 0, column: 0 });
    if (first === null) return;
    const spec = tableEditSpec(
      this.view.state,
      edit,
      this.view.posAtDOM(first, 0),
    );
    if (spec !== null)
      this.view.dispatch(
        this.view.state.update(editingTransaction(spec), {
          scrollIntoView: true,
        }),
      );
    this.view.focus();
  }

  /** A press on a grip: it becomes a drag or, if it stays, the menu. */
  private startDrag(
    kind: 'row' | 'column',
    event: PointerEvent,
    button: HTMLElement,
  ): void {
    const ref = this.activeRef;
    const cell = ref === null ? null : cellOf(this.view, ref);
    if (ref === null || cell === null || this.view.state.readOnly) return;
    event.preventDefault();
    const pos = this.view.posAtDOM(cell, 0);
    const from = kind === 'row' ? ref.row : ref.column;
    this.drag = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pos,
      from,
      ref,
      button,
      moving: false,
      to: from,
    };
    this.listen(button.ownerDocument.defaultView ?? window);
    this.schedule();
  }

  /** Follows one drag on the whole window until it ends (record 0098). */
  private listen(target: Window): void {
    this.stopListening?.();
    const stop = followPointer(target, (input) => {
      this.step(input);
    });
    this.stopListening = (): void => {
      stop();
      this.stopListening = null;
    };
  }

  /** Applies one event of the window to the drag in progress. */
  private step(input: DragInput): void {
    const drag = this.drag;
    if (drag === null) return;
    const step = dragStep(drag, input);
    if (step === 'ignore') return;
    if (step === 'follow' && input.type !== 'cancel') {
      // The header row stays first, so it does not move.
      if (drag.kind === 'row' && drag.from === 0) return;
      const table = tableOf(this.view, drag.ref.tableFrom);
      if (table === null) return;
      drag.moving = true;
      drag.to = dropIndex(drag, table, input.x, input.y);
      this.schedule();
      return;
    }
    this.drag = null;
    this.stopListening?.();
    if (step === 'cancel') {
      this.schedule();
      return;
    }
    this.endDrag(drag);
  }

  /** Ends a press: a drag moves its row or its column, a press opens the menu. */
  private endDrag(drag: Drag): void {
    if (!drag.moving) {
      this.openMenu(drag.kind, drag.ref, drag.button);
      this.schedule();
      return;
    }
    if (drag.to !== drag.from) {
      const spec = tableEditSpec(
        this.view.state,
        drag.kind === 'row' ? moveRowEdit(drag.to) : moveColumnEdit(drag.to),
        drag.pos,
      );
      if (spec !== null)
        this.view.dispatch(this.view.state.update(editingTransaction(spec)));
    }
    this.view.focus();
    this.schedule();
  }

  /** Asks the application for the menu of the row or the column of a cell. */
  private openMenu(
    kind: 'row' | 'column',
    ref: GridRef,
    button: HTMLElement,
  ): void {
    const open = this.view.state.facet(tableMenuOpener);
    const cell = cellOf(this.view, ref);
    if (open === null || cell === null || this.view.state.readOnly) return;
    const pos = this.view.posAtDOM(cell, 0);
    const box = button.getBoundingClientRect();
    const menu: OpenMenu = { kind, ref };
    this.menu = menu;
    open({
      kind,
      pos,
      anchor: {
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
      },
      context: cellFormatContext(this.view.state, pos),
      onClose: () => {
        if (this.menu !== menu) return;
        this.menu = null;
        this.schedule();
      },
    });
    this.schedule();
  }

  /** Measures the active table and places the controls on it. */
  private schedule(): void {
    this.view.requestMeasure({
      key: this,
      read: (view): ControlPlaces | null => {
        if (view.state.readOnly) return null;
        const scroller = view.scrollDOM.getBoundingClientRect();
        const sized = (
          left: number,
          top: number,
          width: number,
          height: number,
        ): Place => ({
          left: left - scroller.left + view.scrollDOM.scrollLeft,
          top: top - scroller.top + view.scrollDOM.scrollTop,
          width,
          height,
        });
        const drag = this.drag;
        if (drag !== null) return this.pressedPlaces(drag, sized);
        const menu = this.menu;
        if (menu !== null) return this.pressedPlaces(menu, sized);

        const rowSize = this.size(this.rowHandle);
        const columnSize = this.size(this.columnHandle);
        const addRowSize = this.size(this.addRow);
        const addColumnSize = this.size(this.addColumn);
        const hit =
          this.pointer === null
            ? null
            : pointerRef(view, this.pointer.x, this.pointer.y, this.hoverRef, {
                left: rowSize.width / 2,
                top: columnSize.height / 2,
                right: addColumnSize.width,
                bottom: addRowSize.height,
              });
        this.hoverRef = hit?.ref ?? null;
        const caret = view.hasFocus ? caretRef(view) : null;
        const pointed = hit?.table ?? null;
        const table =
          pointed ?? (caret === null ? null : tableOf(view, caret.tableFrom));
        const tableFrom = table === null ? null : tableStart(view, table);
        const grid = table === null ? null : gridBox(table);
        this.activeTableFrom = grid === null ? null : tableFrom;
        this.activeRef = null;
        if (table === null || tableFrom === null || grid === null) return null;
        const ref =
          hit?.ref ??
          (caret !== null && caret.tableFrom === tableFrom ? caret : null);
        const cell = ref === null ? null : cellIn(table, ref);
        this.activeRef = cell === null ? null : ref;

        const cellBox = cell?.getBoundingClientRect() ?? null;
        const rowBox =
          cell?.closest('.cm-np-table-line')?.getBoundingClientRect() ?? null;
        // Only the part of a column that the table shows takes a grip, so the
        // grip of a column scrolled out of view does not float beside it.
        const from = cellBox === null ? 0 : Math.max(cellBox.left, grid.left);
        const to = cellBox === null ? 0 : Math.min(cellBox.right, grid.right);
        // The grip straddles the edge: its middle stands on the line of the
        // edge.
        const rowHandle =
          rowBox === null
            ? null
            : sized(
                grid.left - rowSize.width / 2,
                rowBox.top + rowBox.height / 2 - rowSize.height / 2,
                rowSize.width,
                rowSize.height,
              );
        const columnHandle =
          cellBox === null || to <= from
            ? null
            : sized(
                (from + to) / 2 - columnSize.width / 2,
                grid.top - columnSize.height / 2,
                columnSize.width,
                columnSize.height,
              );
        // The bar under the table follows the pointer and the caret. The bar
        // at its right edge follows the pointer alone, and it shows only
        // where the grid ends on the screen and the scroller has room for it.
        const addRow = sized(
          grid.left,
          grid.bottom,
          grid.right - grid.left,
          addRowSize.height,
        );
        const addColumn =
          pointed !== null &&
          grid.endShows &&
          grid.right + addColumnSize.width <= scroller.right
            ? sized(
                grid.right,
                grid.top,
                addColumnSize.width,
                grid.bottom - grid.top,
              )
            : null;
        return {
          ...noPlaces,
          rowHandle,
          columnHandle,
          addRow,
          addColumn,
        };
      },
      write: (places): void => {
        this.layer.classList.toggle(
          'cm-np-table-controls-shown',
          places !== null,
        );
        const shown = places ?? noPlaces;
        // A place on the screen is a measured number, which no class can
        // state, so the layer writes it, as a tooltip of CodeMirror does.
        const put = (element: HTMLElement, place: Place | null): void => {
          element.classList.toggle('cm-np-table-control-off', place === null);
          if (place === null) return;
          element.style.top = `${String(place.top)}px`;
          element.style.left = `${String(place.left)}px`;
          element.style.width = `${String(place.width)}px`;
          element.style.height = `${String(place.height)}px`;
        };
        put(this.rowHandle, shown.rowHandle);
        put(this.columnHandle, shown.columnHandle);
        put(this.addRow, shown.addRow);
        put(this.addColumn, shown.addColumn);
        put(this.dropLine, shown.dropLine);
        put(this.marked, shown.marked);
        this.rowHandle.classList.toggle(
          'cm-np-table-handle-on',
          shown.pressed === 'row',
        );
        this.columnHandle.classList.toggle(
          'cm-np-table-handle-on',
          shown.pressed === 'column',
        );
      },
    });
  }

  /** The size that the theme gives an element of the layer. */
  private size(element: HTMLElement): {
    readonly width: number;
    readonly height: number;
  } {
    return { width: element.offsetWidth, height: element.offsetHeight };
  }

  /**
   * Where the controls stand while a grip is pressed: its menu is open, or it
   * drags its row or its column.
   *
   * The pressed grip stays where it was, the row or the column it acts on
   * takes the mark of a selection, and during a drag a line on the edge of
   * the place where it lands shows where it goes. No other control shows.
   */
  private pressedPlaces(
    press: Drag | OpenMenu,
    sized: (left: number, top: number, width: number, height: number) => Place,
  ): ControlPlaces | null {
    const table = tableOf(this.view, press.ref.tableFrom);
    const cell = table === null ? null : cellIn(table, press.ref);
    if (table === null || cell === null) return null;
    const grid = gridBox(table);
    if (grid === null) return null;
    const lines = grid.lines;
    const drag = 'moving' in press ? press : null;
    const moved = drag !== null && drag.moving && drag.to !== drag.from;
    const cellBox = cell.getBoundingClientRect();
    if (press.kind === 'row') {
      const rowBox =
        cell.closest('.cm-np-table-line')?.getBoundingClientRect() ?? cellBox;
      const size = this.size(this.rowHandle);
      const target =
        drag === null
          ? null
          : (lines[drag.to]?.getBoundingClientRect() ?? null);
      const edge =
        target === null || drag === null
          ? 0
          : drag.to > drag.from
            ? target.bottom
            : target.top;
      return {
        ...noPlaces,
        pressed: 'row',
        rowHandle: sized(
          grid.left - size.width / 2,
          rowBox.top + rowBox.height / 2 - size.height / 2,
          size.width,
          size.height,
        ),
        marked: sized(
          grid.left,
          rowBox.top,
          grid.right - grid.left,
          rowBox.height,
        ),
        dropLine: moved
          ? sized(
              grid.left,
              edge - dropLineWidth / 2,
              grid.right - grid.left,
              dropLineWidth,
            )
          : null,
      };
    }
    const cells = lines[0] === undefined ? [] : rowCells(lines[0]);
    const size = this.size(this.columnHandle);
    const from = Math.max(cellBox.left, grid.left);
    const to = Math.min(cellBox.right, grid.right);
    const target =
      drag === null ? null : (cells[drag.to]?.getBoundingClientRect() ?? null);
    const edge =
      target === null || drag === null
        ? 0
        : drag.to > drag.from
          ? target.right
          : target.left;
    return {
      ...noPlaces,
      pressed: 'column',
      columnHandle:
        to > from
          ? sized(
              (from + to) / 2 - size.width / 2,
              grid.top - size.height / 2,
              size.width,
              size.height,
            )
          : null,
      marked:
        to > from
          ? sized(from, grid.top, to - from, grid.bottom - grid.top)
          : null,
      dropLine: moved
        ? sized(
            edge - dropLineWidth / 2,
            grid.top,
            dropLineWidth,
            grid.bottom - grid.top,
          )
        : null,
    };
  }
}

/**
 * The row or the column under the pointer, as the grid counts them.
 *
 * A row lands on the body row whose top the pointer passed, and never on the
 * header row, which stays first. A column lands on the column whose left edge
 * the pointer passed.
 */
function dropIndex(
  drag: Drag,
  table: HTMLElement,
  pointerX: number,
  pointerY: number,
): number {
  const lines = gridLines(table);
  if (drag.kind === 'row') {
    let to = 1;
    lines.forEach((line, index) => {
      if (index > 0 && pointerY >= line.getBoundingClientRect().top) to = index;
    });
    return Math.min(Math.max(to, 1), lines.length - 1);
  }
  const cells = lines[0] === undefined ? [] : rowCells(lines[0]);
  let to = 0;
  cells.forEach((cell, index) => {
    if (pointerX >= cell.getBoundingClientRect().left) to = index;
  });
  return to;
}

/** The controls of every table (records 0097, 0098 and 0147). */
export function tableControls(): Extension {
  return ViewPlugin.fromClass(TableControls);
}
