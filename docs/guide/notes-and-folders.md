# Notes and folders

This page is for the person who writes the notes. It shows how to make, name,
move, find, link, sort and remove a note, and how to use folders. The keyboard
detail is at the end.

## Make a note

1. Select **All notes** or a folder name in the sidebar. This chooses where the
   new note goes.
2. Select **New note**, the plus button above the tree. You can also use **New
   note** in the command palette, or **New note in this folder** in the menu
   of a folder.

The note opens at once with a name such as `New note`, and the cursor is in
the note. Write now.

A new note goes to your server when a connection is there. Until then, the
sidebar marks it **Local**.

## Name a note

Start a new note with a heading, for example `# Trip to Lisbon`. When you
pause, the note takes the heading as its name. While the note keeps the name
that the heading gave, the name follows the heading when you change it.

- When the folder already has a note of that name, the note takes the name
  with a number after it, for example `Trip to Lisbon 2`.
- A note that starts with text and not with a heading keeps its name.
- Links to the note from other notes follow a new name.

To give a note a name of your own:

1. Select the name. It is the last part of the line at the top of the screen.
2. Type the new name.
3. Press **Enter**, or select something else, to keep the name. **Enter** also
   puts the cursor in the note. Press **Escape** to keep the old name.

A name that you type stays when the heading changes. A daily note keeps the
name of its date.

Rules for a name:

- A name needs no `.md` ending. If you type one, the application removes it,
  because every note is already a Markdown file.
- A name holds only the file name. It cannot contain a slash. To put a note in
  a folder, use **Move to folder**. To make a note that starts in a folder, use
  **New note in this folder**.
- The application refuses a backslash and a name that another note uses. One
  sentence on the note says why. The last good name stays.

## Make a folder

1. Select **All notes** or a folder name. This chooses the parent.
2. Select **New folder**, the folder button next to **New note**. You can also
   use **New folder** in the command palette.
3. Type one name for the new folder, and select **Make folder**.

Select the arrow next to a folder to open or close it. **Expand all folders**,
the last button above the tree, opens every folder. When a folder is open, the
same button is **Collapse all folders**, and it closes every folder.

A folder is only a path. A new folder writes nothing to the server. It stays
visible on this device. It becomes real when a note is in it. It stays when
you move its last note to Trash.

## Move a note or a folder

Drag a note or a folder onto another folder. Drag it onto **All notes** to
move it to the top.

You can also use **Move to folder**. It is in the menu of a row, and in the
note menu in the header, named **Note actions**.

A move is refused when a note or a folder of that name is already there, or
when a folder would move into itself. One line at the foot of the tree says
why.

## Rename a note or a folder

1. Select the row and press **F2**. You can also select **Rename** in the menu
   of the row.
2. Type the new name in the field that opens in the row.
3. Press **Enter** to keep the new name, or **Escape** to keep the old one.

If you move away from the field, the row also keeps the new name. The focus
stays where you moved it.

When you rename a folder, every note inside it gets the new path.

If the application refuses the name, because a note or a folder of that name
is already there, one line at the foot of the tree says why. After **Enter**,
the field stays open, so you can type a different name. After you move away,
the row keeps its old name. Press **F2** to try again.

## Find a note

Select **Search** in the header, or press **Ctrl + P**. Type a few words. The
list shows notes whose name matches first. Then it shows notes whose text
matches, with a short excerpt around the match. An empty box lists the notes
that you changed most recently.

- Search works the same in every language.
- Each word also finds the longer words that start with it. For example,
  `plan` finds `planning`.
- A letter with an accent finds the same letter without one. For example,
  `cafe` finds `café`.
- Search reads the text as the formatted note shows it. A link address and a
  Markdown mark do not count.

### Find text inside one note

1. Press **Ctrl + F** in the editor, or **Cmd + F** on a Mac. A band opens
   above the note.
2. Type in **Find**.
3. Press **Enter** for the next match, or **Shift + Enter** for the match
   before it. You can also select **Next** and **Previous**.

**Select all** selects every match. To replace text, type the new text in
**Replace with**. Then select **Replace** or **Replace all**, or press
**Enter** in that field. **Match case**, **Regular expression** and **Whole
word** change how the text matches.

Press **Escape**, or select **Close**, to close the band. **Ctrl + H**, or
**Cmd + Option + F** on a Mac, opens the band with the replace field.

## Remove a note or a folder

1. Open the menu of the note row or the folder row.
2. Select **Move to Trash**. You can also press **Delete** in the tree.

The note menu in the header and the command palette offer the same action for
the open note.

The action runs at once. A bar offers **Restore** for a few seconds. A folder
action moves every note under the folder to Trash. See [Trash](trash.md).

## Sort the notes

1. Select **Sort notes** above the tree.
2. Select an order.

- **Name** with **A to Z** or **Z to A** puts the notes in alphabet order.
- **Date created** with **Newest first** or **Oldest first** uses the time you
  made each note.
- **Date updated** with **Newest first** or **Oldest first** uses the time you
  last changed each note.

The order applies to the notes in each folder. Folders stay above the notes,
in alphabet order from A to Z. This device keeps your order until you select
another one.

## Link one note to another

Type `](` to get a list of your notes. Select a note to insert a link. Type
`[[` to open the same list. It also inserts a normal Markdown link, so the
file stays readable in any other editor.

You can also type a whole wiki link, as you do in Obsidian. Examples are
`[[Plan]]`, `[[Plan|the plan]]` and `[[Plan#Next steps]]`. When you type the
last `]` and a note of that name is in the workspace, the editor changes the
text to a normal link. A paste of plain text does the same. A wiki link that
names no note stays as you wrote it.

Select a link to open it. The pointer changes over a link, so you can see what
one click does. To change the text of a link, move the cursor into it with an
arrow key, or select the text next to it. The link then shows its Markdown
source, and you can edit it. **Alt + Enter** opens the link at the cursor.

## See what links to a note

**Links to this note** is at the side of the open note. It lists the notes that
link to it. Select a name to open that note. Select the title of the list to
close it or to open it again. When no note links to this note, the list says
so. A narrow window hides this panel.

The list works without a connection, because this device reads your notes and
answers. It then says that the links come from this device. A link that you
type is in the list before you save it.

## The menu of a row

Each row of the tree has a menu. Open it in one of these ways:

- Select the button at the end of the row.
- Right click the row.
- Press **Shift + F10** or the **Menu** key.

A note row offers these items:

- **Open**
- **History**
- **Publish**
- **Rename**
- **Move to folder**
- **Duplicate**
- **Copy link**
- **Export as Markdown**
- **Move to Trash**

**Copy link** puts the address of the note on the clipboard. The address opens
the note for a person who signs in to your account. To share a note with other
people, use **Publish**.

A folder row offers **New note in this folder**, **New folder in this
folder**, **Rename**, **Move to folder**, **Publish** and **Move to Trash**.

## Select several notes

Hold **Ctrl**, or **Cmd** on a Mac, and select rows to add them to a
selection. Hold **Shift** and select a row to select every row between it and
the last row that you selected. The open note is part of the selection when
you start it.

The menu of a selected row then acts on the whole selection:

- **Move to folder** moves every selected note and folder.
- **Move to Trash** moves them all to Trash.

You can also drag a selected row to move the whole selection. Press **Escape**
to clear the selection. A plain select of a row also clears it.

## Use the keyboard in the tree

The tree takes one stop of **Tab**. Then use these keys:

- **Up** and **Down** move between rows.
- **Home** and **End** go to the first row and the last row.
- **Right** opens a folder. **Left** closes it, or goes to the folder above.
- **Enter** opens a note or selects a folder.
- **Delete** moves the selection to Trash.
- **Shift + Down** and **Shift + Up** extend the selection.
- **Space** adds the row that has the focus to the selection.
- **Ctrl + A** selects every row.
- **F2** renames the row.

When a row leaves the tree, for example after **Move to Trash** or **Move to
folder**, the focus goes to the next row.
