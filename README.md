# tidy notebook

tidy notebook is an open source Markdown notes application. Write notes,
organize them in folders, and keep them on a server that you control.
You can invite other people. Each account has its own notes.

[Product website](https://tidynotebook.com) · [User guide](https://docs.tidynotebook.com) · [Releases](https://github.com/tidynotebook/tidynotebook/releases)

![The tidy notebook editor in light mode, with note folders, a travel checklist, and a table.](docs/assets/editor-light.png)

## Features

- **Write in Markdown.** Edit the source and see formatted text in one editor.
  Use tables, task lists, footnotes, math, and Mermaid diagrams.
- **Organize and find notes.** Keep notes in folders and separate workspaces.
  Search by name and content.
- **Keep your history.** Save versions to the server and restore an earlier
  version. Restore notes from Trash.
- **Work offline.** Open and edit notes on your device. The application sends
  queued saves when the connection returns.
- **Take your notes with you.** Export a workspace as ordinary Markdown files
  with its folders and images.
- **Share published links.** Publish a note or folder at a read-only address.
  Set an optional password or expiry, and revoke access when needed.

## Get started

- **Try it locally:** follow the [quick start](docs/guide/quickstart.md) to run
  a test installation with Docker Compose.
- **Run your own server:** follow [self-hosting](docs/guide/self-hosting.md)
  before you store data that you need to keep. The guide covers requirements,
  installation, and HTTPS. Then set up [backup and restore](docs/guide/backup-and-restore.md).
- **Use the hosted service:** tidy notebook cloud is the paid service of the
  owner. Follow [Getting started](docs/guide/getting-started.md) to sign up or
  join an existing installation.

The self-hosted edition is free and has every feature. It needs no license key
and has no telemetry. Both editions run the same code.

Use [Published images](docs/guide/published-images.md) to select a release
image and [Upgrade](docs/guide/upgrade.md) to update an installation.

## Documentation

The [user guide](docs/guide/README.md) covers writing notes and running a server.
Start with these pages:

- [Getting started](docs/guide/getting-started.md) to write your first note.
- [Markdown](docs/guide/markdown.md) for editor features and supported syntax.
- [Saving and history](docs/guide/saving-and-history.md) and
  [Working offline](docs/guide/offline.md) to understand how your work is saved.
- [Security model](docs/guide/security-model.md) to understand what the
  application protects and what the server operator can see.

For release changes, see the [Releases](https://github.com/tidynotebook/tidynotebook/releases)
and [changelog](CHANGELOG.md).

## Contribute and get help

Use [GitHub issues](https://github.com/tidynotebook/tidynotebook/issues) to
report a bug or propose a feature. Read the user guide for help with use and
installation.

To contribute code or documentation, start with [Contributing](CONTRIBUTING.md).
It links to the development process and gives the setup and review steps.
See [Architecture](docs/development/architecture.md) for the code design and
[Documentation](docs/README.md) for the documentation rules.
Follow the [Code of conduct](CODE_OF_CONDUCT.md) in project spaces.

Report security problems privately. Follow the [security policy](SECURITY.md).

## License

tidy notebook uses the
[GNU Affero General Public License, version 3 only](LICENSE) (AGPL-3.0-only).
Contributions use the same license. There is no contributor license agreement
or required commit sign-off. See [Contributing](CONTRIBUTING.md#license).
