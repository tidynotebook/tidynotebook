# packages/ui

Read the root [AGENTS.md](../../AGENTS.md) first. This file adds the rules of
this directory. The recipe for a whole feature is in
[docs/development/feature-workflow.md](../../docs/development/feature-workflow.md).

## Purpose

The shared interface pieces: the theme registry, layout primitives,
accessible controls, menus, dialogs, notices, and lightweight SVG icons.
`src/themes/` is the only place in this repository that holds a colour value.

## What lives here and what does not

- `src/themes/` holds one file per theme family and `src/themes/index.ts` is
  the registry. `src/theme.ts` declares `ThemeTokens` and `SyntaxTokens`,
  `applyTheme`, and the contrast helpers.
- `src/layout.tsx` holds `Page`, `PageHeader`, `Card`, `EmptyState`,
  `ListRow`, `Toolbar`, and `pageGutter`, the one distance from the edge of
  the screen to the content. `src/controls.tsx`, `src/menu.tsx`,
  `src/dialog.tsx`, and `src/notice.tsx` hold the controls.
  `src/loading.tsx` holds `LoadingState`, the one placeholder that a screen
  shows while it waits.
- No screen, no route, no data fetching, and no storage lives here. A control
  takes its data and its callbacks as props.

## Allowed imports

Nothing from the workspace. Only `react`.

This package is browser code. It cannot import a Node built in module, a Node
only package, or a server only package.

## How to add a common thing here

- **A theme.** Copy a file in `src/themes`, fill in the family, the name, the
  source, and the variants, add the family to `themeFamilies` in
  `src/themes/index.ts`, and record the project and the licence in
  `THIRD_PARTY_LICENSES.md`. See
  [docs/development/themes.md](../../docs/development/themes.md).
- **A control.** Add the component in `src/controls.tsx` and export it from
  `src/index.ts`. Build its classes with the named scale, and give an icon
  only action an accessible name and a title.
- **A layout primitive.** Add it in `src/layout.tsx` and use it from every
  screen, so spacing and the heading ramp stay decided in one place. A frame
  that cannot use `Page` reads `pageGutter` rather than its own padding.

## Testing conventions here

`node --test` through `pnpm test:unit`. `src/theme.test.ts` walks the whole
registry and fails with the exact token, surface, and theme that misses a
contrast rule, so a new theme needs no new test. A class building helper such
as `buttonClassName` is a pure function and is tested as one.
`tests/integration/theme-variables.test.ts` proves that the built page and
the editor read the same palette.

## Forbidden here

- No colour value outside `src/themes/`. No hex value, no `rgb(`, and no
  named colour utility such as `text-white` or `bg-black`.
- No arbitrary Tailwind value such as `w-[32rem]`, and no `style=` JSX
  attribute.
- No `text-xs`. `text-control` is the smallest size.
- No `dangerouslySetInnerHTML`.
- No network call, no storage, no router, and no workspace dependency.
- No theme that misses a contrast rule. Move the token along its own
  lightness until `theme.test.ts` passes, and note it in the licence file.

`tools/check-design-rules.mjs` fails `pnpm lint` on each of these.

## Key files

| File                      | Purpose                                     |
| ------------------------- | ------------------------------------------- |
| `src/index.ts`            | The one public entry point                  |
| `src/themes/index.ts`     | The theme registry                          |
| `src/theme.ts`            | Token names, `applyTheme`, contrast checks  |
| `src/layout.tsx`          | Page, PageHeader, Card, EmptyState, ListRow |
| `src/controls.tsx`        | Buttons, inputs, and their class rules      |
| `THIRD_PARTY_LICENSES.md` | The source and licence of every palette     |
