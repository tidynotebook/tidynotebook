# packages/core

Read the root [AGENTS.md](../../AGENTS.md) first. This file adds the rules of
this directory. The recipe for a whole feature is in
[docs/development/feature-workflow.md](../../docs/development/feature-workflow.md).

## Purpose

The domain rules that both runtimes share: paths, the revision graph,
changesets and commits, history, trash, snapshots, search, published links,
the role and action matrix, and the storage ports that a runtime implements.

## What lives here and what does not

- `src/files/` holds the path rules, the digest rules, the revision graph,
  the changeset builders, `commit.ts`, the rules of a notice stream in
  `notices.ts` (0129), and the storage ports.
- `src/identity/` holds the actor, the workspace role and action matrix, and
  the UUID helper. `installation.ts` holds the second matrix, the one of the
  installation role, and the two never read each other (0109).
  `administration.ts` and `registration.ts` hold the use cases of accounts,
  invitations and the one registration path, over the ports of `ports.ts`
  (0108 to 0112). `installation-settings.ts` holds the rules of the mail
  settings and the legal documents that an administrator sets, and
  `legal-templates.ts` the templates of both documents (0148). `src/history/`, `src/search/`, `src/workspaces/`, and
  `src/publications/` hold their own use cases and ports. The publication port
  declares read methods only, and no use case of it takes an `Actor`.
- `src/daily-notes/` holds the day arithmetic, the name format, the path of
  the note of a date and the settings of a member (0099, 0101). `src/files/permit.ts` is the one read check of a use case.
- `src/index.ts` is the only public entry. A name that is not exported there
  is internal. The verified actor marker stays internal, so an actor can be
  built only through `verifyActor`.
- No transport, no SQL, no IndexedDB, no React, and no file system access.
  An implementation of a port lives in `packages/storage-server` or in
  `packages/storage-browser`.

## Allowed imports

Nothing. This package declares no workspace dependency and no runtime
dependency. It imports only its own relative files.

## How to add a common thing here

- **A use case.** Add `src/<area>/<name>.ts` with a pure function that takes
  its data and a port, and returns `Result` through `ok` or `fail`. Export it
  from `src/index.ts`.
- **A stored read or write.** Add the method to the port interface in
  `src/files/ports.ts` or `src/workspaces/ports.ts`, then implement it in
  `packages/storage-server`. The port is an interface only.
- **A limit or a default.** Export a named constant, for example
  `maxPageSize` or `defaultSearchLimit`, so the server and the browser read
  one value.

## Testing conventions here

`node --test` through `pnpm test:unit`, with `node:test` and
`node:assert/strict`. A test file is `src/<area>/<name>.test.ts`. A test
builds a small in memory fake of the port and drives the use case through it.
Every test must prove both the accepted path and the refusal, with the exact
`DomainErrorCode`.

## Forbidden here

- No Node built in module in production code. Only a `*.test.ts` file may
  import `node:test` and `node:assert/strict`.
- No transport: no `fetch`, no `XMLHttpRequest`, no HTTP library.
- No React, no `fastify`, no `drizzle-orm`, no `pg`, no `dexie`.
- No DOM global: no `document`, `window`, `navigator`, `location`,
  `localStorage`, `indexedDB`, `caches`, or `Worker`. `.oxlintrc.json`
  refuses each one by name.
- No dependency on any other workspace package, including
  `@notesapp/api-client`.
- No thrown error for an expected refusal. Return `fail(code)`. Throw only
  `OperationalError` for an infrastructure failure.

`tools/check-boundaries.mjs` fails `pnpm lint` on each import rule above.

## Key files

| File                           | Purpose                                     |
| ------------------------------ | ------------------------------------------- |
| `src/index.ts`                 | The one public entry point                  |
| `src/files/ports.ts`           | `WorkspaceStore` and `WorkspaceTransaction` |
| `src/files/model.ts`           | `Result`, `DomainError`, `ok`, `fail`       |
| `src/files/commit.ts`          | Changeset commit and rebase rules           |
| `src/files/path.ts`            | Note path rules and the one `.md` suffix    |
| `src/identity/actor.ts`        | Roles, actions, and `verifyActor`           |
| `src/identity/installation.ts` | The installation role and action matrix     |
| `src/publications/errors.ts`   | The one refusal of the reader path          |
