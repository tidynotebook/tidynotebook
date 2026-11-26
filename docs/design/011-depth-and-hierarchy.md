# 011: Depth and hierarchy in the interface

Status: complete

This design states why the application reads flat, and what the interface needs
so that a person sees structure before they read a word. It follows the owner
report of 2026-09-17, which compared the product with a polished note
application and asked what is missing.

## The problem

The rules of this repository say what the interface refuses. `AGENTS.md` bans a
handwritten selector, an arbitrary Tailwind value, a one off size, and a colour
outside the registry. `tools/check-design-rules.mjs` holds each ban. The result
is a tidy interface with no accidents in it.

No rule says what carries hierarchy. So every screen reaches for the one tool
that is always available, which is a hairline edge, and every distance comes
from the same four step layout scale. The screen has one plane, one edge
weight, and one rhythm. A person reads that as flat.

Five separate faults produce the effect. Each one is small. Together they are
the difference between a tidy interface and a finished one.

## Fault one: the note column is pinned to the left

`editorTheme` in `packages/editor/src/editor-theme.ts` gives a line and a block
widget the note measure as a maximum width, and then pins the inline margin to
zero. The note therefore starts at the left edge of the editor column and stops
at the measure.

`note-editor.tsx` in `apps/web/src/features/editor/` puts a side region of a
fixed width to the right of that column from the large width up. The region
holds the outline and the inbound links, and it is there whether or not it has
anything to say.

On a wide screen the text sits left, the side region sits right, and a band of
empty canvas sits between them. Nothing in the frame explains the band. The
note name once used a different measure from the note text.

## Fault two: the brightest plane is spent on the chrome

Each palette in `packages/ui/src/themes` carries five fills. In every family
they order the same way. The sidebar surface is the quietest, the page
background is next, and the card surface is the brightest.

That order is a three plane model, and it is correct: the chrome recedes, the
page sits above it, and a raised thing sits above the page. The application
follows the model everywhere but one place. The frame header in
`apps/web/src/shell/shell.tsx` paints itself with the card fill, so the strip
that a person never reads sits on the highest plane of the screen, above the
page they write on.

One wrong assignment inverts the model at the top of every screen.

## Fault three: one edge token does all the separation

`packages/ui/src/theme.ts` states two edge tokens. The component edge meets the
non text contrast minimum, which `theme.test.ts` proves on all five surfaces.
The decorative edge has no minimum at all, because it is decorative, and each
palette therefore puts it close to its own page fill.

Every divider in the product uses the decorative edge: the rows of `ListRow` in
`packages/ui/src/layout.tsx`, the rows of the note list in
`apps/web/src/features/notes/notes-home.tsx`, the card outline, the frame
header rule, and the note header rule. On most palettes a person cannot see it.
The component edge is the only other choice, and it is far too loud for a
divider, so a screen either shows nothing or shows a cage.

The gap between the two is where a readable divider lives, and no token sits in
it.

## Fault four: there is no elevation scale and no motion scale

Three shadow utilities appear in the whole application: one on the primary
button, one on a toast, and one shared by the dialog and the menu. Nothing sits
between flat and modal, so a card, a popover and a dialog all read as one kind
of thing.

Motion is in the same state. Colour transitions appear across the shell with no
stated duration and no stated easing, so each one takes whatever the framework
default is. A button also scales down on press, which is a touch idiom and
reads cheap under a mouse.

The central theme in `apps/web/src/tailwind.css` already decides type, spacing,
radius and colour for the whole product. Elevation and motion are the two
scales it does not decide, and they are the two that a person reads as polish.

## Fault five: the note name is not the largest text on the note screen

[Decision 0015](../decisions/0015-the-note-surface-is-the-design.md) states that
the note name is the largest item on the note screen. The code disagrees. The
name in `apps/web/src/lib/note-header-layout.ts` takes a fixed step of the
interface scale, and the first heading of the note body takes the top of the
note ramp in `apps/web/src/tailwind.css`, which is larger. A note that opens
with a heading therefore shows two titles, and the wrong one wins.

Heading type is also set without optical correction. Large type at the default
letter spacing is the clearest sign of an untouched framework theme.

## The options

### For the column

The first option leaves the column where it is and removes the side region, so
the band disappears. This is cheap, and it loses the outline.

The second option centres the note column inside the space it owns and holds
the name and text to one column. The side region stops taking
width from the measure: it appears one breakpoint later, at the first width
where the full measure and the region both fit, and its outline section
appears only when the note has a heading. This costs a change in the typed
editor adapter, in the header layout module, and in the note screen.

The design takes the second option. The band is not a spacing defect. It is a
composition defect, and moving the text to the centre of its own space is what
a reader expects of a page.

### For the planes

The only real option is to correct the assignment, because the model the
palettes carry is already right. The frame header takes the chrome fill, like
the sidebar. Nothing else moves and no palette changes.

### For the divider

The first option gives each palette a third edge value. This is one more value
in eighteen variants, and a new palette can get it wrong.

The second option derives the divider from two values the palette already
carries. The divider is a fixed blend of the component edge into the page
background, computed once, written as a custom property with every other token,
and proved by the same test that walks the registry today.

The design takes the second option. A derived value cannot drift, a new theme
cannot forget it, and the contrast test can state the invariant directly: the
divider is louder than the decorative edge and quieter than the component edge,
in every theme that exists and every theme that follows.

### For elevation and motion

Both become named scales in the central theme, beside the scales that are there
already. Elevation is built from the scrim of the palette, which every theme
carries and which the contrast test already proves is darker than every
surface, so a shadow needs no new colour and no new token.

Motion needs one more step. Tailwind gives a duration no theme namespace, so a
duration written in a class is a bare number that no rule can hold. The
application already solves this shape of problem with `pageGutter` in
`packages/ui/src/layout.tsx`, which is the one distance from the edge of the
screen to the content, stated once and read by every frame that cannot use the
page primitive. Motion takes the same form: one module in `packages/ui` states
the transitions, and every screen reads them from there.

The gate then bans a raw shadow utility, a raw duration and a raw easing
outside that module, the same way it bans a one off type size today.

### For the title ramp

The name takes a larger step, and the top of the note ramp comes down, so the
name wins at every zoom and the record and the code agree again. Heading type
gets a tightening at the large steps, from a named scale.

## What this design does not do

It does not change a palette. Every hue, every fill and every text colour in
`packages/ui/src/themes` stays as it is. The faults above are structural, and
repainting ten families would hide them rather than fix them.

It does not add a package, move a boundary, or change what a note is at rest.

## Decisions

- [0052. Three planes and one elevation scale](../decisions/0052-three-planes-and-one-elevation-scale.md)
- [0053. The divider is derived from the palette](../decisions/0053-the-divider-is-derived-from-the-palette.md)
- [0054. Motion is a named scale in one module](../decisions/0054-motion-is-a-named-scale-in-one-module.md)
- [0055. The note is one centred column](../decisions/0055-the-note-is-one-centred-column.md)
- Kept: [0015. The note surface is the design](../decisions/0015-the-note-surface-is-the-design.md)
- Kept: [0016. A theme is data in one registry](../decisions/0016-themes-are-data-in-one-registry.md)
- Kept: [0025. The live preview is the one note surface](../decisions/0025-the-live-preview-is-the-one-note-surface.md)
