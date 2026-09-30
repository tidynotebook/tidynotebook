# 0140. A published formula keeps its layout in style attributes

- Status: Accepted
- Date: 2026-10-01

## Context

KaTeX places each row and each script of a formula with a `style` attribute,
for example the height and the offset of a `vlist`. The published page sends
`style-src 'self'` (`publishedDocumentContentPolicy` in
`apps/server/src/plugins/security-headers.ts`), so the browser refuses every
one of them. The rows of an aligned block draw on top of each other, and a
superscript, a subscript and a fraction move. The editor draws the same note
correctly. [Issue 205](https://github.com/bkhanale/notesapp/issues/205).

The only producer of a `style` attribute on the page is `sanitizeMathHtml` in
`packages/markdown/src/math.ts`. It keeps a numeric size on a closed list of
layout properties, `position: relative` and the KaTeX error red. The schema of
`packages/markdown/src/policy.ts` drops `style` from everything that an author
writes.

Two other ways were read. A page of MathML only draws in the math face of the
device and not in the face of the editor, so one note reads two ways (record
0025), and it needs a second sanitizer for the MathML elements. A hash of each
style value needs `'unsafe-hashes'` and one hash for each distinct value, so a
note with many formulas sends a header that a proxy can refuse.

## Decision

- The published page sends `style-src-attr 'unsafe-inline'` beside
  `style-src 'self'`. A `style` attribute applies. A `<style>` element and an
  inline style sheet stay refused, and `script-src 'none'` of record 0031
  stays.
- `sanitizeMathHtml` stays the one producer of a style attribute on the page.
  `isSafeMathStyle` in `packages/markdown/src/math.ts` states its rule, and the
  served result is held to it.
- A browser that does not know `style-src-attr` reads `style-src 'self'` and
  draws the page as before.

This refines record 0031 and record 0060.

## Consequences

- A formula on a published page has the layout that the editor draws.
- A style attribute cannot run a script, read the page or load a resource that
  `img-src` does not already allow. A defect in the math sanitizer can move
  content on the page, so the math sanitizer is a boundary of this page.
- `apps/server/src/plugins/security-headers.test.ts` holds the policy, and
  `tests/integration/published-page.test.ts` proves that every style
  attribute of a served formula passes `isSafeMathStyle` and that the style of
  an author does not travel.
