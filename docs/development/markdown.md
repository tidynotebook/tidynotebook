# Markdown

NotesApp has one Markdown grammar and two readers of it. The editor and the
reader must never disagree about what a document means.

- `packages/markdown` is the definition. It parses with remark, applies the URL
  policy and the sanitizer, and returns HTML. It is the reference renderer, and
  it also builds the server-side search text.
- `packages/editor` is the live preview. It reads the Lezer Markdown syntax
  tree that CodeMirror already parses and turns it into decorations. The
  Markdown source stays the document at every position.

There is no third scanner. The outline reads the same tree.

See [decision 0001](../decisions/0001-one-markdown-grammar.md),
[decision 0002](../decisions/0002-widgets-only-where-text-cannot-express.md),
and [decision 0003](../decisions/0003-read-mode-uses-the-shared-renderer.md).

## What holds the two paths together

`tests/integration/markdown-equivalence.test.ts` reads the shared corpus in
`packages/markdown/test-data/content.ts` through both paths and reduces each
result to the same list of structural facts. The two lists must be equal, in
order. An ordered item carries the value a reader shows; its style and its
renumber are in [decision 0089](../decisions/0089-an-ordered-item-shows-its-place-and-keeps-its-number.md).

The editor side of that list comes out of the same function that builds the
decorations, so a construct that stops being decorated also stops being
reported. Add a case to the corpus rather than writing a private sample.

The corpus lives in a TypeScript file and not in a `.md` file for two reasons.
A browser-safe package cannot read a file from disk in a test, and Prettier
would repair the deliberately malformed Markdown that the corpus needs.

## Line breaks

A new line inside a paragraph is a line break on every surface, the way
Obsidian and Notion show it. A blank line starts a new paragraph. The stored
text keeps the CommonMark soft break, so the parse that the editor, the links
and the index read is CommonMark, and only the renderer writes the break
element. The two CommonMark hard break forms give the same break element.

The live preview keeps each source line on its own line and joins nothing,
so a paragraph never reflows under the caret. It hides the marker of a hard
break while the selection is away from its paragraph. Shift and Enter write a
plain new line that stays inside the list item or the quote. See
[decision 0107](../decisions/0107-a-new-line-is-a-line-break.md).
`render.test.ts` and `widgets.test.ts` hold the rule, and the corpus holds
one break of each kind.

## Delimiters that are ours to choose

`packages/markdown/src/math-syntax.ts` holds the math delimiter rule, and both
engines import it.

- One dollar is money, never math.
- Inline math is a doubled dollar pair or a backslash parenthesis pair, on one
  line. Math ends at the first closing pair, and a pair that its line does not
  close stays text.
- Display math is a doubled dollar fence on its own line.

remark-math gives the renderer the dollar pair only, because the backslash pair
is a CommonMark character escape. `packages/markdown/src/math-parens.ts` adds
the second pair as a text construct on the backslash, ahead of that escape, and
writes the tokens remark-math already reads, so both pairs build the same node.
Every other backslash keeps its CommonMark meaning.

## What the preview shows

Reveal is per construct, never per marker.

- A block construct shows its source when the selection touches the line that
  carries its marker. A fenced block shows its fences when the selection is
  anywhere inside it.
- An inline construct shows its source when the selection touches the whole
  construct, so a cursor inside a bold word shows both marker runs.
- A bullet and a task box are drawn at every caret, and no caret rests in
  them: a tap beside a box puts the caret on the item text. A bullet is drawn
  once a space follows it. Their source comes
  back only while a range selection covers the marker, so a person sees what
  a copy takes. See
  [decision 0033](../decisions/0033-a-task-box-is-a-control-not-a-marker.md)
  and [decision 0132](../decisions/0132-a-list-marker-holds-no-caret.md).

A widget exists only where text cannot express the result: an image, a diagram,
and math. A table stays editable text: each row of the source is one row of a
real table and each cell holds its own padding, so the columns line up without
a widget and every cell is edited where it stands. The padding never shows, and
a cell wraps, so a column takes the width of its text
([decision 0147](../decisions/0147-a-table-sizes-to-its-text-and-its-controls-sit-on-its-edge.md)). The delimiter row follows
the same reveal rule as every other marker, because the columns already state
what it says. Each widget covers whole lines or one span, is atomic for cursor
movement, disappears while the selection touches it, and puts the cursor at the
start of its source when clicked. A picture is a button that opens the image
viewer, and a click beside it opens the source
([decision 0145](../decisions/0145-a-click-on-a-picture-opens-the-image-viewer.md)).
A widget that cannot render falls back to its source with one short sentence,
so a note never loses text to a failed render.

## Safety

The renderer drops raw HTML and keeps its text, so nothing a person writes as
HTML can act. The URL policy keeps a small set of schemes and the two internal
prefixes, and it removes the destination of anything else rather than following
it. An external image loads over HTTPS and no other scheme, and it carries
`referrerpolicy="no-referrer"`. See
[decision 0067](../decisions/0067-an-external-picture-loads-by-itself.md).

`packages/markdown/src/policy.ts` is the one definition of both rules. A change
there is a change to the security surface, so it needs a test that proves the
refusal.

## Limits

NotesApp is one self-hosted deployment with one author, and that author is the
only person who can put text in front of the parser. The two limits guard
against an accident rather than an attack: a document size and a nesting depth,
both stated in `packages/markdown/src/limits.ts`.

Nesting is checked twice. A prefix scan runs before the parse, because nesting
is the one shape that can stop the parser rather than slow it down. The tree is
measured again after the parse, because an inline construct nests without a
line prefix. Both counts are in levels an author wrote.

There is no wall-clock timeout and no cost score. A timeout would bound one
render on one machine and make the outcome depend on the load of that machine,
so the same note could render for one reader and fail for another.

Every entry point parses through the same function, so every consumer is
bounded. A refused document throws rather than being truncated, because a half
note looks like data loss. The error message is technical, so the storage
package maps it to a domain code and the boundary answers with a sentence the
person can read.

## Cost

Decorations are built for the visible ranges only, from the tree. Nothing reads
the whole document as a string per keystroke. The preview builder reports how
many tree nodes it entered, and its unit test bounds that count for a large
document instead of timing a clock, so the test does not depend on machine
load.

## Styling

The editor writes its presentation in TypeScript, because CodeMirror builds its
own DOM and a utility class cannot reach it. Every value is a central theme
variable declared in `apps/web/src/tailwind.css`.
`packages/editor/src/editor-theme.ts` names the list, and
`tests/integration/theme-variables.test.ts` asserts that the built stylesheet
declares all of them.
