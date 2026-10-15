# Developing a feature

This page is the order of work for one whole feature, from the contract to the
merge. Each step names the directory that owns it, and each of those
directories has an `AGENTS.md` with its own rules. **Read the `AGENTS.md` of a
directory before you edit under it.**

This page covers one feature. Work that is larger than one feature starts
earlier, with a design, then the decision records, then a plan. See
[the lifecycle of a large task](../README.md).

An architectural choice needs a decision record first. See
[the decision records](../decisions/README.md).

## Where does this go

| Feature kind                            | Package                    |
| --------------------------------------- | -------------------------- |
| A new or changed HTTP operation         | `packages/api-contract/`   |
| A domain rule, a limit, a storage port  | `packages/core`            |
| A PostgreSQL table, query, or migration | `packages/storage-server`  |
| A route handler, headers, static files  | `apps/server`              |
| An IndexedDB table or transaction       | `packages/storage-browser` |
| A queue, lease, or offline rule         | `packages/sync`            |
| A screen, a route, a React feature      | `apps/web/src/features`    |
| A shared control, layout, icon, theme   | `packages/ui`              |
| Markdown syntax, sanitizing, URL policy | `packages/markdown`        |
| Editor decoration, widget, command      | `packages/editor`          |
| The generator or the contract check     | `tools/sdk-codegen`        |
| A real database or a served result test | `tests`                    |
| A guide page or the documentation site  | `docs/guide`, `apps/docs`  |

## a. The contract first

Write the operation in `packages/api-contract/` before any code that uses it,
then run `pnpm contract:lint` and `pnpm generate` and commit the generated
output with the contract. The contract source is a root document beside one
file for each path item and one file for each component, so a new operation
adds a file under `paths/` and one row in the root `paths` list. Never edit a file under a `src/generated/`
directory. The rules that generation enforces are in
[Adding an API operation](api-contract.md).

## b. The domain rule in `packages/core`

`packages/core` holds the rules that both runtimes share. It imports no
workspace package, no Node built-in module, no database driver, no HTTP
framework, and no React.

1. Add the use case as a pure function under the directory of its area.
2. When the use case needs stored data, add the method to the port of that
   area. The port is an interface, and `packages/core` never implements it.
3. Export the new names from the package entry.
4. Add the adjacent test. A unit test proves the rule, including the refusal.

## c. The storage in `packages/storage-server`

1. Implement the port method in the store that owns the area. Every write runs
   inside `transact`, which opens one transaction, sets the actor identity for
   that transaction only, and takes the workspace advisory lock. A SQL function
   that reads or writes workspace data carries its own membership check.
2. A schema change needs a migration. Edit the schema, run `pnpm db:generate`,
   and review the emitted file. Never edit an applied migration; add the next
   number. Raise `requiredSchemaVersion` in the same change, because the
   readiness probe compares it with the applied count. See
   [Database](database.md).
3. Add the integration test under `tests/integration/`. It runs against the
   real PostgreSQL service. A storage test proves the row access rule as well
   as the result.

## d. The handler in `apps/server`

`createHandlers` returns one function per operation id, and a missing or
unknown handler stops startup, so the server cannot drift from the contract.
Put the body of the handler in the file of its area. A handler reads its
validated input, calls the `packages/core` use case with the store, and returns
a status, a media type, and a body. It declares no route and no shape.

## e. The client side

1. When the feature works offline, add the local record to the port in
   `packages/sync` first, then implement it in `packages/storage-browser` with
   a Dexie table. A new table or index needs a new schema version entry and the
   record upgrade for it.
2. Add the React feature under `apps/web/src/features`. It calls a generated
   operation. It never builds a URL and never calls a transport.
3. Build the screen from the `packages/ui` primitives and Tailwind utilities.
   Colour comes from the theme registry only.
4. Keep testable logic out of the `.tsx` file. Put it in a `.ts` file next to
   it with its own test, as `save-state.ts` and `note-name.ts` do. Node cannot
   strip JSX, so a `.tsx` file has no unit test.

## f. Markdown and editor work

`packages/markdown` is the only definition of the language. A syntax change, a
sanitizer change, or a URL policy change goes there. `packages/editor` keeps
the Markdown source as the document and builds every decoration from the syntax
tree. Any change to either side must keep the two paths equal, which the corpus
test proves. See [Markdown](markdown.md).

## g. Verification

| When            | Command                                                       |
| --------------- | ------------------------------------------------------------- |
| While you work  | `pnpm test:unit -- <name>`, `pnpm test:integration -- <name>` |
| Before you land | Required hosted Check and Sign-off                            |

See [Verification](verification.md) for what each one proves.

## h. Landing the change

The [agent lifecycle](agent-lifecycle.md) owns hosted proof and protected landing.
Use a worktree and a short-lived branch. Open a PR, resolve its threads and use
the `land-change` skill to enter the merge queue. GitHub checks the combined
source before merge. Review is optional. No actor bypasses protection.

Local `pnpm verify` is optional. Main advancing alone does not require a manual
rebase. Never force push. Worktree cleanup stays an owner action.

## Definition of done

- [ ] The contract change is in `packages/api-contract/`, and the generated
      output is committed with it.
- [ ] The domain rule is in `packages/core` with a unit test for the accepted
      path and for the refusal.
- [ ] The storage change has a migration, a raised `requiredSchemaVersion`, and
      an integration test against real PostgreSQL.
- [ ] The handler exists for every new operation id, and the coverage test
      passes.
- [ ] The screen uses generated operations, `packages/ui` primitives, and theme
      tokens only.
- [ ] Every fixed defect has a regression test that fails before the fix.
- [ ] User-facing text follows [the copy rules](../../rules/08-copy.md). No
      identifier, timestamp, error code, or engine notice reaches the person.
- [ ] An architectural choice has a decision record.
- [ ] A document you changed follows [the document rules](../README.md), and
      the `AGENTS.md` of each directory you edited still describes the truth.
- [ ] Required hosted checks pass and the merge queue lands the change.
- [ ] Each screen that the change touches has a screenshot in light and in
      dark, read against [the design guide](design.md).
