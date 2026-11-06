# Documentation

This page describes document integrity checks and gives short writing advice.
The code is the source of truth. Use documents to explain intent and link to
code that supplies the details.

## Integrity checks

`tools/check-docs.mjs` runs inside `pnpm lint`. It finds all Markdown files
under `docs/`, including files in nested or new directories. It refuses a
missing or empty documentation tree and requires the root `README.md` and
`CONTRIBUTING.md` files.

Relative inline links in these files must resolve to an existing file or
directory. The check excludes external URLs, fragment-only links, code spans,
and fenced examples. It does not check anchors, reference-style links, or
external URL availability.

Pages under `development/` and `guide/` describe the current product.
Repository paths in their code spans must exist. Paths with placeholders are
excluded. Paths in historical records can name files that no longer exist.
Relative links in historical records must still resolve.

Four-digit decision IDs must be unique. The table under `## Index` in
`decisions/README.md` must list each record once, in order, with no orphan
rows. A blank line ends the table. The `0000` template is excluded.

Guide instructions must use **Move to Trash** for that action. The check
refuses **Delete note**, **Delete folder**, and **Delete this note** in guide
pages. In Trash, **Delete** removes a note permanently.

The guide build requires an H1 title and checks its page index. See
[the documentation site](development/docs-site.md). The document checker does
not enforce record templates, directory layouts, fence languages, page length,
or numerical prose.

## Writing advice

- Use ASD-STE100 Simplified Technical English. Keep sentences short and use
  the active voice.
- Do not use an em dash or an en dash.
- Use sentence case for headings and a clear title.
- Explain intent. Link to code instead of repeating its details.
- Keep pages focused on the reader's task. Use examples when they help.
- Preserve historical records. Do not rewrite them to match current code.

Use `guide/` for product and hosting tasks, `development/` for current design
intent, `decisions/` for architectural choices, `design/` for options,
`plans/` for ordered work, and `audits/` for findings at a known source state.
These names help readers find information. They do not restrict file layout.
Designs, plans, and decision records are optional. Use them when they preserve
reasoning that the code cannot explain. The
[decision index](decisions/README.md) gives the record process and template.

`AGENTS.md` holds required agent context and the development process. Skills
hold optional instructions for repeated tasks. Keep both short and select
additional context as needed.
