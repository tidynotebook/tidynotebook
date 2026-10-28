# 0240. A code block shows quiet fences and one ring

- Status: Accepted
- Date: 2026-10-28

## Context

Record [0002](0002-widgets-only-where-text-cannot-express.md) hid the fence
lines of a code block while the caret was away, and record
[0174](0174-a-code-block-carries-its-language-and-a-copy-action.md) put a bar
with the language and a copy action at the top of the card, with room kept
for it on the first line. In use (issue 517) this read as broken: the card
had an empty band at the top while the caret was in it, the line of the caret
drew a blue box of its own across the card, and three typed backticks drew an
empty card around a hidden line. Hidden fences also joined source to the code
lines, so the caret and a copy met text that the screen did not show.

## Decision

- A fenced code block keeps its fence lines on the screen. A fence line is
  quiet, smaller and dim, except while the caret is on it. The info string
  reads as a small label on the opening fence. The saved Markdown does not
  change.
- The card has even room above its first line and below its last. While the
  text has the focus and the selection is in the block, the edge of the whole
  card takes the focus colour. No single line draws a box.
- The bar of a fenced block stands on its opening fence line and carries the
  copy action alone, because the fence names the language. It steps aside
  while the caret is on that line. An indented block has no fence, so it
  keeps the bar of record 0174 and the room for it.
- A fence with no closer is not a card while the caret is on its opening
  line, and an opener with no line after it is never one. Enter on the opener
  writes the closer, as before, and the card then holds the caret.

This refines records 0002 and 0174.

## Consequences

- The caret, a selection and a copy meet the source that the screen shows.
- `live-preview.test.ts` holds the quiet fences, the ring and the typing
  flow, `widgets.test.ts` that no fence line hides, `code-controls.test.ts`
  the place of the bar, and `editor-theme.test.ts` the room and the label.
