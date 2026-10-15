# packages/editor

## Purpose

The CodeMirror Markdown editor: the extension set, the live preview
decorations, the widgets, the commands and keymaps, the outline, note link
completion, the slash menu, the find panel, paste conversion, the binding of
an open note, and the unified diff for History.

## What lives here and what does not

- `create-editor.ts` builds one instance; `extensions.ts`, `language.ts` with
  the fence languages and code tokens of `@notesapp/markdown` (0173),
  `keymaps.ts`, `commands.ts` and `list-numbering.ts` (0089) build it.
  `grammar-gate.ts` turns the language off past the limits (0182).
- `document-binding.ts` joins the live document of an open note to one view
  (0082); `openBoundNote` holds the work of the person until a screen takes
  it (0175). A bound editor takes its undo from Yjs; a plain one keeps
  CodeMirror history. Work of another device waits in its gate while an IME
  composition runs, because an update inside it loses the composed text.
- `live-preview.ts` has the decorations, the inline HTML of 0157 among them,
  `widgets.ts` the widgets, `table-grid.ts` and `table-controls.ts` the table
  (0095 to 0098, 0147), `list-move.ts` and `list-controls.ts` an item (0106).
- `editor-theme.ts` is the typed CodeMirror adapter and the one place here
  that sets presentation in TypeScript. It reads the named steps of
  `apps/web/src/tailwind.css`, which `editorThemeVariables` lists for the
  integration test, and the runtime `--notes-*` palette.
- The rhythm of a note comes from the note: a blank source line is a line at
  the full height, so `.cm-line` adds no block padding and a heading adds the
  one step that groups it with its text. Strong text, a heading and a table
  head read `--font-weight-note-heading`.
- A list marker line is a lead and a body cell, and a table row is cells. A
  cell is an outer, inclusive mark of `layoutClasses`, so no mark splits it.
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
  `syntaxTree(state)`. Never scan the source, or the whole note on a key.
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
- One dollar opens math through `dollarMathEnd` of `@notesapp/markdown` (0171).
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
| `src/fence-close.ts`      | Enter writes the closer of a typed fence     |
| `src/footnote-syntax.ts`  | GFM footnotes in the grammar (0156)          |
| `src/document-binding.ts` | Binds a live note document to a view (0082)  |
| `src/table-grid.ts`       | A table as a grid over its text (0095)       |
| `src/table-controls.ts`   | The grips and add bars of a table (0147)     |
| `src/pointer-drag.ts`     | What one pointer event does to a drag (0098) |
| `src/list-line.ts`        | The marker of one list line, from its text   |
| `src/list-marker.ts`      | The drawn marker and its caret rule (0132)   |
| `src/list-move.ts`        | Moves a list item among its siblings (0106)  |
| `src/list-controls.ts`    | The grip that drags a list item (0106)       |
| `src/format-context.ts`   | Where the caret stands for the tools (0094)  |
| `src/spell-check.ts`      | What the browser spell check skips (0103)    |
| `src/code-controls.ts`    | The bar of a code block (0174)               |
| `src/grammar-gate.ts`     | The language only within the limits (0182)   |
| `src/note-measure.ts`     | The reading of the lines after a change      |
| `src/search-panel.ts`     | The find and replace panel                   |
| `src/slash-menu.ts`       | The slash menu of the blocks                 |
| `src/caret-in-view.ts`    | The caret stays in view as the text shrinks  |
