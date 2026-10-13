# Markdown

This page is for the person who writes the notes. It shows how the editor
displays Markdown while you type, what the formatting tools do, and which
Markdown you can write.

## How the editor shows Markdown

A note is plain Markdown text. The editor hides the marks and styles the text
in place. The marks come back where your cursor is, so you can always edit the
text.

- On a line that has marks, such as a heading or a list, the marks show while
  the cursor is on that line.
- In a fenced code block, the fences show while the cursor is anywhere inside
  the block.
- Around a word, such as bold, the marks show while your selection touches the
  whole word. A cursor inside a bold word brings back both `**` marks.

A published page reads your note in the same way as the editor.

## Format text with the tools

The row of tools above the note formats the text for you. You do not need to
know Markdown.

1. Select text, then select a tool. Or select a tool, then type.
2. Select the tool again to remove the format.

The tools are **Heading 1**, **Heading 2**, **Heading 3**, **Bold**,
**Italic**, **Strike through**, **Inline code**, **Link**, **Bullet list**,
**Ordered list**, **Task list**, **Block quote**, **Table**, **Move item up**
and **Move item down**. Hold the pointer on a tool to see its key.

Every tool is also in the command palette. Press **Ctrl + P**, or **Cmd + P**
on a Mac, and type the name of the tool.

### Use the tools on a phone or with a keyboard

On a phone, the row of tools stands above the note, as on a computer.

- Swipe the row sideways to reach the other tools. You can also select the
  arrow at the end of the row. The arrow shows when more tools are there.
- While you type, the word count goes away to give the text more room.
- The slash menu and the other menus open above the keyboard.

With a keyboard, press **Tab** to reach the row. Use the arrow keys to move
between the tools, and press **Enter** to use a tool. The cursor then goes back
to the note.

## Add a block with the slash menu

1. Type `/` at the start of a line, or after a space. A menu of blocks opens.
2. Type more letters to narrow the menu, for example `/bul` or `/h2`.
3. Press the Up arrow or the Down arrow to move in the menu. Press **Enter** or
   **Tab** to choose. You can also select a block with the pointer.

The block takes the line. The slash and the letters after it go. Press
**Escape** to close the menu and keep the slash.

The menu has the three headings, the three lists, **Block quote** and
**Table**. A slash inside a word, an address, code or a formula opens no menu.

## Tables

**Table** writes a small table with two columns and one empty row. Type the
name of the first column. You can also select a cell to write in it.

### Move in a table

| Key                            | What it does                                  |
| ------------------------------ | --------------------------------------------- |
| **Tab**                        | Goes to the next cell.                        |
| **Shift + Tab**                | Goes to the previous cell.                    |
| **Enter**                      | Goes to the cell below.                       |
| **Shift + Enter**              | Goes to the cell above.                       |
| **Tab** in the last cell       | Adds a row.                                   |
| **Enter** in the last row      | Adds a row.                                   |
| **Down arrow** in the last row | Goes below the table, at the end of the note. |

### Add, move and delete rows and columns

A handle of six dots shows on the left edge of a row and on the top edge of a
column. It shows for the row or column that you point at, or that holds the
cursor. Select the handle to open the menu of that row or column. The row or
column that the menu acts on shows as selected.

- The row menu inserts a row above or below, moves the row up or down, and
  deletes the row.
- The column menu inserts a column to the left or to the right, moves the
  column, sets its alignment, and deletes it.
- The header row and the last column stay. You cannot delete them.
- Both menus have **Delete table**. It removes the whole table. Press
  **Ctrl + Z** to get it back.

To add a row at the end, select **Add a row**, the **+** bar under the table.
To add a column at the end, point at the table and select **Add a column**, the
**+** bar at its right edge.

To move a row or a column with the pointer:

1. Drag its handle. A line shows where it goes.
2. Release the handle to move it there. Press **Escape** to stop the drag and
   move nothing.

The header row does not move. The command palette offers the same actions while
the cursor is in a table.

### Paste and delete in a table

Copy a row or a range of cells, from a note or from a spreadsheet, and paste it
into a cell. It fills the cells from there to the right and down. The table
grows if it needs more rows or columns.

**Backspace** and **Delete** remove text and never a cell, a row or a column.
Tools that change whole lines, such as **Heading 1** and **Bullet list**, do
nothing in a table and show as disabled.

## Lists

### Move a list item

You can change the order of the items of a list, a task list included. An item
moves with its later lines and with the items under it. It stays in its own
list and at its own level.

- With a mouse, point at an item. A grip shows to the left of it. Drag the grip.
  A line shows where the item goes. Release the grip to move the item there.
  Press **Escape** to stop the drag and move nothing.
- On every device, put the cursor in the item and select **Move item up** or
  **Move item down** in the row of tools.
- On a keyboard, press **Alt + Up arrow** or **Alt + Down arrow**. On a Mac,
  press **Option** and the arrow. Outside a list, these keys move the line of
  the cursor.

A numbered list keeps its first number and counts on from it after each move.
Press **Ctrl + Z** or **Cmd + Z** to put the item back.

### Numbers in ordered lists

An ordered list shows numbers. A list inside it shows the letters a, b, c. The
next list inside shows the numerals i, ii, iii. Below that level the three
styles start again.

The note keeps plain numbers in the source, so the file reads the same in any
other Markdown tool. You see the number of the source while your cursor is on
its line.

The editor keeps each list in sequence as you write. **Enter**, a paste, a
deletion, **Tab**, and **Shift + Tab** all put the numbers of the list back in
order. One undo removes the change and the new numbers together.

A list keeps the number it starts at. **Tab** puts an item inside the item
above it. A list that starts this way counts from one.

## Lines, paragraphs and code fences

### New lines and paragraphs

A new line shows as a new line in the editor and on a published page. The text does not move when your cursor goes into a paragraph or out of
it. Press **Enter** twice to start a new paragraph.

Other Markdown tools can join two lines of one paragraph into one line. Put a
blank line between the two lines if they must stay apart in those tools too.

### New lines in lists and quotes

- In a list, **Enter** starts a new item. Press **Shift + Enter** to start a new
  line in the same item.
- In a quote, **Shift + Enter** keeps the quote marks.
- Press **Enter** on an empty item to end the list. The editor removes the empty
  item and puts a blank line after the list. The text that you type next is a
  new paragraph in every Markdown tool.
- On an empty item inside another item, **Enter** moves the item out by one
  level.
- **Enter** on an empty line of a quote ends the quote in the same way.

### Code fences and formulas

Type three backticks or three tildes, with a language if you want one, and
press **Enter**. The editor writes the closing fence. It puts your cursor on the
empty line between the two fences.

A `$$` line and **Enter** do the same for a formula.

This also works above text that you wrote before. The text and any block below
it stay as they were. When you edit the first line of a fence that you did not
just type, and the fence has a closing fence below it or holds code, **Enter**
only starts a new line inside the block.

### Home and Shift + Home

On a list line or a quoted line, **Home** goes to the start of the text after
the bullet, the box, the number or the quote mark. On a numbered line or a
quoted line, press **Home** again to go to the start of the line.

**Shift + Home** selects the text first. A second press adds the marker to the
selection.

## Supported Markdown

The editor understands CommonMark and the GitHub set: tables, task list items,
strikethrough, autolinks, and footnotes. These all work as CommonMark describes:

- headings, and lists at any depth,
- ordered lists, block quotes, and inline code,
- fenced code with a language, and indented code,
- links, reference links, and images,
- thematic breaks, hard breaks, escapes, and entities.

A task box is a real checkbox. Select it to tick the line.

A table shows as a grid of cells. The note stores it as a GitHub table. A long
cell wraps onto more lines, so each column takes the width that its text needs.
A table that cannot fit even when its cells wrap scrolls sideways inside its own
outline. The rest of the note stays where it is.

### Code blocks

Code in a fence shows in colour, in the note and on a published page alike,
when the fence names one of these languages:

JavaScript (`js`), TypeScript (`ts`), JSON, CSS, HTML, Python (`py`), shell
(`sh`, `bash`, `zsh`), SQL, Go, Rust, YAML, Java, C, C++, C# (`cs`), PHP, XML,
Dockerfile, Kotlin, Swift, Ruby, TOML and Diff.

Code in another language shows as plain text.

Inside a fence of one of these languages:

- **Enter** indents the next line the way the language does.
- **Ctrl + /** or **Cmd + /** turns the line into a comment of that language.

Each code block shows the name of its language at the top and a **Copy** button
at the other end. Select **Copy**, or press **Tab** to reach it and then
**Enter**. The code of the block goes to the clipboard without the fences. The
button says **Copied** for a moment. A published page shows the same name and
the same button.

### Footnotes

1. Write `[^1]` after a word to add a footnote.
2. Write the note on a line of its own, for example
   `[^1]: The source of the quote.`

The label can be a number or a word. To write more than one paragraph in a
footnote, indent the next paragraph by four spaces.

The editor shows the label as a small raised mark, and shows the note in
smaller, quieter text. Put the cursor on a footnote to see its Markdown.

A published page shows a number for each footnote and puts the notes at the end
of the page. A label that no note defines stays as you wrote it.

### Alerts

A block quote whose first line is `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`,
`[!WARNING]` or `[!CAUTION]` is an alert. The marker leaves the text. The quote
shows the word and a colour instead.

### Math

- Inline math is `$x^2$` or `\(x^2\)` on one line, or `$$x^2$$`, which can go on
  to the next line of its paragraph. A run of three dollars closes on a run of
  three.
- Display math is a `$$` line of its own, the formula, then a closing `$$` line.
- One dollar starts a formula only when a character that is not a space follows
  it. The closing dollar has a character that is not a space before it and no
  digit after it. So `It costs $5 and $10 today` stays text, as it does in
  GitHub, Obsidian and Pandoc.
- To write a dollar sign that must not start a formula, write `\$`.

A formula that the editor cannot draw stays as readable source.

## Diagrams and images

### Diagrams

A code fence marked `mermaid` is drawn as a diagram, in the note and on a
published page.

A diagram that selects ELK uses the standard layout. Its nodes and links stay
visible. Their placement can change.

### Add an image

An image from this note shows the picture. An image from another site shows the
picture as well, and the address must start with `https`. Opening the note asks
that site for the picture, so the site learns that somebody opened it. The
request names no note and no address of yours.

To add an image to a note, use one of these ways:

- Paste the image.
- Drag the file onto the editor.
- Open the note menu, **Note actions**, and select **Attach an image**.

The editor uploads the image and writes the Markdown for you. The editor
accepts only images, and an upload needs a connection.

### View an image

Click an image to open it at full size over the darkened page.

- To close it, click outside the image, press **Escape**, or use the close
  button.
- To zoom, use the zoom buttons, the `+`, `-` and `0` keys, or the mouse wheel
  with **Ctrl** or **Cmd** held. When you zoom in, drag the image to move it.
- An image from this note has **Copy image** and **Download**. An image from
  another site has **Copy link** and **Open original**.

To change the Markdown of an image, click next to the image or move the cursor
onto it with the arrow keys.

## HTML in a note

A note keeps a safe set of HTML, the set that GitHub keeps. For example:

- `<kbd>Ctrl</kbd>` shows a key.
- `H<sub>2</sub>O` and `x<sup>2</sup>` show a subscript and a superscript.
- `<mark>` marks text.
- `<br>` breaks a line.
- `<details>` with a `<summary>` folds a block on a published page.

The note shows a key, a subscript, a superscript, a mark and other text
elements as they look. It shows a block element such as `<details>`, and `<br>`,
as its HTML. The tags are quiet, and the words between them read as the text of
the note.

Other HTML loses its tags and keeps its words. A script, a style, a text area
and a few other tags show as the text you typed, so a tag that you do not close
never hides the rest of the note.

A script, a style, an event, and a link or a picture written as HTML have no
effect. Write a link or a picture in Markdown instead. A link to anything other
than a web address, a mail address, another note, or an attachment loses its
destination and shows as plain text.

## Limits

The editor cannot show some notes as formatted text. These notes are too big or
too complex:

- a very large note,
- a note nested very deeply,
- a paragraph with very many formatting marks, such as a long run of nested
  links or emphasis,
- tables with very many cells.

The editor shows such a note as plain source, with one sentence that says why.
A save of the note stops and tells you what to change. For example, divide the
paragraph, or move some rows of a table to another note. Nothing is truncated
and no text is lost.
