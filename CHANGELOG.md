# Changelog

All notable changes to this project are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## 0.22.1 - 2026-10-27

### Changed

- The notes, folder, template, editor, Settings, Trash and recovery screens use the approved redesign on phone and desktop.
- Undo and Redo are icon buttons with accessible names. Their tooltips stay open when the pointer moves onto them, and Escape closes them without moving focus.
- Each Settings topic has its own page. Old Settings links open the matching topic.
- Note creation shows a simpler destination choice, including No folder.

### Fixed

- The navigation drawer traps focus and locks scrolling only on phone screens. Desktop Tab and scrolling stay free, and Escape returns focus to a visible control.
- A link to a deleted note finds the note in Trash, also when Trash has more than one page. Restored device text has priority over a failed Trash lookup.
- Folder actions are not available until the folder list loads, so a folder cannot be removed from an incomplete list.

## 0.22.0 - 2026-10-26

### Added

- Notes have Undo and Redo controls. Image removal affects one reference and supports Undo.
- Note creation offers template previews and a visible destination. Today and recent notes are easier to find.

### Changed

- Search and export actions show their workspace scope. History shows the comparison baseline.
- Signup, account settings, trial information, and offline settings use clearer actions and status messages.

### Fixed

- Restored notes recover their editor without a page reload. Purged notes keep their terminal state during navigation.
- Search shows pending work and keeps results tied to the current query.
- Template reads, errors, and creation navigation stay tied to the active workspace and request.
- Save status includes open editor work before a checkpoint. Recovered drafts keep their save proof and require a choice when the accepted head changes.
- The Use saved version action archives and removes the same draft in one transaction. A concurrent draft change keeps the newer text and shows a fresh choice.

## 0.21.0 - 2026-10-24

### Added

- Operators can give new member accounts a fixed free trial with initial limits and feature access. Direct signup and invitation acceptance set access in one transaction. Server checks enforce expiry without a login. Existing accounts and default self-hosted behavior stay unchanged.
- Account and operator reads show the fixed trial end and state. Trial screens explain remaining access and the upgrade action, with no card requirement or automatic charge.

### Changed

- Revision-checked paid or manual control changes end a trial. Administrator promotion also ends it. Expiry keeps the original account-creation removal deadline. The internal registration SQL signature changes, so server processes must use the matching schema during an upgrade.

## 0.20.0 - 2026-10-24

### Added

- MCP clients can append text to a note or section, or apply exact range edits with safe retries and receipts.
- Every core email has HTML and plain text from one shared template. Email actions remain readable in dark mode and Proton Mail.
- New accounts get a welcome note. A pending note can complete after account activation through browser session access.
- Public pages share account layouts, the official notebook mark, and a footer. Application and documentation links have generic social previews.

### Changed

- New main and version images publish only to the public `ghcr.io/tidynotebook/tidynotebook` package for `linux/amd64` and `linux/arm64`. Existing `core` tags and digests remain available. Upgrade with the new release's complete image address and digest; do not change only the package name in an old pin. Historical `latest` aliases stay at their old images.
- Versioned image releases run without manual approval. The release environment keeps its version-tag policy and disabled administrator bypass. Both native images pass source and notice checks before publication, and the image index has GitHub OIDC provenance.
- The primary install path selects a stable image by digest. Install and upgrade guidance covers platform selection, backups, migrations, and rollback for both published and source-built images.
- Contributions no longer require a DCO sign-off. Contributions remain under AGPL-3.0-only, with no contributor license agreement.
- CI selects checks for each change. The fast forward merge workflow keeps the exact reviewed head and dispatches main image publication after merge.

### Fixed

- S3 backups include attachments. Backup archives are verified before publication. Restore guidance covers storage targets and mail credential repair; tests verify target contents and refusal safety.
- API-key and delegated reads do not create pending welcome notes, including when a browser cookie is present. Completed session reads preserve welcome timestamps. Expected refusals and unexpected failures have separate log events with fixed levels.
- Checklist text and completed links use muted styles. List dragging keeps the viewport position, and Markdown parsing keeps bounded cached blocks.
- Email and web autolinks use the correct destination. External protocol actions save drafts first and stop when the draft changes.
- Public page scrolling, account error actions, guide contents scrolling, and installation footer links use the shared layouts correctly.

### Security

- Update Node to 26.12.1 and update dependencies and their distribution notices.

## 0.19.0 - 2026-10-15

This release updates tidy notebook.

### Added

- Future images use the core package. Read the official manifest before you move an image pin. ELK diagram requests use the standard layout. Distributions carry license notices and required source. Image checks return safe text, and a failed upload shows one message with Try again. Quick start keeps PostgreSQL data private and permits access through its bind root.
- The guide is rewritten for the person who does each step. New scripts in `tools/ops/` write the secret files, prepare the quick start and select a published image. The account commands now run in the application container.
- Add opt-in OAuth authorization for MCP clients with `NOTESAPP_MCP_ORIGIN`. Add identity tables for OAuth clients, client assertions, client resources, resources, consent, access tokens and refresh tokens. Use safe client registration, opaque tokens and shared refresh rotation.
- Add an opt-in remote MCP server with OAuth resource discovery and bounded grant access.
- Connect an app through a consent page that shows its claimed name, identity and answer destination. Choose read only or read and write, then allow or deny access.
- Connect an assistant to find and read notes through the six MCP read tools. Long notes and lists continue in bounded pages.
- Use a connected AI client with Write access to create, edit, move, or send notes to Trash. A changed note asks the client to read it again before a write.
- Settings shows connected MCP apps and lets you revoke their access.

### Fixed

- Update the Node runtime to 26.10.0.
- Separate release preparation from publication and publish prepared remote artifacts without repeating source tests. Keep latest version writes under one shared publication lock.
- Fix the quick start and image CI configuration. Update affected dependencies and the public contribution and security guides.
- Fix the affected transitive math and compiler dependencies. Keep diagram math and note math on the same fixed renderer release.
- Update Better Auth and its adapters to the release required by the OAuth provider.
- Fix incomplete offline Markdown reads and editor test failures when a parse time limit ends.
- Replicas and operator commands can start together with OAuth on. A database failure stops startup with one clear message.
- Limit OAuth client last-use writes to once a day during token resolution.
- Conditional edits, moves, and moves to Trash refuse a note version that changes before the commit.
- Native source downloads use fixed time bounds and retry temporary network failures during image builds.
- Classify PostgreSQL resource failures as unavailable in storage.
- Recover stopped unpublished release preparation with checked remote absence and fresh notes.

## 0.18.1 - 2026-10-09

This release updates tidy notebook.

### Fixed

- Publish the tested image once and remove the required GitHub build certificate.
- Accept the completed automatic review without a second request.

## 0.18.0 - 2026-10-09

This release updates tidy notebook.

### Added

- Add exact source proof for agent review, landing, and release. Publish a release manifest and the operator contract.

## 0.17.0 - 2026-10-09

This release shows account use against each limit in Settings. It also makes
Billing and account deletion easier to find.

### Added

- Settings shows a meter for storage and each monthly transfer limit. Almost
  full marks use at or above 90% of the limit.

### Changed

- Settings gives Billing its own section when the installation offers it.
  Open billing opens that section.
- Settings names account removal Delete my account. Sign out sits below the
  account card.

### Fixed

- The consent line links to the terms and the privacy notice.
- The terms and the privacy notice use Delete my account for account removal.

## 0.16.2 - 2026-10-08

This patch release makes the account role visible to a service of the
operator.

### Changed

- The deployment plan uses Railway Pro within the compute budget.

### Fixed

- The operator account interface includes the installation role. A service
  can check which account controls apply.

## 0.16.1 - 2026-10-08

This patch release adds a generated API reference to the documentation site.
It shows the authentication rules for personal API keys and browser sessions.

### Added

- The API reference shows each operation, request, response, and schema from
  the OpenAPI contract. You can download the same contract.
- Search and page links include the API reference.

### Changed

- The API key guide links to the generated reference for API details.
- The reference explains how to set the address of your own installation.

### Fixed

- Long section lists scroll so you can reach every operation and schema.
- The contents menu shows the current page on a small screen.

## 0.16.0 - 2026-10-07

This minor release lets you use a personal API key to read and change your
notes from a program.

### Added

- Settings lets you create, name, and revoke API keys.
- An API key gives a program the same account access as the web application.
- The API guide explains how to use a key and save a note.

### Security

- Each key has an expiry date. The application shows its secret only once.
- A password change, account disable, or account removal revokes all API keys.
- A password reset waits for a key creation in progress and revokes that key.

## 0.15.1 - 2026-10-06

This patch release keeps notes in sync after a connection failure and on a
slow connection. The format row on a phone gives more space to its tools.

### Fixed

- A queued save tries again after a connection failure. The offline notice
  clears when the connection works again.
- A save on a slow connection has time to reach the server.
- A large note keeps downloading while data arrives on a slow connection.
  An interrupted download tries again.
- The format row on a phone has no scroll arrows. Swipe the row to reach its
  tools.

## 0.15.0 - 2026-10-05

This minor release gives the operator of an installation controls for each
account, an interface for a separate account service, monthly limits on
transfer, and storage in an S3 compatible store. The source is now licensed
under AGPL-3.0-only.

### Added

- **Account controls.** An administrator can lock an account, set its storage,
  text, published transfer and download limits, and turn teams and
  collaboration on or off for it.
- A locked account signs in to one screen. It can export its notes, remove the
  account, and open the account portal when the installation names one.
- A locked account is removed after its removal time. The account receives a
  mail 30 days and 7 days before the removal.
- **An operator interface.** A separate service of the operator can find an
  account, read and change its controls, remove it, read the account events,
  and read the totals of a month. The interface uses one secret and is off
  when no secret is set.
- Settings opens the account portal for any account when the installation
  names one. A portal can link a person back to a page of the portal through
  the application, and sign-in returns the person there.
- **Monthly limits.** An installation can limit the published transfer, the
  downloads, and the calls to the object store in each calendar month. Past a
  limit, a published page closes and a download waits for the next month.
- **S3 compatible storage.** Uploads, images and imports can live in R2, MinIO
  or Amazon S3. An import goes up in parts, so a large archive passes a proxy
  that limits the size of a request.
- The image takes the commands `migrate` and `serve`, so a replica that serves
  holds no migration secret.
- The environment can name the registration policy. The setting is then
  locked on the accounts page.
- Each secret of the image can come from an environment variable or from a
  file.

### Changed

- The source is licensed under AGPL-3.0-only. A contribution needs a sign-off
  on each commit.
- The open sign-up no longer needs a separate origin for published pages.
- The health probes answer on any host name, so a platform can check a
  replica by its own name.

### Fixed

- A start that fails on a wrong setting now names the setting.
- The container image no longer copies the dependency folders of a local
  checkout.

## 0.14.1 - 2026-10-04

This patch release gives the container image that 0.14.0 did not build.

### Fixed

- The container image builds again. The tag 0.14.0 has no image, and this
  release holds every change of 0.14.0.

## 0.14.0 - 2026-10-04

This minor release gives the product its new name, tidy notebook, and a new
install icon. The source and the container image move to the tidynotebook
organization on GitHub.

### Changed

- **A new name.** The product is tidy notebook. The title of the browser tab,
  the installed application, the mail and the published page show it.
- The welcome note of a new account is "Welcome to tidy notebook". An existing
  note keeps its name.
- The install icon is a ring bound page with a tn monogram. The small mark in
  the application shows the same page.
- The container image moves to `ghcr.io/tidynotebook/tidynotebook`.
- The settings of the server keep their names. An installation needs no other
  change.

## 0.13.2 - 2026-10-04

This patch release keeps the tools, the menus and the caret in view when you
write a note on a phone.

### Fixed

- On a phone, the row of formatting tools stands above the note again. You can
  reach it when the keyboard is closed.
- The slash menu and the other menus open above the keyboard of a phone. A long
  menu scrolls and keeps every item.
- When the keyboard of a phone opens, the caret stays in view. The word count
  gives its row to the text while you type.
- A notice at the top of the screen no longer pushes the foot of the note out
  of view.

## 0.13.1 - 2026-10-03

This patch release gives the container image that 0.13.0 did not build.

### Fixed

- The container image builds again. The tag 0.13.0 has no image, and this
  release holds every change of 0.13.0.

## 0.13.0 - 2026-10-03

This minor release adds a slash menu, a menu and a selection in the file tree,
a preview in History, and a name that comes from the first heading. It also
makes typing, saving, search and the first screen faster.

### Added

- **A slash menu.** Type `/` at the start of a line, or after a space, to
  insert a heading, a list, a block quote or a table.
- **A menu for each row of the tree.** A right click, the button at the end of
  the row, or Shift + F10 opens it. It offers Rename, Move to folder,
  Duplicate, Copy link and more.
- You can select several rows of the tree with Ctrl, Shift or the keyboard,
  then move them or move them to Trash together. F2 renames a row in place.
- **A preview in History.** A version shows its changes and a preview of the
  note as it looked then. History groups the versions by day.
- **A name from the first heading.** A new note that starts with a heading
  takes the heading as its name when you pause.
- Footnotes show in the editor and on a published page.
- Inline math can be `$x^2$`, as in GitHub, Obsidian and Pandoc. A price such
  as `$5` stays text.
- Code shows in colour in more languages. Each code block shows its language
  and a Copy button, in the note and on a published page.
- A typed or pasted wiki link, such as `[[Plan]]`, becomes a normal link when
  the note exists. An import of an Obsidian vault changes its wiki links in
  the same way.
- A note keeps a safe set of HTML, such as `<kbd>`, `<sub>` and `<details>`.
- A published page draws a diagram, highlights code, and shows tasks and
  tables as the editor does.

### Changed

- Find and replace is a band above the note, with Match case, Regular
  expression and Whole word.
- On a phone, the row of tools stands above the keyboard. An arrow shows when
  more tools are there.
- Enter after a typed fence opener writes the closing fence. Enter on an empty
  list item ends the list with a blank line.
- Home on a list line or a quoted line goes to the start of the text.
- Search finds the words of every language. A word finds the longer words that
  start with it, and `cafe` finds `café`.
- The export downloads as a file of the browser. An import takes every zip
  file that an export writes, up to 65534 files and 4 GiB.
- The action that removes a note from the tree is Move to Trash on every
  surface, and the bar after it offers Restore.
- The notice about the storage of the browser shows once, and you can close
  it.
- The database needs the `btree_gin` and `unaccent` extensions of PostgreSQL.
  The Compose image holds both. A database that you run yourself needs the
  contrib modules installed.

### Fixed

- Typing, Ctrl + S, a save to a second device, search and the first screen are
  faster. A large note no longer slows each key.
- All notes shows a long list of notes without delay.
- A save that the server refuses names the limit that it broke, and Retry
  keeps your later changes.
- An error on a page shows Reload and Open all notes, and the sidebar stays.
- The sync status in the sidebar footer shows whole.
- The dialog of keyboard shortcuts fits on the screen.
- A new note no longer says that its links need a connection while online.
- A palette result shows plain text and its folder.
- A disabled button reads as unavailable.

## 0.12.0 - 2026-10-02

This minor release copies a whole note as Markdown from the command palette,
and publishes the guide as a documentation site with search.

### Added

- **Copy this note as Markdown.** The command palette copies the whole text of
  the open note to the clipboard. You do not have to select text first. A
  browser with no clipboard names Export as Markdown instead.
- **A documentation site.** The guide is a site with search in the browser.
  Each page has a Markdown copy, and the site gives the whole guide in one
  file for an AI agent.
- The guide has a reference page for Settings and a reference page for the
  settings of the server.

### Fixed

- The save status no longer names another tab when no other tab is open.
- Each tab of a browser shows that a save is on the server when the save
  arrives there.
- Safari on iPhone and iPad does not zoom the page when you tap a field.

## 0.11.0 - 2026-10-02

This minor release lets an administrator set the mail server and the legal
documents in the application, and lets you insert a template into any note.

### Added

- **Mail and legal documents in Settings.** An administrator sets the mail
  server and the terms and the privacy notice on the accounts page, with no
  file and no restart. Send a test message checks the mail server at once.
- The editor of a legal document starts from the template of NotesApp. Each
  blank of the template is a field, and the text does not save while a blank
  is left.
- **Insert from template.** The command palette inserts a note of your
  template folder at the cursor and fills its placeholders. A template can
  hold the time as well as the date.
- Settings, under Templates, names the template folder of the workspace.
- The person who runs the server can name the mail server as separate values,
  so a user name or a password needs no encoding.

### Changed

- A published page and a legal page follow the light or dark choice of the
  device of the reader.
- The mail override of the hosting files takes the separate values and a
  password file. An installation that keeps one mail URL names the new URL
  override in its list of Compose files.

### Fixed

- An undo and a redo in an open note reach the server.
- The command palette opens with an empty search field every time.

## 0.10.1 - 2026-10-01

This patch release opens a picture of a note in an image viewer, fits a table
to its text, and lets the page of a closed link say what to do next.

### Added

- Select a picture in a note to open it in an image viewer. The viewer fits
  the picture to the screen, zooms it, and copies or downloads it. A picture
  from another site gives Copy link and Open original.
- Select the dark area beside the picture to close the viewer.

### Changed

- A table takes the width of its text and fits the note column. A cell breaks
  a line between words and not inside a word.
- The row and column controls of a table are small grips on its edge. A grip
  marks its row or column while its menu is open or while you drag it.
- The bars under a table and at its right edge add a row or a column at the
  end.
- The page of a link that opens nothing and the page of a link that asks for a
  password show a heading and one sentence that tells you what to do next. The
  password field gets the focus.

### Fixed

- A click on a line below a picture, a diagram, or display math puts the
  cursor on that line and not on the line below it.
- The row and column grips of a table stay on the cell under the pointer and
  on the cell of the cursor after a click.

## 0.10.0 - 2026-10-01

This minor release lets an installation open sign-up to the public, lets you
reset a forgotten password, and lets you import a theme of your own.

### Added

- **Forgot password.** Sign in offers Forgot password when the server sends
  mail. A link goes to your address, works once for 1 hour, and opens a page
  where you choose a new password. Every device then signs out, and a message
  tells you that the password changed.
- **Terms and privacy notice.** The server can show the terms and the privacy
  notice that the person who runs it writes, from two Markdown files. The
  hosting guide holds a template of each, and the server does not start while
  a blank of a template is left.
- Sign in, the sign-up form, the invitation form and Settings link the terms
  and the privacy notice.
- **Import a theme.** Settings, under Appearance, imports a theme file and
  downloads the theme in use as a file. A theme that cannot be read lists each
  colour to correct. An imported theme reaches every device of the account.
- Every page except All notes and the open note has one back control before
  its title.
- A page of two or more sections lists them under On this page beside it.

### Changed

- An invited person accepts the terms and the privacy notice on the invitation
  form, so the account opens with no second step.
- A sign-in before you open the link of your sign-up says to open the link. A
  sign-in of a disabled account says to ask an administrator.
- Every message of the server is plain text and names the product and the
  address of the installation. One address gets at most three messages in an
  hour that a person with no account can cause.
- Accounts is a part of Settings and takes the same layout.
- The name of a page shows once, in its heading.
- The hosting guide adds the mail setup, the domain records that mail needs,
  and the steps that open sign-up.

### Fixed

- A request for a new password answers in the same time for every address.
- Images next to each other on one line all show in the editor, in the order
  that you attached them.
- A formula on a published page keeps its layout.
- The first page of the application loads less code.
- Save and search are faster again.
- A theme name counts each character once, including an emoji.
- A device that missed the delete of an imported theme cannot put the theme
  back.
- The first paint of a light screen draws native controls in the right
  appearance.
- A server that stops right after it starts now stops.
- The two buttons of two list rows no longer touch on a touch screen.

## 0.9.1 - 2026-09-30

This patch release repairs saves across devices, keeps task boxes usable, and
makes notes easier to open and edit on a phone. Settings lets you change your
profile name.

### Added

- Settings lets you change the name that appears with your account.

### Changed

- Bullets and task boxes stay visible while you edit a list item. Select a
  marker to see and copy its Markdown text.
- A task box saves its change at once.

### Fixed

- A note already on your device opens without a brief empty editor or a
  second copy of its name.
- The sidebar scrolls on a short screen, so you can still reach your notes
  when the phone keyboard is open.
- A tap beside a list marker puts the cursor on the item text. A scroll that
  starts on a task box leaves its state unchanged.
- A task box keeps one state when two devices change it at the same time.
- A save of an open note keeps the changes that arrive from another device.
  A tab with no new edit creates no extra version.
- Saves from two tabs of one note reach the server in order.
- The next save tries to store the whole open note again after a local write
  fails. If it still cannot store the note, it shows a message.

## 0.9.0 - 2026-09-29

This minor release shows the changes of your other devices in less than a
second, and repairs sync of a large change.

### Added

- **Live updates.** When you save a change on one device, your other devices
  show it in less than a second. The server tells each browser that a change
  is ready, and the browser reads it. The message holds no note text.
- A browser that cannot keep the connection, for example behind a proxy that
  refuses it, still reads the changes about every 15 seconds.

### Changed

- The tab that syncs for a browser now also reads the notes that its other
  tabs show, so a note open in any tab stays current.
- A proxy in front of the server must pass WebSocket connections to give live
  updates. The hosting guide names the address.

### Fixed

- A device no longer misses part of a large change, for example a move of
  many notes, when it reads the changes after a time away.
- A tab that signs in to another account no longer stops the saves of that
  account in the other tabs of the browser.

## 0.8.0 - 2026-09-27

This minor release lets several people use one installation, each with their
own notes, and lets an installation serve the public safely.

### Added

- **Several accounts.** The first account administers the installation. An
  administrator invites a person by mail or with a link, and the person
  chooses a password and gets their own notes.
- The accounts page lists each account with its role, its state, its last use
  and its storage. An administrator makes an account an administrator or a
  member, disables it, changes its storage limit, or removes it. You never see
  the notes of another account.
- Each account has a storage limit. Settings shows how much of it you use.
- Settings lets you remove your own account and every note in it.
- Settings lists each device that is signed in to your account. Sign out one
  device, or every device but this one.
- An installation can let anybody sign up. The person proves their address
  with a link in a message, and the browser does a short check first.
- An installation can name its terms and its privacy notice. Each person
  accepts them at sign-up, and again before the notes open when a new version
  comes out.
- An installation can show published pages on an address of their own, so a
  harmful page cannot reach an account.
- Each published page has a Report this page link. An administrator reads the
  reports, opens the page, and takes a link down. The owner sees the takedown.
- The operator can invite a person and make an account an administrator from
  the command line.

### Changed

- A new password needs at least 15 characters. Your current password keeps
  working.
- A sign-in needs an address that the installation proved. Every account of an
  installation that upgrades counts as proved.
- The limits of the server and its hourly work now hold across several server
  processes of one installation.
- The note tree uses less space between rows.

### Fixed

- A browser that another account signs in to stops sending your saves until
  you sign in again. The data that another account left on the device goes
  away at sign-in and at sign-out.
- The outline of a note scrolls inside its side panel.
- On a phone, the editor footer stays above the keyboard.
- An empty note list shows one New note action.
- On a touch screen, the name field of a new note takes the focus at once.
- A setting in the environment file of a container now reaches the server.

### Security

- A new password is checked against a list of leaked passwords. The server
  sends five characters of a digest of the password and never the password.

## 0.7.3 - 2026-09-25

This patch release shows each new line of a note as a new line, and repairs
list items that have a second line.

### Changed

- A new line in a note shows as a new line in the editor, in Read mode, and on
  a published page. The text no longer moves when your cursor goes into a
  paragraph or out of it. Press Enter twice to start a new paragraph.
- Shift and Enter start a new line in the same list item or quote. They no
  longer add a backslash to the note.

### Fixed

- A list item with a second line shows that line under the item text. Before,
  the editor showed the second line one character to a line.

## 0.7.2 - 2026-09-25

This patch release lets you change the order of the items of a list, a task
list included.

### Added

- Drag the grip to the left of a list item to move it to a new place in its
  list. The grip shows when you point at the item with a mouse.
- Move item up and Move item down are in the row of tools and in the command
  palette. Alt and the Up arrow or the Down arrow do the same.
- An item moves with its later lines and with the items under it. A numbered
  list keeps its first number after a move.

## 0.7.1 - 2026-09-25

This patch release sends a new note to the server as soon as you make it, and
gives the sidebar a bar that switches between your notes and the calendar.

### Added

- A thin bar at the left edge of the sidebar switches the sidebar between your
  notes and the calendar. The sidebar keeps the view that you chose.
- The menu of a table row and of a table column has Delete table. The command
  palette has it too.

### Changed

- The daily note folder and name format apply when you leave the field or
  press Enter. The Save button is gone.
- The calendar always shows its month.

### Fixed

- A new note, a copy from Duplicate and a new daily note go to the server at
  once. Before, they stayed on the device until you changed them.
- On iPhone and iPad, a drag on the header no longer moves the page up and
  leaves empty space under it.
- The template list in Settings has the same height and shape as the other
  fields in Safari.

## 0.7.0 - 2026-09-25

This minor release adds daily notes with a calendar in the sidebar, and a spell
check in the editor. Each row and column of a table now has a handle and a
menu.

### Added

- **Daily notes.** Each day has one note. A calendar in the sidebar shows one
  month and marks each day that has a note. Select a day to open its note, or
  to make it when the day has no note.
- Open today's note from the calendar or from the command palette.
- Settings has a Daily notes section. Choose a template, a folder and a name
  format of date tokens. You can also open today's note when the app opens.
  These settings follow your account to every device.
- A template fills its placeholders, such as the date and the name, once, when
  a new daily note is made.
- **Spell check.** Your browser underlines a word that it does not know. Code,
  web addresses, HTML, front matter and math stay out of the check.
- Settings has a Spelling section. Clear Check spelling to turn the spell check
  off. Your other devices follow this choice.
- **Table handles.** A handle shows beside the row and above the column that
  you point at. Select it to open a menu that inserts, moves, aligns or deletes
  the row or the column.
- Drag a handle to move its row or its column. Press Escape to stop the drag.
- A bar under a table adds a row, and a bar at its right edge adds a column.
- Paste a row or a range of cells into a cell. The cells fill to the right and
  down, and the table grows when it needs more rows or columns.

### Changed

- The row of formatting tools no longer holds the table tools. The table
  handles, the table bars and the command palette hold the table actions.
- A tool that the arrow keys reach scrolls into view on a narrow screen.

### Fixed

- Backspace and Delete in a table remove text, and never a cell, a row or a
  column.
- A space that you type at the end of a cell stays.
- A drag of a row or a column ends each time you release the pointer.
- A list item that holds inline code shows the spell check mark correctly.
- The month name of the calendar stays whole in a narrow sidebar.

## 0.6.0 - 2026-09-24

This minor release adds a row of formatting tools above the note, so you can
format a note without Markdown. A table now shows as a grid of cells that you
fill in like a spreadsheet.

### Added

- **Formatting tools.** A row above the note holds Heading 1, Heading 2,
  Heading 3, Bold, Italic, Strike through, Inline code, Link, Bullet list,
  Ordered list, Task list, Block quote and Table. Select text and then a tool,
  or select a tool and then type. Select a tool again to remove its format.
- Each formatting tool is also in the command palette.
- On a narrow screen, the row of tools scrolls sideways.
- Table writes a small table with two columns and one empty row.
- **Tables as a grid.** A table shows its cells and never its Markdown
  source. Tab and Shift + Tab move between cells. Enter and Shift + Enter move
  down and up. Tab in the last cell and Enter in the last row add a row.
- While the cursor is in a table, Add a row, Add a column, Remove the row and
  Remove the column join the row of tools and the command palette.

### Changed

- A wide table scrolls sideways inside its own outline. The rest of the note
  stays where it is.
- The tools that change whole lines, such as Heading and Bullet list, show
  disabled in a table.
- The name field keeps a new note name when you press Enter or leave the
  field. Enter then moves the cursor into the note, and Escape gives back the
  name the note has.

### Fixed

- A duplicated note shows its text once.
- A heading, a list or a quote that you start on an empty line puts the cursor
  after its marker.
- A link writes itself at once, so the text you type next lands after it.
- An action from the command palette keeps the cursor in the note.

## 0.5.4 - 2026-09-24

This patch release adds note sorting and tree actions. It also keeps nested
list labels clear while you edit.

### Added

- Sort notes by name, date created, or date updated. Choose either direction
  for each order. This device keeps the order you choose.
- The sidebar puts New note, New folder, Sort notes, and Expand or collapse all
  folders in one row above the tree.

### Changed

- A menu uses a thin line to separate groups of actions.

### Fixed

- A nested ordered list keeps its visible label while you edit its text.

## 0.5.3 - 2026-09-23

This patch release offers Review after two devices join their work, draws
nested ordered lists in the style of their depth, and repairs workspace
deletion.

### Added

- A note whose save joined the work of another device shows a notice with
  Review and Dismiss. Review compares the text you saved with the note now.
- History marks each version that joined the work of another device.
- A nested ordered list reads 1, a, i, in the editor and on the published
  page.
- The editor keeps the numbers of an ordered list in sequence while you
  write. One undo removes the edit and its new numbers.

### Changed

- Settings opens inside the workspace, with the sidebar in its place.

### Fixed

- A workspace that holds notes can be deleted again. Before, the delete
  failed with a server error.
- When this device cannot keep your work, the note and the sidebar state it
  and give the step that helps. Before, the sidebar still read that
  everything was saved.
- The server keeps running when the database ends an idle connection.
- A top level ordered item keeps its number on the same line as its text.

## 0.5.2 - 2026-09-23

This patch release shows when each note was saved again, on every device.

### Fixed

- The note list shows when each note was saved. Before, every note read "just
  now" on a device that had just downloaded the workspace.

## 0.5.1 - 2026-09-23

This patch release opens the local storage of an earlier version again, and
it keeps the work that waited there.

### Fixed

- A browser that ran version 0.4 or earlier opens its local storage again.
  Version 0.5.0 closed editing on such a browser with a storage error.
- The work that such a browser kept and did not send reaches the server. When
  the note changed on another device in the meantime, both texts stay. When
  both changed the same lines, Needs attention keeps your text.
- A note that another device makes shows its text on this device. Before, the
  note could read as empty.
- Two devices that write an older note at the same time no longer put its text
  in the note twice. The server now prepares every existing note once.
- A storage error states the cause and the step that helps, in words.

### Security

- Sign-out removes the text of every note from this device. Before, a copy of
  each note stayed in the local storage.

## 0.5.0 - 2026-09-23

This minor release keeps the work of every device. Two people who write the
same note at the same time now keep both texts, and the note you have open
takes the work of the other device while you write.

### Added

- **Both texts stay.** A save carries the work you did, not the whole note. A
  note that two devices wrote at the same time keeps the text of both, and
  History marks the version that joined them.
- The note you have open takes the work of another device as it arrives. Your
  place in the text stays where it is, and your own undo stays your own.
- A note that you edit after another device moved it to Trash comes back with
  your text.

### Changed

- A deletion never hides text that you have not read. Notesapp refuses it and
  states that the note holds newer work.

## 0.4.0 - 2026-09-22

This minor release makes an update safe for every open tab, and it tells you
when your server needs a newer version of Notesapp.

### Added

- Notesapp asks your server which sync version it serves, before it sends or
  reads anything. When your server needs a newer version, the sidebar states
  that saving waits, and a notice offers the update. Your work stays on this
  device until then.

### Changed

- Update now stores the text of every open tab and closes each of them, then
  starts the new version. A tab that cannot store its text stops the update,
  and every tab stays as it is.

## 0.3.7 - 2026-09-21

This patch release opens a link with one click, and it keeps a long list item
in line with its own text.

### Changed

- One click opens a link in a note. The pointer over a link states what the
  click does.
- A link that holds the cursor shows its Markdown source, so you can still
  change the words and the address. Move the cursor into a link with an arrow
  key, or select the text beside it.
- A web address that you write on its own in the text opens the same way. An
  address inside angle brackets opens as well.

### Fixed

- A list item that is longer than one line keeps each line in step with its
  own text. A checklist item no longer starts again under its box.

## 0.3.6 - 2026-09-21

This patch release brings the current icon to an installed application, and it
puts the task box and the controls of the top bar on their line.

### Fixed

- An installed application shows the current icon. A device that holds an older
  drawing gets the new one.
- A change to the typeface reaches the reader. The browser no longer keeps an
  old font file for a year.
- A task box sits on the line of its text. The box centres on the word beside
  it.
- The controls of the top bar line up with the page below. On a phone the
  drawer button and the account picture stand at the edge of the title.

## 0.3.5 - 2026-09-20

This patch release keeps the note safe when a second device writes it, and it
cleans the top and the bottom of the note screen.

### Fixed

- A note stays correct when a second device saves it. The open note reads the
  new version, and it does not put the old text back.
- A restore from History reaches this device at once. The note shows the
  restored version without a wait.
- The empty bar under the note header is gone. The space above the first line
  moves with the text.
- A line separates the note from the word count. The count no longer reads as
  a line of the note.

## 0.3.4 - 2026-09-20

This patch release adds a hard line break, moves the note name into the
breadcrumb, and repairs the caret, the scrollbar, and the relative time.

### Added

- Shift and Enter breaks a line inside one paragraph. The new line keeps the
  list item or the block quote that the caret sits in.

### Changed

- The note name is the last part of the breadcrumb. The note now starts with
  its text.
- The sidebar Search row is gone. The Search button in the header opens the
  same palette.
- History and Publish are rows of the note menu on a narrow screen.

### Fixed

- The caret stays in the note name while a person types. On a phone the
  keyboard stays open.
- The editor keeps the caret in view after a command. Enter, a heading, a
  list, an indent and a link all move the view with the caret.
- A dark page draws a dark scrollbar. The thumb takes its colour from the
  palette of the theme.
- A relative time follows the clock. The note list, Trash, History and the
  published links all state the time that passed.
- A note screen opens faster after the first visit. The browser starts the
  request for the page while the worker starts.
- A return to the window asks for one sync pass. Two returns close together
  cost one server conversation.

## 0.3.3 - 2026-09-19

This patch release simplifies the Trash delete flow and keeps the Publish
action quiet at rest.

### Changed

- Trash uses Delete for the remove action. The page states that Delete removes
  a note for good.
- A Delete row shows a tick to continue and a cross to keep the note. Clear
  all removes all notes in Trash through the same choice.
- The Publish action in the note header stays quiet at rest. It gains a fill
  only when a pointer or the keyboard reaches it.

## 0.3.2 - 2026-09-19

This patch release makes the live preview and the published page render the
same Markdown.

### Added

- Alert block quotes show their tone and title in the live preview and on a
  published page.

### Fixed

- An external picture over HTTPS loads when it reaches the screen. The request
  sends no referrer.
- A soft line break joins one paragraph. A hard line break stays on a new line.
- A table inside a list or a quote keeps its columns and indentation.
- A reference image resolves through its definition in the live preview.
- A Mermaid diagram can recover from a slow load or a render failure.
- Strikethrough needs two tildes. One tilde stays as text in every Markdown
  surface.

## 0.3.1 - 2026-09-18

This patch release corrects the note loader, the folder tree marks, and the
note name field. It also gives the product one neutral mark.

### Changed

- The install icon and the application mark use one neutral N with an
  underline. The application renders all installed icons from the one vector
  source.

### Fixed

- The note screen shows no text from another note. A loader result reaches the
  editor only when it names the open account, the open workspace, and the open
  note.
- The note name field no longer requests stored personal data. It tells the
  browser that the name is application content.
- The All notes row, a selected folder, and the open note no longer touch the
  marked row below them as one band. One spacing step now separates each pair.

## 0.3.0 - 2026-09-18

This release gives the interface one face, one accent, one edge and one recipe
for every control, so it reads as a finished product on every device. It
closes the seven interface rows of the 0.3.0 milestone. The fixed rows that
this milestone also lists shipped in 0.2.1 and 0.2.2 and are recorded there.

### Added

- **One typeface.** The application is set in Geist, with Geist Mono for code
  and keyboard hints. Both are served by the application itself, so the
  product looks the same on every device and makes no request to a third
  party.
- **A header that knows where you are.** The frame header shows the workspace,
  the folder and the open note as a breadcrumb, the actions of the open screen
  (History, Publish and a menu of the rest for a note), Search with its key
  hint, and your account. The wordmark now appears on the sign in screen only.
- **Key caps.** Every keyboard hint draws one cap for each key, with the
  Command, Shift and Option signs on an Apple device and Ctrl, Shift and Alt
  elsewhere.
- **A design guide and a design gate.** `docs/development/design.md` states the
  system every screen follows, and `pnpm lint` refuses a control that leaves
  it: an icon off the grid, a label in capitals, a dashed edge, an off scale
  size or radius, a colour class that names no token, a hand written control.

### Changed

- The default theme paints the one action of a screen in ink and keeps its
  blue for a link, the focus ring, the caret and the selection. The app mark
  and the avatars are monochrome. A screen has one primary button.
- The sidebar is a column of rows: the workspace switcher, Search, New note,
  the Folders label with its New folder action, the tree without guide lines
  or rings, and the footer rows with the sync state as a dot.
- Every button, row, field and keyboard hint reads one recipe, with one focus
  treatment. A field and a secondary button wear the soft divider as their
  edge. The dark component edge marks a checkbox, a task box and a drop
  target only.
- The note surface: muted list markers, a drawn task box, a quiet quote bar,
  a code block as one card, a link with a soft underline, a table with one
  rule, no active line fill, and no rules around the name or the word count.
  The heading ramp stops under the note name.
- The command palette gives every action the same icon as the sidebar and the
  menus. The account menu gives every row an icon.
- Empty states have no box. A notice takes a tone surface and a mark. Settings
  is a page of sections with a segmented appearance control. The undo bar of
  the trash is one toast primitive. The published page reads the same classes
  as the application.
- Icons are drawn at a stroke of 1.5 and render at 16 px in a control and
  20 px in an empty state. Six unused icons are gone.

### Removed

- **The browser test suite.** The Playwright journeys, their configuration and
  their CI job are retired. The gate is `pnpm verify`: the unit tests beside
  each module, the integration tests against a real database and server, the
  design gate, typecheck, lint, format and the build. See decision record 0066.

## 0.2.2 - 2026-09-18

This hotfix repairs the installed application update flow.

### Fixed

- Update now recognizes the sync lease of the current tab. It no longer says
  that another tab blocks the update when the current tab holds the lease.
- Update now stores the open draft and stops all sync work before it closes
  local storage.
- The page now waits for the new service worker to become active before it
  reloads. The update notice also follows a worker while it installs.

## 0.2.1 - 2026-09-18

This intermediate release separates notes into workspaces, gives the interface
clear depth, and fixes the main faults found after 0.2.0. It closes 10 rows of
the 0.2.1 milestone.

Before an existing installation starts this release, set
`NOTESAPP_DATABASE_DIR`, `NOTESAPP_STORAGE_DIR` and `NOTESAPP_SECRETS_DIR`.
These values no longer have defaults. Each value must point at the directory
that holds the installation data now. Do not point an upgrade at new empty
directories. The database migrations run in the application container, as
before.

### Added

- **Workspaces.** Keep personal notes and work notes in separate workspaces.
  The workspace control in the sidebar lets you switch, make, rename and
  delete a workspace. Search, Trash, History and published links each show the
  workspace that is open. An account always keeps one workspace, and a save
  continues to sync when you switch to another workspace.
- **A clear interface depth.** The application uses three surface planes,
  named elevation and motion, stronger dividers and one centred note column.
  The note name is the main heading of the note screen again.
- **A neutral default theme.** A new preference starts with the neutral
  Default family. A stored theme choice does not change.

### Changed

- The database, stored files and secrets must use host directories that the
  operator names. Compose stops with a clear message when one of the three
  directory values is missing. This keeps service-owned data outside the
  checkout and keeps repository commands able to read the checkout.
- A menu opens on the screen instead of inside the box that holds its trigger.
  A row menu can stay visible at the edge of a long folder tree.

### Fixed

- Renaming a saved note now creates a version, so the new name reaches the
  server and the other devices.
- A deep folder name keeps usable space, and a menu near the edge of the
  screen is no longer cut off.
- A table now follows the same centred measure as the other note content.
- A published page loads the style for mathematics and serves its font files
  with the correct type.
- An offline application no longer answers a published link with the private
  application screen.
- History tells a failed picture read apart from a version that has no
  picture.
- A failed server start closes the resources that it opened and gives the
  operator one message that names the settings to check.
- Database connection waits and an idle import body now stop after their
  bounds, so they do not hold a request without limit.
- Rows, empty states and note side regions now have names that assistive
  technology can tell apart.

### Security

- The page form and the unlock operation of one published link now share one
  attempt bucket, so changing the operation does not give more password
  attempts.

## 0.2.0 - 2026-09-16

This release opens the first path that serves a reader with no account, brings
tables and backlinks to the note surface, and puts the deployment behind an
optional TLS front. It closes 56 rows of the 0.2.0 milestone.

An installation that runs 0.1.0 or 0.1.1 must set two values before it starts.
See Changed below for `NOTESAPP_PORT` and for the origin list that replaces
`NOTESAPP_ALLOWED_HOSTS`. The server stops at startup with a message that names
each value, so no installation starts with a stale setting. The migrations run
in the application container, as before.

### Added

- **Published read-only links.** Publish a note or a folder and share one
  address. A link takes an optional password and an optional expiry, and you
  revoke it at any moment. Publish sits in the command palette and in the menu
  of a folder row, and Published links lists what the workspace publishes,
  beside Trash.
  The reader gets a sanitized page with no account, no cookie and no write.
- **Tables.** A table renders in the note surface and in Read mode, and the
  editor keeps its source editable.
- **Backlinks.** A note lists the notes that link to it. The list is derived on
  the device from the note bodies it already holds, so the link syntax stays a
  standard Markdown link.
- **Front matter.** A note keeps a YAML front matter block through a save and a
  render, so the stored Markdown stays portable.
- **An optional TLS front.** `docker compose --profile tls up -d` starts Caddy
  in front of the application. It answers `NOTESAPP_DOMAIN`, gets the
  certificate on its own, passes the original `Host` header, and adds the
  forwarded headers. A default `docker compose up` starts the application
  alone, as before.
- **A folder inside a folder.** New folder takes the folder you selected, the
  folder row offers New folder in this folder, the dialog states the parent it
  takes, and Enter creates the folder.
- **The sidebar width belongs to you.** The sidebar has four named widths and a
  collapsed state. A drag on its edge, the arrow keys on that edge,
  `Cmd or Ctrl + \`, the header button and a palette action all reach it.
- **A loading state.** A screen that waits shows the shape of what arrives,
  instead of a sentence.
- **A key hint that matches the platform.** A shortcut shows the key icon of
  the machine you use.

### Changed

- The command palette opens with `Cmd or Ctrl + P`, so `Cmd or Ctrl + K`
  inserts a link.
- The port that the server listens on is `NOTESAPP_PORT`, and it no longer
  follows the port of `NOTESAPP_ORIGIN`. The public address and the listening
  socket are two different things behind a proxy. An installation that names a
  port in its origin and no `NOTESAPP_PORT` stops at startup with a message
  that names the value to set. The Compose file and the image set it already.
- An installation now names the addresses it serves as full origins. Set
  `NOTESAPP_ORIGIN` to the one public origin, and name a second address in
  `NOTESAPP_ADDITIONAL_ORIGINS`, with its scheme and its port. The host list
  `NOTESAPP_ALLOWED_HOSTS` is gone: an installation that still sets it stops at
  startup with a message that names the two values to set.
- The shutdown is a drain. The server stops taking new requests, finishes the
  requests it holds, and then closes.
- `/health` and `/ready` are operations of the API contract, so the response
  check covers every address that an operator configures. Readiness reads the
  pool that the deployment already serves from, so a repeated probe opens no
  connection of its own.
- A task box stays a control while you edit its line, so you tick an item on
  the line you are writing.
- The open note selects its folder, and a note list that still loads cannot
  reset that choice.
- The note list refreshes in the background. A window focus no longer empties
  the tree and no longer puts a placeholder over it.
- A read surface tells an empty answer apart from a failed read, so an empty
  state never stands for a server that did not answer.
- The service worker stays out of the first load, it claims no client, and the
  build names its precache and the cache that holds it. It stands aside for a
  request it holds no answer for.
- Every log record goes through one module.
- A move and a deletion are each one operation of the local store, so a save
  from another device no longer reverts them.
- The browser gate runs in parallel workers, and each worker owns its whole
  stack.
- A type assertion is refused across the source. A value of an unknown shape
  reaches its type through a guard or a parser that fails loudly.

### Fixed

- Deleting the only child folder no longer removes its parent folder.
- A table no longer reads as raw text in the note surface.
- A save that the server refuses is no longer reported as an empty save queue
  in Settings.
- The backlinks panel names a failed read instead of reporting no inbound link.
- A revoked link leaves the list of the owner.
- A dialog no longer moves focus back to its opener in the middle of a
  keystroke, so a typed folder name lands in the field.
- A folder made from the menu of a closed row is on the screen at once.
- The caret mark of a line stops at the content box, so a heading shows no
  tall empty band over its own text.
- The tree marks the open note and the selected folder with two different
  marks, so a note under its own folder no longer reads as one band of colour.
- The note name and the note text share one left edge, and the gap between
  them is the gap of the scale.
- A block quote renders with a left bar, in the GitHub style.
- The active line stays clear inside a code block.
- The New folder icon has the body and the size of its neighbours.
- A missing asset answers 404, not the application shell.
- Firefox opens a note address directly and still loads the first lazy chunk.
- The welcome note is seeded on both first-account paths.
- The editor keeps the work that scales with the document off the keystroke
  path, and the diff worker carries no editor engine.
- The local store revalidates in bounded chunks, and the file list load is
  bounded.
- The first run of `pnpm lint` passes in a fresh checkout with no prior build.

### Security

- The setup routes and the authentication routes carry an attempt limit.
- One list decides which origins the installation serves. The cookie write
  check and the identity routes read that one list, and no scheme and no port
  is added to it, so the shipped defaults no longer trust an address that
  nobody named.
- One value decides whose forwarded headers the installation believes.
  `NOTESAPP_TRUSTED_PROXIES` names the proxies in front, it is empty by
  default, and the identity routes read the address that the server resolved
  instead of a header of the caller. A caller can no longer state an address of
  its own choice and pass the attempt limit of the sign-in screen.
- The first-run setup write checks the origin of the request.
- An attachment download states its disposition and its name, so no stored file
  renders in the browser as a document of this origin.
- An attachment upload has a per route timeout and a bounded idle body.
- A published link holds a hashed token. Its password goes through the hasher
  of the account path, its attempts are bounded, and the reader path refuses
  every write.
- A problem document of the reader path carries no secret address.
- The setup compensation is safe: a failed first account leaves no partial row.
- A migration run takes an advisory lock, so two containers cannot migrate at
  the same moment.

## 0.1.1 - 2026-09-15

A rebuild of the image on a new Node base image. The tag also carried the work
that was in progress toward 0.2.0, which the entry above records.

## 0.1.0 - 2026-09-13

The first public release. NotesApp is a self-hosted Markdown notes
application for one person. A large part of the change is removal: the
multi-user and remote-integration surface that no screen and no route reached
is gone.

There is no earlier release, so an upgrade note is not needed. Every
installation starts from an empty database.

### Added

- **Trash.** Deleting a note moves it to Trash. Trash lists the deleted notes
  with Restore and Delete permanently, and shows an undo notice after a
  delete. Delete permanently releases the attachment bytes that no live
  revision references.
- **Needs attention.** A save that the server refuses for good is kept on the
  device and listed on its own screen, reachable from the save state. Each
  row offers Retry, Save as new note, Copy text and Discard, and states the
  cause in one sentence.
- **Stale draft handling.** When the device holds unsaved text written over an
  older version of a note, the note screen states that and lets the person
  choose. Taking the latest version keeps the older text under Needs
  attention.
- **Superseded save notice.** When a save became the latest version because
  the note also changed elsewhere, the application says so and points at
  History, where the other text is kept.
- **Note size messages.** A note that is too large or too deeply nested to
  render is refused with a sentence the author can act on, instead of a
  server error.

### Changed

- The first `docker compose up` is safe with no edit beyond the origin. The
  listener is published on `127.0.0.1`, the allowed-host list holds the host
  of the origin only, `NOTESAPP_ORIGIN` is required and has no default, and
  both services rotate their container logs.
- Database migrations run in the application container entry point, with the
  migration role, before the server starts with the restricted runtime role.
  The separate one-shot migration service is gone.
- The database and the attachment store are host bind mounts, so the host
  encryption check and the backup and restore scripts name the same paths.
- The container health check sends the host name that the deployment serves.
- The image name is a Compose variable, so a version tag can replace `latest`.
- The Markdown package keeps two limits, the document size and the nesting
  depth, instead of thirteen.
- The API contract shares its repeated schemas and caches its validators, so
  the server starts faster.

### Removed

- The remote integration surface: the remote MCP server, the OAuth
  authorization server, agent tokens and the `mcp-stdio` app. Only the session
  cookie authenticates a request now. An MCP adapter returns in a later
  release.
- Public share pages and the `/s/` URL prefix.
- Wiki links `[[...]]` and backlinks. Link to another note with a standard
  Markdown link.
- Named checkpoints. A save creates one version; History lists them.
- Invitations, members, workspace roles and ownership transfer. There is one
  user and one workspace, and the workspace has no screen.
- Conflict branches, on the server and in the browser store. History stays one
  line.
- The purge, recovery and offline status screens. Their useful parts moved
  into Trash, Needs attention and Settings.
- The `/metrics` route and the write pause.

### Fixed

- A save whose parent moved is placed after the current head and reports the
  head it passed, so no save silently removes text its author never saw.
- A rebase across a deletion or a rename boundary is refused with
  `stale_head`, so a stale save cannot resurrect a deleted note.
- A stale delete no longer removes newer text. The note stays and the
  application says so.
- A purged note leaves the local cache, and a restore returns it.
- A stale delete draft no longer describes a restored note.
- The editor keeps its base version after the draft row is removed.
- Purge no longer removes an upload that is still in flight, and it now
  deletes the attachment bytes it should.
- The phone header no longer scrolls sideways.

### Security

- The unauthenticated `/metrics` route is removed.
- The consent-free OAuth authorize route is removed with the OAuth server.
- The default deployment no longer carries a private network address as its
  origin, no longer binds every interface, and no longer accepts any host
  name.
- `.dockerignore` keeps the secret, storage, database, report and document
  trees out of the build context.
