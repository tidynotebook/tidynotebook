# Contributing

Use [AGENTS.md](AGENTS.md) for the development process and commands.
The repository owner selects changes and merges PRs.
Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) in project spaces.

## Setup

Use the Node and pnpm versions in `package.json`.
Install Docker with Compose, Bash, and jq.
Create a git worktree for your branch, then install dependencies there:

```sh
pnpm install --frozen-lockfile
```

The optional `test-application` skill gives the fresh local Docker setup.
Unit tests sit beside the code. Integration tests use the services in
`compose.test.yaml`. `pnpm verify` starts these named services, waits for their
health checks, and runs the test-profile migration. Externally managed test
services on the same ports are no longer used. Stop them before running checks.
Use [verification](docs/development/verification.md) for focused test commands.

## Review and merge

The owner merges PRs with GitHub's **Create a merge commit** option after
`Check` passes and all review threads are resolved. Merge commits keep the
branch commits and record the PR merge in `main`. Squash and rebase merges
are disabled. Main does not require linear history. Force pushes and branch
deletion remain blocked, and no actor can bypass the rules.

The fast-forward workflows and the `ff-merge` and `/ff-merge` comment commands
are retired. Use the GitHub merge action, or `gh pr merge --merge`, instead.
A merge to `main` starts the normal push CI and main image workflow.

## License

tidy notebook uses [AGPL-3.0-only](LICENSE).
Contributions use the same license. There is no contributor license agreement
or required commit sign-off.

## Security

Use [SECURITY.md](SECURITY.md) to report a security problem.
