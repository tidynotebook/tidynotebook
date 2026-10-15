# packages/storage-server

## Purpose

The PostgreSQL schema, migrations, stores, row access rules and provisioning.

## What lives here and what does not

- `src/schema.ts` is the schema, `migrations/` the SQL, `meta/` the order.
- `src/workspace-store/` implements `WorkspaceStore`: `transaction.ts` is the unit of work,
  `publication-transaction.ts` the read-only one of the reader path and `publication-unlock.ts`
  its one write (0031), one repository per context holds the SQL, `index.ts` is the composition
  root, and `admin.ts`, `identity-store.ts`, `profiles.ts`, `snapshots.ts`, `attachments.ts`,
  `attachment-row.ts` (0019), `installation-settings-row.ts` (0148) and `account-controls-row.ts`
  (0189) own the rest. `coordination.ts` holds what every process shares (0121, 0129) with the counts of a month and `usage-rows.ts` (0193), and `sync-listener.ts` and `sync-hints.ts` the hints (0125, 0144).
- `src/object-store/` holds the port of each byte that outlives a request, its
  two adapters, the keys of `keys.ts`, the cleanup of `staging/` (0192), and `calls.ts`, the kind of each S3 call that 0193 counts.
- `src/oauth-store.ts` holds OAuth request transactions, expiry and the narrow
  token resolver (0226). The identity role owns the OAuth tables.
  `identity-store.ts` exposes it through its existing runtime pool for MCP (0225).
- `src/migrate.ts` runs the migrations and exports `requiredSchemaVersion`.
  `src/search-text.ts` writes the text of a search row and `searchTextRule`;
  a raised rule makes `src/search-index-migration.ts` redo each row (0167).

## The one lock order

Locks go installation, workspaces by identifier, accounts by identifier
(0112), then the account events (0190). A write and a new workspace take the
account lock after the workspace lock, in `notesapp_account_usage` and
`notesapp_create_workspace`.

OAuth writes take the account lock, then the client and account pair lock.
Token and revocation requests never take the installation lock (0226).

## Allowed imports

`@notesapp/core` and `@notesapp/markdown`, plus `drizzle-orm`, `pg`, and `@aws-sdk/client-s3`
in `src/object-store/s3-store.ts` only. Markdown reads stay in this Node package.

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

A pure module such as `excerpt.ts` or `search-text.ts` has a `*.test.ts` next to it under
`pnpm test:unit`. Everything that needs a database is an integration test in
`tests/integration/`, with one disposable database per file against the service that
`tools/test-database/ensure-postgres.sh` starts. Such a test proves the row access rule as
well: `row-access.test.ts` is the pattern, and `object-store.test.ts` holds both adapters.

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
  No edit of an applied migration. No superuser or `BYPASSRLS` on its role.
- No `new pg.Pool` outside `src/pool.ts`, which keeps the idle error listener
  and waits for every socket on `end()` (0090).

## Key files

| File                                 | Purpose                                          |
| ------------------------------------ | ------------------------------------------------ |
| `src/index.ts`                       | The one public entry point                       |
| `src/workspace-store/index.ts`       | The store and its per-context repositories       |
| `src/workspace-store/transaction.ts` | The transaction unit of work                     |
| `src/migrate.ts`                     | Migration run and `requiredSchemaVersion`        |
| `src/profiles.ts`                    | The profile guards and the deploy secrets (0207) |
| `src/oauth-store.ts`                 | OAuth transactions and the narrow token resolver |
| `src/connected-app-row.ts`           | Public grant metadata without credentials (0226) |
| `src/identity-store.ts`              | Account ports and narrow grant functions (0226)  |
| `src/api-key-row.ts`                 | Public key metadata without secrets (0208)       |
| `src/pool.ts`                        | The one factory of a connection pool             |
| `src/object-store/port.ts`           | The port of every byte that outlives one request |
| `migrations/0000_initial.sql`        | The base schema, roles, and policies             |
| `migrations/meta/_journal.json`      | The applied order and the version count          |
