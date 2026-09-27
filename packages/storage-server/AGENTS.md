# packages/storage-server

Read the root [AGENTS.md](../../AGENTS.md) first. This file adds the rules of
this directory. The recipe for a whole feature is in
[docs/development/feature-workflow.md](../../docs/development/feature-workflow.md).

## Purpose

The PostgreSQL side: the schema, the migrations, the roles and row access
policies, the workspace store, the reader path of a published link, the
identity store, the attachment bytes, and provisioning.

## What lives here and what does not

- `src/schema.ts` is the schema, `migrations/` holds the applied SQL, and
  `migrations/meta/_journal.json` holds their order.
- `src/workspace-store/` implements `WorkspaceStore`: `transaction.ts` is the
  unit of work, `publication-transaction.ts` the read-only one of the reader
  path and `publication-unlock.ts` its one write (0031), one repository per
  context holds the SQL, `index.ts` is the composition root, and `admin.ts`,
  `identity-store.ts`, `profiles.ts`, `snapshots.ts`, `attachments.ts` and
  `attachment-row.ts` (0019) own the rest. `coordination.ts` holds what every
  server process shares: the attempt counters and the job locks (0121).
- `src/migrate.ts` runs the migrations and exports `requiredSchemaVersion`.
- No domain rule and no HTTP route live here. A rule lives in `packages/core`.

## The one lock order

Locks go installation, then workspaces by identifier, then accounts by
identifier (0112). A write and a new workspace take the account lock after the
workspace lock, in `notesapp_account_usage` and `notesapp_create_workspace`.
An installation transaction starts with the installation lock.

## Allowed imports

`@notesapp/core` and `@notesapp/markdown`, plus `drizzle-orm` and `pg`.
`@notesapp/markdown` is allowed because an accepted index update and a
published read both parse Markdown. This package is Node only. A browser
package cannot import it.

## How to add a common thing here

- **A port method.** Add the SQL in the repository of that context under
  `src/workspace-store/`, and answer the shape that its port declares.
- **A schema change.** Edit `src/schema.ts`, run `pnpm db:generate`, review the
  emitted file, add it as the next number in `migrations/`, and raise
  `requiredSchemaVersion` to the new journal entry count in the same change.
- **A SQL function.** Write it in the migration with its own membership check,
  `SECURITY DEFINER` only when it must be, and one narrow fact as its answer.
- **A published read.** Narrow the one scoped query of
  `publications-repository.ts`. A read of bytes takes the token digest.

## Testing conventions here

A pure module such as `excerpt.ts` or `publication-row.ts` has a `*.test.ts`
next to it and runs under `pnpm test:unit`. Everything that needs a database is
an integration test in `tests/integration/`, which makes one disposable database
per file against the service of `compose.test.yaml`; start it with
`tools/test-database/ensure-postgres.sh`. Such a test proves the row access rule
as well as the result: `row-access.test.ts` is the pattern.

## Forbidden here

- No write outside a transaction. One call to `transact` opens one transaction,
  sets the actor identity for that transaction only, and takes the workspace
  lock, so the commit ordered cursor cannot skip a late commit.
- No write and no `Actor` on the reader path. Its transaction is read only, it
  adopts the owner of the link that the token digest opened, and the SQL binds
  the scope (0030, 0031). Its one write is `publication-unlock.ts`, which
  answers no password digest to a route.
- No raw token and no raw ticket at rest. A digest column takes a SHA-256 in
  lower case hexadecimal and a check constraint refuses another shape.
- No SQL function that reaches workspace data without a membership check, or
  the digest of a secret on the reader path.
- No schema change without a migration file and a raised
  `requiredSchemaVersion`, and no edit of an applied migration.
- No superuser and no `BYPASSRLS` on the migration role, and no browser import.
- No `new pg.Pool` outside `src/pool.ts`. `openPool` keeps the error listener
  of an idle client and waits for every socket on `end()` (0090).

## Key files

| File                                 | Purpose                                    |
| ------------------------------------ | ------------------------------------------ |
| `src/index.ts`                       | The one public entry point                 |
| `src/workspace-store/index.ts`       | The store and its per-context repositories |
| `src/workspace-store/transaction.ts` | The transaction unit of work               |
| `src/migrate.ts`                     | Migration run and `requiredSchemaVersion`  |
| `src/pool.ts`                        | The one factory of a connection pool       |
| `migrations/0000_initial.sql`        | The base schema, roles, and policies       |
| `migrations/meta/_journal.json`      | The applied order and the version count    |
