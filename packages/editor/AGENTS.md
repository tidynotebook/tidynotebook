# packages/editor

Read the root [AGENTS.md](../../AGENTS.md) first. This file adds the rules of
this directory. The recipe for a whole feature is in
[docs/development/feature-workflow.md](../../docs/development/feature-workflow.md).

## Purpose

The CodeMirror Markdown editor: the extension set, the live preview
decorations, the widgets, the commands and keymaps, the outline, note link
completion, paste conversion, and the unified diff for History.

## What lives here and what does not

- `create-editor.ts` builds one editor instance. `extensions.ts`,
  `language.ts`, `keymaps.ts`, and `commands.ts` build its behaviour.
- `live-preview.ts` holds the decorations. `widgets.ts` holds the block
  widgets. `outline.ts` reads the same syntax tree.
- `editor-theme.ts` is the typed CodeMirror adapter. It is the one place in
  this package that sets presentation in TypeScript, and it reads the central
  `--notes-*` variables.
- No Markdown grammar lives here. `packages/markdown` owns the language.
  Navigation leaves through injected callbacks, so no route and no endpoint
  lives here either.

## Allowed imports

`@notesapp/core`, `@notesapp/markdown`, `@notesapp/ui`, plus the CodeMirror
and Lezer packages and `diff`.

This package is browser code. It cannot import a Node built in module, a Node
only package, or a server only package.

## How to add a common thing here

- **A decoration.** Read the node from the Lezer tree with
  `syntaxTree(state)` in `live-preview.ts` and add the decoration for its
  range. Never scan the source text.
- **A command and its key.** Add the command in `commands.ts`, then bind it
  in `keymaps.ts` and add it to the exported `shortcuts` list, so the
  shortcuts screen stays complete.
- **A shared Markdown syntax constant.** Add it in `packages/markdown`, for
  example in `math-syntax.ts`, and read it here. Do not repeat a delimiter.

## Testing conventions here

`node --test` through `pnpm test:unit`. A test file is `*.test.ts` next to
its module. A decoration test builds an `EditorState` with the real extension
set and asserts the decorations that the state produces, so it proves the
tree reading and not a regular expression. `unified-diff.test.ts` is the
pattern for a pure module.

## Forbidden here

- No second Markdown grammar and no second scanner. Every decoration and the
  outline come from the Lezer tree through `syntaxTree(state)`.
- No second exception to the reveal rule. A task box is the one construct that
  keeps its control under the caret (record 0033); every other marker reveals
  its source when the selection touches it.
- No widget outside the three allowed kinds: an image, a Mermaid diagram, and
  display math. A table stays editable text with alignment decorations.
- No single dollar inline math. Inline math uses `$$...$$` or `\(...\)`.
- No network call, no database access, no token storage, and no import of
  `@notesapp/api-client`.
- No colour value. The theme adapter reads `--notes-*` and
  `--notes-syntax-*`.
- No replacement of the editor document during a React render, a theme
  change, or a preview update.

## Key files

| File                   | Purpose                                   |
| ---------------------- | ----------------------------------------- |
| `src/index.ts`         | The one public entry point                |
| `src/create-editor.ts` | Builds one editor instance                |
| `src/live-preview.ts`  | Tree driven decorations                   |
| `src/widgets.ts`       | The three allowed block widgets           |
| `src/editor-theme.ts`  | The typed CodeMirror presentation adapter |
| `src/keymaps.ts`       | Keymaps and the public `shortcuts` list   |
