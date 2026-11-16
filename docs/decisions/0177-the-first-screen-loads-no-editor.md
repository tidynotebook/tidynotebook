# 0177. The first screen loads no editor

- Status: Accepted
- Date: 2026-10-02

## Context

A cold start loaded more script than the first screen needs before All notes
stated the note count (issue 266, `pnpm perf:start`). The largest part of it
was the editor engine: the frame imported the shortcut list and the
formatting rows of the palette from `@notesapp/editor`, and that entry
loads CodeMirror. The device search of the palette imports the plain text
rule of `@notesapp/markdown`, which brought the Markdown parser and the HTML
reader of the renderer into the first route. Settings was a static part of
it too. `pnpm perf:bundle` read only the scripts that `index.html` names, so
the lazy modules of the frame and of All notes never reached the budget of
record 0136. Each module of a screen also waited for the one above it.

## Decision

- The frame imports nothing that loads the editor. The open note gives the
  palette its formatting rows through `NoteScreenActions`. The list of
  shortcuts loads with its dialog, the device search with the first search
  (`shell/device-search.ts`), and Settings with its page.
  `packages/sync` states that it has no side effects, so its unused modules
  leave a chunk.
- The first screen is the scripts that `index.html` names, the lazy chunks
  of the frame and All notes, and every chunk that they import, as
  `firstScreenScripts` of `tools/performance/first-route.ts` reads them from
  the build. `tools/performance/bundle-budget.mjs` holds that set to the size
  that this record left with a small margin. The figure of
  record 0136 stays the ceiling of every budget.
- `tests/integration/web-build.test.ts` fails when CodeMirror, KaTeX or
  the HTML reader of the renderer is in the first screen.
- The router starts the modules of the routes that the first address
  matches while the session check runs, so a note address loads the editor
  in parallel with the frame and its list.

This refines record 0136.

## Consequences

- A cold start of All notes reads no CodeMirror code and no renderer. The
  worker still caches them after the load (record 0044).
- A change that grows the first screen past the margin changes the budget
  line and states why.

## 2026-11-07 finite margin for find and replace

The unchanged base uses all 315,394 bytes of its budget. The approved floating
find and replace candidate measured 315,422 bytes, an increase of 28 bytes.
Asset references differ, but this alone does not prove that the eager code
bodies are unchanged or that hashes alone caused the increase.

Chief authorized 315,648 bytes for this feature. This restores a finite
254-byte margin at the base, less than the original 256-byte small margin.
The 650,117-byte ceiling, first-screen script set, gzip level 9, deferred
library and action checks, and rejection above the limit stay unchanged.
The settled implementation measures 315,403 bytes across 54 first-screen
scripts. Its new search code stays in the deferred frame chunk, as production
source maps show. The policy change has its own commit. Earlier failed
checks remain failures.

## 2026-11-10 finite margin for reviewed UI fixes

The owner approved increasing the first-screen limit from 315,648 to
315,904 bytes, adding 256 bytes. The historical growth bound becomes
8 KiB plus 256 bytes. The reviewed auth build at 885194eb measures
315,684 gzip bytes across 54 scripts, leaving 220 bytes at the new limit.
The separate table build at 30cfac44 measures 315,675 bytes. The workspace
build at 6a4f9133 measures 315,971 bytes and still exceeds the new limit.
These are separate builds, not a combined result.

The 650,117-byte ceiling, actual first-screen script set, gzip level 9,
import graph, deferred-library and action checks, and rejection above the
limit stay unchanged. The source and artifact records do not establish
that all size changes came from asset names. Keep earlier failures as
failures. This policy has a separate commit and requires the existing
policy and web checks. Candidate image and application proof remain
required. This approval does not authorize a release or deployment.
