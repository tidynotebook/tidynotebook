# UI redesign proposal: coverage map and approval checklist

Status: APPROVED by the owner on 2026-10-27: "Wireframes approved but ensure the issues are fixed for desktop as well." The approved structure, flows and icon-only Undo and Redo are frozen. Every fix applies on phone and on desktop at medium (1024 px) and wide widths.
Scope: user-facing UI shipped between v0.21.0 and v0.22.0 (source b430eb97).

## Files

Open any page from disk. No server or network is needed. Each page has a
switch that shows every frame in dark mode.

| Page                                   | Content                                                              | Screens |
| -------------------------------------- | -------------------------------------------------------------------- | ------- |
| [index.html](index.html)               | What changes, design foundations, coverage, new behaviour, checklist | system  |
| [01-notes.html](01-notes.html)         | All notes, tips, menu, account menu, calendar, folders               | 14      |
| [02-templates.html](02-templates.html) | Use template: pick, preview, folder, create, all states              | 17      |
| [03-editor.html](03-editor.html)       | Undo and Redo icons, save status, history, choose a version, images  | 21      |
| [04-settings.html](04-settings.html)   | Settings list, every page, confirmations                             | 24      |
| [05-states.html](05-states.html)       | Note states, Needs attention, search, trial, sign up, limits         | 22      |
| [06-desktop.html](06-desktop.html)     | Desktop: all notes, folders, calendar, menus, settings, medium width | 17      |

`_src/` holds the generator (`python3 -I _src/build.py`). It writes the pages
above from one shared CSS kit and icon set, so all screens stay consistent.

## Coverage map

| Shipped UI change                              | Screens                      |
| ---------------------------------------------- | ---------------------------- |
| All notes header, New note, tips, today's note | A1 to A5, A13, G1, G2        |
| Sidebar Create in, From template, save line    | A6, A9 to A12, A14, E1, G1   |
| New folder text                                | A11                          |
| New from template and its errors               | B1 to B17, G3                |
| Search scope and pending state                 | E10 to E13, G8               |
| Undo and Redo                                  | D1 to D3, Undo spec, D21, G4 |
| Remove image                                   | D17 to D20                   |
| Pending save and save status                   | D4 to D7, E1, A6             |
| Recover local draft                            | D11 to D16, G7               |
| Purged, deleted, restored, unavailable notes   | E2 to E7                     |
| Kept text (Needs attention)                    | E8, E9                       |
| Version history copy                           | D8 to D10, G9                |
| Settings groups and sections                   | C1 to C24, G5, G6            |
| Offline settings                               | C8, C14, C15, C24            |
| Trial notice                                   | E14 to E16, C11              |
| Sign-up verification, sign-in email            | E18 to E22                   |
| Account limits in GiB                          | E23                          |

## Not drawn

- Tablet widths (768 to 1023 px): phone layout with a wider column.
- Move note dialog: reuses the folder picker B4.
- Trash list, Publish dialog, workspace dialogs, shortcuts dialog, rest of administration, documentation site, published pages: not changed in v0.22.0.
- Plain sign-in screen: E20 without the verified mark.

## New behaviour to confirm

1. Tips have no Next button. A different tip shows each time All notes opens.
2. Spelling is a switch in the Settings list, with no page of its own.
3. Settings merges: Export with Import, API keys with Connected apps, Profile with Account. Delete account moves into Profile and email. Sessions becomes Devices.
4. The avatar opens an account menu: Settings, Help, Sign out.
5. Image removal shows a short message with Undo for `6 seconds`. Editor Undo stays.
6. The save details sheet shows the last upload time and waiting count only if the app can read them.
7. Search with no results offers a new note with the search words as its name.

## Approval checklist

1. Look and feel: type, colour, spacing, icons and components (index.html).
2. Button rules: one filled button per screen, outlined secondary buttons with icons, text buttons only for Cancel and Discard, red only for delete.
3. All notes: count only, New note and Use template side by side, no "workspace root" (A1 to A5, G1).
4. Tips: one line, 6 words or less, one tip per visit, Close only (A1).
5. Menu: Today's note and Calendar rows, folders with +, short save line (A6, A8, G1).
6. Where notes go: folder page title, "Folder: None [Change]", "Inside: Projects" (A9, A11, B3, B4).
7. Template flow on phone and desktop, with all states (B1 to B17, G3).
8. Undo and Redo are arrow icons with no visible text, accessible names, desktop tooltips with shortcuts, a dimmed disabled state and 44 px phone targets (D1 to D3, Undo spec, D21, G4).
9. Save status: one pill and the words for each state (E1, D6, D7).
10. Choose a version: tabs on phone, columns on desktop, "Keep this device's text" filled (D11 to D16, G7).
11. Image: "Remove from note", then a short message with Undo (D17 to D20).
12. Settings: 9 rows and 1 switch, one page each, merges and renames (C1 to C24, G5, G6).
13. Sign out with waiting changes: "Sign out and keep them" filled (C21).
14. States and account copy (E2 to E23).
15. Dark mode matches light everywhere.
16. The new behaviour list is acceptable.
17. The screens that are not drawn can wait.

## Decisions

No decision records were added for this design.
