# Daily notes

This page is for the person who writes the notes. It explains the note of each
day and the calendar in the sidebar that opens it.

## The note of a day

Each day has one note. By default its name is the date, for example
`2026-09-24`, and it is in the folder **Daily notes**. You can change the folder
and the name in the settings.

It is an ordinary note. You edit, search, link, export and move it to Trash like
any other note.

If you rename the note or move it to another folder, it is no longer the note
of its day. The next time you open that day, a new note is made.

## Open a day with the calendar

1. In the thin bar at the left edge of the sidebar, select **Calendar**. To show
   your notes again, select **Notes**. The sidebar keeps the view that you chose.
2. Select a day. Its note opens. If the day has no note, a new one is made.

The calendar shows one month. A day with a note has a dot under its number, and
today has an edge around it.

- Select **Open today's note**, the calendar icon beside the month, to open the
  note of today. The date comes from the clock of your device. The command
  palette also has **Open today's note**.
- Select **Previous month** or **Next month** to change the month.
- With the keyboard, the arrow keys move one day or one week. **Home** and
  **End** move to the start and the end of the week. **Page Up** and
  **Page Down** move one month. Hold **Shift** with **Page Up** or **Page Down**
  to move one year. Press **Enter** to open the note of the selected day.

## Settings

Open **Settings** and go to **Daily notes**. The settings apply to the open
workspace, and they follow your account to every device.

- **Template** is a note whose text a new daily note starts with. The text is
  copied once, when the daily note is made. A later change to the template does
  not change the daily notes that already exist. Select **No template** to start
  each daily note empty.
- **Open today's note when the app opens** opens the note of today each time the
  app starts on the note list. If you open the app with the address of a note or
  of another page, that page opens instead.
- **Folder** is the folder that holds the daily notes. Leave it empty to keep
  them at the top of the workspace.
- **Name format** is the name of each daily note, written with date tokens. The
  line under the fields shows the name of today's note as you type.

A new folder or format applies when you leave the field or press **Enter**. If
you change the folder or the format, the notes you already have stay where they
are. The calendar marks only the notes that have the new name.

The template can use placeholders in double braces. The app fills them when it
makes the daily note. See
[Placeholders in a template](templates.md#placeholders-in-a-template).

### Date tokens

The name format uses the same tokens as Obsidian.

| Token  | Example for Friday 25 September 2026 |
| ------ | ------------------------------------ |
| `YYYY` | `2026`                               |
| `YY`   | `26`                                 |
| `Q`    | `3`, the quarter                     |
| `MMMM` | `September`                          |
| `MMM`  | `Sep`                                |
| `MM`   | `09`                                 |
| `M`    | `9`                                  |
| `DD`   | `25`                                 |
| `D`    | `25`                                 |
| `Do`   | `25th`                               |
| `dddd` | `Friday`                             |
| `ddd`  | `Fri`                                |
| `dd`   | `Fr`                                 |
| `d`    | `5`, where Sunday is `0`             |

- A `/` makes a folder. For example, `YYYY/MM/YYYY-MM-DD dddd` puts the note of
  today at `2026/09/2026-09-25 Friday` in the daily notes folder.
- Put other text in square brackets, for example `[Journal] YYYY-MM-DD`. A
  letter outside brackets can be a token: `D` in `Day` writes the day.
- The format must have a year, a month and a day of the month.
- The names of months and days are in English on every device.

## The template note

The template of a daily note fills its placeholders once, when the daily note
is made. It uses the date of that note and the time of now. The placeholders are
the same as in every other template.

If you move the template note to Trash, a new daily note starts empty. When you
restore the template, it is the template again.

## With no connection

The settings that your device read last stay in use. If the template text is not
on your device and there is no connection, the daily note is not made. Connect
to the internet and try again.
