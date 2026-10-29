# Spacing standard

This page owns the spacing rules for repository surfaces and the approved surface roles.

## General rules

Use the shared spacing grid. Keep each spacing value in a named role token in
`packages/ui/src/spacing.css`. Do not copy values into a surface component.

The parent owns the space. A container sets its padding and the gaps between
its children. Children do not add outer margins. This prevents duplicate space.

Keep top and bottom padding equal. Keep left and right padding equal.
Containers use the same padding on all sides. Measure the visible content,
not an invisible pointer target, when you check these edges.

Let content set row height. Add equal vertical padding around the line box.
A surface can keep names on one line and show an ellipsis. Do not use a minimum
height to add blank space.

Use one leading content edge in a container. Indent each tree level by the
shared indent step. A leaf keeps the empty disclosure slot so its icon and
name align with a folder.

Keep related items closer than separate groups. The item gap is smaller than
the group gap. The group gap equals the container padding.

Keep icon glyphs on the padding line. Extend their pointer targets outward
into the padding. A larger target must not move the glyph or the label.

Use the pointer density of the shared roles. Fine pointers use compact
controls. Coarse pointers use larger targets. Full-width rows can use the
row target rule. An icon action inside a row uses the row height and the
shared row-action width. Toolbar, header and rail targets have separate roles.

These rules apply to all surfaces. Each surface section names its approved
roles. Other surface values remain in their existing roles until review.

## Sidebar

`packages/ui/src/spacing.css` owns the `--ui-sidebar-*` tokens and the
`ui-sidebar-*` utilities. The base tokens define fine pointer density. The
coarse pointer token block defines touch density. The panel padding, group
gap, item gap, row padding, row line, indent, switcher, action, rail, header
and status roles are separate tokens.

The panel has three regions. The fixed top contains the header, workspace
switcher and actions. The tree alone scrolls. The fixed status footer has no
extra panel padding below it. Each region owns its padding. The tree owns
the gaps between rows. All rows have equal horizontal padding. Their disclosure,
icon, name and menu slots share one anatomy. A menu glyph stays on the right
padding line. Its target extends into the padding. Phone row menus stay
visible. Names stay on one line with an ellipsis. Their accessible names stay
complete. A view without menu actions keeps an empty menu slot. Fine pointer row menus appear on hover and keyboard focus.

All rail controls use the same rail button role. The rail owns its top and
bottom padding and its item gaps. The status line uses its own height and
the panel padding role for its side inset.

`apps/web/src/shell/shell.tsx` composes the groups.
`apps/web/src/shell/workspaces.tsx` renders the workspace switcher.
`apps/web/src/shell/sidebar-view-bar.tsx` renders the rail.
`apps/web/src/shell/sidebar-status.tsx` renders the status line.
`apps/web/src/shell/tree.tsx` renders tree rows and their targets.
`apps/web/src/lib/tree-row.ts` names the row roles and computes indentation.
`apps/web/src/shell/drawer.ts` owns drawer presentation and scrolling.

`tests/browser/sidebar-symmetry.ts` measures visible content edges and checks
alignment at each tree level. The drawer, keyboard and drag checks also
verify that the layout keeps navigation and direct manipulation available.

Run `pnpm test:browser:sidebar` against the local review deployment.

## Settings

`packages/ui/src/spacing.css` owns the `--ui-settings-*` tokens. Navigation,
content, groups, rows, forms, headers and footers have separate roles. Fine
pointer navigation follows sidebar density. Its account card has equal padding
on all sides. The navigation parent owns the item and group gaps.

The content column owns equal padding and the gaps between groups. Fine
pointer groups use flat rows and full-width dividers. Phone groups use cards.
A phone heading aligns with the inner card content. A heading above tiles
aligns with the tiles. Cards have no padding outside their rows.

Rows center their text and controls. Their height comes from the line boxes,
the help gap and equal vertical padding. Larger pointer targets extend out
from a control slot without changing its line box. Help stays inside its text
column. A full row action has no second button on phone.

Every Settings level uses the same header role. Phone header glyphs align
with the content inset. The title stays centered. Forms use shared field,
label and help gaps. Each footer has equal padding on all sides, with the
phone safe area added at the bottom.

`packages/ui/src/settings-layout.tsx` supplies the Settings surface context.
`packages/ui/src/controls.tsx` and `packages/ui/src/layout.tsx` use that context
for row controls. `apps/web/src/features/accounts/settings-section.tsx`
composes groups and rows. `apps/web/src/features/accounts/account-settings.tsx`
composes navigation, content and form levels. No route selector changes these
component roles.

## Scroll edges

A fixed region shows an edge only while content is hidden below or above it.
At the start there is no upper edge. At the end there is no lower edge. The
edge is a divider and a soft shadow toward the scroll area. The edge does not
change layout or take pointer input.

`packages/ui/src/scroll-region.tsx` observes sentinels at both ends of each
scroll region. Its state drives the adjacent fixed header and footer.
`--ui-scroll-shadow-color`, `--ui-scroll-shadow-down` and
`--ui-scroll-shadow-up` in
`apps/web/src/tailwind.css` select the shadow for the active appearance,
including custom themes. The shared edge style uses the border token and a
short opacity fade. Reduced motion removes the fade.

`tests/browser/settings-symmetry.ts` checks Settings component edges and text
roles. `tests/browser/scroll-edges.ts` checks the start, middle and end states
of the sidebar and Settings scroll regions. Both checks read review data
without a save.
