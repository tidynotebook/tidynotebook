# Interface design

This page states the design rules of every screen and points at their code. The
reasons are in [design 012](../design/012-a-finished-interface.md) and its
records. `tools/check-design-rules.mjs` holds these rules in `pnpm lint`.

## The principle

Type, space and fill show order before an edge does. Use few values, and make
each one a decision you can name. When two treatments work, use the quieter one.

## The face

One family, Geist, for everything a person reads, and Geist Mono for code, a
keyboard hint and a copied value. Both are vendored in `apps/web/public/fonts`
and declared in `apps/web/src/tailwind.css`, the only file that may declare a
face. No module or document names a family, and the diagram frame carries
that stylesheet and its faces inside it. Record 0061.

## The type steps

The named steps live in `apps/web/src/tailwind.css`. Use no other size.

- `text-kbd` is a keyboard hint and nothing else.
- `text-control` and `text-ui` are primary text, controls, rows and menus.
- `text-help` is help, metadata, field errors and quiet group headings.
- `text-title` keeps compact titles at their current size.
- `text-base` is the title of a card or a section.
- `text-xl` is the title of a page.
- `text-3xl` is the largest step: a note name on the published page and the
  landing home headline (record 0217).
- The `text-note` steps are the note text and its heading ramp.

Touch tokens match primary text to fields. Titles and note text keep their sizes.

Two weights in the chrome: `font-medium` for a control label and a selected
row, `font-semibold` for a title. No capitals, no wide tracking, no bold.
Large type takes `tracking-heading` or `tracking-display`.

## The planes and the edges

Three planes (record 0052): `bg-surface` is chrome, `bg-app` is the page,
`bg-card` is raised. `bg-hover` and `bg-active` are the states of a row or chip.

Three edges (records 0053 and 0063): `edge-line` is the resting edge of a
control and the one divider. `edge-subtle` is the edge of a raised surface and
a hairline inside a group that already differs in fill. `edge` is only a task
box, a checkbox, a radio, a switch track and a drop target. Draw a divider only
where a person must see the boundary of a region they scroll or a list they
count. Separate everything else with space or fill.

## Elevation, radius and space

Elevation is `shadow-raised`, `shadow-overlay` and `shadow-modal`, from the
scrim of the palette (record 0052). A raised surface is `bg-card`,
`edge-subtle` and one step. Radius: `rounded-sm` for a keyboard hint, a task box
and a meter, `rounded-md` for a control and a row, `rounded-lg` for a card, a
menu, a toast and a code block, `rounded-xl` for a dialog, `rounded-full` for an
avatar alone.

Space comes from the named steps `gutter`, `gutter-wide`, `cluster` and
`group`, plus the numeric scale inside one control. `pageGutter` in
`packages/ui/src/layout.tsx` is the one distance from the screen edge to the
content. The [page layouts](layouts.md) define the three page families.

## Controls

Every control reads `packages/ui/src/control-classes.ts` (record 0065).

- `buttonClassName`: `primary` is the one action of a screen, ink on the page.
  `secondary` is every other button, `bg-card` with `edge-line` and
  `shadow-raised`. `ghost` is an icon only action and a Cancel. `danger` is a
  destructive confirmation, and a quiet button that starts one takes the
  danger tone from the recipe. `md` is 32 px, `sm` is 28 px, and `compact`
  keeps the touch target and draws a smaller surface inside it. A disabled
  button is `text-muted`, a filled one on `bg-hover`, and nothing fades.
- `rowClassName`: every clickable row, in the tree, a list, a menu, the palette
  and the sidebar footer. 28 px on a desktop, `rounded-md`, `hover:bg-hover`.
  The open or chosen row is `bg-active text-strong font-medium`. No ring. A row
  that destroys something takes the danger tone from the recipe and never a
  colour class of its own (record 0065).
- `fieldClassName`: a text field, a select and a read only field. 32 px,
  `edge-line` at rest, `border-focus` when active, `border-danger` in error,
  16 px text under touch (`touchFieldText`) against the zoom of iOS, a label
  in `text-control font-medium` above, `inlineFieldClassName` in a tree row.
- `tabClassName`: a tab, a chip that takes `bg-active` when its view shows.
- `kbdClassName`: one cap in `text-kbd font-mono` with `edge-line` for each
  key, from `KeyHint` (`apps/web/src/shell/key-hint.tsx`) with the device cap
  of `apps/web/src/shell/modifier-key.ts` and the full name for a reader.
- `meterClassNames`: `Meter` in `packages/ui/src/controls.tsx` shows a value
  against a maximum with no state or callback. The track is `bg-hover`, the
  SVG fill is `fill-accent-fill`, and both use `h-1.5 rounded-sm`.
  `meterFillPercent` gives the real fraction. A second SVG rectangle keeps
  positive use visible with a 2 px minimum. Only use at or above the maximum fills the track. At `90%`,
  `meterAlmostFull` gives the fill `fill-danger-fill` and adds Almost full to the
  text. The named meter states its minimum, maximum and current value.

Focus uses `focus-visible:` with one outline, outward on a control and inward on
a row in a scroller, two pixels in the focus colour. A primary button appears
once, inside the route, never in the sidebar. A hover changes only the fill
(record 0057). Nothing scales on press.

## Icons

`packages/ui/src/icons.tsx` is the one set: a 24 grid at a stroke of 1.5. An
icon is 16 px in a control, a row and a label, and 20 px in an empty state. A
menu gives every row an icon or no row an icon. An action carries one icon
everywhere. An icon only action carries a `label`. Delete an unused icon.

## The frame

The header is 44 px and is the context of the route (record 0064): the sidebar
toggle, the breadcrumb, the route actions of `HeaderSlot`, the last part of
`HeaderLeafSlot` (`apps/web/src/shell/header-slot.tsx`), Search and the avatar.
The note route writes its name in that part and gives the header one menu, with
History and Publish as rows (record 0069). An icon-only control there is
compact, and one at an end takes the pull of `edgeControlClassName`. The sidebar
is a bar of view buttons and a panel of rows (record 0105): the switcher, the
tree (records 0093, 0164) or the calendar (0100), and the footer. The wordmark
belongs to sign in and setup. The note has one row of formatting tools above its
text at every width (record 0094), and `apps/web/src/lib/format-toolbar.ts` is
the one list that the row, the command palette and the slash menu read. An
overlay opens above the keyboard of a phone.

## Surfaces a person waits on or reads

- An empty state is an icon at 20 px, a title in `text-ui font-semibold`, one
  sentence in `text-control text-muted`, and one action. No box.
- A notice is a tone surface, `bg-accent-surface`, `bg-success-surface` or
  `bg-danger-surface`, a mark in the tone colour and text in `text-strong`. No
  edge, and one notice for one cause.
- A loading state is the placeholder in `packages/ui/src/loading.tsx`.
- `Toast` in `packages/ui` sits at the bottom with one sentence and one action.
- A menu and a dialog are raised surfaces of `packages/ui`, but the image
  viewer is a picture on the scrim (0145). A dialog title is `text-ui`, Cancel
  is `ghost`, and the confirming action at the end is `primary` or `danger`.
  A dialog scrolls between its title and its action row, inside the screen.

## Copy

Use sentence case. Name a thing by its action. Keep one term: Save, Trash, Move
to Trash, Restore, Delete, History, Publish. Delete removes a note for good, in
Trash only (record 0164). A row shows one name and one fact.

## Before a screen lands

- One primary button, every icon 16 or 20, every label in sentence case.
- Light and dark both read: take a screenshot of each.
- The keyboard reaches every action, and the focus is visible.
- `pnpm lint` passes with no new entry in `tools/design-rules-allow.json`.
