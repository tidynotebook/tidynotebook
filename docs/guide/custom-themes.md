# Your own theme

This page is for the person who writes the notes and wants colours of their own.

## Import a theme

Open **Settings** and go to **Appearance**. Select **Import a theme** and choose
a theme file. When the file is correct, the application says that the theme is
imported, and the theme shows in the **Theme** list with the themes that ship
with the application. Choose it there, as you choose any other theme.

Your account keeps the theme, so it follows you to every browser where you sign
in. An account keeps a limited number of imported themes. To remove one, select
**Delete** next to its name under **Imported themes**. When you delete the theme
in use, the application goes back to the default theme.

## Start from a theme you like

Choose a theme, then select **Download this theme**. The file that you get is a
correct theme file with every colour in it. Change its name and its colours, then
import it.

## The theme file

A theme file is a JSON file. It holds a `name`, and a `light` palette, a `dark`
palette or both. When a theme has one palette, the application uses it for light
and for dark.

Each palette holds two groups: `tokens`, the colours of the application, and
`syntax`, the colours of code inside a code block. Write each colour as `#` and
six hexadecimal digits, for example `#1f2328`.

The application names a colour in words, such as Muted text. In the file, the
same colour is one word, `textMuted`. The downloaded file holds every name.

## When a theme does not import

The application reads the whole file before it keeps anything. When a part of the
file cannot be used, the theme does not import, and the settings list every part
to correct. Each line names the palette, the colour and what to change.

- A colour that is missing, or that is not `#` and six hexadecimal digits.
- Text that is hard to read on a background, or an edge or a focus ring that is
  hard to see.
- A shade behind a dialog that is lighter than a background, or a quiet edge
  that is as strong as the control edge.

Correct the file and import it again.
