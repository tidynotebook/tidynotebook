# Interface design

This page is the system that every screen of the product follows. It states the
intent and the invariant of each part and points at the code that holds it.
Read it before you touch anything a person sees. The reasons are in
[design 012](../design/012-a-finished-interface.md) and the records it names.
`tools/check-design-rules.mjs` holds the rules that a check can hold, and
`pnpm lint` fails on each one.

## The principle

Hierarchy comes from type, space and fill before it comes from an edge. A person
reads the weight and the size of a word, the distance between two groups and
the shift of a plane, and only then a line. Use few values, and make each one a
decision you can name. When two treatments would do, take the quieter one.

## The face

One family, Geist, for everything a person reads, and Geist Mono for code, a
keyboard hint and a copied value. Both are vendored in `apps/web/public/fonts`
and declared in `apps/web/src/tailwind.css`, the only file that may declare a
face. No module names a family. Record 0061.

## The type steps

The named steps live in `apps/web/src/tailwind.css`. Use no other size.

- `text-kbd` is a keyboard hint and nothing else.
- `text-control` is a control, a row, a label, a hint, a caption and the text
  of a menu.
- `text-ui` is body text outside a note, a list row title and a dialog title.
- `text-base` is the title of a card or a section.
- `text-xl` is the title of a page.
- `text-3xl` is the name of a note on the published page, the largest step.
- The `text-note` steps are the note text and its heading ramp.

Two weights in the chrome: `font-medium` for a control label and a selected
row, `font-semibold` for a title. No capitals, no wide tracking, no bold.
Large type takes `tracking-heading` or `tracking-display`.

## The planes and the edges

Three planes (record 0052): `bg-surface` is chrome, `bg-app` is the page,
`bg-card` is raised. `bg-hover` and `bg-active` are the two states of a row and
a chip.

Three edges (records 0053 and 0063): `edge-line` is the resting edge of a
control and the one divider. `edge-subtle` is the edge of a raised surface and
a hairline inside a group that already differs in fill. `edge` is only a task
box, a checkbox, a radio, a switch track and a drop target. Draw a divider only
where a person must see the boundary of a region they scroll or a list they
count. Separate everything else with space or fill.

## Elevation, radius and space

Elevation is `shadow-raised`, `shadow-overlay` and `shadow-modal`, from the
scrim of the palette (record 0052). A raised surface is `bg-card`, `edge-subtle`
and one step.

Radius: `rounded-sm` for a keyboard hint and a task box, `rounded-md` for a
control and a row, `rounded-lg` for a card, a menu, a toast and a code block,
`rounded-xl` for a dialog, `rounded-full` for an avatar alone.

Space comes from the named steps `gutter`, `gutter-wide`, `cluster` and
`group`, plus the numeric scale inside one control. `pageGutter` in
`packages/ui/src/layout.tsx` is the one distance from the screen edge to the
content. Every page is the note column and a side region (record 0137).

## Controls

`packages/ui/src/control-classes.ts` writes the classes of every control, and
no screen writes its own (record 0065).

- `buttonClassName`: `primary` is the one action of a screen, ink on the page.
  `secondary` is every other button, `bg-card` with `edge-line` and
  `shadow-raised`. `ghost` is an icon only action and a Cancel. `danger` is a
  destructive confirmation, and a quiet button that starts one takes the
  danger tone from the recipe. `md` is 32 px, `sm` is 28 px, and `compact`
  keeps the touch target and draws a smaller surface inside it.
- `rowClassName`: every clickable row, in the tree, a list, a menu, the palette
  and the sidebar footer. 28 px on a desktop, `rounded-md`, `hover:bg-hover`.
  The open or chosen row is `bg-active text-strong font-medium`. No ring. A row
  that destroys something takes the danger tone from the recipe and never a
  colour class of its own (record 0065).
- `fieldClassName`: a text field, a select and a read only field. 32 px,
  `edge-line` at rest, `border-focus` with a ring when active, `border-danger`
  in error, and 16 px text under touch (`touchFieldText`) so that iOS does not
  zoom. Its label is above it in `text-control font-medium`.
- `kbdClassName`: one key cap in `text-kbd font-mono` with `edge-line`. A key
  combination is one cap for each key, from `KeyHint` in
  `apps/web/src/shell/key-hint.tsx`, and `apps/web/src/shell/modifier-key.ts`
  decides the cap of the device. A screen reader gets the full key name.

Focus is one treatment: a two pixel outline in the focus colour, offset outward
on a control and inward on a row inside a scroller. Never `focus:`, always
`focus-visible:`.

A primary button appears once on a screen, inside the route and not in the
sidebar. A hover changes the fill to the derived hover of the palette and
nothing else (record 0057), and nothing scales on press.

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
compact, and one at an end takes the pull of `edgeControlClassName`. The
sidebar is a bar of view buttons and a panel of rows (record 0105): the
switcher, the tree (record 0093) or the calendar (record 0100), and the footer.
The wordmark belongs to sign in and setup. The note has one row of formatting
tools above its text (record 0094), and `apps/web/src/lib/format-toolbar.ts` is
the one list that the row and the command palette read.

## Surfaces a person waits on or reads

- An empty state is an icon at 20 px, a title in `text-ui font-semibold`, one
  sentence in `text-control text-muted`, and one action. No box.
- A notice is a tone surface, `bg-accent-surface`, `bg-success-surface` or
  `bg-danger-surface`, a mark in the tone colour and text in `text-strong`. No
  edge, and one notice for one cause.
- A loading state is the placeholder in `packages/ui/src/loading.tsx`.
- A toast is `Toast` in `packages/ui`, a raised surface at the bottom of the
  screen with one sentence and one action.
- A menu and a dialog are raised surfaces of `packages/ui`, but the image
  viewer is a picture on the scrim (0145). A dialog title is `text-ui`, Cancel
  is `ghost`, and the confirming action at the end is `primary` or `danger`.

## Copy

Sentence case everywhere. Name a thing by what a person does with it. One term
for one thing: Save, Trash, Restore, Delete, History, Publish. In Trash, the
page copy states that Delete removes a note for good. A row shows one name and
one fact. The rules of user facing text in `AGENTS.md` hold here.

## Before a screen lands

- Every control reads a recipe from `control-classes.ts`.
- One primary button, every icon 16 or 20, every label in sentence case.
- Light and dark both read: take a screenshot of each.
- The keyboard reaches every action and the focus is visible on each.
- `pnpm lint` passes with no new entry in `tools/design-rules-allow.json`.
