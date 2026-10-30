# Design system

This page owns the UI composition, spacing, density and depth contract for every surface.

## Rules

Use Tailwind in `packages/ui` components. Features compose them without spacing, size or depth rules.

Use one spacing scale and the named size roles. `apps/web/src/tailwind.css`
owns all tokens in `@theme`. The `coarse:` and `fine:` variants select pointer
density. A component defines both densities with one rule set.

Parents own padding and gaps; children have no outer margins. Keep padding symmetric,
with `pad`, or symmetric `padX` and `padY`.

Every control with a fill has equal space between its content and each side
of the fill, including on hover. Content must not touch a fill edge. An
optical slot can extend the fill without moving its content.

Rows get height from a line box and equal vertical padding. Do not use a
minimum height to add blank space. Keep glyphs on the padding line. Extend a
pointer target outward without moving its glyph. Keep one leading content
edge in each container. Nesting adds the shared indent step. A leaf keeps an
empty disclosure slot. Calendar cells keep control height in equal columns.

Keep items closer than groups. The group gap equals the container padding.
A fixed region next to scrolling content always shows a hairline, including
at rest. Its soft shadow shows only while it covers hidden scroll content.

## Tokens and CSS

`apps/web/src/tailwind.css` owns spacing, sizes, radius, shadows, surfaces and
type roles. Use Tailwind tokens, not spacing variables or arbitrary values.

Typed spacing steps are `0`, `0.5`, `1`, `2`, `3`, `4`, `6`, `8` and `12`,
or a `fine` and `coarse` pair. Shared size roles distinguish glyphs, controls,
row actions, toolbars, headers and rails. Code owns their values.

Use `text-title-page`, `text-title-header`, `text-body`, `text-label`,
`text-value`, `text-secondary`, `text-group` and `text-small`. Each role sets
size, line height and weight. Note text keeps its own rendering scale.

Use the page, panel, card, raised card and overlay surfaces. Menus and popovers
use the overlay surface, edge and shadow. Scroll edges use
`shadow-edge-top` and `shadow-edge-bottom`. Theme overrides keep these roles
valid for custom themes.

CSS can hold only theme tokens, custom pointer variants, the base reset and
the iOS viewport rule. Do not add layout utilities, screen selectors,
doubled-class selectors or inline spacing styles. Runtime overlay and viewport
coordinates and virtual list offsets are browser geometry, not spacing choices.

## Components

- `Stack` owns a vertical gap and alignment.
- `Inline` owns a horizontal gap, alignment, justification and wrapping.
- `Inset` owns symmetric padding.
- `Region` separates fixed and scrolling areas. Scroll sentinels set
  `data-edge-top` and `data-edge-bottom` on adjacent fixed regions. Hairlines
  use `border-edge-subtle` in every scroll state. Only the scroll cue shadows,
  `shadow-edge-top` and `shadow-edge-bottom`, follow the sentinels. Shadows
  change with `duration-120`. Reduced motion removes the transition.
- `Divider` has no margin. Its parent owns the space.
- `ListRow` owns leading and trailing slots, label, help and value. It centers
  content vertically. Densities are `tree`, `setting` and `menu`; `indent` adds
  empty disclosure slots. Trailing types are `chevron`, `value`, `switch`,
  `action`, `menu` or none.
- `IconButton` uses `row`, `toolbar`, `header` or `rail` size. Its target grows
  around a fixed glyph box.
- `Button` uses `compact` or `default` size and a semantic variant.
- `SectionHeading` holds a label, optional count and optional action. Its
  parent owns the gap to the group.
- `Card` is a raised, rounded container without padding. Its rows own their
  padding. Dividers between rows align with the inner row edge.
- `Panel` owns equal padding and a stack whose group gap equals that padding.
- `Toolbar` is an inline group of icon buttons with the item gap.
- `Field`, `TextField`, `SelectField` and `TextAreaField` share label, control,
  help and error spacing. A form is a stack of fields.
- `SwitchRow` is a setting row whose whole surface toggles its switch.
- `Pill` states a fact. It uses the small type role and the quiet surface.
- `Notice`, `EmptyState`, `Toast` and `Tooltip` use equal padding.
- `Sheet` owns the phone header, scrolling body and pinned footer. Header
  glyphs align with the body inset. Its footer has one full-width primary
  button and adds the safe area at the bottom.
- `Dialog` owns equal desktop padding and the gaps between title, body and
  footer. Its footer is an inline group aligned to the end.
- `Menu` and `Popover` own equal padding, the overlay surface and menu rows.

## Sidebar

A panel contains fixed top, scrolling tree and fixed status regions. Padding
belongs inside each region. The top holds the phone header, workspace switcher
and toolbar. Only the tree scrolls. The status footer has no extra panel
padding below it. Phone safe area belongs below the status line.

Tree rows share anatomy and indent slots. Names use an ellipsis; accessible
names stay complete. Desktop tooltips show full names. Phone row menus stay
visible. Fine pointer menus show on hover and keyboard focus. A view without
real menu actions keeps an empty menu slot.

Rail buttons share one size role. The rail owns padding and item gap; the
status line uses the panel inset and its own line height.

## Page lists

Pages reached from the rail have no back control before the title. A list
page has one content edge for its title and rows. Keep the title on its own.
When the list is empty, use the `Page` empty-state slot. It centers the shared
`EmptyState` in the free area under the title, with an icon, title and one help
line. Put the explanation there instead of repeating it below the page title.

## Settings

Order settings by scope: the Profile card, Security, Preferences, Workspace,
then Administration (administrators only). Its account list is Users, with
the `accounts` deep link. Profile has no second entry in a group. Keep the
workspace name with its group and Appearance and editor as the default.
Deep links name their section regardless of group order.

Desktop navigation uses the sidebar density. Its account card has equal
padding. Desktop content is a scrolling region with a stack of flat row
groups and full-width dividers. Phone groups use cards. Their headings align
with the inner card content. Headings above tiles align with the tiles.

The title block has one group gap after it. Descriptions add no outer space.
Rows center content vertically and align label and help text left. Phone
action rows have no second filled or outlined button.

Keep a short form on its section page. Add a sub-level only when a picker
needs a long list, an editor needs the full height, or a separate step needs
its own confirmation. Mail is a section form, with a saved draft and a footer.

All levels use the container header and footer roles. Forms use a stack of
fields. Back, Close and Cancel discard drafts. Primary actions retain their
verb or value-edit label. Focus stays in the modal and returns to its trigger.

## Checks

`tools/check-design-system.mjs` runs in `pnpm lint`. It refuses feature
margins except `m-0`, child space utilities, padding and gap utilities,
minimum heights, arbitrary values and inline spacing. Shared UI code can use
only scale steps. The CSS check refuses layout utilities, screen descendant
selectors and doubled-class selectors.

`tools/design-system-allow.json` records cases with a reason and can only
shrink. New exceptions require a component variant and a contract update.

`tests/browser/symmetry.ts` checks content edges and visual parity in both
themes and pointer densities. Remove or explain changes beyond the tolerance.
