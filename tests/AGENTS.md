# tests

Read the root [AGENTS.md](../AGENTS.md) first. This file adds the rules of
this directory. The recipe for a whole feature is in
[docs/development/feature-workflow.md](../docs/development/feature-workflow.md).

## Purpose

The one suite that needs more than one package: the integration tests against
a real PostgreSQL service and a real server. It also holds the image tests,
which run the built container image. This tree holds no browser test.
See
[decision 0066](../docs/decisions/0066-the-browser-suite-is-retired.md).

## What lives here and what does not

- `integration/` holds one file per area. `integration/support/` holds the
  disposable database, the identity provider, the listening server, and the
  Tailwind compiler of the web build.
- `image/` holds the tests of the built image (record 0202). They drive the
  Docker command line and a PostgreSQL of their own, import no workspace
  package, and run in the image job of CI after the build, through
  `pnpm test:image`. `pnpm verify` builds no image, so it does not run them.
- A unit test does not live here. It lives next to its module in a package
  `src` tree and runs under `pnpm test:unit`.
- A test that drives a browser does not live here, and no gate starts one.
  Only the measurements `pnpm perf:typing`, `perf:save` and `perf:start` of
  `tools/performance/` drive the Chromium of the skill, and
  `support/dev-app.ts` starts their server.

## Allowed imports

Any workspace package, because this tree is the top of the graph. A test calls
a generated operation or `app.inject()`, never a handwritten HTTP call.

## How to add a common thing here

- **An integration test.** Add `integration/<area>.test.ts` with a database
  from `support/database.ts` and a server from `support/server.ts`. Run
  `pnpm test:integration -- <area>` after `tools/test-database/ensure-postgres.sh`.
- **A proof of what a person sees.** Put the rule in a pure module with its
  own unit test, then read the built or served result here. The stylesheet
  tests hold the theme variables, and the delivery tests hold the served
  document and its headers.
- **A reader proof.** Ask for a published address with no session, and move a
  link or a ticket past its life with the retention operation, never with a
  delay.

- **An image test.** Add `image/<area>.test.ts`. Build the image with
  `docker compose build`, then run `pnpm test:image`. `NOTESAPP_IMAGE` names
  another image.

## Testing conventions here

`integration` runs under `node --test` through `pnpm test:integration`, which
starts the PostgreSQL service of `compose.test.yaml` and builds first. Each
file makes its own disposable database. A test proves the result through a
generated operation and checks the server state.

## Forbidden here

- No `fetch`, no `axios`, and no other handwritten transport. Use a generated
  operation, or `app.inject()` for a request that no operation can express.
- No fixed delay. Wait for a condition or a state.
- No weakened assertion and no skipped failing test.
- No shared database between test files, and no leaked temporary directory.
- No assertion on an internal identifier that a person never sees.

## Key files

| File                                          | Purpose                                |
| --------------------------------------------- | -------------------------------------- |
| `integration/support/`                        | The disposable database and the server |
| `integration/contract.test.ts`                | Every operation and its handler        |
| `integration/row-access.test.ts`              | The row access policies                |
| `integration/published-write-refusal.test.ts` | Every write, with a published token    |
| `integration/theme-variables.test.ts`         | The built stylesheet and the palette   |
| `integration/web-delivery.test.ts`            | The served document and its headers    |
| `integration/docs-site.test.ts`               | The built documentation site           |
| `image/commands.test.ts`                      | The commands of the image entry point  |
