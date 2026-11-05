# 0242. Tables keep readable column widths

- Status: Accepted
- Date: 2026-11-05

## Context

The editor measured the widest character as each column minimum. Fitting all
columns to the note then split ordinary words into short fragments. An empty
column had only padding and borders. The reader allowed breaks anywhere, so
its intrinsic minimum also lost word boundaries. A cap alone did not fix this.

## Decision

Keep the CodeMirror text grid and its table scroll wrapper. Measure preferred
widths from all source rows. Use word widths for readable minima, bounded by
the existing cap. A scoped theme floor gives empty and short columns room to
edit. The same floor applies after the first text is typed. A table can shrink
only to those minima. Further overflow scrolls inside the table.

Use semantic tables in published pages, documentation and template previews.
Give their cells the same floor and cap, with word wrapping and emergency
breaks for long tokens. Keep keyboard focus visible on each scroll wrapper.

Moving to an existing cell changes only selection. It does not reformat table
padding or create a text diff. This keeps navigation usable in long tables.
Actual table edits still use the existing writer.

The stored Markdown format does not change. The existing table model has no manual
column resizing or stored widths. This change adds neither feature.

## Consequences

[Obsidian advanced syntax](https://obsidian.md/help/advanced-syntax) documents
Markdown tables, inline formatting, alignment, and row and column actions.
It does not describe automatic width calculation.

[Notion simple tables](https://www.notion.com/help/columns-headings-and-dividers)
documents manual column resizing and an optional Fit to page width action.
It does not specify its automatic bounds. These documents describe supported
behavior, not a common sizing algorithm. The floor here is a product choice.

Browser checks must prove cell bounds, editing access, local scrolling and
page containment. Screenshots support those checks. Browser table layout and
canvas text measurement can differ between readers and the editor; exact
pixel equality between those surfaces is not a requirement.
