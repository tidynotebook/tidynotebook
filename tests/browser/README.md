# Browser checks

`touch-typography.ts` checks the deployed application at 320 and 390 px, in
light and dark mode, with `hasTouch` and `isMobile` enabled. It reads every
visible UI text node and field, checks the shared touch combinations, compares
field labels with field text, and checks the title hierarchy and control layout.
Note text in the editor is outside this UI scale.

Build the packages first. Use a local Playwright Core installation and Chromium:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
UI_AUDIT_ORIGIN=http://localhost:3517 \
UI_AUDIT_STATE=.local-app/review-session.json \
UI_AUDIT_FIXTURE=.local-app/review-fixture.json \
pnpm test:browser:type
```

The state file is a Playwright storage state for a signed-in local test account.
The fixture file holds `workspaceId` and `files` (each with a `fileId`). It names
the existing design review corpus: Personal, Projects, and Templates folders,
with seven templates including Meeting and Empty. The script changes only local
form drafts. Browser responses supply disposable keys, apps, Trash entries,
and published links. No server settings or note content are changed.

Results are in `.local-app/text-roles-results.json`. Screenshots are in
`.local-app/screenshots/text-roles-*.png`. Any invalid combination, unequal touch
field size, inverted title, or layout error fails the command.

DS1 also uses `DS1_AUDIT=1` to check typed component padding, parent gaps,
row symmetry, optical slots, fields and controls on every review screen.
`DS1_CAPTURE=/absolute/output/path` records screenshots and semantic geometry
for comparison with `compareSurface` in `symmetry.ts`. Set `TOUCH_WIDTHS` to
`1440,390,320` to include both pointer densities. `UI_AUDIT_ASSETS` can name
a local web asset build for source checks before the single Docker build.
Omit it when checking the deployed image.

`content-parity.ts` checks selected rail and navigation surfaces, outline indent
slots, the note footer and page list content edges at both pointer densities.
It also checks that a row fill and hit area extend into the page gutter.
Parity records include the painted surface, current state and visible content
position, so unchanged wrapper boxes cannot hide these regressions.

Set `HOVER_AUDIT=1` with the review screen audit to hover each visible control
and check positive, symmetric padding between its content and its fill.

`note-scroll.ts` checks a long note with real touch and mouse input at 320,
390 and 1440 px in light and dark mode. Phone checks include a reduced height
for the keyboard. The editor must stay on screen, scroll after input, and
reach the end. Use a disposable account and a note that exceeds one screen:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
UI_AUDIT_ORIGIN=http://localhost:3517 \
UI_AUDIT_STATE=.local-app/review-session.json \
SCROLL_NOTE_PATH=/w/<workspace>/notes/<note> \
node tests/browser/note-scroll.ts
```

The test reads the note and saves screenshots in `.local-app/screenshots/`.

`table-layout.ts` checks a table in the editor and its published
page at 320, 390, and 1440 px, in light and dark mode. Run it with a Weight-style
table and with a long fixture that has compact empty cells, short rows, rows
without edge pipes, and a long cell below the first viewport. `TABLE_FIXTURE_PATH`
names a JSON file with the fixture Markdown in `text`.

The check measures browser text independently of the implementation. Columns stay within the readable floor and the measured content cap.
It also checks row height, page containment, stable tracks after scrolling,
typing, undo, cell navigation, reachable table ends, and keyboard access to the
reader scroll area. Set `TABLE_WIDE_READER_PATH` to a published table with many columns
to check horizontal scroll and keyboard scroll. Screenshots go to `.local-app/screenshots/`.

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
UI_AUDIT_ORIGIN=http://localhost:3000 \
UI_AUDIT_STATE=.local-app/review-session.json \
TABLE_FIXTURE_PATH=.local-app/table-fixture.json \
TABLE_NOTE_PATH=/w/<workspace>/notes/<note> \
TABLE_READER_PATH=/published/<token> \
node tests/browser/table-layout.ts
```

`note-outline.ts` checks a synthetic 7,183-word note with 42 headings. It
checks the initial open, levels 1 to 6, navigation near the end, outline
scrolling, edits, code fences, empty text, note switching, and reload. It uses
both themes at desktop and phone widths. The current layout hides the outline
on phones; the check confirms that behavior and tests document updates there.
Use two disposable notes. The script replaces their text.

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
UI_AUDIT_ORIGIN=http://localhost:3000 \
UI_AUDIT_STATE=.local-app/review-session.json \
OUTLINE_NOTE_PATH=/w/<workspace>/notes/<note> \
OUTLINE_OTHER_PATH=/w/<workspace>/notes/<other-note> \
node tests/browser/note-outline.ts
```

Results, the safe test note, and screenshots stay in `.local-app/`. After a
build, run `node tools/performance/outline.ts` to measure the initial parse,
50 edits, and cache reuse for 38,400 and 960,000 characters. This measures
outline work alone. It does not measure React rendering or editor layout.

`table-viewport.ts` checks the real editor component with synthetic long notes.
It observes DOM updates and frames during fast vertical leave/reentry, then
checks input-free settled intervals. A known table must not return to fallback
tracks. First-ever body-only visibility is checked separately. Container and
font-size changes, passive horizontal position, edits/history and table/note
replacement use the same editor instance.

Build the packages from the repository root before starting the fixture:

```sh
pnpm build
```

Serve the fixture with the existing web Vite configuration from the repository:

```sh
pnpm --filter @notesapp/web exec vite ../.. --config vite.config.ts --host 127.0.0.1 --port 3019
```

Then run with the existing Playwright installation:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
UI_AUDIT_ORIGIN=http://127.0.0.1:3019 \
node tests/browser/table-viewport.ts
```

`TABLE_VIEWPORT_OUTPUT` selects the evidence directory. This component check
uses no account, server write or Docker service. It is separate from production
stack checks.
