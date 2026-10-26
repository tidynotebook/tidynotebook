# UI redesign proposal: screen and flow map

Status: prototype wireframes for owner approval. No app code changes.
Wireframes: [index.html](index.html). Open it in a browser. No server is needed.
Scope: UI shipped between v0.21.0 and v0.22.0 (source b430eb97).

## Shipped problems this fixes

| Shipped (v0.22.0)                                             | Problem                                               | Proposal                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| "28 notes. New notes go in this workspace root."              | Internal term, extra sentence                         | "28 notes" (A1)                                                                 |
| Sidebar "Create in: Personal workspace root"                  | Internal term, no action                              | Removed. The page title or the "Folder" row says where a note goes (A3, A4, B2) |
| "From template" ghost button                                  | Looks like a label                                    | Outlined "Use template" button, same height as "New note" (A1)                  |
| Tips card: heading, paragraph, 4 indented lines, 2 buttons    | Too long, wrong indent                                | One line, one tip, "Next" and Close (A1)                                        |
| "Open today's note" inside tips                               | Hidden when tips close                                | Fixed "Today's note" row in the menu (A3)                                       |
| Template dialog: chips, "Create in: workspace root" paragraph | Weak choice, internal term                            | Row list, then preview with "Folder: No folder [Change]" (B1, B2, B3)           |
| Settings: wrapping link groups plus every section on one page | Hard to tap, duplicate "Appearance" titles, long copy | List of rows, one page per topic, one helper line (C1 to C6)                    |
| Recovery: two long text blocks stacked                        | Hard to compare on a phone                            | Two tabs, changes marked, clear button names (D3, D4)                           |
| Search "Search in: X. Results include..." paragraph           | Long                                                  | One quiet line "In Personal" (E4)                                               |
| Long trial sentences                                          | Long                                                  | One strip "Trial: 12 days left [Upgrade]" (E5)                                  |

## Screens

| ID       | Screen                                               | Primary action                              | Other actions                                                                         |
| -------- | ---------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| A1       | All notes                                            | New note                                    | Use template, tip Next and Close                                                      |
| A2       | All notes, empty                                     | New note                                    | Use template                                                                          |
| A3       | Menu (phone drawer, desktop sidebar)                 | none                                        | Workspace switch, Today's note, Needs attention, Trash, folders, new folder, Settings |
| A4       | Folder page                                          | New note (in this folder)                   | Use template, "..." menu: new folder, rename, delete                                  |
| B1       | Choose a template                                    | none (tap a row)                            | Search, Manage                                                                        |
| B2       | Template preview                                     | Create note                                 | Change folder, Back                                                                   |
| B3       | Save in (folder picker)                              | none                                        | Done                                                                                  |
| B4       | No templates                                         | Create a template                           | Close                                                                                 |
| B5       | Preview failed                                       | Create note (off)                           | Try again                                                                             |
| C1       | Settings list                                        | none                                        | Rows open C2 to C6, Sign out                                                          |
| C2       | Appearance                                           | none                                        | Mode, theme, Import theme file                                                        |
| C3       | Offline                                              | none                                        | Images, Older versions switches                                                       |
| C4       | Devices                                              | none                                        | Sign out per device, Sign out all other devices                                       |
| C5       | Profile and email                                    | none                                        | Save name, Delete account                                                             |
| C6       | Templates                                            | none                                        | Change folder, New template                                                           |
| D1       | Editor                                               | none (writing)                              | Status pill, Undo, Redo, format bar                                                   |
| D2       | Status details                                       | none                                        | Version history                                                                       |
| D3       | Recover a draft                                      | Keep this device's text                     | Use saved version                                                                     |
| D4       | Recovery failed                                      | Keep this device's text                     | Use saved version                                                                     |
| D5       | Image viewer                                         | none                                        | Zoom, Remove, Undo toast                                                              |
| E1       | Save status copy table                               | n/a                                         | n/a                                                                                   |
| E2       | Note in Trash                                        | Restore note                                | All notes                                                                             |
| E3       | Deleted for good, not found, unavailable             | Open Needs attention (only with local text) | All notes, Try again                                                                  |
| E4       | Search                                               | none                                        | Results, New note action                                                              |
| E5       | Trial strip and create errors                        | n/a                                         | Upgrade, Try again                                                                    |
| E6       | Email verified                                       | Continue                                    | Get a new link, Sign in                                                               |
| F1 to F4 | Dark versions of A1, B2, C1, D3                      | same                                        | same                                                                                  |
| G1 to G4 | Desktop All notes, template dialog, Settings, editor | same                                        | same                                                                                  |

## Flows

1. New blank note: A1 or A4, New note, editor D1. Location: no folder from A1, the folder from A4.
2. New note from template: A1 or A4, Use template, B1, row, B2, optional Change to B3, Create note, D1.
3. No templates: B1 shows B4. Create a template makes a note in the template folder and opens it.
4. Template text not on device: B2 shows B5. Create note stays off until the text loads.
5. Today's note: menu A3, Today's note, editor. The calendar opens from the same row.
6. Tips: A1 tip line. Next rotates. Close hides tips for this account and workspace (same stored key as now).
7. Settings on phone: avatar or menu, C1, row, detail page, Back to C1. On desktop: G3, both at once. Each page has its own address.
8. Save status: D1 pill, tap, D2. Copy for all states is in E1.
9. Draft recovery: open note with an older local draft, D3. Choose. On failure D4. Editing stays blocked until a choice. The other text goes to Needs attention, as now.
10. Image remove: D5 Remove, toast with Undo. The file stays in the account.
11. Note states: Trash E2 with Restore. Deleted for good E3 links to Needs attention when local text exists.

## Copy rules used

- Sentence case. Short sentences. No paragraphs in the app.
- Familiar words: "No folder", "Devices", "Offline", "Use template", "Two versions of this note".
- No internal terms: no "workspace root", "checkpoint", "draft sequence", "server version".
- Workspace scope uses the workspace name, in one quiet line, only where it matters (C6, E4).
- Buttons say what happens: "Keep this device's text", "Use saved version", "Restore note".

## Layout rules used

- One filled button per screen. Other buttons are outlined with a visible edge. Text-only buttons only for Cancel and Next.
- Touch targets 44 px or more (rows 48 px). Format bar targets 40 px with 44 px spacing.
- Bottom sheets on phone, centred dialogs on desktop.
- Visible keyboard focus ring on rows and buttons (F1).
- Light and dark use the current Default theme tokens. No new colour tokens.

## Behaviour that stays the same

- Creation queue, free note names, draft storage and recovery rules.
- Template text loads before Create note turns on.
- Billing and Connected apps rows show only when the server supports them.
- Delete account keeps its confirm dialog. Sign out all other devices gets a confirm step.

## Compatibility effects if approved

- Settings gets one address per page. Old `#section` links to Settings must redirect to the matching page.
- Tips keep the current stored dismiss key, so a closed tips line stays closed.
- No change to stored data, API contract, configuration or image commands.

## Open questions for the owner

1. Settings groups: merge Export and Import, API keys and Connected apps, Profile and Account, as shown in C1?
2. Delete account inside "Profile and email" (C5), not on the main Settings list?
3. "Use template" as the button name, or keep "From template"?
4. In draft recovery, filled button on "Keep this device's text" (safe default), as shown?
