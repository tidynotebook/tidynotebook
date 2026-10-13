# Saving and history

This page is for the person who writes the notes. It explains how a note saves
itself, how to bring an older version back, and what to do when two devices
change one note.

## Your note saves itself

There is no Save button. Typing writes your text to this device at once. The
application makes a version when you stop typing for a moment, when you leave
the note, and when you switch to another tab.

To make a version at once, press **Ctrl + S**, or **Cmd + S** on a Mac.

## Check where your work is

The versions go to your server when this device has a connection. The line at
the bottom of the sidebar tells you where your work is.

- **Sending your save to the server.** Your work is on its way.
- **No connection. Notes stay on this device.** This device is offline. Your
  work goes to your server when the connection returns.
- **No connection. Saves wait on this device.** This device is online, but it
  cannot reach your server. Your work goes when the server answers again.
- **1 save needs attention.** Your server refused a save. The save waits under
  **Needs attention**, below this line. Nothing sends it until you act. See
  [Fix a save that needs attention](#fix-a-save-that-needs-attention).
- **Everything is saved to the server.** Your work is on your server.

## Bring back an older version

1. Open the note.
2. Open the note menu in the header, named **Note actions**, and select
   **History**. History needs a connection.
3. Find the version that you want. Each row says when the version was saved,
   for example `Saved at 14:32`.
4. Select **Restore** on that row.

The old text comes back as a new newest version. The application rewinds
nothing and removes no version, so you can go back again.

**Restore** is not on the newest version, which is marked **Current version**.

### Look at a version first

The versions are grouped by day, newest first. Each row also says what
changed, for example `3 lines added, 1 line removed`. When two versions of one
day were saved in the same minute, their rows show the seconds too. A row that
ends with `with changes from another device` is a version that holds the work
of two devices.

Select a row to open it. Then choose one of two views. Use the arrow keys to
move between them.

- **Changes** shows the difference between that version and the current
  version, line by line.
- **Preview** shows the version as the note looked then, with its headings,
  task boxes, tables and pictures.

If the note is an image, you see the picture of that version.

## When two devices change the same note

You never choose between two texts. The work of both devices goes into the
note. It appears in the open note on each device without a reload. Undo takes
back only what you typed on this device.

If your save went into the note together with changes that this device had not
seen, the note shows **This note has changes from another device.** Then:

1. Select **Review** to see what changed. The page compares the text of your
   save with the note now, line by line.
2. Or select **Dismiss** to close the notice.

Opening **Review** or selecting **Dismiss** closes the notice on this device
only. A later change from another device can show it again.

## Fix a save that needs attention

A save that your server refuses for good stays on your device. It appears
under **Needs attention** in the sidebar. This section shows only while a save
waits there.

Each row says why the server refused the save, says when the application kept
the text, and shows the text. Each row offers four actions:

- **Retry** sends the text again. When the note already has that text,
  **Retry** sends the note as it is now, so you keep your later changes.
- **Save as new note** puts the text in a note of its own. A new note never
  takes the name that a waiting save still holds on your server.
- **Copy text** puts the text on the clipboard.
- **Discard** removes the text from this device. The application asks you to
  confirm with **Confirm discard**, or you can select **Keep**.

You can also change the note itself. For example, when the row says "Divide
the paragraph.", divide the paragraph in the note. Your next save goes to your
server with all of your text, and the row goes away.

When no save waits there any more, the line at the bottom of the sidebar
states your other work again.

After an update of tidy notebook, earlier work on this device that could not
go into its note waits under **Needs attention** too. That note shows a
notice, and its **Review** compares the earlier work with the note now and
opens **Needs attention**.
