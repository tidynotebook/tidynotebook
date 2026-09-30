# packages/markdown

Read the root [AGENTS.md](../../AGENTS.md) first. This file adds the rules of
this directory. The recipe for a whole feature is in
[docs/development/feature-workflow.md](../../docs/development/feature-workflow.md).

## Purpose

The one definition of the Markdown language: remark with CommonMark and GFM,
math, the sanitizer, the URL policy, the parse limits, and `renderMarkdown`.
The editor, the server index, and Read mode all read a note through it.

## What lives here and what does not

- `parse.ts` gives the mdast tree with source offsets. `render.ts` gives
  sanitized HTML. `links.ts` extracts note links and attachment references.
- `policy.ts` classifies a URL. `limits.ts` holds the size and depth limits
  and `MarkdownLimitError`. `math.ts` and `math-syntax.ts` hold the math
  rules and delimiters. `alerts.ts` holds the alert marker of a block quote,
  which the live preview reads as well. `ordered-markers.ts` holds the
  style cycle and the label of an ordered item, which the live preview and
  the published page both follow (record 0089).
- `test-data/content.ts` is the corpus document that both render paths must
  agree on.
- `package.json` states `"sideEffects": false`, so a bundle takes only the
  modules a caller imports. The link scan of the first route then leaves the
  renderer and KaTeX in the deferred chunks. A module here runs nothing when
  it loads, and a stylesheet belongs to the caller that renders the markup.
- No input and no output of any kind happens here. No attachment is fetched
  and no diagram is rendered. A caller resolves those through typed
  resolvers.

## Allowed imports

`@notesapp/core`, plus the remark, rehype, micromark, unified, and `katex`
packages.

This package is browser code. It cannot import a Node built in module, a Node
only package, or a server only package.

## How to add a common thing here

- **A syntax rule.** Add the remark or micromark extension in `parse.ts`, add
  the matching sanitizer rule in `policy.ts`, and add the case to
  `test-data/content.ts`.
- **A sanitizer allowance.** Change the schema in `policy.ts` and add a
  `policy.test.ts` case that proves the refusal of the neighbouring unsafe
  form.
- **A limit.** Add the named value in `limits.ts` and the
  `MarkdownLimitReason` for it, and prove the refusal in `limits.test.ts`.

## Testing conventions here

`node --test` through `pnpm test:unit`. A test file is `*.test.ts` next to
its module. A syntax test must prove the produced structure and the
sanitized output, not a string match on one fragment. `corpus.test.ts` and
`compatibility.test.ts` walk `test-data/content.ts`, and
`tests/integration/markdown-equivalence.test.ts` renders the same corpus
through the editor path, so both surfaces must agree on structure.

## Forbidden here

- No DOM global: no `document`, `window`, `navigator`, `location`,
  `localStorage`, `indexedDB`, `caches`, or `Worker`. `.oxlintrc.json`
  refuses each one by name.
- No `fetch` and no storage. A caller passes an `attachmentHref` resolver, and
  a surface that opens some notes and not others passes a `noteHref` resolver.
- No wiki link syntax. A link between notes is a standard Markdown link.
- No unsanitized HTML path. Every render goes through `rehype-sanitize` with
  the policy in `policy.ts`.
- No unbounded parse. Every entry point refuses a document over the limits
  with `MarkdownLimitError`.
- No second copy of a delimiter or a limit in `packages/editor`.

## Key files

| File                     | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| `src/index.ts`           | The one public entry point                  |
| `src/parse.ts`           | The parser and its extension set            |
| `src/render.ts`          | `renderMarkdown` and heading slugs          |
| `src/policy.ts`          | The sanitizer schema and the URL policy     |
| `src/alerts.ts`          | The alert marker and the five tones         |
| `src/ordered-markers.ts` | The label and style of an ordered item      |
| `src/limits.ts`          | Size and depth limits, `MarkdownLimitError` |
| `test-data/content.ts`   | The equivalence corpus                      |
