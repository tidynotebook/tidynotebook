# packages/editor

Read the root [AGENTS.md](../../AGENTS.md) first. This file adds the rules of
this directory. The recipe for a whole feature is in
[the feature workflow](../../docs/development/feature-workflow.md).

## Purpose

The CodeMirror Markdown editor: the extension set, the live preview
decorations, the widgets, the commands and keymaps, the outline, note link
completion, paste conversion, the binding of an open note, and the unified
diff for History.

## What lives here and what does not

- `create-editor.ts` builds one instance; `extensions.ts`, `language.ts`,
  `keymaps.ts`, `commands.ts` and `list-numbering.ts` (0089) build it.
- `document-binding.ts` joins the live document of an open note to one view
  (record 0082). `openBoundNote` is what a screen uses, so no screen opens a
  document of its own. A bound editor takes its undo from Yjs and leaves the
  CodeMirror history out; a plain editor, which History and a diff use, keeps
  that history. Work of another device reaches a bound note through the gate
  of this module only: it holds one merged update while an IME composition
  runs, because an update inside a composition loses the composed characters.
- `live-preview.ts` has the decorations, `widgets.ts` the widgets,
  `table-grid.ts` and `table-controls.ts` the table (0095 to 0098), and
  `list-move.ts` and `list-controls.ts` the move of a list item (0106).
- `editor-theme.ts` is the typed CodeMirror adapter and the one place here
  that sets presentation in TypeScript. It reads the named steps of
  `apps/web/src/tailwind.css`, which `editorThemeVariables` lists for the
  integration test, and the runtime `--notes-*` palette.
- The rhythm of a note comes from the note: a blank source line is a line at
  the full height, so `.cm-line` adds no block padding and a heading adds the
  one step that groups it with its text. Strong text, a heading and a table
  head read `--font-weight-note-heading`.
- A list marker line is one row: a lead cell for indent and marker, and a
  body cell that wraps. `outline.ts` reads the same tree.
- The task box is drawn from the theme (0033) and alone reads `--notes-border`
  (0063). Other edges are `--notes-border-line` or `--notes-border-subtle`.
- No Markdown grammar lives here. `packages/markdown` owns the language, and
  navigation leaves through injected callbacks.

## Allowed imports

`@notesapp/core`, `@notesapp/markdown`, `@notesapp/ui`, the note document and
its bridge, the CodeMirror and Lezer packages, `y-codemirror.next`, and `diff`.
This package is browser code: no Node built in module and no server package.

## How to add a common thing here

- **A decoration.** Read the node from the Lezer tree with
  `syntaxTree(state)` in `live-preview.ts`. Never scan the source text.
- **A command and its key.** Add the command, dispatch it through
  `editingTransaction`, and list it in `shortcuts`. A formatting command is
  one row of `formatActions`; its key, tool and palette row read it (0094).
- **A shared Markdown syntax constant.** Add it in `packages/markdown` and
  read it here. Do not repeat a delimiter.

## Testing conventions here

`node --test` through `pnpm test:unit`, with no DOM. A test file is
`*.test.ts` next to its module. A decoration test builds an `EditorState`
with the real extension set and asserts the decorations that the state
produces. `unified-diff.test.ts` is the pattern for a pure module.

## Forbidden here

- No second Markdown grammar and no second scanner: every decoration and the
  outline come from the Lezer tree.
- A bullet and a task box hold no caret (0033, 0132). An ordered marker shows
  its source under the selection (0092). Others follow the reveal rule.
- No widget outside an image, a Mermaid diagram and display math, and no text
  decoration above a widget (204). A table stays text; only its model and
  writer change its rows and columns (0096).
- No single dollar inline math: use `$$...$$` or `\(...\)`.
- No network call, no database, no token storage, no `@notesapp/api-client`.
  No colour value: the theme adapter reads `--notes-*` and `--notes-syntax-*`.
- No replacement of the editor document during a React render, a theme
  change, or a preview update.

## Key files

| File                      | Purpose                                      |
| ------------------------- | -------------------------------------------- |
| `src/index.ts`            | The one public entry point                   |
| `src/create-editor.ts`    | Builds one editor instance                   |
| `src/live-preview.ts`     | Tree driven decorations                      |
| `src/widgets.ts`          | The three allowed block widgets              |
| `src/editor-theme.ts`     | The typed CodeMirror presentation adapter    |
| `src/keymaps.ts`          | Keymaps and the public `shortcuts` list      |
| `src/document-binding.ts` | Binds a live note document to a view (0082)  |
| `src/table-grid.ts`       | A table as a grid over its text (0095)       |
| `src/table-controls.ts`   | The handles of a table and their drag (0098) |
| `src/pointer-drag.ts`     | What one pointer event does to a drag (0098) |
| `src/list-line.ts`        | The marker of one list line, from its text   |
| `src/list-marker.ts`      | The drawn marker and its caret rule (0132)   |
| `src/list-move.ts`        | Moves a list item among its siblings (0106)  |
| `src/list-controls.ts`    | The grip that drags a list item (0106)       |
| `src/format-context.ts`   | Where the caret stands for the tools (0094)  |
| `src/icon-mark.ts`        | The one glyph grid of the editor             |
| `src/spell-check.ts`      | What the browser spell check skips (0103)    |
