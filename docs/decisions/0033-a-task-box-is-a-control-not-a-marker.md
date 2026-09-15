# 0033. A task box is a control, not a marker

- Status: Accepted
- Date: 2026-09-15

## Context

The live preview reveals the source of a construct while the selection touches
its line. `packages/editor/src/live-preview.ts` applies that rule to every
marker, the `TaskMarker` node included, so a caret on a task line replaced the
checkbox with its `- [ ]` text. A person who writes a list of things to do is
on that line at the moment they want to tick the item, so the one control the
line carries was gone exactly when it was needed. The `Cmd or Ctrl + Enter`
command still worked, but nothing on the screen said so.

Every other marker is notation: it states how the text around it reads, and a
person edits it as text. A task box is not notation. It is a control with two
states, and the person changes those states with a pointer, with touch, and
with the keyboard.

## Decision

A task box keeps its checkbox at every selection. `TaskMarker` always renders
`TaskCheckboxWidget`, and the list marker of a task item always hides, so the
line shows one box and its text whether the caret is on it or not. The `- [ ]`
source is never drawn again, and the `.cm-np-task-source` rule is removed from
`packages/editor/src/editor-theme.ts`.

This is the one exception to the reveal rule of decision 0025. It does not open
the closed widget set of decision 0002: a task box was already a widget there.

## Consequences

- Typing `- [ ]` makes a box at once, and the box stays while the item is
  written.
- The source characters stay in the document and stay addressable. Backspace
  and the arrow keys walk through the hidden range, because the range is not
  atomic, so the marker is still removable as text.
- `live-preview.test.ts` moves the caret to each offset of a task line and
  requires the box at every one of them. It also requires a plain bullet to
  keep the reveal rule, so the exception stays one construct wide.
- `docs/development/markdown.md` states the exception next to the rule.
