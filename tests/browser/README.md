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
UI_AUDIT_STATE=.local-app/review-session.json \
SCROLL_NOTE_PATH=/w/<workspace>/notes/<note> \
node tests/browser/note-scroll.ts
```

The test reads the note and saves screenshots in `.local-app/screenshots/`.
