# tidy notebook

tidy notebook is a self-hosted notes application. You write notes in Markdown,
you keep them in folders, and you store them on a server that you control. You
can invite other people. Each account has its own notes.

A note is a plain Markdown file. You can take every note out as Markdown files
at any time.

**Status:** 0.18.1 is the current release. See
[CHANGELOG.md](CHANGELOG.md) for what changed and the
[GitHub project board](https://github.com/users/bkhanale/projects/2) for the
open work.

## Where to go

- **Try it on your machine:** follow the
  [quick start](docs/guide/quickstart.md). One script prepares a test
  installation, and Docker Compose starts it.
- **Install it on a server:** follow
  [self-hosting](docs/guide/self-hosting.md) before you store data that you care
  about.
- **Learn to use it:** read the [guide](docs/guide/README.md).
- **Change the code:** read [CONTRIBUTING.md](CONTRIBUTING.md).
- **Report a security problem:** read [SECURITY.md](SECURITY.md).

## Editions

tidy notebook has two editions. They run the same code.

- **tidy notebook self-hosted** is free. You run it on your own server from the
  image and the Compose file of this repository. It has every feature. It has no
  license key and no telemetry, and it sends no request to the owner. It is
  under the GNU Affero General Public License, version 3 only (AGPL-3.0-only).
  See [License](#license).
- **tidy notebook cloud** is the paid service of the owner at
  `app.tidynotebook.com`. It runs the public image of a public release with no
  change. A separate private service sells the plans, and it talks to the
  application over HTTP only.

## Features

- **Plain Markdown files.** Notes live in folders. Nothing is stored that you
  cannot export as plain Markdown files.
- **One editor.** A live-preview Markdown editor keeps the source editable at
  every position, and shows the note formatted everywhere else. It supports
  CommonMark and GFM, with tables, tasks, footnotes, math and Mermaid.
- **Versions on the server.** Typing writes a draft on your device. A pause in
  typing, leaving the note, or Ctrl + S makes one version on the server. History lists the versions and restores any of them.
- **Works offline.** The application sends a queued save when the connection
  returns. You see one linear history, and the application tells you when a
  later save replaced an earlier one.
- **Trash.** Moving a note to Trash keeps it. Trash restores it, or deletes it
  for good.
- **Search.** Finds notes by name and content, ranked, with a highlighted
  excerpt.
- **Attachments.** The server checks each image, stores one copy of equal
  images, and keeps them outside the database.
- **Separate accounts.** Setup creates the first administrator. An administrator
  can invite other people.
- **Published links.** Publish a note or a folder as one read-only address, with
  an optional password and an optional expiry. Revoke it at any moment.
- **One Compose file.** Safe defaults, health checks, encrypted backups and a
  tested restore.

## Requirements

- Node.js 26.10.0
- pnpm 12.3.4
- Docker Engine and Docker Compose v2
- PostgreSQL 18 for a self-hosted installation

To run a server you need Docker and Docker Compose. You need Node.js and pnpm
to change the code.

## Development

These three commands install the dependencies, start a test database, and run
every check:

```bash
pnpm install --frozen-lockfile
tools/test-database/ensure-postgres.sh
pnpm verify
```

[CONTRIBUTING.md](CONTRIBUTING.md) has the complete setup path, the command
list, the branch workflow and the commit style.

## Repository layout

| Path                       | Purpose                                              |
| -------------------------- | ---------------------------------------------------- |
| `apps/web`                 | React web application and PWA                        |
| `apps/server`              | Fastify API, authentication, and static delivery     |
| `apps/docs`                | The static documentation site of the guide           |
| `packages/api-contract`    | OpenAPI source contract and request validators       |
| `packages/api-client`      | Generated typed client                               |
| `packages/core`            | Domain rules, revision graph, and version validation |
| `packages/editor`          | CodeMirror editor and live preview                   |
| `packages/markdown`        | Safe CommonMark and GFM rendering                    |
| `packages/storage-browser` | IndexedDB persistence                                |
| `packages/storage-server`  | PostgreSQL stores, migrations, and files             |
| `packages/sync`            | Save queue, lease, and synchronization               |
| `packages/ui`              | Shared interface components, icons, and theme        |
| `docker`                   | Container entry point and health check               |
| `docs`                     | Guide, development, decision, and audit documents    |
| `tests`                    | Integration tests over a real database and server    |
| `tools`                    | Checkers, code generation, and operator scripts      |

## Documentation

- [docs/guide/](docs/guide/README.md) is for the people who write notes and the
  people who run a server. The documentation site at
  [docs.bhu.sh/notesapp](https://docs.bhu.sh/notesapp/) publishes it with a
  search, and an agent reads its
  [llms.txt](https://docs.bhu.sh/notesapp/llms.txt).
- [docs/development/](docs/development/architecture.md) is for contributors.
- [docs/README.md](docs/README.md) states what each documentation directory
  holds and how to write a document of that kind.

[CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md),
[SECURITY.md](SECURITY.md) and [CHANGELOG.md](CHANGELOG.md) stay at the root.

## License

tidy notebook is available under the
[GNU Affero General Public License, version 3 only](LICENSE) (AGPL-3.0-only).
You can use, change and share it. When you run a changed copy as a service for
other people, you must offer them the source of your copy.

A contribution comes in under the same license, with a sign-off on each commit
and no contributor license agreement. See
[CONTRIBUTING.md](CONTRIBUTING.md#license-and-sign-off).
