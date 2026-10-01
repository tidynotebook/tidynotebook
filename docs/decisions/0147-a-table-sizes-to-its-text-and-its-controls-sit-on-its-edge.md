# 0147. A table sizes to its text and its controls sit on its edge

- Status: Accepted
- Date: 2026-10-01

## Context

A cell showed the padding of the source and never wrapped, so a column was as
wide as its longest cell and a table ran past the note column on every
screen. The handles of record 0098 were outlined bars as long as a row and a
column, and the table kept a margin for them. The owner asked for the table
of Notion and of Obsidian. See
[design 018](../design/018-a-table-that-reads-like-a-document.md).

## Decision

- The padding of a cell never shows. `live-preview.ts` hides it, except the
  spaces between the text and the caret, so a space typed at the end of a cell
  stays on the screen. An empty cell keeps one space, so it keeps its line.
- A cell wraps at a word. The browser sizes each column from its text, up to
  the note column, and a table scrolls sideways only when its columns cannot
  fit (`editor-theme.ts`).
- A handle is a grip of six dots on the edge of the table: the row grip on the
  left edge, centred on the row, and the column grip on the top edge, centred
  on the column. It straddles the edge, so the table keeps no margin. On a
  coarse pointer the hit area of a grip is larger and stays centred on the
  edge, so a tap on a short header cell still reaches its text. This replaces
  the place of a handle in record 0098.
- A press on a grip marks its row or its column with the selection tint while
  its menu is open or the drag runs. The menu tells the editor when it closes.
- An add bar shows under the table and at its right edge while the pointer is
  over the table, and the bar under the table also shows while the caret is in
  it. A press adds a row or a column at the end, through one edit of
  `table-grid.ts`. This restores the bars that record 0098 removed.

## Consequences

- A table lines up with every other line of the note, and a long cell wraps
  in place on a phone.
- The menu, the palette, the keys, the drag and the stored Markdown do not
  change.
- `live-preview.test.ts`, `table-grid.test.ts` and `editor-theme.test.ts` hold
  the rules. It refines records 0095 and 0098.
