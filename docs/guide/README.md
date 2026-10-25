# tidy notebook guide

This page is for anyone who uses tidy notebook or runs it on their own server.
Pick the group that fits your task.

Use tidy notebook cloud, or run tidy notebook on your own server. Start with
[Getting started](getting-started.md) to choose your path and save a first note.

tidy notebook is a Markdown notes application. Each account has its own notes.
Write in Markdown and organize notes in folders. Export your notes as ordinary Markdown files. Live
notes and history are stored in PostgreSQL. Images use local or object storage.
When you type, the application writes a draft on your device. A pause in typing
or a manual save queues a version, and synchronization sends it to your server.
History keeps each version.

## Writing notes

For the person who writes the notes.

- [Getting started](getting-started.md) - sign in and write your first note.
- [Joining an installation](joining.md) - accept an invitation, or leave an
  installation.
- [Notes and folders](notes-and-folders.md) - create, rename, move, and find
  notes.
- [Workspaces](workspaces.md) - keep personal notes and work notes apart.
- [Markdown](markdown.md) - the Markdown that the editor understands, and how
  the editor shows it while you type.
- [Saving and history](saving-and-history.md) - save a version, and bring an
  older version back.
- [Working offline](offline.md) - what you can do with no connection.
- [Daily notes](daily-notes.md) - one note for each day, with a template and a
  calendar in the sidebar.
- [Templates](templates.md) - copy a template note into another note, with the
  date and the time filled in.
- [Trash](trash.md) - bring back a note that you moved to Trash, or delete it
  for good.
- [Published links](published-links.md) - show one note or one folder to a
  person who has no account.
- [Appearance and shortcuts](appearance-and-shortcuts.md) - themes, light and
  dark, and the keyboard.
- [Your own theme](custom-themes.md) - import a theme file with your own
  colours.
- [Spelling](spelling.md) - use the spell check, or turn it off.
- [Export](export.md) - take every note out as plain Markdown files.
- [API keys and programs](api.md) - connect a program to your account.
- [Connect an AI assistant](mcp.md) - choose its access to your notes, and end
  that access.
- [Settings](settings.md) - each section of the Settings page, and where each
  choice is kept.

## Hosting a server

For the person who runs the server. If you are new, do the pages in this order.

- [Quick start](quickstart.md) - set up a local test installation.
- [Self-hosting](self-hosting.md) - install a server for real use, step by
  step.
- [Server operations](operations.md) - set up a reverse proxy, mail, open
  sign-up and object storage, and run the server day to day.
- [Published images](published-images.md) - choose an official image by its
  fixed digest.
- [Configuration reference](configuration.md) - look up a setting by name.
- [Backup and restore](backup-and-restore.md) - make encrypted backups, and
  test that you can restore them.
- [Upgrade](upgrade.md) - move to a new build, and go back if it fails.
- [Accounts and invitations](accounts.md) - invite people and manage their
  accounts as an administrator.
- [Security model](security-model.md) - what the operator can see, and what
  the product does not protect against.

To report a security problem, read [SECURITY.md](../../SECURITY.md).
