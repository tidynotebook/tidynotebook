# Export

This page is for the person who writes the notes. It explains how to take your
notes out of tidy notebook, and how to bring notes in.

Every note can leave as a plain Markdown file. Export needs a connection,
because it reads the versions that your server accepted.

## Export one note

1. Open the note.
2. Open the note menu in the header (**Note actions**), then select
   **Export as Markdown**.

The note downloads as one `.md` file named after the note.

## Copy one note as Markdown

1. Open the command palette with **Ctrl + P**, or **Cmd + P** on a Mac.
2. Select **Copy this note as Markdown**.

The whole text of the open note goes to the clipboard as Markdown. You do not
have to select text first.

The copy holds the text that you see, which includes text that you have not
saved yet. It does not need a connection. A browser that has no clipboard, such
as one that opens the application over plain HTTP, cannot copy the note. Use
**Export as Markdown** there.

## Export every note

1. Select your avatar at the right end of the header, then select **Settings**.
2. In the **Export** section, select **Export all notes**.

Your browser downloads one zip file to its downloads folder, as with any other
download. A large workspace does not need the memory of the device. The zip file
holds:

- every note as a `.md` file, at its folder path, so your folders come out as
  folders;
- an `attachments` folder with your images.

The files are ordinary Markdown. You need no application to read them again.

### What an export holds

An export holds the versions that your server accepted. It does not hold:

- text on this device that you have not saved yet;
- notes in Trash;
- earlier versions from History.

Save first if you want your newest text included. Restore anything you need from
Trash before you export.

## Import notes

1. Select your avatar at the right end of the header, then select **Settings**.
2. In the **Import** section, select **Import workspace**.
3. Choose a zip file that contains Markdown files and images.

The import keeps each file path and each relative link. An imported path must
not be in use. If a path is in use, rename or remove that file before you import
the zip file again.

When the import is done, the **Import** section counts the notes and the images
that came in. It also counts the files that it left out and names their kinds.

### What the import takes and leaves out

The import takes the Markdown files and the images of the zip file. A hidden
file, such as `.ideas/plan.md`, is a note like any other, so a zip file of an
export comes back whole.

The import leaves out two kinds of file:

- The settings of an app: the `.obsidian`, `.trash`, `.git` and `__MACOSX`
  folders, a `.DS_Store` file and a file whose name starts with `._`.
- Every file that is not a note or an image, such as a `.canvas` or a `.pdf`
  file.

### Import an Obsidian vault

You can import an Obsidian vault as a zip file.

- The import puts each image that is not in the `attachments` folder into that
  folder, and the links to the image follow it. When that folder already holds
  an image with the same name, the moved image gets a number after its name.
- A wiki link such as `[[Plan]]` or `![[photo.png]]` becomes a normal Markdown
  link when the zip file holds its note or its image. The image in the folder of
  the note comes first.
- A wiki link to something that is not in the zip file stays as text.

### Size limit

One zip file holds up to 65534 files and 4 GiB. **Export all notes** and
**Import workspace** both keep to that limit, so every zip file that an export
writes comes back through an import.

A workspace that holds more cannot leave as one zip file. The **Export** section
says so. Move some notes to another workspace, and export each workspace.

When the server cannot take a zip file, the **Import** section says why and what
to do next.
