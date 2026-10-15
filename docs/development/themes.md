# Themes

A theme is data. `packages/ui/src/themes` holds one file per theme family, and
`packages/ui/src/themes/index.ts` is the registry that every consumer reads. No
other file in this repository holds a colour value.

See [decision 0016](../decisions/0016-themes-are-data-in-one-registry.md).

## The shape of a theme

`ThemeTokens` and `SyntaxTokens` in `packages/ui/src/theme.ts` name every value
a theme must carry. The module documentation there states what each token is
for and which contrast rule holds it. Read that file rather than a copy here.

A family groups the light and the dark variant of one palette. A family may
publish one variant only; it then answers both appearances with that one.

A value that is computed from a palette is not theme data. `derivedPropertyNames`
in the same file names each one, and `themeProperties` writes it with the
tokens, so a new theme file states none of them and cannot place one wrong. See
[decision 0053](../decisions/0053-the-divider-is-derived-from-the-palette.md)
and
[decision 0057](../decisions/0057-a-control-fill-states-its-hover-in-the-palette.md).

## Who reads the registry

- The Tailwind palette, through `applyTheme`, which writes every token as a
  custom property on the document element.
- The CodeMirror adapter, which reads those properties. A theme change
  therefore repaints an open note with no reconfiguration.
- The script that runs before the first paint. A Vite plugin writes the whole
  registry into `apps/web/index.html` at build time, so the page never flashes
  the wrong palette.
- The installed manifest, whose interface colour the same plugin writes.
- A page with no script, a published page or a legal page. The build appends
  the Default dark and light palettes to the one stylesheet, for a root with
  no `data-theme`, so the page follows the preference of the device. See
  [decision 0151](../decisions/0151-a-page-with-no-script-follows-the-device-palette.md).
  Its code reads the syntax group through the `--color-syntax-*` names of
  `apps/web/src/tailwind.css`, as the editor reads `--notes-syntax-*` (record
  0159).
- The sandboxed diagram frame, which receives the colours it paints with in the
  render request.

## The stored preference

An account stores an appearance and a theme family. The appearance selects the
variant and the family selects the palette. An account that has not chosen gets
the Default family, which states no taste. See
[decision 0056](../decisions/0056-the-default-theme-has-no-opinion.md). Three
places state which family that is, because the server holds the family as an
opaque slug: `defaultThemeFamilyId` in the registry, `defaultThemeFamily` in
`packages/storage-server/src/identity-store.ts`, and the `theme_family` column
default in `packages/storage-server/src/schema.ts`. They move together. Both are written to the device
first and sent to the account in the background, so the choice applies at once
and survives a failed request. A family the client does not know falls back to
the default family, so a stored value never leaves the page without colour.

## Imported themes

A person imports a theme file, and the account keeps it. See
[decision 0143](../decisions/0143-a-person-imports-a-theme-that-the-account-keeps.md).

- `themeProblems` in `packages/ui/src/theme-rules.ts` is the one rule set of a
  palette. `theme.test.ts` holds the registry to it, and the import refuses a
  palette that breaks it with the words of `themeColourLabels`.
- `packages/ui/src/theme-file.ts` reads and writes the file. The download of
  the theme in use writes the same shape, so it is the start of a new theme.
- The account answers its themes with its settings. The server checks the shape
  of each colour, the count, and that a chosen imported theme is still held
  under the settings lock, and `apps/web/src/lib/imported-themes.ts` reads
  every stored theme through the file reader again, so a theme that fails the
  rules is neither offered nor painted.
- The family of an imported theme is `custom-` and its identifier. The device
  keeps the palette of the chosen one for the script of the first paint, from
  `apps/web/src/lib/first-paint.ts`, which also builds the registry data of the
  build.

## Adding a theme

1. Copy an existing file in `packages/ui/src/themes` and name it after the
   family.
2. Fill in the family identifier, the name, the source project with its address
   and licence, and one or two variants with their tokens and syntax colours.
   Take the values from the published palette of that project.
3. Add the family to the registry in `packages/ui/src/themes/index.ts`.
4. Record the project, the licence, the address, and every value you had to
   derive in `packages/ui/THIRD_PARTY_LICENSES.md`.
5. Run the unit tests of the package. `theme.test.ts` holds the whole registry
   to `themeProblems`, which names the exact colour, surface, and palette that
   misses a rule. Move that token along its own lightness until it passes, and note the
   change in the licence file.
6. Use the completion steps in [AGENTS.md](../../AGENTS.md).

Nothing else changes. The settings screen, the pre-paint script, the manifest,
the editor, and the diagram frame all read the registry, so a new family
appears in the theme picker with its swatch as soon as it is registered.
