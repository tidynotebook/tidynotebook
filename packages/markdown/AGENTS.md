# packages/markdown

## Purpose

The one definition of the Markdown language: remark with CommonMark and GFM,
math, author HTML, the sanitizer, the URL policy, the fence languages, the
parse limits, and `renderMarkdown`. Every reader of a note reads it here.

## What lives here and what does not

- `parse.ts` gives the mdast tree with source offsets. `render.ts` gives
  sanitized HTML. `links.ts` extracts note links and attachment references.
  `plain-text.ts` is the one plain text rule, `readableText`, which search
  indexes and quotes (0162, 0167); `indexNote` gives links and text at once.
- `policy.ts` classifies a URL. `limits.ts` holds the limits (0182),
  `autolink-literals.ts` the literal links of GFM (0185), `math*.ts` the math
  rules (0171), `alerts.ts` the alert marker and `ordered-markers.ts` the
  style and label of an ordered item (0089), which the live preview reads.
- `html-elements.ts` is the one list of author HTML (0157), which
  `render.ts` applies after the parse of `hast-util-raw`. `code-languages.ts`
  and `code-tokens.ts` are the one list of fence languages and the one map of
  code tokens (0159), which both surfaces read. `task-mark.ts` is the mark.
- `test-data/content.ts` is the corpus that both render paths agree on, and
  the note of block syntax that the editor reads the same in slices (0155).
- `package.json` states `"sideEffects": false`, so a bundle takes only the
  modules a caller imports. The link scan of the first route then leaves the
  renderer and KaTeX in the deferred chunks. A module here runs nothing when
  it loads, and a stylesheet belongs to the caller that renders the markup.
- No input and no output of any kind happens here. No attachment is fetched
  and no diagram is rendered. A caller resolves those through typed resolvers.

## Allowed imports

`@notesapp/core`, the remark, rehype, mdast, micromark and unified packages,
`hast-util-raw`, `katex`, `@lezer/common` and `@lezer/highlight`. Only
`code-languages.ts` loads a CodeMirror language package, lazily (0173).

This package is browser code. It cannot import a Node built in module, a Node
only package, or a server only package.

## How to add a common thing here

- **A syntax rule.** Add the remark or micromark extension in `parse.ts`, add
  the matching sanitizer rule in `policy.ts`, and add the case to
  `test-data/content.ts`.
- **A sanitizer allowance.** Change the schema in `policy.ts` and add a
  `policy.test.ts` case that proves the refusal of the neighbouring unsafe
  form.
- **An author element or a fence language.** One entry of `authorElements`
  or of `codeLanguages`, and a test of the kept form and the refused one.
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
- No wiki link in the grammar: `wiki-links.ts` converts one at the border (0172).
- No unsanitized HTML path, no second HTML parser and no second highlighter.
  Every render goes through `rehype-sanitize` with `policy.ts`.
- No unbounded parse: each entry point refuses a note over the limits, and a
  step that reads a list again for each item gets a patch in `patches/` (0185).
- No second copy of a delimiter or a limit in `packages/editor`.

## Key files

| File                       | Purpose                                     |
| -------------------------- | ------------------------------------------- |
| `src/index.ts`             | The one public entry point                  |
| `src/parse.ts`             | The parser and its extension set            |
| `src/render.ts`            | `renderMarkdown`                            |
| `src/wiki-links.ts`        | The one converter of wiki links (0172)      |
| `src/policy.ts`            | The sanitizer schema and the URL policy     |
| `src/html-elements.ts`     | The HTML that an author may write (0157)    |
| `src/code-languages.ts`    | The one list of fence languages (0173)      |
| `src/code-tokens.ts`       | The one map of code tokens (0159)           |
| `src/alerts.ts`            | The alert marker and the five tones         |
| `src/footnote-syntax.ts`   | The footnote label rule (0156)              |
| `src/ordered-markers.ts`   | The label and style of an ordered item      |
| `src/limits.ts`            | The four limits, `MarkdownLimitError`       |
| `src/autolink-literals.ts` | The literal links of GFM in one pass (0185) |
| `test-data/content.ts`     | The equivalence corpus                      |
