# packages/ui

## What lives here and what does not

- `src/themes/` holds one file per family, `src/themes/index.ts` is the
  registry, the one place here with a colour value. `default.ts` starts a new
  account: ink action fill, meaningful blue (0056, 0062). `src/theme.ts`
  declares the tokens, `applyTheme`, the contrast helpers, and
  `derivedPropertyNames`: the divider (0053), the control hover (0057) and the
  tone surfaces (0065). `src/theme-rules.ts` is the one rule set of a palette
  and `src/theme-file.ts` the file of an imported theme (0143).
- `src/control-classes.ts` is the one recipe of a control, and nothing else
  writes the classes of a control (0065): `buttonClassName`, `rowClassName`,
  `fieldClassName`, `inlineFieldClassName`, `textAreaClassName`, `tabClassName`, `kbdClassName`, `badgeClassName`, `avatarClassName`,
  `edgeControlClassName` at a frame edge, `controlStripClassName` for a row
  that scrolls (0094), and `focusOutline` with `focusOutlineInset`.
  One element takes one colour class, a tone is in a recipe, and a class is
  whole, as Tailwind reads the text. `src/icon-grid.ts` is the grid of an icon
  (24, 1.5, 16 and 20); `src/glyph.ts` draws `glyph-parts.ts` in plain DOM.
- `src/layout.tsx` holds the page frame, `pageGutter`, and the row of every
  page from `layout-classes.ts` (0137). `controls.tsx`, `menu.tsx`,
  `dialog.tsx`, `notice.tsx` and `toast.tsx` hold the controls and the raised
  surfaces, `overlay-position.ts` the place of an overlay in `visible-area.ts`
  (0058), `loading.tsx` the placeholder of a wait, and `motion.ts` the named
  transitions, which no other module here may name (0054).
- No screen, no route, no data fetching, and no storage lives here. A control
  takes its data and its callbacks as props.

## Allowed imports

Nothing from the workspace, only `react` and `react-dom`, the second for
`createPortal` alone (0058). This is browser code: no Node built in module, no
Node only package, no server only package.

## How to add a common thing here

- **A theme.** Copy a file in `src/themes`, register it in
  `src/themes/index.ts`, record the licence in `THIRD_PARTY_LICENSES.md`, and
  use the existing theme conventions. A failing token moves
  along its lightness until `themeProblems` answers nothing, noted there.
- **A control.** Add it in `src/controls.tsx`, read its classes from
  `src/control-classes.ts`, export it, and give an icon only action an
  accessible name and a title. A control that needs a class of its own needs a
  recipe: add it to `control-classes.ts` and prove it in its test.
- **An icon.** Add it in `src/icons.tsx` inside `IconFrame`, draw it on the 24
  grid with no attribute of its own, export it, and delete an unused one.
- **A menu.** `label` names any trigger. Alternatives set `selected`, a set of
  rows names a `group`, and an unbounded list pins its create action.

## Testing conventions here

`node --test` through `pnpm test:unit`. `src/theme.test.ts` holds the registry
to `themeProblems`, so a new theme needs no new test. Node loads no `.tsx`
file, so a rule a test must read lives in a `.ts` module: `control-classes.ts`,
`icon-grid.ts`, `overlay-position.ts`, `dialog-classes.ts`, `dialog-focus.ts`.
`src/icons.test.ts` reads `src/icons.tsx` as text, the only way to see an
attribute an icon states for itself, and `tests/integration/theme-variables.test.ts`
holds the built page, the editor and the stylesheet fallbacks to one registry.

## Forbidden here

`tools/check-design-rules.mjs` fails `pnpm lint` on each of these.

- No colour value outside `src/themes/`, no utility such as `text-white`, no
  colour class that names no `--color-*` token of the stylesheet, and no
  family name or `font-family`: the face is declared in it alone (0061).
- No arbitrary value, no `style=`, no `dangerouslySetInnerHTML`, no `text-xs`
  or `text-sm`, no off-scale radius, no bare `rounded`, no `uppercase`, no
  `tracking-wide` or wider, no `font-bold` or heavier, no `border-dashed`, no
  opacity that fades a control, and nothing scales on press.
- No icon `size` other than 16 or 20 (0065). No `border-edge` or `ring-edge`
  except a checkbox, a task box and a drop target (0063). No `focus:` where
  `focus-visible:` is meant. No built in shadow utility (0052), no duration,
  easing or transition outside `src/motion.ts` (0054), no colour filter (0057).
- No network call, storage, router or workspace dependency.

## Key files

| File                      | Purpose                                                 |
| ------------------------- | ------------------------------------------------------- |
| `src/index.ts`            | The one public entry point                              |
| `src/themes/index.ts`     | The theme registry                                      |
| `src/theme.ts`            | Tokens, the colour scheme, contrast checks              |
| `src/control-classes.ts`  | The one recipe of every control, and `menuSurfaceStyle` |
| `src/icon-grid.ts`        | The one grid and the two sizes of an icon               |
| `src/icons.tsx`           | The one icon set                                        |
| `src/overlay-position.ts` | Where an overlay sits on the screen                     |
| `src/visible-area.ts`     | The part of the screen a person sees                    |
| `src/motion.ts`           | The named transitions of the application                |
| `src/layout.tsx`          | Page, PageHeader, Card, EmptyState, ListRow             |
| `src/layout-classes.ts`   | The row, column and side region of a page               |
| `src/controls.tsx`        | Buttons, inputs, a static meter and their wrappers      |
| `src/copy-action.ts`      | The words of a copy control (0174)                      |
| `src/code-figure.ts`      | The one recipe of a rendered code figure                |
| `THIRD_PARTY_LICENSES.md` | The source and licence of every palette                 |
