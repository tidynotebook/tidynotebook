# Working offline

This page is for the person who writes the notes. It states what still works
when your device has no connection, and what waits until the connection
returns.

Your notes live on your device as well as on your server, so the application
opens and works offline.

## What works offline

- Opening the application, the note tree, and any note.
- Writing. The note saves itself on your device and the application queues
  each version. **Ctrl + S**, or **Cmd + S** on a Mac, makes a version at once.
- Making, renaming, moving, and removing a note or a folder.
- Trash and **Needs attention**.
- Search, over the notes on this device.
- Changing the theme.

## What needs a connection

These actions read from or write to your server:

- History and **Restore**.
- **Delete** in Trash, which removes a note for good.
- **Delete permanently** for a workspace.
- Export.
- Attaching an image.

## See the state of your saves

The bottom of the sidebar shows one sentence about your saves.

1. Offline, it reads "No connection. Notes stay on this device."
2. When the connection returns, it reads "Sending your save to the server."
3. Then it reads "Everything is saved to the server."

A save that waits in **Needs attention** does not go when the connection
returns. The sentence then reads "1 save needs attention." See
[Saving and history](saving-and-history.md) to fix it.

There is no queue list and no retry button. The queue sends itself in order as
soon as it can. If another device changed the same note meanwhile, the work of
both goes into the note, and the note offers **Review**. See
[Saving and history](saving-and-history.md).

The command palette adds a line that says its results come from this device.

## Keep your data on the device

After your first save, the browser is asked to keep your data. If it refuses,
it can remove the data of this device when the device needs space. Notes on
your server stay safe, so a quiet notice says this once. Select **Close** to
remove the notice from that device.

When changes are only on this device and cannot go to your server, a stronger
notice shows until they do. Keep the tab open until then.

## Update the application

When a new version of the application has downloaded, a notice offers **Update
now**. The update waits for you, so the application never replaces a running
tab while you write.

When your server needs a newer version, saving to the server waits. The same
notice asks you to update. Your work stays on this device until then.

When you select **Update now**, every open tab of the application stores its
text and closes. Then the tabs reload with the new version. If a tab cannot
store its text, the update stops and every tab stays as it was.

## Sign out with saves that did not reach the server

If saves have not reached your server yet, the **Sign out** section of
**Settings** offers two buttons:

- **Sign out and keep them** leaves the saves on this device for your next
  sign-in.
- **Sign out and remove them** removes the saves from this device.
