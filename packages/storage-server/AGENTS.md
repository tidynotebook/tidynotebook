# packages/storage-server

Read the root [AGENTS.md](../../AGENTS.md) first. This file adds the rules of
this directory. The recipe for a whole feature is in
[docs/development/feature-workflow.md](../../docs/development/feature-workflow.md).

## Purpose

The PostgreSQL side: the schema, the migrations, the roles and row access
policies, the workspace store, the reader path of a published link, the
identity store, the attachment bytes, and provisioning.

## What lives here and what does not

- `src/schema.ts` is the schema, `migrations/` the SQL, `meta/` the order.
- `src/workspace-store/` implements `WorkspaceStore`: `transaction.ts` is the
  unit of work, `publication-transaction.ts` the read-only one of the reader
  path and `publication-unlock.ts` its one write (0031), one repository per
  context holds the SQL, `index.ts` is the composition root, and `admin.ts`,
  `identity-store.ts`, `profiles.ts`, `snapshots.ts`, `attachments.ts`,
  `attachment-row.ts` (0019), `installation-settings-row.ts` (0148) and
  `account-controls-row.ts` (0189) own the rest. `coordination.ts` holds what
  every process shares (0121, 0129), `sync-listener.ts` and `sync-hints.ts`
  the hints (0125, 0144).
- `src/migrate.ts` runs the migrations and exports `requiredSchemaVersion`.
  `src/search-text.ts` writes the text of a search row and `searchTextRule`;
  a raised rule makes `src/search-index-migration.ts` redo each row (0167).
  No domain rule and no HTTP route live here. A rule lives in `packages/core`.

## The one lock order

Locks go installation, workspaces by identifier, accounts by identifier
(0112), then the account events (0190). A write and a new workspace take the
account lock after the workspace lock, in `notesapp_account_usage` and
`notesapp_create_workspace`.

## Allowed imports

`@notesapp/core` and `@notesapp/markdown`, plus `drizzle-orm` and `pg`. An
index update, the search text and a published read parse Markdown. This
package is Node only, so a browser package cannot import it.

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

A pure module such as `excerpt.ts` has a `*.test.ts` beside it. A test that
needs a database lives in `tests/integration/`, one disposable database per
file on the service of `tools/test-database/ensure-postgres.sh`, and it proves
the row access rule too, as `row-access.test.ts` does.

## Forbidden here

- No write outside a transaction. One call to `transact` opens one transaction,
  sets the actor identity for that transaction only, and takes the workspace
  lock, so the commit ordered cursor cannot skip a late commit.
- No write and no `Actor` on the reader path. Its transaction is read only, it
  adopts the owner of the link that the token digest opened, and the SQL binds
  the scope (0030, 0031). Its one write is `publication-unlock.ts`, which
  answers no password digest to a route.
- No raw token, ticket or handoff at rest. A digest column takes a SHA-256 in
  lower case hexadecimal and a check constraint refuses another shape.
- No SQL function that reaches workspace data without a membership check, or
  the digest of a secret on the reader path.
- No schema change without a migration and a raised `requiredSchemaVersion`.
  No edit of an applied migration.
- No superuser and no `BYPASSRLS` on the migration role, and no browser import.
- No `new pg.Pool` outside `src/pool.ts`, which keeps the idle error listener
  and waits for every socket on `end()` (0090).

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
