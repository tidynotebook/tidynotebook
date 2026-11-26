# 012: A finished interface

Status: complete

This design states why the interface reads as unfinished after design 011
landed, and what it takes to make it read as a product that somebody chose. It
follows the owner report of 2026-09-18, which said that the interface looks
like a school project, that the colour and the icon of a button matter, and
that one text face should carry the whole experience.

Design 011 repaired structure: the three planes, the derived divider, the
elevation scale, the motion scale and the centred note column. Those hold. This
design covers what 011 left alone: the voice of the type, the colour of the
action, the weight of an edge, the shape and the size of a control, the frame
around the note, and one written system that every later change follows.

## The problem

The audit of 2026-09-18 read every screen and every control. The facts below
come from it. Each one is small. Together they are why a tidy interface reads
as a template.

**The type has no voice.** `apps/web/src/tailwind.css` names the system stack
and nothing else, so the product renders in whatever the device has: Segoe on
Windows, Liberation Sans on Linux. The chrome and the note share one face. The
scale has four steps, and 103 of 143 size utilities take the smallest. Six
labels are set in capitals with wide tracking, which is the most recognised
mark of a generated admin template.

**The accent paints things that are not actions.** The Default family gives one
saturated blue to the primary button, the app mark in the header, the workspace
avatar, the appearance chip in the settings, and every list bullet in a note.
The home screen shows two blue New note buttons at once. Record 0056 made
Default neutral so that a first screen states no taste; the blue is a taste.

**Every edge is loud and every thing has one.** Fifty four edge utilities, plus
a rule under every row, every section of a dialog, the header, the sidebar, the
note header and the note scroll edges. A secondary button and a text field wear the
component edge of the palette, which `theme.test.ts` holds to 3 to 1 against
every surface, so each one reads as a dark cage. Separation never comes from
space or from fill.

**There is no one recipe for a control.** Twenty three clickable things in
`apps/web/src` and `packages/ui/src` set their own classes instead of reading
`buttonClassName`. They use four different focus treatments, and eight of them
have none. `TextField` exists three times with three heights. The page frame is
built by hand in eight places. The `subtle` variant, the `Badge`, the `Toolbar`
and six icons are exported and never used.

**The icons have no grid.** Six sizes from 14 to 32 render one stroke width, so
the same icon is a hairline in the sidebar and heavy in an empty state. The
command palette gives every action the same chevron. The account menu gives two
of its four rows an icon.

**The frame knows nothing.** The header holds a wordmark, a search field that is
a button, and a kebab that opens the account menu. It never says where the
person is or what they can do here. The sidebar shows a bordered select for the
workspace, a filled button next to an icon button, an all caps label, a row in
a ring, and guide lines down every branch.

**The small things disagree.** Six radius values, with the one on every raised
surface off the named scale. Twenty five raw spacing steps. An empty state in a
dashed box. A notice whose tone lives in its text colour alone. A published page
whose title, button and field match none of the application.

## What a finished interface has

Hierarchy comes from type, space and fill before it comes from an edge. A
person reads the weight and the size of a word, the distance between two
groups and the shift of a plane, and only then a line. Values are few, and each
one is a decision that a reader can name.

## The options

### For the type

The first option keeps the system stack. It costs nothing, and it is the
problem: the product has no face.

The second option vendors one family and sets everything in it. Linear and
Vercel do this. It is cohesive, it is quiet, and every screen speaks with one
voice.

The third option sets the chrome in one face and the note in another, a serif
drawn for reading, so the note reads as a document and the chrome reads as a
tool around it.

A specimen of eleven faces was set before the choice, and the owner reviewed a
mock of the second and the third option side by side. The third option was
refused: a note is a note and not a document, and a serif made it one. The
design takes the second option: Geist for everything a person reads, and Geist
Mono for code. Both are variable fonts under the SIL Open Font License,
vendored and served by the application, because the product is offline first
and a font served by a third party is a request the product does not control.
Geist is tight and even at 13 px in a control, and open at 16 px in a note.
Inter was the other candidate, and it is the face of every generated page.

### For the colour of an action

The first option keeps the blue fill. The second gives the fill the colour of
ink: near black on the light page, near white on the dark page, with the label
in the opposite. The blue stays where colour carries a meaning that no shape
states: a link, the focus ring, the caret and the selection. The app mark, the
workspace avatar and the account avatar become monochrome, so the one filled
control on a screen is the one action.

The design takes the second option. It is the choice that record 0056 implied
and did not finish. A hover on the ink fill still comes from record 0057, and
the contrast test still holds the label.

### For the edge

The first option keeps the component edge on a control. The second makes the
divider of record 0053 the resting edge of a field, a secondary button, a card
and a menu, and reserves the component edge for a control whose state a person
must read with no text: a task box, a checkbox, a radio and a drop target.

The design takes the second option. The resting edge of a text field then falls
under the 3 to 1 non text minimum. The field keeps its label above it, its
focus ring when active and its fill, and every polished product on the market
makes the same trade. The trade is stated in record 0063 so that nobody
rediscovers it as a defect.

### For the control

One module in `packages/ui` gives every button, every row and every field its
classes, and nothing else in the product writes them. A control is 32 px on a
desktop and 44 px under touch. A small control is 28 px. A row is 28 px. Every
corner of a control is the medium radius. An icon is 16 px at a stroke of 1.5
on a 24 grid, and 20 px in an empty state, and nothing else. A primary button
appears once on a screen. The gate refuses a raw icon size, a capital label, a
dashed edge and an off scale radius, the same way it refuses a raw shadow today.

### For the frame

The first option keeps the frame as it is. The second removes the header, as
Bear and Obsidian do. It gives the note the full height and it moves every
header function into the sidebar, and it needs a floating control to bring the
sidebar back. The third option keeps the 44 px header and makes it the context
of the route: where the person is, as a breadcrumb, then the actions of the
route, then search and the account. The wordmark leaves the frame, because the
workspace name is the identity a person works under. The sidebar becomes rows:
a workspace switcher row, a search row and a new note row with their key hints,
a folders label with a new folder action, a tree of 28 px rows with no guide
lines, and a footer of rows.

The design takes the third option. It is the shape of Notion and of Craft, it
keeps every route reachable with one pointer, and the header stops repeating
what the sidebar already says.

### For the surfaces and the small things

A raised surface is the card fill, the subtle edge and one elevation step, so a
light palette shows the shadow and a dark palette shows the edge. An empty
state is an icon, a title, one sentence and one action, with no box around it.
A notice takes a tone surface derived from its tone and the page, and a mark,
so a person who does not separate the hues still reads the tone. The undo toast
becomes a primitive. The note text is 16 px on a 1.65 line at a measure of
40 rem, and its heading ramp stops under the note name at 1.5 em. The published
page reads the same class strings as the application.

## What this design does not do

It does not change a borrowed palette. The ten borrowed families keep every
value. Default changes its accent fill and nothing else.

It does not add a package or move a boundary. The slot that lets a route fill
the header lives in `apps/web/src/shell/`.

It does not give the person a choice of note face. One face per role is the
decision. A stored preference can follow later as its own record.

## Decisions

- [0061. The application is set in one vendored family](../decisions/0061-the-application-is-set-in-one-vendored-family.md)
- [0062. The default action is ink and the blue carries meaning](../decisions/0062-the-default-action-is-ink-and-the-blue-carries-meaning.md)
- [0063. The resting edge of a control is the divider](../decisions/0063-the-resting-edge-of-a-control-is-the-divider.md)
- [0064. The frame header is the context of the route](../decisions/0064-the-frame-header-is-the-context-of-the-route.md)
- [0065. One recipe for a control and one grid for an icon](../decisions/0065-one-recipe-for-a-control-and-one-grid-for-an-icon.md)
- Kept: [0015. The note surface is the design](../decisions/0015-the-note-surface-is-the-design.md)
- Kept: [0016. A theme is data in one registry](../decisions/0016-themes-are-data-in-one-registry.md)
- Kept: [0052. Three planes and one elevation scale](../decisions/0052-three-planes-and-one-elevation-scale.md)
- Kept: [0053. The divider is derived from the palette](../decisions/0053-the-divider-is-derived-from-the-palette.md)
- Kept: [0054. Motion is a named scale in one module](../decisions/0054-motion-is-a-named-scale-in-one-module.md)
- Kept: [0055. The note is one centred column](../decisions/0055-the-note-is-one-centred-column.md)
- Kept: [0056. The default theme has no opinion](../decisions/0056-the-default-theme-has-no-opinion.md)
- Kept: [0057. A control fill states its hover in the palette](../decisions/0057-a-control-fill-states-its-hover-in-the-palette.md)

The plan is [plan 012](../plans/012-a-finished-interface.md). The system that
every later screen follows is [the design guide](../development/design.md).
