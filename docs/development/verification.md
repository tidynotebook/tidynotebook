# Verification

This page explains what the local checks cover. The development process is in
[AGENTS.md](../../AGENTS.md).

`pnpm verify` runs the checks in `package.json`: contract validation,
generated output comparison, types, lint, format, build, typed lint, unit
tests, and integration tests. The build comes before typed lint because it
supplies package declarations.

Unit commands use Node file patterns beside package source and at the tools
root. `pnpm test:unit` builds its required packages first.
`pnpm test:unit:run` runs the same files after a build. Package commands use
`pnpm --filter <package> test:unit` to select that package only.
`tools/run-tests.mjs` selects integration files and keeps the slow files on
separate CI shards. `node-test.config.json` holds the shared coverage settings.
For a direct Node command, put `--no-experimental-test-coverage` before the
file paths to hide its report.
Integration commands also accept `NOTESAPP_COVERAGE=off`.

`pnpm test:services` starts the named PostgreSQL and MinIO services from
`compose.test.yaml`, waits for their health checks, then runs the mandatory
test-profile migration. `pnpm verify` and `pnpm test:integration` include this
setup. Each integration test creates its own database or bucket.

Test setup now requires Docker Compose. It no longer uses an external service
because a host port accepts connections. Stop any external service on the test
ports before running the commands. Use the named disposable Compose services.

For a focused check, use an explicit file path with the Node runner. Build and
start the test services first for an integration test:

```sh
pnpm exec node --config-file=node-test.config.json packages/api-client/src/configure.test.ts
pnpm build
pnpm test:services
pnpm exec node --config-file=node-test.config.json tests/integration/mcp-endpoint.test.ts
```

Use Node's `--test-name-pattern` before the file path to select a test case.
The former basename form, such as `pnpm test:unit -- configure`, is retired.

The documentation build test also needs Linux `strace` with syscall delay
injection. It delays a real search-index write to check that the build waits
for the file to finish before it stops the search service.

Node cannot strip JSX. Logic that needs a unit test can live in a plain
TypeScript module beside the component. Integration tests can check built
styles and served results. Browser checks cover actual interaction and layout.

CI runs scoped checks on each push. `Check` requires every selected job to
pass. A push diffs from the nearest of 20 first-parent ancestors whose latest
`Check` passed in this CI workflow on a push or manual run. A branch's first
push can use a proven main ancestor. Missing proof or the search time limit in
`tools/ci-scope.mjs` selects full checks. Manual branch runs select full checks. Source changes run
static checks, the bundle budget, three unit shards and four integration
shards. Only inert Markdown in decisions, design, plans and audits takes the
short path. It checks changed document formatting and the full document tree.
Guide and development docs, plus the root README, require source checks. Image
inputs also run image smoke tests. Workflow changes run actionlint and zizmor.
Local Docker testing uses the production image and entry point. There is no
local proof receipt or test-file gate. A manual workflow can move `main` to a
reviewed head without a new test run. See [Fast forward
merge](fast-forward-merge.md).

The service performance budget and coverage report run nightly or on a manual
main run. They do not block the push aggregate. The bundle budget runs with
source checks. Its policy is in `tools/performance/bundle-policy.ts`. The
production-build integration test in `pnpm verify` uses the same limit and
checks that Settings, calendar and action forms remain deferred. The DS1
allowance follows the owner-approved remainder after those splits.
Browser measurements use a local Playwright install in
`.local-app/` when needed.

On duplicate same-repo pull request events, GitHub leaves the skipped
aggregate under its unevaluated name expression. That name is never `Check`,
so only the push run can supply the required result.
