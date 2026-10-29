# Spacing standard

This page owns the spacing rules for repository surfaces and the approved sidebar roles.

## General rules

Use the shared spacing grid. Keep each spacing value in a named role token in
`packages/ui/src/spacing.css`. Do not copy values into a surface component.

The parent owns the space. A container sets its padding and the gaps between
its children. Children do not add outer margins. This prevents duplicate space.

Keep top and bottom padding equal. Keep left and right padding equal.
Containers use the same padding on all sides. Measure the visible content,
not an invisible pointer target, when you check these edges.

Let content set row height. Add equal vertical padding around the line box.
A wrapped name adds a line. Do not use a minimum height to add blank space.

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

The panel has equal padding on all sides. Its parent layout separates the
header, workspace switcher, actions, tree and status. The tree owns the gaps
between rows. All rows have equal horizontal padding. Their disclosure,
icon, name and menu slots share one anatomy. A menu glyph stays on the right
padding line. Its target extends into the padding. Phone row menus stay
visible. Fine pointer row menus appear on hover and keyboard focus.

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
