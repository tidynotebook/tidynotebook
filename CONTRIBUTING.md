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
`compose.test.yaml`. `pnpm verify` starts those services as needed.

## License

tidy notebook uses [AGPL-3.0-only](LICENSE).
Contributions use the same license. There is no contributor license agreement
or required commit sign-off.

## Security

Use [SECURITY.md](SECURITY.md) to report a security problem.
