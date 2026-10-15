# Architecture decision records

Each record states one architectural choice, why it was made, and what it
costs. A record is short and it does not change after it is accepted. When a
later choice replaces an earlier one, add a new record and set the status of
the old one to `Superseded by NNNN`.

## When a record helps

A record can preserve the reason for a lasting architectural choice.
It is optional. The code states the current behavior, and `AGENTS.md` states
the development process. Old process records remain as history.

## How to add one

1. Copy [0000-template.md](0000-template.md) to `NNNN-short-title.md` with
   the next free number.
2. Fill in Context, Decision, and Consequences. Keep the file under 40 lines,
   or under 60 when the record states a structure that a reader has to follow.
3. Set `Status: Accepted` and the date.
4. Add the row to the index table below, in number order and with no blank
   line before it. `tools/check-docs.mjs` refuses a record with no row and
   two records with one number.

## Index

| Record                                                                                | Decision                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [0001](0001-one-markdown-grammar.md)                                                  | One Markdown grammar                                                            |
| [0002](0002-widgets-only-where-text-cannot-express.md)                                | Widgets only where text cannot express the result                               |
| [0003](0003-read-mode-uses-the-shared-renderer.md)                                    | Read mode is the second consumer of the renderer                                |
| [0004](0004-standard-links-between-notes.md)                                          | Standard links between notes, no wiki syntax in v0.1                            |
| [0005](0005-workspace-is-an-implicit-container.md)                                    | Workspace becomes an implicit container (superseded)                            |
| [0006](0006-trash-replaces-purge.md)                                                  | Trash replaces the purge screen                                                 |
| [0007](0007-keep-the-save-model.md)                                                   | Keep the save model and close its gaps                                          |
| [0008](0008-remove-the-remote-integration-surface.md)                                 | Remove the remote integration surface for v0.1                                  |
| [0009](0009-export-first-import-later.md)                                             | Export first, import later                                                      |
| [0010](0010-one-command-palette.md)                                                   | One command palette                                                             |
| [0011](0011-contract-emit-and-one-migration.md)                                       | Shared contract definitions and one initial migration                           |
| [0012](0012-package-layout-stays-for-v0-1.md)                                         | The package layout stays for v0.1                                               |
| [0013](0013-delivery-and-headers-belong-to-the-app.md)                                | Delivery and headers belong to the application                                  |
| [0014](0014-browser-tests-are-the-interface-gate.md)                                  | Browser tests are the interface gate                                            |
| [0015](0015-the-note-surface-is-the-design.md)                                        | The note surface is the design                                                  |
| [0016](0016-themes-are-data-in-one-registry.md)                                       | A theme is data in one registry                                                 |
| [0017](0017-save-feedback-on-the-save-button.md)                                      | Save feedback lives on the Save button                                          |
| [0018](0018-directory-structure-by-layer.md)                                          | The directory structure follows ports and adapters                              |
| [0019](0019-contract-validation-and-shared-types.md)                                  | One contract, generated types, and no type assertions                           |
| [0020](0020-central-logging-through-one-module.md)                                    | Central logging through one module                                              |
| [0021](0021-portable-markdown-at-rest.md)                                             | Portable Markdown at rest                                                       |
| [0022](0022-autosave-and-automatic-versions.md)                                       | Autosave and automatic versions                                                 |
| [0023](0023-one-auto-expiring-trash.md)                                               | One auto-expiring Trash                                                         |
| [0024](0024-remove-conflict-and-recovery-surfaces.md)                                 | Remove the conflict and recovery surfaces                                       |
| [0025](0025-the-live-preview-is-the-one-note-surface.md)                              | The live preview is the one note surface                                        |
| [0026](0026-slim-the-save-and-delete-surfaces.md)                                     | Slim the save and delete surfaces, do not remove them                           |
| [0027](0027-track-work-on-the-github-board.md)                                        | Track work on the GitHub board                                                  |
| [0028](0028-command-palette-uses-p.md)                                                | The command palette uses P                                                      |
| [0029](0029-selected-folder-is-the-create-parent.md)                                  | The selected folder is the create parent                                        |
| [0030](0030-published-links-are-hashed-tokens-over-a-scope.md)                        | A published link is a hashed token over a read-only scope                       |
| [0031](0031-the-reader-path-is-a-closed-read-only-boundary.md)                        | The reader path is a closed read-only boundary                                  |
| [0032](0032-whole-file-actions-are-store-operations.md)                               | A move and a deletion are each one store operation                              |
| [0033](0033-a-task-box-is-a-control-not-a-marker.md)                                  | A task box is a control, not a marker                                           |
| [0034](0034-the-open-note-selects-its-folder.md)                                      | The open note selects its folder                                                |
| [0035](0035-the-sidebar-width-belongs-to-the-person.md)                               | The sidebar width belongs to the person                                         |
| [0036](0036-the-browser-gate-runs-in-parallel-workers.md)                             | The browser gate runs in parallel workers                                       |
| [0037](0037-backlinks-are-derived-on-the-device.md)                                   | Backlinks are derived on the device and merged                                  |
| [0038](0038-an-empty-state-is-not-a-failed-read.md)                                   | An empty state is not a failed read                                             |
| [0039](0039-one-list-of-served-origins.md)                                            | One list of served origins                                                      |
| [0040](0040-a-probe-address-is-a-contract-operation.md)                               | A probe address is a contract operation                                         |
| [0041](0041-readiness-reads-the-served-pool.md)                                       | Readiness reads the pool that the deployment serves from                        |
| [0042](0042-the-listening-socket-is-not-the-public-origin.md)                         | The listening socket is not the public origin                                   |
| [0043](0043-one-decider-of-the-client-address.md)                                     | One decider of the client address                                               |
| [0044](0044-the-worker-stays-out-of-the-first-load.md)                                | The worker stays out of the first load                                          |
| [0045](0045-the-build-names-the-precache.md)                                          | The build names the precache and its cache                                      |
| [0046](0046-the-reader-carries-its-credentials-in-the-address.md)                     | The reader carries its credentials in the address                               |
| [0047](0047-the-published-page-always-answers-a-page.md)                              | The published page always answers a page                                        |
| [0048](0048-publish-is-a-command-and-the-links-are-a-list.md)                         | Publish is a command and the links are one workspace list                       |
| [0049](0049-a-workspace-is-an-explicit-container.md)                                  | A workspace is an explicit container that a person chooses                      |
| [0050](0050-every-workspace-with-queued-work-keeps-syncing.md)                        | Every workspace with queued work keeps syncing                                  |
| [0051](0051-an-account-always-keeps-one-workspace.md)                                 | An account always keeps one workspace                                           |
| [0052](0052-three-planes-and-one-elevation-scale.md)                                  | Three planes and one elevation scale                                            |
| [0053](0053-the-divider-is-derived-from-the-palette.md)                               | The divider is derived from the palette                                         |
| [0054](0054-motion-is-a-named-scale-in-one-module.md)                                 | Motion is a named scale in one module                                           |
| [0055](0055-the-note-is-one-centred-column.md)                                        | The note is one centred column                                                  |
| [0056](0056-the-default-theme-has-no-opinion.md)                                      | The default theme has no opinion                                                |
| [0057](0057-a-control-fill-states-its-hover-in-the-palette.md)                        | A control fill states its hover in the palette                                  |
| [0058](0058-an-overlay-is-placed-on-the-screen.md)                                    | An overlay is placed on the screen                                              |
| [0059](0059-a-guide-caps-its-rules.md)                                                | A directory guide caps its rules and not its index                              |
| [0060](0060-the-published-page-takes-every-style.md)                                  | The published page takes every emitted style                                    |
| [0061](0061-the-application-is-set-in-one-vendored-family.md)                         | The application is set in one vendored family                                   |
| [0062](0062-the-default-action-is-ink-and-the-blue-carries-meaning.md)                | The default action is ink and the blue carries meaning                          |
| [0063](0063-the-resting-edge-of-a-control-is-the-divider.md)                          | The resting edge of a control is the divider                                    |
| [0064](0064-the-frame-header-is-the-context-of-the-route.md)                          | The frame header is the context of the route                                    |
| [0065](0065-one-recipe-for-a-control-and-one-grid-for-an-icon.md)                     | One recipe for a control and one grid for an icon                               |
| [0066](0066-the-browser-suite-is-retired.md)                                          | The browser suite is retired                                                    |
| [0067](0067-an-external-picture-loads-by-itself.md)                                   | An external picture loads by itself                                             |
| [0068](0068-a-soft-line-break-joins-its-paragraph.md)                                 | A soft line break joins its paragraph in the preview (superseded by 0107)       |
| [0069](0069-the-note-name-is-the-last-part-of-the-breadcrumb.md)                      | The note name is the last part of the breadcrumb                                |
| [0070](0070-shift-and-enter-writes-a-hard-break.md)                                   | Shift and Enter writes a hard break (superseded by 0107)                        |
| [0071](0071-the-page-states-its-appearance-to-the-browser.md)                         | The page states its appearance to the browser                                   |
| [0072](0072-the-scrollbar-takes-the-edge-of-the-palette.md)                           | The scrollbar takes the edge of the palette                                     |
| [0073](0073-a-save-names-the-revision-it-descends-from.md)                            | A save names the revision it descends from                                      |
| [0074](0074-the-build-names-every-cached-asset.md)                                    | The build names every asset that a browser may pin                              |
| [0075](0075-a-link-opens-on-a-plain-click.md)                                         | A link opens on a plain click                                                   |
| [0076](0076-the-text-of-a-note-is-a-crdt-document.md)                                 | The text of a note is a CRDT document inside its revisions (superseded by 0081) |
| [0077](0077-yjs-behind-one-package.md)                                                | Yjs behind one package (superseded by 0082)                                     |
| [0078](0078-one-rule-for-each-conflict-that-is-not-text.md)                           | One rule for each conflict that is not text (superseded by 0083)                |
| [0079](0079-review-is-the-one-surface-of-a-merge.md)                                  | Review is the one surface of a merge (superseded by 0087)                       |
| [0080](0080-a-document-starts-once.md)                                                | A document starts once (superseded by 0084)                                     |
| [0081](0081-accepted-text-and-observed-state-belong-to-one-document.md)               | Accepted text and observed state belong to one document                         |
| [0082](0082-yjs-has-a-byte-api-and-a-private-editor-bridge.md)                        | Yjs has a byte API and a private editor bridge                                  |
| [0083](0083-metadata-conflicts-preserve-unseen-text-work.md)                          | Metadata conflicts preserve unseen text work                                    |
| [0084](0084-compaction-keeps-identities-and-recovery-keeps-original-work.md)          | Compaction keeps identities and recovery keeps original work                    |
| [0085](0085-local-document-writes-merge-and-receipts-do-not-advance-reads.md)         | Local document writes merge and receipts do not advance reads                   |
| [0086](0086-protocol-upgrades-precede-the-breaking-sync-format.md)                    | Protocol upgrades precede the breaking sync format                              |
| [0087](0087-review-keeps-the-checkpoint-that-caused-it.md)                            | Review keeps the checkpoint that caused it                                      |
| [0088](0088-an-earlier-browser-store-upgrades-through-placement.md)                   | An earlier browser store upgrades through placement                             |
| [0089](0089-an-ordered-item-shows-its-place-and-keeps-its-number.md)                  | An ordered item shows its place and keeps its number                            |
| [0090](0090-every-connection-pool-comes-from-one-factory.md)                          | Every connection pool comes from one factory                                    |
| [0091](0091-every-signed-in-page-opens-in-the-workspace-frame.md)                     | Every signed in page opens in the workspace frame                               |
| [0092](0092-an-ordered-marker-keeps-its-preview-while-editing.md)                     | An ordered marker keeps its preview while editing                               |
| [0093](0093-the-tree-actions-are-one-row-of-icons.md)                                 | The tree actions are one row of icons                                           |
| [0094](0094-the-note-has-one-row-of-formatting-tools.md)                              | The note has one row of formatting tools                                        |
| [0095](0095-a-table-is-a-grid-over-its-text.md)                                       | A table is a grid over its text                                                 |
| [0096](0096-an-edit-keeps-the-structure-of-a-table.md)                                | An edit keeps the structure of a table                                          |
| [0097](0097-a-row-and-a-column-carry-a-menu.md)                                       | A row and a column carry a menu, and a paste fills cells                        |
| [0098](0098-a-handle-moves-its-row-or-column.md)                                      | A handle stands outside the table and moves its row or column                   |
| [0099](0099-a-daily-note-is-a-dated-note-and-its-settings-belong-to-the-member.md)    | A daily note is a dated note and its settings belong to the member              |
| [0100](0100-the-calendar-is-a-section-of-the-sidebar.md)                              | The calendar is a section of the sidebar                                        |
| [0101](0101-a-daily-note-takes-its-path-from-a-folder-and-a-name-format.md)           | A daily note takes its path from a folder and a name format                     |
| [0102](0102-a-template-fills-its-placeholders-once.md)                                | A template fills its placeholders once                                          |
| [0103](0103-the-browser-checks-the-spelling-of-a-note.md)                             | The browser checks the spelling of a note                                       |
| [0104](0104-a-new-note-is-a-version-when-it-is-made.md)                               | A new note is a version when it is made                                         |
| [0105](0105-the-sidebar-shows-one-view-at-a-time.md)                                  | The sidebar shows one view at a time                                            |
| [0106](0106-a-handle-moves-a-list-item.md)                                            | A handle moves a list item                                                      |
| [0107](0107-a-new-line-is-a-line-break.md)                                            | A new line is a line break                                                      |
| [0108](0108-an-account-comes-in-through-one-registration-path.md)                     | An account comes in through one registration path                               |
| [0109](0109-the-installation-role-grants-no-workspace-access.md)                      | The installation role grants no workspace access                                |
| [0110](0110-an-installation-keeps-one-enabled-administrator.md)                       | An installation keeps one enabled administrator                                 |
| [0111](0111-a-removed-account-leaves-a-tombstone.md)                                  | A removed account leaves a tombstone                                            |
| [0112](0112-the-owner-account-holds-the-storage-quota.md)                             | The owner account holds the storage quota                                       |
| [0113](0113-a-browser-serves-the-account-of-its-session.md)                           | A browser serves the account of its session                                     |
| [0114](0114-open-registration-verifies-the-address-before-the-first-session.md)       | Open registration verifies the address before the first session                 |
| [0115](0115-a-sign-up-pays-a-proof-of-work-that-this-server-issues.md)                | A sign-up pays a proof of work that this server issues                          |
| [0116](0116-one-password-policy-follows-nist-800-63b-revision-4.md)                   | One password policy follows NIST SP 800-63B revision 4                          |
| [0117](0117-a-person-manages-their-own-sessions.md)                                   | A person manages their own sessions                                             |
| [0118](0118-a-published-page-of-a-public-installation-has-its-own-origin.md)          | A published page of a public installation has its own origin                    |
| [0119](0119-a-report-reaches-an-administrator-who-can-take-a-link-down.md)            | A report reaches an administrator who can take a link down                      |
| [0120](0120-an-account-records-the-legal-documents-it-accepted.md)                    | An account records the legal documents it accepted                              |
| [0121](0121-every-limit-and-every-job-holds-across-server-processes.md)               | Every limit and every job holds across server processes                         |
| [0122](0122-a-session-is-revoked-by-its-identifier.md)                                | A session is revoked by its identifier                                          |
| [0123](0123-a-report-seals-the-address-of-its-link.md)                                | A report seals the address of its link                                          |
| [0124](0124-websockets-wake-the-durable-sync-engine.md)                               | WebSockets wake the durable sync engine                                         |
| [0125](0125-postgresql-notifies-the-sync-gateways.md)                                 | PostgreSQL notifies the sync gateways                                           |
| [0126](0126-websocket-messages-use-the-generated-contract.md)                         | WebSocket messages use the generated contract                                   |
| [0127](0127-a-sync-page-holds-whole-commits.md)                                       | A sync page holds whole commits                                                 |
| [0128](0128-the-server-validates-every-notice-frame.md)                               | The server validates every notice frame                                         |
| [0129](0129-the-notice-gateway-and-its-bounds.md)                                     | The notice gateway and its bounds                                               |
| [0130](0130-one-notice-coordinator-per-account-tab.md)                                | One notice coordinator per account in the lease tab                             |
| [0131](0131-the-notice-stream-always-runs.md)                                         | The notice stream always runs                                                   |
| [0132](0132-a-list-marker-holds-no-caret.md)                                          | A list marker holds no caret                                                    |
| [0133](0133-an-open-note-saves-the-text-of-its-document.md)                           | An open note saves the text of its document                                     |
| [0134](0134-a-task-box-keeps-one-state-through-a-merge.md)                            | A task box keeps one state through a merge                                      |
| [0135](0135-an-identity-is-keyed-by-its-provider-and-its-account.md)                  | An identity is keyed by its provider and its account                            |
| [0136](0136-the-initial-javascript-budget-follows-the-inequality-gap.md)              | The initial JavaScript budget follows the inequality gap                        |
| [0137](0137-every-page-shares-the-note-column-and-its-side-region.md)                 | Every page shares the note column and its side region                           |
| [0138](0138-a-page-names-the-page-above-it-and-accounts-belong-to-settings.md)        | A page names the page above it, and Accounts belong to Settings                 |
| [0139](0139-the-breadcrumb-names-the-way-to-a-page-and-the-heading-names-the-page.md) | The breadcrumb names the way to a page, and the heading names the page          |
| [0140](0140-the-installation-serves-the-legal-documents-that-its-operator-writes.md)  | The installation serves the legal documents that its operator writes            |
| [0141](0141-a-person-resets-a-password-in-the-application.md)                         | A person resets a password in the application                                   |
| [0142](0142-a-published-formula-keeps-its-layout-in-style-attributes.md)              | A published formula keeps its layout in style attributes                        |
| [0143](0143-a-person-imports-a-theme-that-the-account-keeps.md)                       | A person imports a theme that the account keeps                                 |
| [0144](0144-the-store-sends-its-feed-hints-after-its-commit.md)                       | The store sends its feed hints after its commit                                 |
| [0145](0145-a-click-on-a-picture-opens-the-image-viewer.md)                           | A click on a picture opens the image viewer                                     |
| [0146](0146-a-closed-link-page-says-what-to-do-next.md)                               | A closed link page says what to do next                                         |
| [0147](0147-a-table-sizes-to-its-text-and-its-controls-sit-on-its-edge.md)            | A table sizes to its text and its controls sit on its edge                      |
| [0148](0148-an-administrator-sets-the-mail-and-the-legal-documents.md)                | An administrator sets the mail and the legal documents                          |
| [0149](0149-one-template-engine-fills-a-note-at-the-caret.md)                         | One template engine fills a note at the caret                                   |
| [0150](0150-the-environment-names-the-mail-server-as-fields.md)                       | The environment names the mail server as fields                                 |
| [0151](0151-a-page-with-no-script-follows-the-device-palette.md)                      | A page with no script follows the device palette                                |
| [0152](0152-the-guide-is-a-static-site-of-its-own.md)                                 | The guide is a static site of its own                                           |
| [0153](0153-the-site-answers-search-and-agents-from-its-build.md)                     | The site answers search and agents from its build                               |
| [0154](0154-a-change-carries-its-test.md)                                             | A change carries its test                                                       |
| [0155](0155-the-editor-grammar-parses-the-same-in-slices.md)                          | The editor grammar parses the same in slices                                    |
| [0156](0156-the-editor-reads-gfm-footnotes.md)                                        | The editor reads GFM footnotes                                                  |
| [0157](0157-a-note-keeps-a-safe-set-of-html-elements.md)                              | A note keeps a safe set of HTML elements                                        |
| [0158](0158-a-published-diagram-draws-in-the-frame-of-the-editor.md)                  | A published diagram draws in the frame of the editor                            |
| [0159](0159-one-highlighter-colours-code-on-both-surfaces.md)                         | One highlighter colours code on both surfaces                                   |
| [0160](0160-an-unclosed-tag-never-takes-the-rest-of-a-note.md)                        | An unclosed tag never takes the rest of a note                                  |
| [0161](0161-a-render-failure-stops-at-the-nearest-route-boundary.md)                  | A render failure stops at the nearest route boundary                            |
| [0162](0162-a-search-excerpt-is-the-plain-text-of-its-markdown.md)                    | A search excerpt is the plain text of its Markdown                              |
| [0163](0163-a-new-note-takes-its-name-from-its-first-heading.md)                      | A new note takes its name from its first heading                                |
| [0164](0164-the-tree-is-one-list-of-rows-with-a-selection.md)                         | The tree is one list of rows with a selection                                   |
| [0165](0165-a-long-list-renders-a-window-of-its-rows.md)                              | A long list renders a window of its rows                                        |
| [0166](0166-history-shows-a-version-as-the-note-and-as-a-difference.md)               | History shows a version as the note and as a difference                         |
| [0167](0167-search-reads-the-words-of-any-language-as-a-reader-sees-them.md)          | Search reads the words of any language as a reader sees them                    |
| [0168](0168-a-note-read-carries-the-document-only-for-an-editor.md)                   | A note read carries the document only for an editor                             |
| [0169](0169-the-server-compresses-a-large-json-read.md)                               | The server compresses a large JSON read                                         |
| [0170](0170-an-archive-job-is-bounded-in-number-in-disk-and-in-time.md)               | An archive job is bounded in number, in disk and in time                        |
| [0171](0171-one-dollar-opens-math-by-the-rule-of-pandoc.md)                           | One dollar opens math by the rule of Pandoc                                     |
| [0172](0172-a-wiki-link-becomes-a-standard-link-at-the-border.md)                     | A wiki link becomes a standard link at the border                               |
| [0173](0173-a-fence-language-is-a-codemirror-language-of-the-one-list.md)             | A fence language is a CodeMirror language of the one list                       |
| [0174](0174-a-code-block-carries-its-language-and-a-copy-action.md)                   | A code block carries its language and a copy action                             |
| [0175](0175-a-key-changes-only-the-editor.md)                                         | A key changes only the editor                                                   |
| [0176](0176-a-save-waits-for-no-read.md)                                              | A save waits for no read                                                        |
| [0177](0177-the-first-screen-loads-no-editor.md)                                      | The first screen loads no editor                                                |
| [0178](0178-the-generator-writes-the-address-of-a-browser-download.md)                | The generator writes the address of a browser download                          |
| [0179](0179-an-open-note-follows-a-new-head-in-its-one-editor.md)                     | An open note follows a new head in its one editor                               |
| [0180](0180-a-start-that-fails-shows-the-application-error-screen.md)                 | A start that fails shows the application error screen                           |
| [0181](0181-the-work-of-an-open-editor-names-its-generation.md)                       | The work of an open editor names its generation                                 |
| [0182](0182-the-parse-of-a-note-grows-with-its-size.md)                               | The parse of a note grows with its size                                         |
| [0183](0183-a-save-never-builds-on-a-parked-save.md)                                  | A save never builds on a parked save                                            |
| [0184](0184-a-free-name-avoids-every-path-the-server-may-hold.md)                     | A free name avoids every path the server may hold                               |
| [0185](0185-a-step-of-the-grammar-that-grows-faster-than-the-note-is-patched.md)      | A step of the grammar that grows faster than the note is patched                |
| [0186](0186-the-open-core-holds-no-billing-and-a-private-service-sells-the-cloud.md)  | The open core holds no billing, and a private service sells the cloud           |
| [0187](0187-the-product-is-tidy-notebook-on-tidynotebook-com.md)                      | The product is Tidy Notebook on tidynotebook.com                                |
| [0188](0188-the-repository-opens-under-agpl-3-0-only.md)                              | The repository opens under AGPL-3.0-only                                        |
| [0189](0189-an-account-carries-limits-a-standing-and-feature-switches.md)             | An account carries limits, a standing and feature switches                      |
| [0190](0190-an-operator-api-reaches-the-account-controls.md)                          | An operator API reaches the account controls                                    |
| [0191](0191-a-published-page-of-the-cloud-lives-on-the-application-origin.md)         | A published page of the cloud lives on the application origin                   |
| [0192](0192-uploads-and-attachments-can-live-in-an-s3-compatible-store.md)            | Uploads and attachments can live in an S3 compatible store                      |
| [0193](0193-transfer-and-object-operations-have-a-limit.md)                           | Transfer and object operations have a limit                                     |
| [0194](0194-paddle-is-the-merchant-of-record.md)                                      | Paddle is the merchant of record                                                |
| [0195](0195-two-plans-standard-for-one-person-and-pro-for-a-team.md)                  | Two plans: Standard for one person and Pro for a team                           |
| [0196](0196-the-billing-service-mirrors-paddle-into-the-account-controls.md)          | The billing service mirrors Paddle into the account controls                    |
| [0197](0197-the-billing-pages-and-the-checkout-live-on-the-billing-service.md)        | The billing pages and the checkout live on the billing service                  |
| [0198](0198-the-landing-site-is-a-static-site-of-the-private-repository.md)           | The landing site is a static site of the private repository                     |
| [0199](0199-the-cloud-runs-on-railway-behind-cloudflare.md)                           | The cloud runs on Railway behind Cloudflare                                     |
| [0200](0200-every-cost-of-the-cloud-has-a-limit.md)                                   | Every cost of the cloud has a limit                                             |
| [0201](0201-a-locked-account-keeps-a-fixed-list-of-operations.md)                     | A locked account keeps a fixed list of operations                               |
| [0202](0202-the-image-takes-a-migrate-and-a-serve-command.md)                         | The image takes a migrate and a serve command                                   |
| [0203](0203-the-product-name-is-written-in-lowercase.md)                              | The product name is written in lowercase                                        |
| [0204](0204-the-release-gate-builds-the-image-before-the-tag.md)                      | The release gate builds the image before the tag                                |
| [0205](0205-the-cloud-infrastructure-is-code.md)                                      | The cloud infrastructure is code                                                |
| [0206](0206-the-environment-can-name-the-registration-policy.md)                      | The environment can name the registration policy                                |
| [0207](0207-every-secret-of-the-image-has-an-environment-form.md)                     | Every secret of the image has an environment form                               |
| [0208](0208-personal-keys-resolve-to-the-shared-actor.md)                             | Personal keys resolve to the shared actor                                       |
| [0209](0209-generated-api-reference.md)                                               | The API reference comes from the client contract                                |
| [0210](0210-railway-pro-keeps-private-images-within-the-compute-budget.md)            | Railway Pro keeps private images within the compute budget                      |
| [0211](0211-the-application-names-the-account-portal-billing.md)                      | The application names the account portal Billing                                |
| [0212](0212-agent-lifecycle-proof.md)                                                 | Agent lifecycle uses exact input proof                                          |
| [0213](0213-build-and-publish-one-release-image.md)                                   | Build and publish one release image                                             |
| [0214](0214-read-the-completed-automatic-review.md)                                   | Read the completed automatic review                                             |
| [0215](0215-release-publishes-prepared-artifacts.md)                                  | Release publishes prepared artifacts                                            |
| [0216](0216-release-publication-has-one-remote-writer.md)                             | Release publication has one remote writer                                       |
| [0217](0217-the-landing-home-page-may-use-a-wide-column.md)                           | The home page of the landing site may use a wide column                         |
| [0218](0218-review-is-optional-for-landing.md)                                        | Review is optional for landing                                                  |
| [0219](0219-distributions-carry-notices-and-compatible-diagram-layouts.md)            | Distributions carry notices and compatible diagram layouts                      |
| [0220](0220-future-releases-use-a-new-public-image.md)                                | Future releases use a new public image                                          |
| [0221](0221-save-latency-is-an-advisory-target.md)                                    | Save latency is an advisory target                                              |
| [0222](0222-distribution-runtime-dependency-closure.md)                               | Distribution runtime dependencies form a complete graph                         |
| [0223](0223-core-source-opens-before-distribution.md)                                 | Core source opens before distribution                                           |
| [0224](0224-hosted-ci-runs-the-fast-check-on-each-pull-request.md)                    | Hosted CI runs the fast check on each pull request                              |
| [0225](0225-the-server-answers-mcp-on-its-own-origin.md)                              | The server answers MCP on its own origin                                        |
| [0226](0226-the-application-origin-issues-mcp-grants.md)                              | The application origin issues MCP grants                                        |
| [0227](0227-a-tool-calls-the-contract-as-the-actor-of-its-grant.md)                   | A tool calls the contract as the actor of its grant                             |
| [0228](0228-hosted-proof-and-release.md)                                              | Hosted checks prove changes and one workflow releases them                      |

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
a collapsed state that belong to the person. Record 0036 opens the browser
gate to parallel workers, because each worker already owns its whole stack,
and it refines record 0014. Records 0037 and 0038 follow
[design 009](../design/009-backlinks-on-standard-links.md), which reads the
backlink surface that item 3 of
[plan 009](../plans/009-portable-markdown-at-rest.md) already delivered. Record
0037 keeps the server table as the one link index at rest and derives the
answer of the device from the note bodies it already holds, so no second index
enters the browser. Record 0038 splits an empty answer from a failed read
across every read surface of the web application, because the backlink panel
reported no inbound link whenever it could not reach the server. Record 0039
gives the deployment one list of served origins, which the operator names as
full origins, because the cookie write check, the trusted list of the identity
routes, and the Host allowlist each answered the question from a different
value. Records 0040 and 0041 answer issue 24 and finding 11 of the
[architecture review of 2026-09-11](../audits/2026-09-11/architecture-review.md).
Record 0040 makes every address that the server answers an operation of the
contract, so the root probe addresses that an operator configures are covered
by the response check. Record 0041 makes readiness read the pool that the
deployment already serves from, so a probe that an orchestrator repeats forever
opens no connection of its own. Records 0042 and 0043 answer issue 25, the
optional TLS profile. Record 0042 gives the listening socket its own
configuration, because a proxy separates the public address from the address
that the process binds, and it refines the last bullet of record 0039. Record
0043 gives the client address one decider: one named list grants the trust, it
is empty by default, and Better Auth reads the answer of this server instead of
a header of the caller. Record 0044 answers issue 85. It keeps the installed
worker out of a load that started without it: registration waits for the `load`
event, the worker claims no client, and the precache takes at most half of the
connections of one host. It refines record 0013. Record 0045 answers issue 34 and
finding ENG-13 of the
[tooling audit of 2026-09-10](../audits/2026-09-10/tests-tooling-docs.md). It
gives the build step of this repository the precache of the worker and the name
of the cache that holds it, so no second bundler and no Workbox runtime enter
the tree, and a cache follows the bytes of its build. It refines record 0013.
Record 0046 answers issue 74. It settles where the token and the reading
ticket of a published link sit, because a picture inside a server built page
sets no header and the reader path sets no cookie. It refines record 0030.
Record 0047 answers issue 77. It gives the address that a person opens one
answer for every state of a link, because a problem document shows an error
code and one status cannot carry two media types.
Record 0048 answers issue 78. It puts the publish action in the command palette
and in the folder row menu, and it makes the links of a workspace one list
beside Trash, because the note surface of record 0015 takes no new control and
the list of record 0030 is scoped to a workspace. It refines record 0030.
Records 0049 to 0051 follow
[design 010](../design/010-workspaces-as-an-explicit-container.md), which
reopens the container question that record 0005 closed. Record 0049 supersedes
record 0005: a person keeps personal notes and work notes apart, so the
workspace becomes a control in the sidebar instead of a hidden path segment.
Records 0050 and 0051 close the two invariants that record 0005 had made
unreachable. Record 0050 keeps a sync engine running for every workspace that
still holds queued work, because a person who switches away must not leave a
save on the device. Record 0051 makes the domain rule and the database function
both refuse the delete of the last workspace of an account.

Records 0052 to 0055 follow
[design 011](../design/011-depth-and-hierarchy.md), which reads why the
interface is tidy and still flat. Record 0052 names the three planes of the
interface and makes elevation a named scale built from the scrim of the
palette, because the frame header had taken the highest plane of the screen.
Record 0053 derives the divider from the component edge and the page
background, because the decorative edge of a palette has no minimum and every
divider of the product used it. Record 0054 states the motion of the
application in one module, because Tailwind gives a duration no theme
namespace and a bare number in a class is a value that no rule can hold.
Record 0055 makes the note name, the note text and the note footer one centred
column and holds them to one measure, and it refines record 0015.

Records 0056 and 0057 answer the theme audit of 2026-09-17. Record 0056 makes
the default family a neutral one, because every family in the registry was a
taste and a person with no preference met a preference on the first screen. It
refines record 0016. Record 0057 makes a control fill state its hover in the
palette, because a hover made with a brightness filter moved every light
palette toward its page and cost nine variants the contrast minimum of the
button label. It follows the derived value of record 0053.

Record 0058 puts an overlay at the end of the document and places it in the
coordinates of the screen, because a menu laid out inside the folder tree was
cut by the box that scrolls it.

Record 0059 ends the line cap of a directory guide at its key file index,
because seven of the thirteen guides sat at the cap and a new rule had to
delete an old one.

Record 0060 gives the published page every stylesheet that the build emitted,
because the page holds no script and mathematics on it had no style at all.

Records 0061 to 0065 come from
[design 012](../design/012-a-finished-interface.md), which reads why the
interface was tidy and still looked like a template, and which states the one
system in [the design guide](../development/design.md). Record 0061 sets the
whole application in one vendored family and its monospace sibling, because
the product rendered in whatever face the device had. Record 0062 makes the
default action ink and leaves the blue to a link, a focus ring, a caret and a
selection, because the accent fill painted five things that were not actions.
It finishes record 0056. Record 0063 makes the derived divider the resting edge
of a control and reserves the component edge for a control whose state has no
text, because every field and every secondary button read as a cage. Record
0064 makes the frame header the context of the route, with a breadcrumb, the
actions of the route and the account, because the header stated nothing about
where the person was. It refines record 0015. Record 0065 puts every control
recipe in one module and every icon on one grid, and makes the gate a design
gate, because twenty three controls wrote their own classes and icons rendered
at six sizes.

Records 0067 and 0068 answer the reading report of 2026-09-18. Record 0067
loads an external picture, because a note that names a picture by address
showed a grey box with a Load control and the owner asked for the picture.
Record 0068 joins a soft line break in the live preview, because the note
surface and the published page read one paragraph two different ways, which
record 0025 does not allow.

Record 0066 retires the browser suite, because a full matrix started a build, a
server, a database and a browser for each worker of five projects, and it stood
in front of every landing. `pnpm verify` is the whole gate now. A pure module
proves what a person sees and an integration test reads the built or served
result. It supersedes records 0014 and 0036.

Record 0069 makes the note name the last part of the breadcrumb, because the
header and the note surface both stated it and the note lost its first band to
a word the header already carried. It refines records 0064, 0055 and 0015.

Record 0070 binds Shift and Enter to a hard break and hides the marker while
the selection is away from its paragraph, because record 0068 left no way to
break a line and the marker read as a stray backslash. It refines record 0068.

Record 0073 makes a save name the accepted revision its content descends from,
because the local store read that precondition from the mirror while the
content came from the parent chain, and a device that only opened a note put
its own text back over a version another device wrote. It also drops a working
copy that holds no unsent work when the head of its file moves, so a restore
reaches the device that asked for it. It keeps the resolution of record 0026.

Record 0075 makes a plain click on a link open it and puts a pointer over
every link, because the modifier that opened one was written nowhere a person
could read it and the touch path opened nothing at all. A link that the
selection touches keeps the caret, so every link stays editable. It replaces
the rule of design 001.

Records 0076 to 0080 hold the first decisions of
[design 013](../design/013-conflict-free-sync-of-note-text.md). Records 0081 to
0087 replace them after review, for issue 152. Record 0081 keeps a CRDT inside
revisions, adds complete observed state, and puts every text writer in one
atomic document path. Record 0082 separates the byte API from the private live
editor bridge. Record 0083 protects unseen text in metadata conflicts and purge
recovery. Record 0084 preserves identities during compaction and original work
during bounded legacy recovery. Record 0085 makes local writes merge and keeps
receipts separate from applied state. Record 0086 requires compatibility before
the new format and one complete application landing. Record 0087 binds Review
to the checkpoint that caused it. These are target decisions; the plan stays
active until the implementation and its release evidence are complete.

Record 0090 makes one factory the only place that opens a connection pool,
because a pool with no error listener stopped the process when the database
ended an idle connection, and a pool that ended before its sockets closed made
a test teardown fail.

Record 0091 puts every page that a signed in person opens inside the workspace
frame, because Settings and Page not found stood outside it with no sidebar and
no breadcrumb. An address that names no workspace opens under the chosen one.
It refines record 0064.

Record 0092 keeps the rendered marker of an ordered item while a person edits
its text, because the numeric Markdown marker made a nested list lose its
visible hierarchy until the caret left the line. The numeric source returns
only when the selection touches the marker. It refines record 0089.

Record 0093 puts the actions of the tree in one row of icons above it: New
note, New folder, Sort notes, and Expand or collapse all folders. The order of
the notes is a device choice. It refines records 0064 and 0069, and it answers
[issue 139](https://github.com/bkhanale/notesapp/issues/139).

Record 0094 puts one row of formatting tools above the note text, because a
person who does not know Markdown had no way to make a list, a heading or a
table. Each tool runs the command of its key from one table in
`packages/editor/src/keymaps.ts`. It refines record 0069, and it answers
[issue 153](https://github.com/bkhanale/notesapp/issues/153).

Record 0095 follows [design 014](../design/014-a-table-is-a-grid.md). It
keeps a table as text in the one editor and presents it as a grid, with one
block wrapper that scrolls each table on its own. It refines record 0002.

Record 0096 answers the owner report on tables after 0.6.0. No edit of a person
changes the rows or the columns of a table: an edit that meets its structure is
expressed on the model of the table. A table carries its own controls that add
a row and a column, and the table tools leave the formatting row. It refines
records 0094 and 0095.

Record 0097 gives a row and a column of a table a handle that opens its menu,
because the owner could not find the removal of a row in the command palette.
A range of cells that a person pastes into a cell fills the cells. It refines
record 0096.

Record 0098 moves the handles of a table outside its cells, into a margin
that also holds them in full on a phone. A handle drags its row or its column
to a new place, the menu and the palette move them too, and the add bars
leave the table. It refines records 0096 and 0097.

Record 0099 answers
[issue 138](https://github.com/bkhanale/notesapp/issues/138). A daily note is
an ordinary note at a dated path, a new one starts with the text of a template
note, and a calendar page opens the note of any date. The template and the
choice to open the note of today at start belong to one member of one
workspace, so they follow the person to every device.

Record 0100 moves the calendar of record 0099 into the sidebar, between the
tree and the footer rows, because the owner asked to open a day from every
page. The two settings move to the Settings page. It refines records 0093 and 0099.

Record 0101 makes the folder and the name of a daily note two settings of the
member, with the date tokens of Obsidian, because the owner asked for the
layout of Obsidian. It refines record 0099.

Record 0102 lets a template write the date and the name of a new daily note
through placeholders in double braces, filled once when the note is made. It
replaces the placeholder bullet of record 0099.

Record 0103 answers
[issue 141](https://github.com/bkhanale/notesapp/issues/141). The spell checker
of the browser checks the prose of a note, the code and the addresses stay out
of it, and one setting of the account turns it off.

Record 0104 makes the making of a note a natural boundary of record 0022.
New note, Duplicate and a daily note write the first draft and its checkpoint
together, so the note reaches the server with no edit. It refines record 0099.

Record 0105 gives the sidebar a thin bar of view buttons, because the owner
found the tree full with the calendar under it. The sidebar shows the tree or
the calendar. It refines record 0100.

Record 0106 answers
[issue 172](https://github.com/bkhanale/notesapp/issues/172). A grip moves a
list item and its children among its siblings, and two tools, the palette and
Alt with the arrow keys do the same on every device. It refines records 0094
and 0098.

Record 0107 shows a single new line as a line break on every surface, the way
Obsidian and Notion do, because a joined paragraph reflowed each time the
caret entered it and broke the row of a list item. Shift and Enter write a
plain new line. It supersedes records 0068 and 0070.

Records 0108 to 0113 follow
[design 015](../design/015-several-accounts-on-one-installation.md), which lets
one installation serve several isolated accounts. Record 0108 makes one
database function the only way an account comes in, through an invitation or
an open policy. Record 0109 adds an installation role that grants no workspace
access. Record 0110 keeps one enabled administrator. Record 0111 makes removal
an operation that leaves a tombstone, and it refines record 0051. Record 0112
moves the storage limit to the owner account and fixes the lock order. Record
0113 makes a browser serve only the account of its session.

Records 0114 to 0121 follow [design 016](../design/016-a-public-service.md),
which lets a stranger sign up on a public installation. Record 0114 verifies
the address before the first session and hides whether an address has an
account. Record 0115 makes a sign-up pay a proof of work that this server
issues, with no third party. Record 0116 gives the password one rule from NIST
SP 800-63B revision 4 and a breach check. Record 0117 lets a person manage
their own sessions. Record 0118 gives published pages their own origin, and it
refines records 0039 and 0031. Record 0119 adds a report and a takedown, and
it refines record 0031.
Record 0120 records the legal documents that an account accepted. Record 0121
makes every limit and every job hold across server processes. Record 0122
supersedes record 0117, because the revoke route of the library names a
session by its token. Record 0123 seals the address of a
reported link, so an administrator can open it and the database still holds no
working link.

Records 0124 to 0126 follow [design 017](../design/017-websocket-sync.md).
They define WebSocket wake notices, PostgreSQL notifications, and a generated
message boundary. HTTP keeps the durable sync operations. These are target
decisions; [plan 016](../plans/016-websocket-sync.md) owns implementation and
measured rollout evidence.

Record 0127 answers
[issue 193](https://github.com/bkhanale/notesapp/issues/193). A page of the
incremental feed ends only at the end of a commit, because a page that ended
inside a commit lost the rest of it. It is the prerequisite of plan 016.

Record 0128 answers
[issue 188](https://github.com/bkhanale/notesapp/issues/188). The server
validates every notice frame in both directions, and the browser reads a
frame by its kind, because the content security policy keeps Ajv out of the
browser. It refines record 0126.

Record 0129 answers
[issue 189](https://github.com/bkhanale/notesapp/issues/189). It names the
channel, the triggers, the two switches, the access rechecks, the shared
reservations and the bounds of the notice gateway. It refines records 0124
and 0125.

Record 0130 answers
[issue 190](https://github.com/bkhanale/notesapp/issues/190). One coordinator
in the lease tab owns the lease, the socket and the subscription set, and the
lease tab serves the open workspace of every tab. It refines records 0050 and 0124.

Record 0131 makes the notice stream run on every deployment, with no
admission setting and no publishing switch, because the owner chose that on
2026-09-29. It replaces the switch bullets of records 0125 and 0129, and the
poll stays as the fallback.

Record 0132 draws a bullet and a task box at every caret, keeps the caret
out of the marker, and shows the source of a selected marker, the way Notion
and Obsidian do, because a tap beside a box on a phone put the caret before
the box. It refines records 0033 and 0025.

Record 0133 makes a save of an open note freeze its document and take the
text of that document, so a text that lags its document never becomes new
work. It refines record 0085.

Record 0134 makes a toggle of a task box a save boundary, and a merge that
leaves a box with two states keeps the state of the save accepted last. It
refines records 0022 and 0081.

Record 0135 drops the issuer from the key of an identity account, because
Better Auth 1.7.3 no longer writes it and refuses a schema that requires it.
It refines the identity schema of design 015.

Record 0136 takes the initial JavaScript budget from the critical-path budget
of The Performance Inequality Gap, 2026, because the round figure before it
had no source.

Record 0137 gives every page the column of the note measure and the side
region of the note, because the column moved and changed its width between
a note and a page. A page of two or more sections lists them in the region.
It refines records 0055 and 0091.

Record 0138 gives every page but All notes and the note one back control,
a caret before its title to the page above it, lines a list up with the page
column, and moves Accounts from the sidebar into Settings, because the owner
asked for one rule on 2026-09-30. It refines records 0064, 0091 and 0137.

Record 0139 takes the name of a page out of the breadcrumb, because the
heading below it said the same word. The breadcrumb names the way to the
page, and the note keeps its name there. It refines records 0064, 0091 and 0138.

Record 0140 lets the operator name each legal document by a Markdown file
that the server renders and serves, and ships a template that the server
refuses while a blank is left. It refines record 0120. Record 0141 gives a
person a reset of the password in the application, writes every message of
the server in one module, and puts every message that a stranger can cause
under one budget for each address.

Record 0142 lets the style attributes of a formula apply on the published
page, because KaTeX places each row and each script with one and the page
refused them all. The math sanitizer stays the one producer of such an
attribute. It refines records 0031 and 0060.

Record 0143 answers
[issue 137](https://github.com/bkhanale/notesapp/issues/137). A person imports
a theme file, the account keeps it, and one rule set of a palette holds the
registry and every import, so a theme that cannot be used names what to
correct. It refines record 0016.

Record 0144 lets the unit of work of the store send its feed hints after its
commit, because PostgreSQL serialized every commit that queued a notification
through one lock held until its flush, and twenty saves waited for each other.
Every other writer keeps the trigger. It refines record 0125.

Record 0145 makes a picture of the note a button that opens the image
viewer, where a person zooms, downloads and copies it. A click beside the
picture still opens its source. It refines record 0002.

Record 0146 lets the page of a link that opens nothing and the page of a
link that asks for a password say what the reader can do next, in one more
sentence that is the same for every cause. It refines record 0047.

Record 0147 follows
[design 018](../design/018-a-table-that-reads-like-a-document.md). A cell hides
its padding and wraps, so a column takes the width of its text. The handles
become grips on the edge of the table, a pressed grip marks its row or column,
and the add bars come back. It refines records 0095 and 0098.

Record 0148 follows
[design 019](../design/019-installation-settings-in-the-application.md). An
administrator sets the mail transport and the two legal documents in the
application. A group that the environment sets wins and is locked, the mail
password is sealed with a key of the server, and the legal templates move
into `packages/core`. It refines records 0120, 0140 and 0141.

Record 0149 answers
[issue 220](https://github.com/bkhanale/notesapp/issues/220). One template
engine in `packages/core` fills a daily note and a template that the palette
inserts at the caret, and it gains `{{time}}`. The template folder is a
setting of the member. It refines record 0102.

Record 0150 answers
[issue 214](https://github.com/bkhanale/notesapp/issues/214). The environment
names the mail server as separate fields that pass the rule of the settings of
the application, or as the one SMTP URL, and never as both. It refines record 0148.

Record 0151 answers
[issue 210](https://github.com/bkhanale/notesapp/issues/210). A published
page and a legal page follow the light or dark preference of the device, with
the Default palettes that the build writes into the one stylesheet.

Records 0152 to 0154 follow
[design 020](../design/020-a-documentation-site.md). Record 0152 builds the
guide into a static site of its own in `apps/docs`, with the one renderer, the
one stylesheet and the recipes of `packages/ui`, so it reads like the product.
Record 0153 gives the site a search and the files for agents from its build,
with no server. Record 0154 makes the gate refuse a change of source that
carries no test and states no reason, and runs the same check as a Stop hook
of the agent.

Record 0155 makes the stop and resume of a parse part of the gate: every block
syntax of the editor grammar parses the same in slices as in one pass, after
the audit of 2026-10-02 reported a display math block that a resumed parse
read as two paragraphs.

Record 0156 adds GFM footnotes to the editor grammar, a container block for a
definition and an inline reference, with the label rule of the renderer, so a
footnote has one meaning in the editor and on the published page.

Records 0157 to 0160 follow
[design 021](../design/021-the-published-page-draws-what-the-editor-draws.md).
Record 0157 keeps a safe set of the HTML elements that an author writes and
keeps the text of every other one. Record 0158 draws a diagram of a published
page in the frame of the editor, with one script file that the content policy
names by its address. Record 0159 colours code on the published page and in
the editor with one list of languages and one map of tokens. Record 0160 makes
an unclosed tag keep the rest of a note, bounds the nesting of its HTML, and
names the diagram files at an IPv6 host.

Records 0161 and 0162 answer issues of the
[product audit of 2026-10-02](../audits/2026-10-02/product-audit.md). Record
0161 holds a render failure at the nearest route boundary, so a failure in one
page leaves the frame. Record 0162 makes a search excerpt the plain text of
its Markdown, at the server and on the device, from the one readable text of
record 0167.
Records 0163 to 0165 follow
[design 023](../design/023-names-the-tree-and-long-lists.md). Record 0163
names a note from its first heading while its name is automatic, at the
boundary of a version, and answers
[issue 252](https://github.com/bkhanale/notesapp/issues/252). Record 0164 makes
the tree one list of rows with the tree role, a selection of many rows, one
menu for a row, a right click and the keys, and a rename in place, and answers
[issue 245](https://github.com/bkhanale/notesapp/issues/245) and
[issue 255](https://github.com/bkhanale/notesapp/issues/255). Record 0165
renders a window of the rows of a long list, with a module of our own, and
answers [issue 256](https://github.com/bkhanale/notesapp/issues/256).

Record 0166 answers
[issue 254](https://github.com/bkhanale/notesapp/issues/254). History groups
its versions by day with a time that differs, marks the current version, and
opens a version as a difference and as a read-only preview of the note.

Record 0167 answers
[issue 246](https://github.com/bkhanale/notesapp/issues/246),
[issue 253](https://github.com/bkhanale/notesapp/issues/253) and
[issue 265](https://github.com/bkhanale/notesapp/issues/265). Search uses one
text configuration with no language rule and no accent, matches each word as a
prefix, indexes the readable text of record 0162, and quotes a bounded window
of it.

Record 0168 answers
[issue 264](https://github.com/bkhanale/notesapp/issues/264). A note read
carries the document of the note only for a reader that asks for it, and a
reader that shows the text asks for the text alone.

Record 0169 answers the same issue. The server compresses the JSON answer of
a large read itself, as record 0013 asks of delivery, and leaves a write and
an answer that sets a cookie as they are.

Record 0170 answers the review of
[issue 243](https://github.com/bkhanale/notesapp/issues/243). An import and an
export hold one reservation each across the processes, an export plans its
archive and streams it with its length, and an import checks the free space
and every entry before its first commit.

Records 0175 to 0177 answer the performance audit of 2026-10-02, with the
measurements of `tools/performance/`. Record 0175 makes a key change only
the editor: the note screen holds the work of a burst and writes it after a
pause, and a new change kind names local document work (issue 262). Record
0176 makes a save wait for no read: an explicit save checkpoints at once, a
pull gives way to a waiting save, one transaction announces one change, and
a closed stream returns the engines to the poll (issues 263 and 267). It
refines records 0085, 0124 and 0130. Record 0177 keeps the editor out of
the first screen and makes the budget of record 0136 hold the whole first
screen (issue 266).

Record 0178 follows record 0170. The code generator writes a typed address
for an operation that a browser reads itself, and the export of a workspace
downloads through it in every browser, with no blob.

Record 0179 keeps the one editor of an open note when another device, a
restore or a snapshot moves its head: the bound document joins the new text,
and only a new generation of the document reads the note again. It refines
record 0073.

Record 0180 removes the white page of a start that fails. A load that the
worker controls starts the entry with no preload links, and a failure before
the first render shows the application error screen of record 0161 with
Reload. It refines records 0044 and 0161.

Record 0181 makes each write of open editor work name the generation of its
document, so the store refuses work of another generation. The appends of an
editor stop after a failure until the whole document is written, and a fold
leaves out an update that cannot apply instead of making the note unreadable.
It refines records 0175 and 0179.

Record 0183 sends a save of a note on the last accepted head when an earlier
save of it is parked, so the edit that a refusal asks for saves. A later save
that carries all the work of a parked save removes it from Needs attention.
It refines records 0022, 0073, 0087 and 0181.

Record 0184 keeps the accepted path of each note on the device, so a free
name avoids every path that the server holds or may hold: the local path,
the accepted path, the path of a queued save and the path of a kept text.

Record 0185 patches each step of the grammar, the render and the editor parse
that read their input again for each part of it, so every shape of note
grows with its size and no note is refused for it. It corrects record 0182.

Records 0171 to 0174 follow
[design 022](../design/022-markdown-of-other-tools.md). Record 0171 opens
inline math on one dollar by the rule of Pandoc, so a price stays text, and
answers [issue 240](https://github.com/bkhanale/notesapp/issues/240). Record
0172 turns a wiki link into a standard link when it enters a note, from the
list, the typed brackets, a paste or an import, and answers
[issue 241](https://github.com/bkhanale/notesapp/issues/241). Records 0173 and
0174 answer [issue 242](https://github.com/bkhanale/notesapp/issues/242): each
fence language of the one list is a CodeMirror language, so both surfaces
share its parser and the editor its editing, and a code block carries its
language and a copy action in the note and on a published page.

Records 0186 to 0202 follow
[design 024](../design/024-tidy-notebook-cloud-and-self-hosted.md), which makes
the product a free open core and a paid cloud. Record 0186 keeps every line of
billing out of this repository: a private service sells the cloud and reaches
the core over HTTP only. Record 0187 names the product Tidy Notebook on one
domain. Record 0188 opens the repository under AGPL-3.0-only. Record 0189 gives
an account a text limit, a published transfer limit, a download limit, a
standing and feature switches beside the storage limit of record 0112, with a
revision on each write, and record 0201 states what a locked account keeps.
Record 0190 opens the controls to a service through an operator API. Record
0191 lets the `open` policy run with no published origin. Record 0192 puts
staged uploads, imports in parts and attachments in an S3 compatible store,
and record 0193 bounds the transfer and the object operations of an account
and of the installation. Record 0202 gives the image a migrate and a serve
command. Records 0194 to 0200 state the cloud: Paddle as the merchant of
record, two plans with seats, the billing service that mirrors Paddle into the
account controls, its pages and checkout, the landing site, Railway behind
Cloudflare, and a limit on every cost. Record 0203 writes the name in lowercase, tidy
notebook, and gives the install icon its tn monogram.

Record 0204 builds the image in the release gate before the tag, from the
committed tree, because the tags of 0.13.0 and 0.14.0 have no image.

Record 0205 declares the infrastructure of the cloud as code in the private
repository. It replaces only the bullet of record 0199 that lists the
dashboard settings, and the line of design 024 that keeps infrastructure as
code out.

Record 0206 lets the environment name the registration policy, as record 0148
lets it set the mail and the legal documents, so an installation set up as
code needs no step in a browser.

Record 0207 gives each secret of the image a variable form beside its file,
never both, so the image runs on a platform that mounts no file. It refines
records 0190, 0192 and 0202.

Record 0210 replaces Railway Hobby with Pro from the first deploy. It keeps
the image publication policy and the compute limits of records 0199 and 0200.

Record 0211 gives the account portal a Billing section in Settings and
names it billing in every word that a person reads. It refines records
0186, 0190 and 0201.

Record 0217 lets the home page of the landing site use a wide column, a
hero headline at `text-3xl`, 20 px feature icons and a raised screenshot. Every
other page keeps the note column. It refines records 0137 and 0198.

Records 0225 to 0227 follow [design 026](../design/026-a-remote-mcp-server.md).
Record 0225 serves a remote MCP server on its own origin and replaces the
stdio adapter of record 0008. Record 0226 makes the application origin the
authorization server of that endpoint, and it refines records 0201 and 0208.
Record 0227 runs each tool as calls to the contract operations, as the actor
of the grant.
