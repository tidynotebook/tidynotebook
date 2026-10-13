# Contributing

Thank you for your interest in tidy notebook. This page is the complete setup and
landing path. Read [AGENTS.md](AGENTS.md) for the full rule set and
[docs/development/architecture.md](docs/development/architecture.md) for the
current picture of the system.

Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) in issues, pull requests and
other project spaces. The repository owner maintains the project and makes
the final decision on a change. Use the issue templates for a defect or a feature.
The [GitHub project board](https://github.com/users/bkhanale/projects/2) holds
the work that the owner selects.

## Before you start

Run `node tools/agent-context.mjs <paths you will touch>` before your first
edit. It prints the reading list for those paths: the rules, the documents,
the `AGENTS.md` of each directory, and the key files that the guide names.
Read every file that it lists, then restate the task against them. The
`prepare-change` skill drives the same steps in Claude Code and in Codex, and
it also states how to build, verify and report the change. The skill is
`.agents/skills/prepare-change/SKILL.md`, and `.claude/skills/prepare-change`
links to it.

## Requirements

| Tool           | Version                                 |
| -------------- | --------------------------------------- |
| Node.js        | 26.10.0                                 |
| pnpm           | 12.3.4                                  |
| Docker Engine  | any version that runs Docker Compose v2 |
| Docker Compose | v2                                      |
| Bash           | available in `PATH`                     |
| jq             | available in `PATH`                     |

`pnpm lint` checks Node.js and pnpm against `engines` and `packageManager` in
`package.json`. A different version fails the gate.

Install Bash and jq before you run `pnpm verify`. The tests of the scripts in
`tools/ops/` run them with Bash, and the image selection script reads the
release manifest with jq. A missing tool stops the test and names the tool to
install.

## Setup

Do these three steps once, in the root of your checkout.

1. Install the dependencies. This command installs the exact versions from the
   lock file, and it stops if the lock file and `package.json` disagree.

   ```bash
   pnpm install --frozen-lockfile
   ```

2. Start the test database. This command starts a disposable PostgreSQL service
   with Docker and applies the migrations. It is safe to run again, and it is
   safe to run while another checkout uses the same service.

   ```bash
   tools/test-database/ensure-postgres.sh
   ```

3. Run the complete gate. This command checks the whole project, and it must
   pass before a change is ready.

   ```bash
   pnpm verify
   ```

The test database comes from `compose.test.yaml`. `pnpm test:integration` also
starts the MinIO service of the same file with
`tools/test-database/ensure-minio.sh`.

`pnpm verify` runs contract lint, generated file comparison, typecheck, lint,
format, unit tests, integration tests, all builds, and the type-aware lint.

## The order of the lint

There are two lint commands, and the order between them matters.

- `pnpm lint` reads the sources only. It needs no build, so it passes in a
  fresh checkout right after `pnpm install --frozen-lockfile`.
- `pnpm lint:types` runs the type-aware rules. It reads the declaration files
  that `pnpm build` writes, so run `pnpm build` first. It stops with one
  message when that build output is absent.

`pnpm verify` holds that order for you: it runs `pnpm lint` early and
`pnpm lint:types` after the build.

## What a person sees

This repository holds no browser test. A pure module beside the component
proves the rule that decides a screen, and an integration test reads the built
stylesheet or the served document. See
[docs/development/verification.md](docs/development/verification.md) and
[decision 0066](docs/decisions/0066-the-browser-suite-is-retired.md).

Before you land a change to a screen, open it, drive it with the keyboard, and
take a screenshot of it in light and in dark. Read each screenshot against
[the design guide](docs/development/design.md).

[Run the local application](docs/development/local-app.md) to drive a screen
through the real server with temporary data.

## Useful commands

| Command                 | Result                                                           |
| ----------------------- | ---------------------------------------------------------------- |
| `pnpm build`            | Builds all packages, the server, and the web app                 |
| `pnpm typecheck`        | Checks all TypeScript projects                                   |
| `pnpm lint`             | Checks versions, source rules, boundaries, guides, and documents |
| `pnpm lint:types`       | Checks the type-aware source rules; needs `pnpm build` first     |
| `pnpm format`           | Applies Prettier formatting                                      |
| `pnpm test:unit`        | Runs unit tests                                                  |
| `pnpm test:integration` | Runs the PostgreSQL and IndexedDB integration tests              |
| `pnpm generate`         | Regenerates the API client from the contract                     |
| `pnpm contract:lint`    | Checks the API contract; `packages/api-contract/` holds it       |
| `pnpm generated:check`  | Checks that the generated client matches the contract            |

Select a subset with a name, for example
`pnpm test:integration -- browser-storage`.

## Developing a feature

[docs/development/feature-workflow.md](docs/development/feature-workflow.md)
is the recipe for one whole feature: the contract first, then the domain
rule, the storage and its migration, the handler, the client, and the
verification. It holds the "where does this go" table and the definition of
done.

Each app, each package, and the `tests` tree has its own `AGENTS.md` with the
rules of that directory: what lives there, which imports are allowed, how to
add a common thing, how to test it, and what is forbidden. **Read the
`AGENTS.md` of a directory before you edit under it.**

[docs/decisions](docs/decisions/README.md) holds the architecture decision
records. A new architectural choice gets a record before the code.

## License and sign-off

tidy notebook is under the GNU Affero General Public License, version 3 only
([AGPL-3.0-only](LICENSE)). A contribution comes in under the same license.
There is no contributor license agreement.

Each commit of a contribution carries a sign-off. The sign-off states that you
agree to the [Developer Certificate of Origin](https://developercertificate.org):
you wrote the change, or you have the right to give it under the license of
this repository. Git writes the sign-off for you when you commit:

```bash
git commit --signoff
```

The sign-off is a `Signed-off-by: Your Name <your address>` line at the end of
the commit message. The address must be the author address of the commit.

### Add a sign-off to commits that you already wrote

This rewrites your commits. If you pushed the old commits, a normal push of the
new commits fails, and this project never accepts a force push. So you push the
new commits to a new branch and open a new pull request.

1. Get the newest main branch from the remote.

   ```bash
   git fetch origin
   ```

2. Add the sign-off to each commit of your branch.

   ```bash
   git rebase --signoff origin/main
   ```

3. Push the result to a new branch. Use any new branch name in place of
   `my-change-signed`.

   ```bash
   git push origin HEAD:my-change-signed
   ```

4. Open a new pull request from the new branch, and close the old pull request.

The `DCO` workflow in `.github/workflows/dco.yml` runs on each pull request.
It fails when a commit has no sign-off of its author. A commit of the owner
needs no sign-off, because the owner holds the copyright. The rule is in
`tools/check-dco.mjs`.

## Workflow

A change uses a worktree and a short-lived branch. The
[agent lifecycle](docs/development/agent-lifecycle.md) holds the current PR,
proof, review, and landing procedure. The owner and contributors use
pull requests. A review is optional unless the owner asks for one. An
authorized exact head lands by non-force fast-forward push.
A protection refusal is a stop. Worktree cleanup remains an owner action.

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): summary`. Common types are `feat`, `fix`, `refactor`, `perf`,
`test`, `docs`, `chore`, `ci`. Add `!` after the type for a breaking change.

For example: `fix(sync): keep a queued save after a refused precondition`.

Write the summary in the imperative and in Simplified Technical English. Do
not use an em dash or an en dash anywhere. Keep each commit small and
complete on its own.

## Tests

- Every fixed defect gets a regression test that fails before the fix and
  passes after it.
- What a person sees is proved by a unit test of the pure module that decides
  it and by an integration test of the served result.
- Do not weaken an assertion, add a fixed delay, or skip a failing test to
  make a suite pass. If a test asserts behavior that your change replaces,
  update the test to assert the new behavior and say so.

## Code rules

The gate enforces these. The detail is in
[docs/development/architecture.md](docs/development/architecture.md) and
[docs/development/toolchain.md](docs/development/toolchain.md).

- Keep package boundaries strict. Domain code imports no transport, database,
  browser or React code.
- Call generated API client operations. Do not write a request URL or a direct
  `fetch` in feature code.
- Style with Tailwind utilities. `apps/web/src/tailwind.css` is the only
  application CSS source.
- Add a new API operation to `packages/api-contract/` first, then
  run `pnpm generate`. See
  [docs/development/api-contract.md](docs/development/api-contract.md).
- Validate at domain boundaries. Do not weaken a server invariant to hide a
  client defect.

## Documentation

[docs/README.md](docs/README.md) is the index of the documentation tree. It
names the audience of each directory, what belongs in it, the header that a
document of that kind carries, and the tone. Read it before you write or move
a document.

The code is the source of truth. A document holds the intent, the decision and
the pointer to the code by path. It does not copy source, configuration, a
schema, or a measured number, because a copy goes stale and nothing fails when
it does.

## Reporting a security problem

Do not open a public issue. See [SECURITY.md](SECURITY.md).
