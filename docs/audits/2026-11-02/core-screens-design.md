# Design system audit of the core screens

- Date: 2026-11-02
- Commit read: 6ff39f5c
- Auditor: design owner (task T-03)

## Result

27 deviations: 2 high, 12 medium, 13 low.

The two high items affect every signed-out screen and every `Card` in the
light theme. The code passes `pnpm lint` design checks (0 recorded cases,
6 accepted rule exceptions). Most deviations are in places that the checks
do not see: shared UI code, composed surfaces in features, rendered colour
and copy.

## Authority

1. [Design system](../../development/design-system.md): composition,
   spacing, density, depth (the "DS" references below).
2. [Interface design](../../development/design.md): planes, edges, controls,
   icons, copy ("ID" references).
3. [Themes](../../development/themes.md) and
   [page layouts](../../development/layouts.md).
4. `apps/web/src/tailwind.css` tokens and `packages/ui` components.
5. [2026-10 UI redesign](../../design/2026-10-ui-redesign/README.md) and its
   [approved scope](../../design/2026-10-ui-redesign/approved-scope.md), for structure
   only. Later owner commits replace parts of it (see D-14).

## Coverage and method

| Area                                                                                                                                                                                                                                  | Method               | Screens and states                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in, sign up, first account setup, forgot password, reset link, invitation, verify                                                                                                                                                | Screenshots and code | Default, validation, wrong password, invalid link, server error, setup check error. Desktop 1440 px (fine pointer), phone 390 px (touch), narrow 390 px fine pointer. Light and dark. |
| All notes, editor, read view, search (command palette), settings and its sections, sharing (publish), templates, history, trash, Needs attention, image viewer, menus, toasts, dialogs, phone sheets, empty, loading and error states | Code only            | All variants that the components state in code.                                                                                                                                       |

Screenshots of the signed-in screens are not in this report. They need a
running server with Postgres and S3, which this host runs only in Docker,
and the Docker slot was in use. The signed-out screens ran against the
built client (`apps/web/dist/web`) with mocked `/api/account` and
`/api/setup` answers. The signed-in findings come from code and from the
shared components that those screens compose. A screenshot pass of the
signed-in screens is open (see Q-11).

Screenshots are in [core-screens-design/](core-screens-design/).

## Deviations

### High

#### D-1 Raised card is invisible in the light theme

- Screen and state: every `Card`. Seen on sign in, sign up, setup, reset and
  invitation (light). By code also on phone Settings groups, which use
  cards (DS Settings).
- File and component: `packages/ui/src/layout.tsx`, `Card`;
  `packages/ui/src/surface-classes.ts`.
- Wrong: the card has no shadow and no edge. Computed values on sign in,
  light: card `rgb(248,248,248)` on page `rgb(247,247,245)`, about 1.01:1,
  `box-shadow: none`, border 0. The card shape disappears. Dark reads
  because the fill steps from `#141414` to `#282828`.
- Design system: ID "The planes and the edges" (`bg-card` is raised) and
  "Elevation"; the `Card` doc comment in `layout.tsx` states "the first
  elevation step, the subtle edge and the card fill, so a light palette
  shows the shadow and a dark palette shows the edge". DS Components:
  "`Card` is a raised, rounded container". ID "Before a screen lands":
  light and dark both read.
- Fix: add `shadow-raised` and `border border-edge-subtle` to `Card` (the
  border must stay outside the layout, for example with an outline or an
  inset ring). Add a theme test that the card fill or its edge reaches a
  visible step against both `page` and `panel` in every registered theme.
- Screenshots: `login-desktop-light.png`, `login-desktop-dark.png`.

#### D-2 Public footer overlaps its own text on narrow screens

- Screen and state: every signed-out screen and every public page, at a
  narrow width with a fine pointer (desktop window of 390 px, split screen,
  zoom). The first touch captures also showed it once, before the pointer
  query applied.
- File and component: `packages/ui/src/public-footer.ts`,
  `publicFooterTree` (`grid-cols-6 ... coarse:grid-cols-2`).
- Wrong: the column count follows the pointer type, not the width. At
  390 px with a fine pointer the grid has six columns of 29 px. "Resources"
  and "Open source" overlap and words break on each line. A wide touch
  tablet gets two columns.
- Design system: DS Rules: "`coarse:` and `fine:` variants select pointer
  density", not layout. Layouts "Public pages": public frames use width
  steps (`16 px`, or `24 px` from `sm`).
- Fix: use width breakpoints for the grid (`grid-cols-2`, then
  `md:grid-cols-6`). Keep `coarse:` only for padding density.
- Screenshot: `login-narrow-fine-pointer-light.png`.

### Medium

#### D-3 Browser validation bubble replaces the field error

- Screen and state: sign up, sign in, first account setup, submit with an
  empty required field.
- File and component: `packages/ui/src/controls.tsx` `TextField` and
  `TextAreaField` (`required` on the input); `Form` in
  `packages/ui/src/primitives.tsx` (no `noValidate`).
- Wrong: the browser shows its own bubble ("Please fill out this field.")
  in its own style and words. The field error slot stays empty.
- Design system: the `TextField` doc comment says a browser bubble
  "would compete with the hint and the error of the screen". DS Components:
  `Field` owns label, control, help and error spacing.
- Fix: set `noValidate` on `Form`. Keep `aria-required`. Show the missing
  value as the field error with the shared error text.
- Screenshot: `signup-validation-phone-light.png`.

#### D-4 A note error shows on the sign-in screen

- Screen and state: sign in, the setup check answers 404.
- File and component: `apps/web/src/lib/problem-text.ts` (`not_found`).
- Wrong: the generic `not_found` text is "That note is not on the server."
  The sign-in card shows it although no note is open.
- Design system: AGENTS Text: "Show useful names and actions in the
  product". ID Copy: name a thing by its action.
- Fix: make the generic text neutral ("The server could not find this.")
  and keep the note text only where a note request fails.
- Screenshot: `login-setup-404-desktop-light.png`.

#### D-5 Navigation links on account screens are ghost buttons

- Screen and state: sign in ("Forgot password", "Create an account"), sign
  up ("I have an account"), desktop and phone.
- File and component: `apps/web/src/features/accounts/accounts.tsx`,
  `sign-up.tsx`, inside `AuthFrame`.
- Wrong: two stacked, centred ghost buttons under the primary button, each
  a full control row (48 px apart on phone). They read as actions of the
  form.
- Design system: ID Controls: `ghost` is an icon-only action and a Cancel.
  Redesign checklist item 2: text buttons only for Cancel and Discard.
  `AuthFrame` has a `footer` slot for content outside the card.
- Fix: move these routes to the `AuthFrame` footer as one line of links.
- Screenshots: `login-desktop-light.png`, `signup-validation-phone-light.png`.

#### D-6 Application header shows a hairline at rest

- Screen and state: every signed-in page, all widths.
- File and component: `apps/web/src/shell/shell.tsx` header
  (`border-b border-edge-subtle`).
- Wrong: the header always draws a bottom border, and the border adds 1 px
  to the layout.
- Design system: DS Rules: "Other fixed regions show a hairline only if
  adjacent content overflows" and "Hairlines and shadows stay outside the
  layout". DS Components `Region`.
- Fix: frame the header as a `Region` with a bottom scroll edge that the
  page sentinel sets.

#### D-7 Format toolbar and note footer show hairlines at rest

- Screen and state: editor, all widths.
- File and component: `packages/ui/src/frame-classes.ts`
  `formatToolbarFrameClassName` (`border-b border-edge-line`) and
  `noteFooterClassName` (`border-t border-edge-line`).
- Wrong: both fixed regions always draw a rule in the layout box, with the
  stronger `edge-line` token.
- Design system: same rules as D-6.
- Fix: use `Region` edges (`edge="bottom"` and `edge="top"`) driven by the
  editor scroller sentinels.

#### D-8 Image viewer composes its own overlay and toast

- Screen and state: image viewer, tool bar and status message, both
  themes.
- File and component: `apps/web/src/features/editor/image-viewer.tsx`
  (tool bar near line 383, status near line 489).
- Wrong: the floating tool bar uses `bg-card border-edge-subtle
shadow-overlay` and feature positions (`inset-x-3 top-3`). The status
  message is a second, hand-built toast, while `image-undo.tsx` uses
  `Toast`.
- Design system: DS Tokens: menus and popovers use the overlay surface,
  edge and shadow. DS Components: `Toast` uses equal padding; ID: `Toast`
  sits at the bottom with one sentence and one action. DS Rules: features
  compose components without spacing, size or depth rules.
- Fix: add a floating tool bar variant to `Toolbar` with the overlay
  surface. Show the status with `Toast`.

#### D-9 Button size names and icon-only buttons do not match the contract

- Screen and state: all screens with buttons.
- File and component: `packages/ui/src/control-classes.ts` `ButtonSize`
  (`compact | default | sm | md | touch | inline`); 60 call sites pass
  `sm` or `md`; icon-only actions use `Button` with `icon` (for example
  the image viewer zoom and close).
- Wrong: six size names where the contract has two. Icon-only buttons
  bypass `IconButton` and its target rule.
- Design system: DS Components: "`Button` uses `compact` or `default`
  size"; "`IconButton` uses `row`, `toolbar`, `header` or `rail` size. Its
  target grows around a fixed glyph box."
- Fix: map `sm` to `compact` and `md` to `default`, remove the aliases.
  Move icon-only actions to `IconButton`.

#### D-10 Preview and code boxes are composed in features

- Screen and state: history (version text, picture, diff), version
  preview, Needs attention (kept text), recover draft, note load failure.
- File and component: `features/history/history.tsx` (lines 796, 875),
  `features/history/version-preview.tsx:186`,
  `features/history/inline-diff.tsx:61`,
  `features/attention/attention.tsx:86`,
  `features/editor/stale-draft-recovery.tsx:189`,
  `features/editor/note-loader.tsx:466`.
- Wrong: each box sets its own radius, edge and fill: `border-edge-line`
  in one, `border-edge-subtle` in the others, on `bg-app`, `bg-card` or
  `bg-surface`. They use `text-preview`, which is not a contract role.
- Design system: DS Rules: features compose `packages/ui` components
  without spacing, size or depth rules. DS Tokens: the eight type roles.
- Fix: add one `PreviewBlock` to `packages/ui` (one surface, edge, radius,
  `Inset` padding and a contract type role in mono). Use it in all six
  places.

#### D-11 Two documents name different divider tokens

- Screen and state: all lists and groups.
- File and component: `Divider` (`bg-edge-subtle`), settings rows
  (`after:border-edge-subtle`), command palette (`border-edge-line`),
  format toolbar and note footer (`border-edge-line`).
- Wrong: dividers use two tokens with no rule that tells them apart.
- Design system: ID: "`edge-line` is the resting edge of a control and the
  one divider". DS: "Hairlines use `border-edge-subtle`". The two
  documents disagree.
- Fix: decide one rule (Q-2), update the other document, align the code.

#### D-12 Switch track uses the divider edge

- Screen and state: every switch row (Settings, publish, daily note
  settings), off state in particular.
- File and component: `packages/ui/src/control-classes.ts`
  `switchClassNames`; `ListRow` switch trailing in `layout.tsx`.
- Wrong: the track uses `border-edge-line`. The off track is `bg-hover`,
  so its shape can fall below the non-text minimum.
- Design system: ID "The planes and the edges": `edge` is only a task box,
  a checkbox, a radio, a switch track and a drop target.
- Fix: use `border-edge` on the track and list it with the checkbox in the
  accepted rule exceptions. Remove the duplicate track markup in
  `ListRow` and use `switchClassNames` there.

#### D-13 Phone sheet footer button is wider than the body content

- Screen and state: every phone sheet with a footer (dialogs on phone).
- File and component: `packages/ui/src/dialog.tsx` `DialogFooter` (phone
  `pad={3}`) and `DialogBody` (phone `pad={4}`).
- Wrong: the full-width primary button starts 12 px from the edge, the
  body content 16 px. The sheet has two leading edges.
- Design system: DS Rules: "Keep one leading content edge in each
  container". DS Components `Sheet`: header glyphs align with the body
  inset.
- Fix: use the body inset (`padX={4}`) in the phone footer, keep the
  safe area.

#### D-14 Design documents describe screens that changed

- Screen and state: All notes, editor header, Settings, page width.
- File and component: `docs/design/2026-10-ui-redesign/README.md`,
  `approved-scope.md`, `docs/development/layouts.md`, `Page` in
  `packages/ui/src/layout.tsx`.
- Wrong: the approved scope still requires tips with Next and Close, a save
  status pill and Settings as pages with Back. The owner removed the tips
  (`8b4e3b5d`), the pill (`323f1fca`) and made Settings a modal
  (`7d4234a6`). The approved "count only" header on All notes is not
  shipped. `layouts.md` states a `40 rem` column and a `14 rem` right
  region; `Page` uses one `45rem` (720 px) column.
- Design system: AGENTS Text: keep documentation focused on intent.
- Fix: mark the superseded rows in the approved scope with the commit
  that replaced them, decide the All notes count (Q-6), and update
  `layouts.md` to the `Page` column.

### Low

#### D-15 Account card gap differs from its padding

- Screen and state: account screens, desktop.
- File and component: `features/accounts/auth-frame.tsx` (`pad` 6 fine,
  `gap` 4).
- Wrong: 24 px padding, 16 px between groups. The title and its
  description also sit 16 px apart, the same as two fields.
- Design system: DS Rules: "The group gap equals the container padding";
  "Keep items closer than groups".
- Fix: group the title and description in a `Stack gap={1}`; set the card
  stack gap to the padding.

#### D-16 Trash rows draw a rule between rows

- Screen and state: Trash list.
- File and component: `features/trash/trash-page.tsx:435`
  (`border-b border-edge-subtle` on `ListRow`); also
  `features/folders/folder-tree-view.tsx:519`.
- Wrong: rows add a border inside their own box.
- Design system: `ListRow` doc: rows separate by space and by fill and
  never by a rule; DS: hairlines stay outside the layout.
- Fix: remove the border, or use `Card` rows with the shared divider if a
  counted list needs one.

#### D-17 Command palette search bar has a resting hairline

- Screen and state: search (command palette), desktop and phone.
- File and component: `apps/web/src/shell/command-palette.tsx:374` and
  `:432`.
- Wrong: fixed `border-b border-edge-line` above the scrolling results.
- Design system: DS Rules (fixed regions), `Region`.
- Fix: use `Region` with a bottom scroll edge.

#### D-18 Minimum and fixed heights in shared UI

- Screen and state: menus, loading lists, sidebar status line.
- File and component: `packages/ui/src/menu.tsx` (`md:min-h-8`),
  `loading.tsx` (`min-h-8` rows), `primitives.tsx` `StatusLine` (`h-8`
  with `py-2`).
- Wrong: height comes from a minimum or fixed value, not the line box.
- Design system: DS Rules: "Rows get height from a line box and equal
  vertical padding. Do not use a minimum height to add blank space."
- Fix: use the row recipe padding; extend the `minimum-height` check to
  `packages/ui`.

#### D-19 Arbitrary values pass the design check

- Screen and state: cards, menus, phone sheet footer.
- File and component: `surface-classes.ts`
  (`[--notes-surface-hover:...]`), `dialog.tsx` (`[&_button]:w-full`),
  `tools/check-design-system.mjs` (the pattern misses both forms).
- Wrong: arbitrary properties and variants are in use.
- Design system: DS Tokens: "Use Tailwind tokens, not spacing variables or
  arbitrary values".
- Fix: express the state swap with a named variant or a data attribute;
  give `Button` a `full` prop; extend the check.

#### D-20 Scroll edge shadows hold colour literals

- Screen and state: every scroll edge, custom themes in particular.
- File and component: `apps/web/src/tailwind.css` (`--depth-edge-top`,
  `--depth-edge-bottom` use `rgb(0 0 0 / ...)`).
- Wrong: a colour value outside the theme registry; the other shadows mix
  from `--notes-scrim`.
- Design system: Themes: "No other file in this repository holds a colour
  value". DS Tokens: theme overrides keep these roles valid.
- Fix: build both from `--notes-scrim` with `color-mix`.

#### D-21 Required marker uses the danger colour

- Screen and state: all forms with required fields.
- File and component: `packages/ui/src/controls.tsx` `TextField` label.
- Wrong: a red asterisk on every required field, before any error.
- Design system: ID: errors and danger groups use danger colour; redesign
  checklist: red only for delete.
- Fix: see Q-5.

#### D-22 All notes rows show two facts

- Screen and state: All notes list.
- File and component: `features/notes/notes-home.tsx` `NoteGroupList`.
- Wrong: each row shows the name, the folder and the time.
- Design system: ID Copy: "A row shows one name and one fact."
- Fix: see Q-6.

#### D-23 Loading labels use three sentence forms

- Screen and state: loading states (screen reader text).
- File and component: `LoadingState` call sites, for example "Reading API
  keys", "The trash is loading.", "Loading preview".
- Wrong: three forms for one state.
- Design system: ID Copy: keep one term.
- Fix: use one form, for example "Loading API keys", in all call sites.

#### D-24 Empty state title role differs between code and document

- Screen and state: all empty states.
- File and component: `packages/ui/src/layout.tsx` `EmptyState`
  (`text-title-header`).
- Wrong: ID says the title is `text-ui font-semibold`; the component uses
  the header title role (17 px on touch).
- Design system: ID "Surfaces a person waits on or reads"; DS `EmptyState`.
- Fix: see Q-7.

#### D-25 Sign up shows the trial notice before the description

- Screen and state: sign up with a trial, desktop and phone.
- File and component: `features/accounts/sign-up.tsx`.
- Wrong: order is title, notice, description, fields. The description
  belongs to the title block.
- Design system: DS Settings: "Title blocks have one group gap after
  them".
- Fix: title and description, then the notice, then the fields.
- Screenshot: `signup-validation-phone-light.png`.

#### D-26 All notes group headings are not `SectionHeading`

- Screen and state: All notes groups (Today, Yesterday, and so on).
- File and component: `features/notes/notes-home.tsx` (raw `h2` with
  `groupLabelClassName`).
- Wrong: the shared heading is bypassed.
- Design system: DS Components: `SectionHeading` holds a label, optional
  count and optional action.
- Fix: use `SectionHeading`.

#### D-27 Features set sizes and positions

- Screen and state: theme tiles in Settings, workspace switcher, account
  screens mark.
- File and component: `features/accounts/theme-settings.tsx:253`
  (`absolute right-2 top-2 ... bg-card` badge),
  `shell/workspaces.tsx:253` (`size-5` avatar),
  `features/accounts/auth-frame.tsx:56` (`size-7` mark).
- Wrong: size and position rules live in features.
- Design system: DS Rules: features compose components without spacing,
  size or depth rules; shared size roles distinguish glyphs and controls.
- Fix: add an avatar or mark component with a size role and a tile
  selected badge slot in `packages/ui`.

## Not deviations

- Spacing scale, margins, inline spacing and minimum heights in features:
  clean (`tools/check-design-system.mjs`).
- Type roles in features: no raw `text-sm`, `font-*` or `leading-*`.
- Primary buttons: the files with two primary buttons show them in separate states (spot check of the publish dialog and API keys).
- Dark theme on signed-out screens: card, fields, focus ring and notices
  read correctly.
- Error and invalid link states on account screens use one `Notice` and one
  action.

## Open design questions

| ID   | Question                                                                            | Recommended answer                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-1  | Which document wins when the design system and the 2026-10 approved scope disagree? | The design system and interface design pages win for composition, tokens and controls. The approved scope stays the record of structure, with superseded rows marked (D-14). |
| Q-2  | Which token is the divider: `edge-subtle` or `edge-line`?                           | `edge-subtle` for every hairline, group divider and scroll edge. `edge-line` only for the resting edge of a control. Update ID.                                              |
| Q-3  | Fix the light card with a shadow and edge, or with a darker card token?             | Shadow plus subtle edge, as the `Card` doc states. Keep the tokens. Add the theme test.                                                                                      |
| Q-4  | Where do "Forgot password" and "Create an account" go?                              | The `AuthFrame` footer, as one line of links under the card.                                                                                                                 |
| Q-5  | How do forms mark required fields?                                                  | No marker when all fields are required (all account forms). Mark the rare optional field with "(optional)" in muted text.                                                    |
| Q-6  | All notes: show the count, and which fact on a row?                                 | Show the count next to the title, as approved. Rows show the folder only, because the groups already state the time.                                                         |
| Q-7  | Empty state title role?                                                             | Keep `text-title-header` and update ID.                                                                                                                                      |
| Q-8  | Button sizes?                                                                       | Only `compact` and `default`. Remove `sm`, `md`, `touch` and `inline`.                                                                                                       |
| Q-9  | Type role for preview and code text?                                                | Add one contract role (`text-code`, mono, secondary size) and use it only in `PreviewBlock`. Remove `text-preview` from features.                                            |
| Q-10 | Can layout change with pointer type?                                                | No. Width selects layout, pointer selects density only. Add this sentence to DS Rules.                                                                                       |
| Q-11 | Signed-in screenshots                                                               | Run the screenshot pass on one disposable Docker deployment when the slot is free, before implementation starts, and add the results to this report.                         |

## Implementation record

The owner accepted Q-1 to Q-10. Q-11 uses an isolated native Postgres server
and local file storage on port 4583. No Docker or S3 download was used.
The original findings above remain as the before record.

| Finding | Change                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| D-1     | Card has a raised shadow and an inset outline. Every theme has a fill or edge contrast test.                                               |
| D-2     | Public footer uses two columns below md and six columns from md.                                                                           |
| D-3     | Form disables browser bubbles. Required fields show an accessible field error on submit.                                                   |
| D-4     | Generic missing-resource text is neutral.                                                                                                  |
| D-5     | Sign-in and sign-up navigation uses footer links.                                                                                          |
| D-6     | App header uses the shared conditional scroll edge.                                                                                        |
| D-7     | Editor toolbar and footer use shared conditional scroll edges. The native editor scroller reports hidden content.                          |
| D-8     | Image viewer uses floating Toolbar and Toast.                                                                                              |
| D-9     | Button sizes are compact and default. Icon actions use IconButton. Shared consumers and tests use the new names.                           |
| D-10    | PreviewBlock owns text, rendered version, picture and diff preview surfaces.                                                               |
| D-11    | Hairlines use edge-subtle. Resting control edges use edge-line. The interface guide agrees.                                                |
| D-12    | Switch tracks use edge. ListRow uses the shared switch recipe.                                                                             |
| D-13    | Phone footer and body use the same horizontal inset. Button has a full prop.                                                               |
| D-14    | Layout guide states the Page width. Original scope marks later owner decisions.                                                            |
| D-15    | Account card group gap equals padding. Title and description share a small gap.                                                            |
| D-16    | Trash and folder rows have no border in their layout box.                                                                                  |
| D-17    | Search header uses a conditional scroll edge from the results scroller.                                                                    |
| D-18    | Menu and loading rows use content and padding. StatusLine has no fixed height. The check covers shared row minimum heights.                |
| D-19    | State token swaps use approved named utilities. Content selectors use named variants. The check rejects arbitrary properties and variants. |
| D-20    | Scroll shadows mix from the theme scrim.                                                                                                   |
| D-21    | Required fields have no red marker.                                                                                                        |
| D-22    | All notes shows its count. A row shows its folder. Date groups state the time.                                                             |
| D-23    | Loading labels use Loading plus the object.                                                                                                |
| D-24    | The interface guide uses the EmptyState title role.                                                                                        |
| D-25    | Sign-up description sits with the title, before the trial notice.                                                                          |
| D-26    | Note groups use SectionHeading.                                                                                                            |
| D-27    | IdentityMark and TileSelectedBadge own sizes and positions.                                                                                |

The designer approved `state-overlay`, `state-raised` and the normal
`coarse:state-raised` variant. Each utility sets only inherited hover and
selected tokens. The check rejects all other declarations in these utilities.

## Screenshot comparison

Signed-in before captures use the audit commit. After captures use the fixed
client and the same local account. Each screen has desktop and phone captures
in light and dark. The account before captures remain in the original folder.
Account after captures use the same mocked setup and error responses as the audit.

| Screen              | Before example                                                                   | After example                                                                   |
| ------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| All notes           | [Phone light](core-screens-design/before/notes-phone-light.png)                  | [Phone light](core-screens-design/after/notes-phone-light.png)                  |
| Editor              | [Phone light](core-screens-design/before/editor-phone-light.png)                 | [Phone light](core-screens-design/after/editor-phone-light.png)                 |
| Settings            | [Phone light](core-screens-design/before/settings-phone-light.png)               | [Phone light](core-screens-design/after/settings-phone-light.png)               |
| Trash               | [Phone light](core-screens-design/before/trash-phone-light.png)                  | [Phone light](core-screens-design/after/trash-phone-light.png)                  |
| Version history     | [Phone light](core-screens-design/before/history-phone-light.png)                | [Phone light](core-screens-design/after/history-phone-light.png)                |
| Published links     | [Phone light](core-screens-design/before/publish-phone-light.png)                | [Phone light](core-screens-design/after/publish-phone-light.png)                |
| Search              | [Phone light](core-screens-design/before/search-phone-light.png)                 | [Phone light](core-screens-design/after/search-phone-light.png)                 |
| Sign in             | [Desktop light](core-screens-design/login-desktop-light.png)                     | [Desktop light](core-screens-design/after/login-desktop-light.png)              |
| Sign up validation  | [Desktop light](core-screens-design/before/signup-validation-desktop-light.png)  | [Desktop light](core-screens-design/after/signup-validation-desktop-light.png)  |
| First account setup | [Desktop light](core-screens-design/before/setup-desktop-light.png)              | [Desktop light](core-screens-design/after/setup-desktop-light.png)              |
| Forgot password     | [Desktop light](core-screens-design/before/forgot-desktop-light.png)             | [Desktop light](core-screens-design/after/forgot-desktop-light.png)             |
| Reset link          | [Desktop light](core-screens-design/reset-notoken-desktop-light.png)             | [Desktop light](core-screens-design/after/reset-notoken-desktop-light.png)      |
| Invitation          | [Desktop light](core-screens-design/before/invitation-notoken-desktop-light.png) | [Desktop light](core-screens-design/after/invitation-notoken-desktop-light.png) |
| Verify address      | [Desktop light](core-screens-design/before/verify-notoken-desktop-light.png)     | [Desktop light](core-screens-design/after/verify-notoken-desktop-light.png)     |

Full capture sets: [before](core-screens-design/before/) and [after](core-screens-design/after/).

The sidebar footer showed a saved line, which owner commit `323f1fca` does not allow.
The footer now shows a line only when work needs attention.

## Verification

- `pnpm verify`: contract, generated files, types, lint, format, build and type-aware lint passed.
- Unit results: 3,789 passed. Two Compose configuration tests could not run with Docker disabled by the owner. Assertions were kept.
- Theme integration tests: 18 passed, including real generated CSS.
- Browser regression checks: passed in light and dark at 390 px and 1440 px.
- Full service integration tests need MinIO. It is not installed on this host. CI runs these checks with its test services.

The local test uses isolated Postgres ports 55483 and 55484. The server uses
local file storage. No Docker command or download was allowed to run.

## Designer review changes

- R-1: Restored the full fill rule and page authority. Kept the type role sentences together.
- R-2: Removed duplicate content variants. The check permits content variants only at the five approved shared markup boundaries.
- R-3: Added real data and the review capture set below. The Card menu capture uses the real shared Card and Menu components in a browser fixture. Its hover fill matches the overlay token in both themes.
- R-4: Required-field errors name their field.
- R-5: Account screens use the core normalizeEmail rule and pass their email error to TextField.
- R-6: The note count uses muted value text after the All notes heading.
- R-7: Removed the state alias module. Components use the named utilities directly.
- R-8: Scroll shadow scrims have the same fallback as the other depth tokens.
- R-9: Updated screen names and the saved-line description.

The two separate phone follow-ups are recorded in [issue 531](https://github.com/tidynotebook/tidynotebook/issues/531).

| Review state               | Before example                                                          | After example                                                          |
| -------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| All notes with folders     | [Light](core-screens-design/before/notes-folders-desktop-light.png)     | [Light](core-screens-design/after/notes-folders-desktop-light.png)     |
| Editor at 1024 px          | [Light](core-screens-design/before/editor-tablet-light.png)             | [Light](core-screens-design/after/editor-tablet-light.png)             |
| Settings at 1024 px        | [Light](core-screens-design/before/settings-tablet-light.png)           | [Light](core-screens-design/after/settings-tablet-light.png)           |
| Version changes            | [Light](core-screens-design/before/history-diff-phone-light.png)        | [Light](core-screens-design/after/history-diff-phone-light.png)        |
| Kept text                  | [Light](core-screens-design/before/attention-kept-phone-light.png)      | [Light](core-screens-design/after/attention-kept-phone-light.png)      |
| Publish dialog             | [Light](core-screens-design/before/publish-dialog-phone-light.png)      | [Light](core-screens-design/after/publish-dialog-phone-light.png)      |
| Image tools                | [Light](core-screens-design/before/image-viewer-phone-light.png)        | [Light](core-screens-design/after/image-viewer-phone-light.png)        |
| Image message              | [Light](core-screens-design/before/image-toast-phone-light.png)         | [Light](core-screens-design/after/image-toast-phone-light.png)         |
| Public footer with a mouse | [Light](core-screens-design/before/login-narrow-fine-pointer-light.png) | [Light](core-screens-design/after/login-narrow-fine-pointer-light.png) |

The paired dark captures use the same file names with `dark` in place of `light`.
Card menu hover: [light](core-screens-design/after/card-menu-hover-light.png)
and [dark](core-screens-design/after/card-menu-hover-dark.png).

After the review fixes, 86 DOM and CSS integration tests and 192 targeted unit
checks passed. The first screen uses 315,200 compressed bytes within the
315,392-byte budget. The two Docker-only unit checks still require CI.

## Owner review changes

The profile row shows a name and email, or the email once. Settings has a bottom
scroll shadow only while content remains below. History shows the note name in
the phone app header. The page Back control is centered on its title; the note
count shares the title baseline. History actions sit inside the selected row
fill. The image viewer keeps Close at the end of the first tool row.

Public footer links retain their click areas and use a smaller gap. The sign-in
page omits its self-link and empty Product column. Captures move the pointer
away from background controls. A browser check confirms that those controls
have no hover or visible keyboard focus behind Settings and Search.

The old narrow sign-in capture used the real local setup response, which had
password reset and open registration off. New narrow captures enable both in
the same setup mock for before and after. Both account route links are visible.
Malformed email and a server email field refusal both show an email field error.
Required-field copy preserves initial abbreviations such as API.

The design contract sentences requested in N-1 are restored word for word.
The current first-screen bundle is 315,363 bytes within the unchanged 315,392-byte
budget. The local checks include the server email response and scroll cue states.

## Owner review changes

The profile row shows a name and email, or the email once. Settings has a bottom
scroll shadow only while content remains below. History shows the note name in
the phone app header. The page Back control is centered on its title; the note
count shares the title baseline. History actions sit inside the selected row
fill. The image viewer keeps Close at the end of the first tool row.

Public footer links retain their click areas and use a smaller gap. The sign-in
page omits its self-link and empty Product column. Captures move the pointer
away from background controls. A browser check confirms that those controls
have no hover or visible keyboard focus behind Settings and Search.

The old narrow sign-in capture used the real local setup response, which had
password reset and open registration off. New narrow captures enable both in
the same setup mock for before and after. Both account route links are visible.
Malformed email and a server email field refusal both show an email field error.
Required-field copy preserves initial abbreviations such as API.

The design contract sentences requested in N-1 are restored word for word.
The current first-screen bundle is 315,363 bytes within the unchanged 315,392-byte
budget. The local checks include the server email response and scroll cue states.

## Full screenshot matrix

Each cell links both captures. Phone layout captures use a 390 px width.
The account captures use the same mocked setup and failure responses.

| Screen                             | Desktop light                                                                                                                                                   | Desktop dark                                                                                                                                                  | Phone light                                                                                                                                                 | Phone dark                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All notes                          | [Before](core-screens-design/before/notes-desktop-light.png) / [After](core-screens-design/after/notes-desktop-light.png)                                       | [Before](core-screens-design/before/notes-desktop-dark.png) / [After](core-screens-design/after/notes-desktop-dark.png)                                       | [Before](core-screens-design/before/notes-phone-light.png) / [After](core-screens-design/after/notes-phone-light.png)                                       | [Before](core-screens-design/before/notes-phone-dark.png) / [After](core-screens-design/after/notes-phone-dark.png)                                       |
| All notes with folders             | [Before](core-screens-design/before/notes-folders-desktop-light.png) / [After](core-screens-design/after/notes-folders-desktop-light.png)                       | [Before](core-screens-design/before/notes-folders-desktop-dark.png) / [After](core-screens-design/after/notes-folders-desktop-dark.png)                       | [Before](core-screens-design/before/notes-folders-phone-light.png) / [After](core-screens-design/after/notes-folders-phone-light.png)                       | [Before](core-screens-design/before/notes-folders-phone-dark.png) / [After](core-screens-design/after/notes-folders-phone-dark.png)                       |
| Note editor                        | [Before](core-screens-design/before/editor-desktop-light.png) / [After](core-screens-design/after/editor-desktop-light.png)                                     | [Before](core-screens-design/before/editor-desktop-dark.png) / [After](core-screens-design/after/editor-desktop-dark.png)                                     | [Before](core-screens-design/before/editor-phone-light.png) / [After](core-screens-design/after/editor-phone-light.png)                                     | [Before](core-screens-design/before/editor-phone-dark.png) / [After](core-screens-design/after/editor-phone-dark.png)                                     |
| Settings                           | [Before](core-screens-design/before/settings-desktop-light.png) / [After](core-screens-design/after/settings-desktop-light.png)                                 | [Before](core-screens-design/before/settings-desktop-dark.png) / [After](core-screens-design/after/settings-desktop-dark.png)                                 | [Before](core-screens-design/before/settings-phone-light.png) / [After](core-screens-design/after/settings-phone-light.png)                                 | [Before](core-screens-design/before/settings-phone-dark.png) / [After](core-screens-design/after/settings-phone-dark.png)                                 |
| Profile with a name                | [Before](core-screens-design/before/settings-named-desktop-light.png) / [After](core-screens-design/after/settings-named-desktop-light.png)                     | [Before](core-screens-design/before/settings-named-desktop-dark.png) / [After](core-screens-design/after/settings-named-desktop-dark.png)                     | [Before](core-screens-design/before/settings-named-phone-light.png) / [After](core-screens-design/after/settings-named-phone-light.png)                     | [Before](core-screens-design/before/settings-named-phone-dark.png) / [After](core-screens-design/after/settings-named-phone-dark.png)                     |
| Appearance and editor              | [Before](core-screens-design/before/appearance-desktop-light.png) / [After](core-screens-design/after/appearance-desktop-light.png)                             | [Before](core-screens-design/before/appearance-desktop-dark.png) / [After](core-screens-design/after/appearance-desktop-dark.png)                             | [Before](core-screens-design/before/appearance-phone-light.png) / [After](core-screens-design/after/appearance-phone-light.png)                             | [Before](core-screens-design/before/appearance-phone-dark.png) / [After](core-screens-design/after/appearance-phone-dark.png)                             |
| Appearance in the middle of scroll | [Before](core-screens-design/before/appearance-scroll-middle-desktop-light.png) / [After](core-screens-design/after/appearance-scroll-middle-desktop-light.png) | [Before](core-screens-design/before/appearance-scroll-middle-desktop-dark.png) / [After](core-screens-design/after/appearance-scroll-middle-desktop-dark.png) | [Before](core-screens-design/before/appearance-scroll-middle-phone-light.png) / [After](core-screens-design/after/appearance-scroll-middle-phone-light.png) | [Before](core-screens-design/before/appearance-scroll-middle-phone-dark.png) / [After](core-screens-design/after/appearance-scroll-middle-phone-dark.png) |
| Appearance at the end of scroll    | [Before](core-screens-design/before/appearance-scroll-end-desktop-light.png) / [After](core-screens-design/after/appearance-scroll-end-desktop-light.png)       | [Before](core-screens-design/before/appearance-scroll-end-desktop-dark.png) / [After](core-screens-design/after/appearance-scroll-end-desktop-dark.png)       | [Before](core-screens-design/before/appearance-scroll-end-phone-light.png) / [After](core-screens-design/after/appearance-scroll-end-phone-light.png)       | [Before](core-screens-design/before/appearance-scroll-end-phone-dark.png) / [After](core-screens-design/after/appearance-scroll-end-phone-dark.png)       |
| Templates                          | [Before](core-screens-design/before/templates-desktop-light.png) / [After](core-screens-design/after/templates-desktop-light.png)                               | [Before](core-screens-design/before/templates-desktop-dark.png) / [After](core-screens-design/after/templates-desktop-dark.png)                               | [Before](core-screens-design/before/templates-phone-light.png) / [After](core-screens-design/after/templates-phone-light.png)                               | [Before](core-screens-design/before/templates-phone-dark.png) / [After](core-screens-design/after/templates-phone-dark.png)                               |
| Daily notes                        | [Before](core-screens-design/before/daily-notes-desktop-light.png) / [After](core-screens-design/after/daily-notes-desktop-light.png)                           | [Before](core-screens-design/before/daily-notes-desktop-dark.png) / [After](core-screens-design/after/daily-notes-desktop-dark.png)                           | [Before](core-screens-design/before/daily-notes-phone-light.png) / [After](core-screens-design/after/daily-notes-phone-light.png)                           | [Before](core-screens-design/before/daily-notes-phone-dark.png) / [After](core-screens-design/after/daily-notes-phone-dark.png)                           |
| Version history                    | [Before](core-screens-design/before/history-desktop-light.png) / [After](core-screens-design/after/history-desktop-light.png)                                   | [Before](core-screens-design/before/history-desktop-dark.png) / [After](core-screens-design/after/history-desktop-dark.png)                                   | [Before](core-screens-design/before/history-phone-light.png) / [After](core-screens-design/after/history-phone-light.png)                                   | [Before](core-screens-design/before/history-phone-dark.png) / [After](core-screens-design/after/history-phone-dark.png)                                   |
| Version changes                    | [Before](core-screens-design/before/history-diff-desktop-light.png) / [After](core-screens-design/after/history-diff-desktop-light.png)                         | [Before](core-screens-design/before/history-diff-desktop-dark.png) / [After](core-screens-design/after/history-diff-desktop-dark.png)                         | [Before](core-screens-design/before/history-diff-phone-light.png) / [After](core-screens-design/after/history-diff-phone-light.png)                         | [Before](core-screens-design/before/history-diff-phone-dark.png) / [After](core-screens-design/after/history-diff-phone-dark.png)                         |
| Trash                              | [Before](core-screens-design/before/trash-desktop-light.png) / [After](core-screens-design/after/trash-desktop-light.png)                                       | [Before](core-screens-design/before/trash-desktop-dark.png) / [After](core-screens-design/after/trash-desktop-dark.png)                                       | [Before](core-screens-design/before/trash-phone-light.png) / [After](core-screens-design/after/trash-phone-light.png)                                       | [Before](core-screens-design/before/trash-phone-dark.png) / [After](core-screens-design/after/trash-phone-dark.png)                                       |
| Published links                    | [Before](core-screens-design/before/publish-desktop-light.png) / [After](core-screens-design/after/publish-desktop-light.png)                                   | [Before](core-screens-design/before/publish-desktop-dark.png) / [After](core-screens-design/after/publish-desktop-dark.png)                                   | [Before](core-screens-design/before/publish-phone-light.png) / [After](core-screens-design/after/publish-phone-light.png)                                   | [Before](core-screens-design/before/publish-phone-dark.png) / [After](core-screens-design/after/publish-phone-dark.png)                                   |
| Publish dialog                     | [Before](core-screens-design/before/publish-dialog-desktop-light.png) / [After](core-screens-design/after/publish-dialog-desktop-light.png)                     | [Before](core-screens-design/before/publish-dialog-desktop-dark.png) / [After](core-screens-design/after/publish-dialog-desktop-dark.png)                     | [Before](core-screens-design/before/publish-dialog-phone-light.png) / [After](core-screens-design/after/publish-dialog-phone-light.png)                     | [Before](core-screens-design/before/publish-dialog-phone-dark.png) / [After](core-screens-design/after/publish-dialog-phone-dark.png)                     |
| Search                             | [Before](core-screens-design/before/search-desktop-light.png) / [After](core-screens-design/after/search-desktop-light.png)                                     | [Before](core-screens-design/before/search-desktop-dark.png) / [After](core-screens-design/after/search-desktop-dark.png)                                     | [Before](core-screens-design/before/search-phone-light.png) / [After](core-screens-design/after/search-phone-light.png)                                     | [Before](core-screens-design/before/search-phone-dark.png) / [After](core-screens-design/after/search-phone-dark.png)                                     |
| Image viewer                       | [Before](core-screens-design/before/image-viewer-desktop-light.png) / [After](core-screens-design/after/image-viewer-desktop-light.png)                         | [Before](core-screens-design/before/image-viewer-desktop-dark.png) / [After](core-screens-design/after/image-viewer-desktop-dark.png)                         | [Before](core-screens-design/before/image-viewer-phone-light.png) / [After](core-screens-design/after/image-viewer-phone-light.png)                         | [Before](core-screens-design/before/image-viewer-phone-dark.png) / [After](core-screens-design/after/image-viewer-phone-dark.png)                         |
| Image viewer message               | [Before](core-screens-design/before/image-toast-desktop-light.png) / [After](core-screens-design/after/image-toast-desktop-light.png)                           | [Before](core-screens-design/before/image-toast-desktop-dark.png) / [After](core-screens-design/after/image-toast-desktop-dark.png)                           | [Before](core-screens-design/before/image-toast-phone-light.png) / [After](core-screens-design/after/image-toast-phone-light.png)                           | [Before](core-screens-design/before/image-toast-phone-dark.png) / [After](core-screens-design/after/image-toast-phone-dark.png)                           |
| Needs attention                    | [Before](core-screens-design/before/attention-kept-desktop-light.png) / [After](core-screens-design/after/attention-kept-desktop-light.png)                     | [Before](core-screens-design/before/attention-kept-desktop-dark.png) / [After](core-screens-design/after/attention-kept-desktop-dark.png)                     | [Before](core-screens-design/before/attention-kept-phone-light.png) / [After](core-screens-design/after/attention-kept-phone-light.png)                     | [Before](core-screens-design/before/attention-kept-phone-dark.png) / [After](core-screens-design/after/attention-kept-phone-dark.png)                     |
| Sign in                            | [Before](core-screens-design/before/login-desktop-light.png) / [After](core-screens-design/after/login-desktop-light.png)                                       | [Before](core-screens-design/before/login-desktop-dark.png) / [After](core-screens-design/after/login-desktop-dark.png)                                       | [Before](core-screens-design/before/login-phone-light.png) / [After](core-screens-design/after/login-phone-light.png)                                       | [Before](core-screens-design/before/login-phone-dark.png) / [After](core-screens-design/after/login-phone-dark.png)                                       |
| Sign-in error                      | [Before](core-screens-design/before/login-error-desktop-light.png) / [After](core-screens-design/after/login-error-desktop-light.png)                           | [Before](core-screens-design/before/login-error-desktop-dark.png) / [After](core-screens-design/after/login-error-desktop-dark.png)                           | [Before](core-screens-design/before/login-error-phone-light.png) / [After](core-screens-design/after/login-error-phone-light.png)                           | [Before](core-screens-design/before/login-error-phone-dark.png) / [After](core-screens-design/after/login-error-phone-dark.png)                           |
| Sign up                            | [Before](core-screens-design/before/signup-desktop-light.png) / [After](core-screens-design/after/signup-desktop-light.png)                                     | [Before](core-screens-design/before/signup-desktop-dark.png) / [After](core-screens-design/after/signup-desktop-dark.png)                                     | [Before](core-screens-design/before/signup-phone-light.png) / [After](core-screens-design/after/signup-phone-light.png)                                     | [Before](core-screens-design/before/signup-phone-dark.png) / [After](core-screens-design/after/signup-phone-dark.png)                                     |
| Sign-up validation                 | [Before](core-screens-design/before/signup-validation-desktop-light.png) / [After](core-screens-design/after/signup-validation-desktop-light.png)               | [Before](core-screens-design/before/signup-validation-desktop-dark.png) / [After](core-screens-design/after/signup-validation-desktop-dark.png)               | [Before](core-screens-design/before/signup-validation-phone-light.png) / [After](core-screens-design/after/signup-validation-phone-light.png)               | [Before](core-screens-design/before/signup-validation-phone-dark.png) / [After](core-screens-design/after/signup-validation-phone-dark.png)               |
| Forgot password                    | [Before](core-screens-design/before/forgot-desktop-light.png) / [After](core-screens-design/after/forgot-desktop-light.png)                                     | [Before](core-screens-design/before/forgot-desktop-dark.png) / [After](core-screens-design/after/forgot-desktop-dark.png)                                     | [Before](core-screens-design/before/forgot-phone-light.png) / [After](core-screens-design/after/forgot-phone-light.png)                                     | [Before](core-screens-design/before/forgot-phone-dark.png) / [After](core-screens-design/after/forgot-phone-dark.png)                                     |
| Reset link                         | [Before](core-screens-design/before/reset-notoken-desktop-light.png) / [After](core-screens-design/after/reset-notoken-desktop-light.png)                       | [Before](core-screens-design/before/reset-notoken-desktop-dark.png) / [After](core-screens-design/after/reset-notoken-desktop-dark.png)                       | [Before](core-screens-design/before/reset-notoken-phone-light.png) / [After](core-screens-design/after/reset-notoken-phone-light.png)                       | [Before](core-screens-design/before/reset-notoken-phone-dark.png) / [After](core-screens-design/after/reset-notoken-phone-dark.png)                       |
| Invitation                         | [Before](core-screens-design/before/invitation-notoken-desktop-light.png) / [After](core-screens-design/after/invitation-notoken-desktop-light.png)             | [Before](core-screens-design/before/invitation-notoken-desktop-dark.png) / [After](core-screens-design/after/invitation-notoken-desktop-dark.png)             | [Before](core-screens-design/before/invitation-notoken-phone-light.png) / [After](core-screens-design/after/invitation-notoken-phone-light.png)             | [Before](core-screens-design/before/invitation-notoken-phone-dark.png) / [After](core-screens-design/after/invitation-notoken-phone-dark.png)             |
| Verify address                     | [Before](core-screens-design/before/verify-notoken-desktop-light.png) / [After](core-screens-design/after/verify-notoken-desktop-light.png)                     | [Before](core-screens-design/before/verify-notoken-desktop-dark.png) / [After](core-screens-design/after/verify-notoken-desktop-dark.png)                     | [Before](core-screens-design/before/verify-notoken-phone-light.png) / [After](core-screens-design/after/verify-notoken-phone-light.png)                     | [Before](core-screens-design/before/verify-notoken-phone-dark.png) / [After](core-screens-design/after/verify-notoken-phone-dark.png)                     |
| First account setup                | [Before](core-screens-design/before/setup-desktop-light.png) / [After](core-screens-design/after/setup-desktop-light.png)                                       | [Before](core-screens-design/before/setup-desktop-dark.png) / [After](core-screens-design/after/setup-desktop-dark.png)                                       | [Before](core-screens-design/before/setup-phone-light.png) / [After](core-screens-design/after/setup-phone-light.png)                                       | [Before](core-screens-design/before/setup-phone-dark.png) / [After](core-screens-design/after/setup-phone-dark.png)                                       |
| First account validation           | [Before](core-screens-design/before/setup-validation-desktop-light.png) / [After](core-screens-design/after/setup-validation-desktop-light.png)                 | [Before](core-screens-design/before/setup-validation-desktop-dark.png) / [After](core-screens-design/after/setup-validation-desktop-dark.png)                 | [Before](core-screens-design/before/setup-validation-phone-light.png) / [After](core-screens-design/after/setup-validation-phone-light.png)                 | [Before](core-screens-design/before/setup-validation-phone-dark.png) / [After](core-screens-design/after/setup-validation-phone-dark.png)                 |
| Server unavailable                 | [Before](core-screens-design/before/server-down-desktop-light.png) / [After](core-screens-design/after/server-down-desktop-light.png)                           | [Before](core-screens-design/before/server-down-desktop-dark.png) / [After](core-screens-design/after/server-down-desktop-dark.png)                           | [Before](core-screens-design/before/server-down-phone-light.png) / [After](core-screens-design/after/server-down-phone-light.png)                           | [Before](core-screens-design/before/server-down-phone-dark.png) / [After](core-screens-design/after/server-down-phone-dark.png)                           |
| Profile                            | [Before](core-screens-design/before/profile-desktop-light.png) / [After](core-screens-design/after/profile-desktop-light.png)                                   | [Before](core-screens-design/before/profile-desktop-dark.png) / [After](core-screens-design/after/profile-desktop-dark.png)                                   | [Before](core-screens-design/before/profile-phone-light.png) / [After](core-screens-design/after/profile-phone-light.png)                                   | [Before](core-screens-design/before/profile-phone-dark.png) / [After](core-screens-design/after/profile-phone-dark.png)                                   |
| Devices                            | [Before](core-screens-design/before/devices-desktop-light.png) / [After](core-screens-design/after/devices-desktop-light.png)                                   | [Before](core-screens-design/before/devices-desktop-dark.png) / [After](core-screens-design/after/devices-desktop-dark.png)                                   | [Before](core-screens-design/before/devices-phone-light.png) / [After](core-screens-design/after/devices-phone-light.png)                                   | [Before](core-screens-design/before/devices-phone-dark.png) / [After](core-screens-design/after/devices-phone-dark.png)                                   |
| API keys and apps                  | [Before](core-screens-design/before/api-keys-desktop-light.png) / [After](core-screens-design/after/api-keys-desktop-light.png)                                 | [Before](core-screens-design/before/api-keys-desktop-dark.png) / [After](core-screens-design/after/api-keys-desktop-dark.png)                                 | [Before](core-screens-design/before/api-keys-phone-light.png) / [After](core-screens-design/after/api-keys-phone-light.png)                                 | [Before](core-screens-design/before/api-keys-phone-dark.png) / [After](core-screens-design/after/api-keys-phone-dark.png)                                 |
| Offline                            | [Before](core-screens-design/before/offline-desktop-light.png) / [After](core-screens-design/after/offline-desktop-light.png)                                   | [Before](core-screens-design/before/offline-desktop-dark.png) / [After](core-screens-design/after/offline-desktop-dark.png)                                   | [Before](core-screens-design/before/offline-phone-light.png) / [After](core-screens-design/after/offline-phone-light.png)                                   | [Before](core-screens-design/before/offline-phone-dark.png) / [After](core-screens-design/after/offline-phone-dark.png)                                   |
| Export and import                  | [Before](core-screens-design/before/export-import-desktop-light.png) / [After](core-screens-design/after/export-import-desktop-light.png)                       | [Before](core-screens-design/before/export-import-desktop-dark.png) / [After](core-screens-design/after/export-import-desktop-dark.png)                       | [Before](core-screens-design/before/export-import-phone-light.png) / [After](core-screens-design/after/export-import-phone-light.png)                       | [Before](core-screens-design/before/export-import-phone-dark.png) / [After](core-screens-design/after/export-import-phone-dark.png)                       |
| Users                              | [Before](core-screens-design/before/users-desktop-light.png) / [After](core-screens-design/after/users-desktop-light.png)                                       | [Before](core-screens-design/before/users-desktop-dark.png) / [After](core-screens-design/after/users-desktop-dark.png)                                       | [Before](core-screens-design/before/users-phone-light.png) / [After](core-screens-design/after/users-phone-light.png)                                       | [Before](core-screens-design/before/users-phone-dark.png) / [After](core-screens-design/after/users-phone-dark.png)                                       |
| Mail                               | [Before](core-screens-design/before/mail-desktop-light.png) / [After](core-screens-design/after/mail-desktop-light.png)                                         | [Before](core-screens-design/before/mail-desktop-dark.png) / [After](core-screens-design/after/mail-desktop-dark.png)                                         | [Before](core-screens-design/before/mail-phone-light.png) / [After](core-screens-design/after/mail-phone-light.png)                                         | [Before](core-screens-design/before/mail-phone-dark.png) / [After](core-screens-design/after/mail-phone-dark.png)                                         |
| Legal documents                    | [Before](core-screens-design/before/legal-documents-desktop-light.png) / [After](core-screens-design/after/legal-documents-desktop-light.png)                   | [Before](core-screens-design/before/legal-documents-desktop-dark.png) / [After](core-screens-design/after/legal-documents-desktop-dark.png)                   | [Before](core-screens-design/before/legal-documents-phone-light.png) / [After](core-screens-design/after/legal-documents-phone-light.png)                   | [Before](core-screens-design/before/legal-documents-phone-dark.png) / [After](core-screens-design/after/legal-documents-phone-dark.png)                   |
| Reports                            | [Before](core-screens-design/before/reports-desktop-light.png) / [After](core-screens-design/after/reports-desktop-light.png)                                   | [Before](core-screens-design/before/reports-desktop-dark.png) / [After](core-screens-design/after/reports-desktop-dark.png)                                   | [Before](core-screens-design/before/reports-phone-light.png) / [After](core-screens-design/after/reports-phone-light.png)                                   | [Before](core-screens-design/before/reports-phone-dark.png) / [After](core-screens-design/after/reports-phone-dark.png)                                   |

The 1024 px captures and the fine-pointer footer are linked in the review table above.
