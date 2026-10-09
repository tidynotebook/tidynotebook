# tidy notebook

tidy notebook is a self-hosted Markdown notes application for you and the people
you invite. Each account has its own notes. The file is the document: a note is a Markdown file with one `.md` suffix, in a folder
you choose. Typing writes a draft on your device. Save creates one immutable
version on your server.

**Status:** 0.18.1 is the current release. See
[CHANGELOG.md](CHANGELOG.md) for what changed and the
[GitHub project board](https://github.com/users/bkhanale/projects/2) for the
open work.

## Editions

tidy notebook has two editions. They run the same code.

- **tidy notebook self-hosted** is free. You run it on your own server from
  the image and the Compose file of this repository. It has every feature. It
  has no license key and no telemetry, and it sends no request to the owner.
  It is under the GNU Affero General Public License, version 3 only
  (AGPL-3.0-only). See [License](#license).
- **tidy notebook cloud** is the paid service of the owner at
  `app.tidynotebook.com`. It runs the public image of a public release with no
  change. A separate private service sells the plans, and it talks to the
  application over HTTP only.

## Features

- **Plain Markdown files.** Notes are organised in folders. Nothing is stored
  that cannot be exported as plain Markdown files.
- **One editing surface.** A live-preview Markdown editor keeps the source
  editable at every position. A Read mode shows the same note through the
  reference renderer. CommonMark and GFM, with tables, tasks, footnotes, math
  and Mermaid.
- **Explicit save.** Typing writes a local draft. Save creates one immutable
  version on the server. History lists the versions and restores any of them.
- **Works offline.** A queued save is sent when the connection returns. You
  see one linear history, and the application tells you when a later save
  superseded an earlier one.
- **Trash.** Deleting moves a note to Trash. Trash restores it or deletes it
  permanently.
- **Search.** Finds notes by name and content, ranked, with a highlighted
  excerpt.
- **Attachments.** Images are validated, deduplicated by digest, and stored
  outside the database.
- **One user.** First-run setup takes one email address and one password.
  There is no sharing and no invitation.
- **Published links.** Publish a note or a folder as one read-only address,
  with an optional password and an optional expiry. Revoke it at any moment.
- **One Compose file.** Safe defaults, health checks, encrypted backups and a
  tested restore.

## Quick start

The shortest path from a clone to the setup screen is in
[docs/guide/quickstart.md](docs/guide/quickstart.md). Read
[docs/guide/self-hosting.md](docs/guide/self-hosting.md) before you store data
you care about.

## Requirements

- Node.js 26.8.1
- pnpm 12.3.4
- Docker Engine and Docker Compose v2
- PostgreSQL 18 for a self-hosted installation

## Development

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

## API generation

The contract is `packages/api-contract/`. `openapi.yaml` is the root
document, and it lists one file for each path item and one file for each
component.

```bash
pnpm contract:lint
pnpm generate
pnpm generated:check
```

## Documentation

- [docs/guide/](docs/guide/README.md) is for the people who write notes and the
  people who run a server. The documentation site at
  [docs.bhu.sh/notesapp](https://docs.bhu.sh/notesapp/) publishes it with a
  search, and an agent reads its
  [llms.txt](https://docs.bhu.sh/notesapp/llms.txt).
- [docs/development/](docs/development/architecture.md) is for contributors.
- [docs/README.md](docs/README.md) states what each documentation directory
  holds and how to write a document of that kind.

[CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and
[CHANGELOG.md](CHANGELOG.md) stay at the root.

## License

tidy notebook is available under the
[GNU Affero General Public License, version 3 only](LICENSE)
(AGPL-3.0-only). You can use, change and share it. When you run a changed copy
as a service for other people, you must offer them the source of your copy.

A contribution comes in under the same license, with a sign-off on each
commit and no contributor license agreement. See
[CONTRIBUTING.md](CONTRIBUTING.md#license-and-sign-off).
