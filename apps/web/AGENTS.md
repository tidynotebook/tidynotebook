# apps/web

Read the root [AGENTS.md](../../AGENTS.md) first. This file adds the rules of
this directory. The recipe for a whole feature is in
[docs/development/feature-workflow.md](../../docs/development/feature-workflow.md).

## Purpose

The React web application: the router, the screens, the service worker, and the
sandboxed diagram frame. It composes the packages and holds no rule of its own.

## What lives here and what does not

- `src/shell/` is the app frame: the layout, the sidebar with its tree, width
  and drawer, the command palette, and the frame notices.
  `src/features/<feature>/` holds one feature each (notes, editor, history,
  trash, attention, folders, accounts, export). `src/lib/` holds pure helpers.
- `src/app.tsx`, `src/router.tsx`, and `src/main.tsx` compose the application.
  `src/pwa/` holds the service worker, `src/diagram/` the Mermaid frame.
- `src/tailwind.css` is the only application CSS source. It holds Tailwind
  imports, source registration, and the central theme variables only.
- A domain rule lives in `packages/core`, a Markdown rule in
  `packages/markdown`, and a reusable control in `packages/ui`.

## Allowed imports

`@notesapp/api-client`, `@notesapp/core`, `@notesapp/storage-browser`,
`@notesapp/sync`, `@notesapp/markdown`, `@notesapp/editor`, `@notesapp/ui`.

This package is browser code. It cannot import a Node built in module, a Node
only package, or a server only package. `vite.config.ts` is the one exception
that the boundary checker allows, because it runs in Node during the build.

## How to add a common thing here

- **A screen.** Add `src/features/<feature>/<name>.tsx`. Compose `Page`,
  `PageHeader`, `Card`, `EmptyState`, and `ListRow` from `@notesapp/ui`. Add
  the route in `src/router.tsx`. Read and write through a generated operation.
- **Testable logic.** Add a pure `src/lib/<name>.ts` and its `.test.ts`. A file
  that imports React is not `lib`; it stays with its feature. `save-state.ts`,
  `note-name.ts`, and `palette-items.ts` are the pattern.
- **A command palette action.** Add it in `src/lib/palette-items.ts`.
- **A move or a deletion.** Call `applyMoves` in `features/folders/` or
  `deleteNotes` in `features/editor/`. No screen holds either value (0032).

## Testing conventions here

`node --test` through `pnpm test:unit`. A test file is `*.test.ts` next to the
module it tests. There is no DOM unit framework, so a test covers a pure module
only, and it must prove the rule and its refusal path. Screen behaviour is
proved by a Playwright journey in `tests/e2e`.

## Forbidden here

`tools/check-boundaries.mjs` and `tools/check-design-rules.mjs` fail
`pnpm lint` on each rule below.

- No `fetch`, no `XMLHttpRequest`, no request URL. Call a generated operation
  from `@notesapp/api-client`.
- No handwritten CSS, CSS module, style sheet, or `style=` attribute.
- No colour value. Colour comes from the theme registry in
  `packages/ui/src/themes` through the theme tokens.
- No `text-xs`, no `text-white`, no `bg-black`, and no arbitrary Tailwind
  value such as `w-[32rem]`. Use the named type, spacing, and layout scales.
- No `innerHTML` and no `dangerouslySetInnerHTML`, except the sandboxed
  `src/diagram/frame-main.ts` in `tools/design-rules-allow.json`.
- No identifier, raw timestamp, error code, or engine notice in text that a
  person reads. A note path keeps its `.md` suffix in storage and never shows
  it in the name field.

## Key files

| File                                  | Purpose                         |
| ------------------------------------- | ------------------------------- |
| `src/app.tsx`                         | Application shell and stores    |
| `src/tailwind.css`                    | CSS source and layout scale     |
| `src/shell/shell.tsx`                 | Frame, tree, sidebar size       |
| `src/features/editor/note-editor.tsx` | The editor host and editor view |
| `vite.config.ts`                      | Build, theme assets, worker     |
| `src/logging.ts`                      | Browser sink for log events     |
