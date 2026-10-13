# Templates

This page is for the person who writes the notes. It explains how to copy a
template into a note, and the placeholders that a template fills in.

## What a template is

A template is an ordinary note in your template folder. You keep the text that
you write again and again in it, for example a grocery list for each month.
When you insert the template, the app copies its text into the open note and
fills in each placeholder.

The template folder is **Templates** by default. Every note in that folder is a
template, and so is every note in a subfolder of it.

## Insert a template

1. Open the note that gets the text. Put the cursor where the text must go.
2. Open the command palette with **Ctrl + P**, or **Cmd + P** on a Mac.
3. Select **Insert from template**. The palette shows your templates.
4. Type a part of the name to find a template, and press **Enter**.

The text goes in at the cursor. If you selected text, the template replaces it.
Press **Ctrl + Z** once to remove the inserted text again.

- In the list of templates, press **Backspace** in the empty search field to go
  back to the actions.
- Press **Escape** to close the palette.
- If the folder has no notes, the palette offers **New template**. It makes a
  new note in the template folder.

## Change the template folder

1. Open **Settings** and go to **Templates**.
2. In **Folder**, type the name of the folder, for example `Work/Templates`.
3. Leave the field or press **Enter**.

The line under the field shows how many templates the folder has. The setting
applies to the open workspace, and it follows your account to every device. A
change of the folder moves no note.

## Placeholders in a template

A placeholder is a name in double braces. The app fills it in once, when it
copies the template. The template note itself keeps its placeholders.

| Placeholder                 | Example for 1 October 2026 at 18:04     |
| --------------------------- | --------------------------------------- |
| `{{date}}`                  | `2026-10-01`                            |
| `{{date:MMMM YYYY}}`        | `October 2026`                          |
| `{{date:dddd, Do MMMM}}`    | `Thursday, 1st October`                 |
| `{{time}}`                  | `18:04`                                 |
| `{{time:h:mm A}}`           | `6:04 PM`                               |
| `{{dddd}}` or `{{YYYY-MM}}` | `Thursday` or `2026-10`                 |
| `{{title}}`                 | the name of the note that gets the text |

- When you insert a template, the date and the time come from the clock of
  your device. A new daily note takes the date of its day.
- After `date:` or `time:`, use the date tokens of
  [Daily notes](daily-notes.md#date-tokens) and these time tokens.
- A placeholder with no `date:` or `time:`, such as `{{dddd}}`, takes date
  tokens only.
- A placeholder that the app does not know stays as you wrote it.

### Time tokens

| Token | Example for 18:04:09 |
| ----- | -------------------- |
| `HH`  | `18`                 |
| `H`   | `18`                 |
| `hh`  | `06`                 |
| `h`   | `6`                  |
| `mm`  | `04`                 |
| `m`   | `4`                  |
| `ss`  | `09`                 |
| `s`   | `9`                  |
| `A`   | `PM`                 |
| `a`   | `pm`                 |

## With no connection

The template folder that your device read last stays in use. If the text of a
template is not on your device and there is no connection, the template is not
inserted. Connect to the internet and try again.
