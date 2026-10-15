# Verification

This page explains what the local checks cover.
The development process is in [AGENTS.md](../../AGENTS.md).

`pnpm verify` runs the checks in `package.json`: contract validation,
generated output comparison, types, lint, format, build, typed lint, unit tests,
and integration tests. The build comes before typed lint because it supplies
package declarations.

`tools/run-tests.mjs` discovers unit tests beside the source and tool files.
It discovers integration tests under `tests/integration/`.
The tests use PostgreSQL and MinIO from `compose.test.yaml`.
Each integration test creates its own database or bucket.

Node cannot strip JSX. Logic that needs a unit test can live in a plain
TypeScript module beside the component. Integration tests can check built
styles and served results. Browser checks cover actual interaction and layout.

CI runs lint only. Local Docker testing uses the production image and entry
point. There is no separate image-test command, proof receipt, or test-file gate.

Performance commands remain available for investigation. They are not part of
the merge checks. Browser measurements use a local Playwright install in
`.local-app/` when needed.
