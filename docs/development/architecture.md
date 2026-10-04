# Architecture

tidy notebook is a self-hosted Markdown notes application for one person. A note is
a Markdown file with one `.md` suffix. Typing writes a draft on the device.
Save creates one immutable version on the server. Nothing is stored that cannot
be exported as plain Markdown files.

This is the one current picture of the system. Each section links to the
detailed page instead of repeating it.

## Apps and packages

| Path                       | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `apps/web`                 | React web application, router, service worker, note screens   |
| `apps/server`              | Fastify HTTP adapter, authentication, static delivery, jobs   |
| `packages/core`            | Domain rules: files, revision graph, history, search, actors  |
| `packages/api-contract`    | OpenAPI source contract, operation index, request validators  |
| `packages/api-client`      | Generated typed client and its one handwritten configuration  |
| `packages/markdown`        | remark parse and render, sanitizer, URL policy, parse limits  |
| `packages/editor`          | CodeMirror editor, live preview, widgets, commands, diff      |
| `packages/storage-browser` | Dexie schema and IndexedDB transactions                       |
| `packages/storage-server`  | PostgreSQL stores, migrations, attachment bytes, provisioning |
| `packages/sync`            | Save queue, lease, snapshot download, local search            |
| `packages/ui`              | Shared controls, icons, and the runtime theme                 |
| `tools/sdk-codegen`        | Contract lint and client generation                           |

`apps/server` serves the built web application, the REST API, and the
authentication routes on one origin. There is no second service. See
[decision 0012](../decisions/0012-package-layout-stays-for-v0-1.md) and
[decision 0013](../decisions/0013-delivery-and-headers-belong-to-the-app.md).

## The save model

Four records hold the text, and they stay separate.

| Record         | Where                 | Meaning                                 |
| -------------- | --------------------- | --------------------------------------- |
| Draft          | IndexedDB, mutable    | The text on this device right now       |
| Local version  | IndexedDB, immutable  | What the person selected Save on        |
| Queue entry    | IndexedDB             | One save that waits to reach the server |
| Server version | PostgreSQL, immutable | The accepted history of the note        |

Typing never creates a version. Save never needs a connection. The sync engine
sends queue entries in local order with a frozen body and digest, so a retry
repeats the same mutation. See
[decision 0007](../decisions/0007-keep-the-save-model.md),
[Local drafts and explicit saves](local-storage.md), and
[Files, revisions, and atomic changes](files-and-revisions.md).

A save states the head that its author saw. When that head moved, the server
rebases the save onto the current head and reports it as superseded rather than
opening a conflict screen, and it refuses only a rebase that would cross a
deletion boundary. History stays one line. The full rule set is in
[Files, revisions, and atomic changes](files-and-revisions.md).

Delete moves a note to Trash, and Trash offers Restore and Delete permanently.
The permanent delete also releases the attachment bytes that no live revision
references. See [decision 0006](../decisions/0006-trash-replaces-purge.md).

The note saves itself and makes a version on a natural boundary, and the
sidebar footer states the queue (`apps/web/src/lib/sync-state.ts`). A save
refused for good is parked, is not sent again, and waits in "Needs attention". See
[decision 0022](../decisions/0022-autosave-and-automatic-versions.md). A save
that joined work the device had not seen keeps its checkpoint for Review. See
[decision 0087](../decisions/0087-review-keeps-the-checkpoint-that-caused-it.md).

## Boundaries

`tools/check-boundaries.mjs` runs inside `pnpm lint` and fails the build. It
parses every source file and enforces these rules. The detail and the exemption
policy are in [Toolchain](toolchain.md).

- **Dependency direction.** Each package declares which workspace packages it
  may use, and the graph is acyclic. `core` may use nothing, so a domain rule
  cannot reach transport, database, browser, or React code.
- **Browser safety.** A package that runs in the browser cannot import a Node
  built-in module, a Node-only package, or a server-only package. The rule is
  transitive, and a failure names the chain.
- **One public entry.** Every package exposes only its root export. A deep
  import and a subpath alias both fail.
- **Generated transport only.** Every HTTP transport name and every HTTP
  library is refused outside the generated client. Feature code calls a
  generated operation.
- **Declared dependencies.** An import of a package the manifest does not
  declare fails, and a type-only import may resolve through a declaration
  package.
- **Test placement.** A test file lives in a package `src` tree or in the
  repository-root `tests` tree, because no command discovers it anywhere else.
  Production source cannot import a test file.

## Target structure

The structure inside an application and a package is decided, and it is not yet
what the tree holds.
[Decision 0018](../decisions/0018-directory-structure-by-layer.md) states the
ports and adapters layout that new code follows: cross-cutting plugins and
resource routes in the server, one directory per context in `core`, one
repository per context behind the transaction object, and one folder per
feature on the web side.
[Decision 0019](../decisions/0019-contract-validation-and-shared-types.md)
states that the contract stays the one shared schema, that its source splits
into files that Redocly bundles, and that a type assertion gives way to a type
guard or a parser. The move is one epic on the
[GitHub project board](https://github.com/users/bkhanale/projects/2), and until
it closes the two records decide where new code goes.
[Decision 0020](../decisions/0020-central-logging-through-one-module.md) adds
`packages/logging`, which owns the shape of every log record and keeps the
transport in a sink adapter.

## Data storage

PostgreSQL holds the accepted state: files, the revision graph, attachment
metadata, the search index, and identity. Row level security restricts every
row to its workspace, and the runtime role has no migration rights. Attachment
bytes live in the object store of record 0192, content addressed by digest.

The container entry point applies the migrations with the migration role before
the server starts with the restricted runtime role, so a container that serves
without its migrations never reports ready. See [Database](database.md),
[Accounts and identity](identity.md), and
[Self-hosting](../guide/self-hosting.md).

The browser holds working state in IndexedDB through Dexie: drafts, local
versions, the queue, the recovery area, and the offline snapshot. Local browser
data is a working copy, not a backup.

## One Markdown grammar

`packages/markdown` is the only definition of the language, and
`packages/editor` decorates the same syntax tree that CodeMirror already
parses. There is no second scanner and no second grammar, and one corpus is
rendered through both paths in a test that requires the two results to agree on
structure. See [Markdown](markdown.md).

## Contract and generation

`packages/api-contract/` is the source. `pnpm generate` writes the
typed client and the contract index, and `pnpm generated:check` fails when the
committed output does not match the contract. Every request and response is
validated against the contract at the HTTP boundary. See
[Adding an API operation](api-contract.md) and [HTTP API access](api.md).

## Verification

`pnpm verify` is the whole gate. A pure module proves what a person sees, and
an integration test reads the built or served result. See
[Verification](verification.md) and
[decision 0066](../decisions/0066-the-browser-suite-is-retired.md).
