# Local Docker application

This page explains the disposable local deployment.

`docker-compose.yml` defines the production application and database.
`compose.local.yaml` replaces their host data mounts with named volumes and
disables automatic restart. Removing those volumes resets the local data.
The fixed Compose project is `notesapp-local`.

The optional `test-application` skill gives the setup and browser commands.
It uses `tools/ops/create-secrets.sh` for temporary local credentials and keeps
settings and screenshots in the ignored `.local-app/` directory.

The development process and cleanup requirements are in
[AGENTS.md](../../AGENTS.md). No application replaces the test deployment after cleanup.
