# Markdown

This page is for the person who writes the notes. It states which Markdown the
editor understands and how a note shows it.

## One note surface

A note has one surface, and the Markdown source is always the document.
Markers are hidden and the text is styled in place, and the source comes back
where your cursor is. A block construct shows its markers while you are on the
line that carries them. A fenced block shows its fences while you are anywhere
inside it. An inline construct shows its markers while your selection touches
the whole construct, so a cursor inside a bold word brings both `**` runs back.

A published link shows the same note through the same grammar, so the two
never disagree about what a note means.

## Formatting tools

The row of tools above the note formats the text for you, so you do not need to
know Markdown. Select text and then select a tool, or select a tool and then
type. The tools are Heading 1, Heading 2, Heading 3, Bold, Italic, Strike
through, Inline code, Link, Bullet list, Ordered list, Task list, Block quote,
Table, Move item up and Move item down. Select a tool again to remove its
format. Hold the pointer on a tool to see its key.

Table writes a small table with two columns and one empty row. Type the name of
the first column. Press Tab to go to the next cell, and Shift and Tab to go
back. Press Enter to go to the cell below, and Shift and Enter to go up. Tab in
the last cell and Enter in the last row add a row. You can also select a cell
to write in it.

A small handle of six dots shows on the left edge of the row and on the top
edge of the column that you point at, or that holds the cursor. Select it to
open the menu of that row or that column. The row or the column that the menu
acts on shows as selected. The row menu inserts a row above or below, moves the row up or down,
and deletes the row. The column menu inserts a column to the left or to the
right, moves the column, sets its alignment, and deletes it. The header row and
the last column stay. Both menus have **Delete table**, which removes the whole
table. Press Ctrl + Z to get it back. The command palette offers the same
actions while the cursor is in a table.

To add a row at the end, select the **+** bar under the table. To add a column
at the end, point at the table and select the **+** bar at its right edge.

To move a row or a column, drag its handle. A line shows where it goes. Release
the handle to move it there. Press Escape to stop the drag and move nothing.
The header row does not move.

Copy a row or a range of cells, from a note or from a spreadsheet, and paste it
into a cell: it fills the cells from there to the right and down, and the table
grows if it needs more rows or columns. Backspace and Delete remove text, and
never a cell, a row or a column. Tools that change whole lines, such as Heading
and Bullet list, do nothing in a table and show disabled. To go below a table
at the end of the note, press the Down arrow in its last row.

## Moving a list item

You can change the order of the items of a list, a task list included. An item
moves with its later lines and with the items under it. It stays in its own
list and at its own level.

With a mouse, point at an item. A grip shows to the left of it. Drag the grip,
and a line shows where the item goes. Release the grip to move the item there.
Press Escape to stop the drag and move nothing.

On every device, put the cursor in the item and select **Move item up** or
**Move item down** in the row of tools. On a keyboard, press Alt and the Up
arrow or the Down arrow. On a Mac, press Option and the arrow. Outside a list,
these keys move the line of the cursor.

A numbered list keeps its first number and counts on from it after each move.
Press Ctrl + Z or Cmd + Z to put the item back.

## Tools on a narrow screen and with a keyboard

On a narrow screen, swipe the row sideways to reach the other tools. Every tool
is also in the command palette: open it with Ctrl + P or Cmd + P and type the
name of the tool.

With a keyboard, press Tab to reach the row and the arrow keys to move
between the tools. Press Enter to use a tool. The cursor then goes back to the
note.

## Paragraphs and line breaks

A new line shows as a new line, in the editor, in Read mode, and on a
published page. The text does not move when your cursor goes into a paragraph
or out of it. Press Enter twice to start a new paragraph.

In a list, Enter starts a new item. Press Shift and Enter to start a new line
in the same item. In a quote, Shift and Enter keep the quote marks.

Other Markdown tools can join two lines of one paragraph into one line. Put a
blank line between the two lines if they must stay apart in those tools too.

## What the editor understands

CommonMark, plus the GitHub set: tables, task list items, strikethrough,
autolinks, and footnotes. Headings, lists at any depth, ordered lists, block
quotes, inline code, fenced code with a language, indented code, links,
reference links, images, thematic breaks, hard breaks, escapes, and entities
all work as CommonMark describes.

A task box is a real checkbox. Select it to tick the line. A table shows as a
grid of cells, and the note stores it as a GitHub table. A long cell wraps
onto more lines, so each column takes the width that its text needs. A table
that cannot fit even when its cells wrap scrolls sideways inside its own
outline, and the rest of the note stays where it is.

## Ordered lists

An ordered list shows numbers, a list inside it shows the letters a, b, c,
and the next list inside shows the numerals i, ii, iii. Below that level the
three styles start again. The note keeps plain numbers in the source, so the
file reads the same in any other Markdown tool. You see the number of the
source while your cursor is on its line.

The editor keeps each list in sequence as you write. Enter, a paste, a
deletion, Tab, and Shift and Tab all put the numbers of the list back in
order, and one undo removes the change and the new numbers together. A list
keeps the number it starts at. Tab puts an item inside the item above it, and
a list that starts this way counts from one.

## Alerts

A block quote whose first line is `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`,
`[!WARNING]` or `[!CAUTION]` is an alert. The marker leaves the text and the
quote shows the word and a colour instead.

## Math

- A single dollar sign is money, never math. `It costs $5 today` stays text.
- Inline math is `$$x^2$$` or `\(x^2\)`, on one line.
- Display math is a `$$` line of its own, the formula, then a closing `$$`
  line.

A formula the renderer cannot draw stays as readable source rather than
failing.

## Diagrams and images

A code fence marked `mermaid` is drawn as a diagram.

An image from this note shows the picture. An image from another site shows the
picture as well, and the address must start with `https`. Opening the note
asks that site for the picture, so the site learns that somebody opened it. The
request names no note and no address of yours.

To add an image, paste it, drag the file onto the editor, or use **Attach
image** in the note menu. The editor uploads it and writes the Markdown for
you. Only images are accepted, and an upload needs a connection.

Click an image to open it at full size over the darkened page. To close it,
click outside the image, press Escape, or use the close button. Use the zoom buttons, the `+`, `-`
and `0` keys, or the mouse wheel with Ctrl or Cmd held to zoom. When you zoom
in, drag the image to move it. An image from this note has **Copy image** and
**Download**. An image from another site has **Copy link** and **Open
original**. To change the Markdown of an image, click next to the image or
move the cursor onto it with the arrow keys.

## HTML is not rendered

Raw HTML is shown as text in the note and removed from a published link.
Nothing you write as HTML has any effect. A link to anything other than a web address, a
mail address, another note, or an attachment loses its destination and is shown
as plain text.

## Limits

A very large note, or one nested very deeply, is shown as source with one
sentence that says why. Nothing is truncated and no text is lost.
