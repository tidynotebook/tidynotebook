# 018: A table that reads like a document

Status: complete

This design states why the table of a note still looks unfinished after
records 0095 to 0098, and what it takes to make it read and edit the way the
table of Notion and of Obsidian does. It follows the owner report of
2026-10-01: the columns size badly on a desktop and on a phone, and the two
handles of a row and a column make the whole table look bad.

## The problem

A drive of the note surface on 2026-10-01, at 1280 and at 390 pixels wide,
shows the faults.

- A column is as wide as its longest cell, and a cell never wraps. One long
  note in a cell makes the table wider than the note column. On a desktop the
  last column is cut at the edge, and on a phone the table scrolls so far that
  the first column leaves the screen as soon as the caret is in a later cell.
- A column is as wide as the source padding of its longest cell. The writer
  of `table-grid.ts` pads every cell of a column with spaces to one width, and
  the cell shows those spaces, so a short cell carries the width of a long one
  in a proportional face.
- The row handle is a box with an edge as tall as the row, and the column
  handle is a box with an edge as wide as the column. Both stay on the screen
  while the caret is in the table, so a table always shows two extra outlined
  bars beside it.
- The table keeps a margin at its start and a padding above it for the
  handles (record 0098). The table so stands to the right of every other line
  of the note and further from the text above it.
- A person adds a row with Tab or Enter or through a menu, and a column only
  through a menu. Nothing on the table says that it can grow.

## What the two products do

Notion and Obsidian agree on the shape of a table editor.

- A cell wraps its text. A column is as wide as its text needs, up to the
  width of the page, and the table scrolls sideways only when its columns
  cannot fit even when they wrap.
- A handle is a small grip of six dots. It shows only for the row and the
  column under the pointer, or of the cell that is being edited. The row grip
  sits on the left edge of the table, centred on the row. The column grip sits
  on the top edge, centred on the column. The grip straddles the edge, so the
  table keeps no room for it.
- A press on a grip selects the row or the column: it takes the selection
  tint, and its menu opens beside the grip. The same grip drags the row or the
  column to a new place.
- A plus bar shows under the table and at its right edge while the pointer is
  over the table. A press adds a row at the end or a column at the end.

Notion stores a width for each column. A GFM table has no place for a width,
and record 0021 keeps the note portable, so this design leaves widths to the
text, as Obsidian does.

## Options

### Option A: keep the grid and fix it

Keep the grid of record 0095, and change three things. The padding of a cell
is hidden, so a cell is as wide as its text, and a cell wraps. The handles
become grips on the edge in the layer of `table-controls.ts`. The add bars
return to that same layer.

Every guarantee of record 0095 stays: the table is text of the one editor, so
undo, IME composition, find and remote work need nothing new. The cost is the
hidden padding. The caret already never stands in the padding (record 0095),
so hiding it changes what a person sees and not where the caret goes. The one
exception is a space typed at the end of a cell, which is padding until the
next letter. The space stays on the screen while the caret stands after it.

### Option B: a table widget

A widget draws a real table, and an editor in each cell edits it. Design 014
already weighed this option and refused it, because it breaks the rule of one
editor, and every guarantee of record 0082 would have to be built again.
Nothing that a person sees in this report needs a widget.

## Recommendation

Option A. Each fault of the report comes from the presentation, and the model
of the table is sound.

## What this design does not do

It does not store a column width, a cell colour or a header column, because a
GFM table has none of them. It does not change the published page or the
export.

## Decisions

- [0147. A table sizes to its text and its controls sit on its edge](../decisions/0147-a-table-sizes-to-its-text-and-its-controls-sit-on-its-edge.md)
