# Working offline

This page is for the person who writes the notes. It states what still works
when your device has no connection.

Your notes live on your device as well as on your server, so the application
opens and works offline.

## What works

- Opening the application, the note tree, and any note.
- Writing, and **Save**. The version is made on your device and queued.
- Creating, renaming, moving, and deleting a note or a folder.
- Trash, and **Needs attention**.
- Search, over the notes on this device.
- Changing the theme.

## What needs a connection

History, Restore, **Delete permanently**, Export, and attaching an image. Each
of these reads from or writes to your server.

## What you see

The bottom of the sidebar carries one sentence about your saves. Offline it
reads "No connection. Your notes stay on this device." When the connection
returns it changes to "Sending your save to the server." and then "Everything
is saved to the server."

The Save button reads **Saved on this device** for anything that is queued.
There is no separate queue list and no retry button: the queue sends itself in
order as soon as it can.

The command palette adds a line saying that its results come from this device.

## Two things to know

**Persistent storage.** After your first save the browser is asked to keep your
data. If it refuses, the application shows a notice, because offline work is
then not durable on that browser. Keep the tab open, and copy anything
important out.

**Updates.** When a new version of the application has downloaded, a notice
offers **Update now**. The update waits for you, so a running tab is never
replaced while you write. When your server needs a newer version, saving to
the server waits, and the same notice asks you to update. Your work stays on
this device until then.

When you select **Update now**, every open tab of the application stores its
text and closes, then reloads with the new version. If a tab cannot store its
text, the update stops and every tab stays as it was.

## Signing out with queued saves

If saves have not reached your server yet, **Settings** offers two buttons:
**Sign out and keep them**, which leaves them on this device for your next
sign-in, and **Sign out and remove them**, which does not.
