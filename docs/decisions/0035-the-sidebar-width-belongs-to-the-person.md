# 0035. The sidebar width belongs to the person

- Status: Accepted
- Date: 2026-09-15

## Context

The sidebar was one fixed width at every screen from `md` up, and there was no
way to put it away. A deep folder tree truncated its own names, and a person
who wanted the whole screen for a note had no control for that. Below `md` the
sidebar is already an overlay that opens and closes, so only the wide frame had
the gap.

A width that a person drags is normally an inline pixel style. The root
`AGENTS.md` refuses that: presentation comes from Tailwind utilities, and
`tools/check-design-rules.mjs` fails the build on an inline style and on an
arbitrary value.

## Decision

The sidebar has four named widths and a collapsed state, both chosen by the
person and stored on the device.
`apps/web/src/shell/sidebar-size.ts` holds the steps, the class of each step,
the matching inset of the content, and the parse of the stored value. A drag on
the edge of the sidebar moves the width to the nearest step, and the arrow keys
move it one step at a time, so a pointer is never required. `Cmd or Ctrl + \`
and a command palette action collapse and restore it.

A step and not a pixel, so every width is a utility class and the design rules
stay whole. A collapsed sidebar is invisible and not only off the screen, so
nothing inside it stays in the tab order.

## Consequences

- The tree can be made wide enough for a deep path, or put away for the note.
- A new width is one row in three records of `sidebar-size.ts`, because
  Tailwind reads whole class names out of the source.
- The choice never reaches the account. It is a device choice, like the open
  folders of the tree.
- `sidebar-size.test.ts` and `drawer.test.ts` hold the steps, the fallback of a
  broken stored value, and the tab order of a collapsed panel. A browser
  journey collapses the sidebar and restores it.
