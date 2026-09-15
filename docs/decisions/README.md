# Architecture decision records

Each record states one architectural choice, why it was made, and what it
costs. A record is short and it does not change after it is accepted. When a
later choice replaces an earlier one, add a new record and set the status of
the old one to `Superseded by NNNN`.

## The rule

**A new architectural choice gets a record before the code.** A change that
moves a boundary, adds or removes a package, changes the save model, adds a
second parser or renderer, changes the contract emit rules, changes the
database migration policy, or changes what the verification gate proves, is
architectural. Write the record, then write the code, and name the record in
the commit body.

A change inside one package that keeps every boundary is not architectural
and needs no record.

## How to add one

1. Copy [0000-template.md](0000-template.md) to `NNNN-short-title.md` with
   the next free number.
2. Fill in Context, Decision, and Consequences. Keep the file under 40 lines,
   or under 60 when the record states a structure that a reader has to follow.
3. Set `Status: Accepted` and the date.
4. Add the row to the index below.

## Index

| Record                                                         | Decision                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| [0001](0001-one-markdown-grammar.md)                           | One Markdown grammar                                      |
| [0002](0002-widgets-only-where-text-cannot-express.md)         | Widgets only where text cannot express the result         |
| [0003](0003-read-mode-uses-the-shared-renderer.md)             | Read mode is the second consumer of the renderer          |
| [0004](0004-standard-links-between-notes.md)                   | Standard links between notes, no wiki syntax in v0.1      |
| [0005](0005-workspace-is-an-implicit-container.md)             | Workspace becomes an implicit container                   |
| [0006](0006-trash-replaces-purge.md)                           | Trash replaces the purge screen                           |
| [0007](0007-keep-the-save-model.md)                            | Keep the save model and close its gaps                    |
| [0008](0008-remove-the-remote-integration-surface.md)          | Remove the remote integration surface for v0.1            |
| [0009](0009-export-first-import-later.md)                      | Export first, import later                                |
| [0010](0010-one-command-palette.md)                            | One command palette                                       |
| [0011](0011-contract-emit-and-one-migration.md)                | Shared contract definitions and one initial migration     |
| [0012](0012-package-layout-stays-for-v0-1.md)                  | The package layout stays for v0.1                         |
| [0013](0013-delivery-and-headers-belong-to-the-app.md)         | Delivery and headers belong to the application            |
| [0014](0014-browser-tests-are-the-interface-gate.md)           | Browser tests are the interface gate                      |
| [0015](0015-the-note-surface-is-the-design.md)                 | The note surface is the design                            |
| [0016](0016-themes-are-data-in-one-registry.md)                | A theme is data in one registry                           |
| [0017](0017-save-feedback-on-the-save-button.md)               | Save feedback lives on the Save button                    |
| [0018](0018-directory-structure-by-layer.md)                   | The directory structure follows ports and adapters        |
| [0019](0019-contract-validation-and-shared-types.md)           | One contract, generated types, and no type assertions     |
| [0020](0020-central-logging-through-one-module.md)             | Central logging through one module                        |
| [0021](0021-portable-markdown-at-rest.md)                      | Portable Markdown at rest                                 |
| [0022](0022-autosave-and-automatic-versions.md)                | Autosave and automatic versions                           |
| [0023](0023-one-auto-expiring-trash.md)                        | One auto-expiring Trash                                   |
| [0024](0024-remove-conflict-and-recovery-surfaces.md)          | Remove the conflict and recovery surfaces                 |
| [0025](0025-the-live-preview-is-the-one-note-surface.md)       | The live preview is the one note surface                  |
| [0026](0026-slim-the-save-and-delete-surfaces.md)              | Slim the save and delete surfaces, do not remove them     |
| [0027](0027-track-work-on-the-github-board.md)                 | Track work on the GitHub board                            |
| [0028](0028-command-palette-uses-p.md)                         | The command palette uses P                                |
| [0029](0029-selected-folder-is-the-create-parent.md)           | The selected folder is the create parent                  |
| [0030](0030-published-links-are-hashed-tokens-over-a-scope.md) | A published link is a hashed token over a read-only scope |
| [0031](0031-the-reader-path-is-a-closed-read-only-boundary.md) | The reader path is a closed read-only boundary            |
| [0032](0032-whole-file-actions-are-store-operations.md)        | A move and a deletion are each one store operation        |
| [0033](0033-a-task-box-is-a-control-not-a-marker.md)           | A task box is a control, not a marker                     |
| [0034](0034-the-open-note-selects-its-folder.md)               | The open note selects its folder                          |
| [0035](0035-the-sidebar-width-belongs-to-the-person.md)        | The sidebar width belongs to the person                   |

Records 0001 to 0015 record the decisions D1 to D15 of
[the v0.1 revamp plan](../plans/003-v0.1-revamp.md). Record 0016 records the
theme registry described in [Themes](../development/themes.md). Record 0017
records how the save state reaches the person. Records 0018 and 0019 record the
target structure and the type rules that the
[architecture review](../audits/2026-09-11/architecture-review.md) asked for.
Record 0020 records the one way to write a log record, and it follows
[design 003](../design/003-central-logging.md). Record 0021 records the
portable form of the stored note text, and it follows
[design 004](../design/004-portable-markdown-at-rest.md). Records 0022 to 0024
and 0026 record [design 005](../design/005-streamline-save-and-delete.md), the
streamlined save and delete workflow. Record 0022 supersedes 0007 and 0017, and
record 0023 supersedes 0006. Record 0026 keeps the safety net and slims the save
and delete surfaces instead of removing them, and it supersedes records 0023 and 0024. Record 0025 makes the live preview the one note surface and supersedes
record 0003, and it follows
[design 006](../design/006-the-one-markdown-surface.md). Record 0027 moves the
work list to the GitHub board and removes `docs/releases/`, and it is described
in [work tracking](../development/tracking.md). Record 0028 replaces the
shortcut choice of record 0010, so the link command and the command palette
have separate keys. Record 0029 makes the temporary selected folder the parent
for each create action, and it follows
[design 007](../design/007-nested-folder-creation.md). Records 0030 and 0031
open the first path that serves a person with no account, and they follow
[design 008](../design/008-published-read-only-links.md). Record 0030 states
what a published link is: an opaque token that is hashed at rest, a scope of one
note or one folder, an optional password through the hasher of the account path,
an optional expiry, and immediate revocation. Record 0031 states how the server
serves that link without an actor, and it gives the sanitized renderer that
record 0025 kept its first production reader. Record 0032 makes a move and a
deletion each one operation of the local store, because the path and the
deletion state of a note live on every working copy of that note and an action
that wrote only one of them was reverted by the next save of any other.
Records 0033 to 0035 answer the client report of 2026-09-15. Record 0033 makes
a task box the one construct that keeps its control under the caret, so a
person can tick an item on the line they are writing. Record 0034 makes the
open note select its folder and stops a background read of the note list from
moving that selection, so a create action lands where the person is reading,
and it refines record 0029. Record 0035 gives the sidebar four named widths and
a collapsed state that belong to the person.
