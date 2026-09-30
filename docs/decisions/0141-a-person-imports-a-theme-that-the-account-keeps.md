# 0141. A person imports a theme that the account keeps

- Status: Accepted
- Date: 2026-10-01

## Context

[Issue 137](https://github.com/bkhanale/notesapp/issues/137) asks that a person
import a theme of their own, select it with the built-in themes, and see what to
correct when it cannot be used. Record 0016 makes a theme data in one registry,
`packages/ui/src/themes`. The account keeps the chosen family as an opaque slug
(`Preferences` in `packages/core/src/workspaces/ports.ts`), and the device reads
the family before the first paint from the build output in
`apps/web/index.html`. The contrast rules that hold every theme live in
`packages/ui/src/theme.test.ts` and reach no running code. `apps/server` cannot
import `packages/ui`.

## Decision

- **The file.** A theme file is JSON: a name and a `light` palette, a `dark`
  palette or both. A palette has the `tokens` of `ThemeTokens` and the `syntax`
  of `SyntaxTokens`, each a six digit hex value. `packages/ui/src/theme-file.ts`
  reads it and writes it, so a person downloads the theme in use as the start
  of a new one.
- **One set of rules.** `themeProblems` in `packages/ui/src/theme-rules.ts` is
  the contrast rule set. `theme.test.ts` holds the registry to it, and an import
  lists every problem it finds by the name of the colour and the surface, so
  the person knows what to change. A theme with a problem does not import.
- **The account keeps it.** An imported theme is a row of `account_themes`, at
  most `customThemeLimit` of `packages/core` for one account. `Preferences`
  answers the themes of the account, so every device receives them with the
  account, and the family slug of one is `custom-` and its identifier. The
  contract checks the shape of each colour and `packages/core` checks the name
  and the count. `importTheme` and `deleteTheme` answer the new `Preferences`.
- **The client checks again.** A stored theme that fails `themeProblems` is not
  offered and not painted, because the server cannot read the contrast rules.
  The chosen family falls back to the default family, as an unknown slug does.
- **Delete.** Delete of the theme in use sets the family of the account back
  to the default family in the same transaction.
- **The first paint.** The device keeps the computed properties of the chosen
  imported theme under one storage key, and the script of `index.html` paints
  them before React starts, as it does for a family of the registry.

This refines record 0016: the registry stays the one place in the source with a
colour value, and an imported theme is data of the account.

## Consequences

- A person can use any palette that meets the contrast rules on every device of
  the account, and a palette that does not meet them names the fix.
- The server stores colours that it does not judge. Only the account that
  imported them reads them, so a bad palette harms nobody else.
- `packages/ui/src/theme-file.test.ts`, `packages/core` use case tests and
  `tests/integration/account-themes.test.ts` hold the decision.
