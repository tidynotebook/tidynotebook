---
name: test-application
description: Starts one fresh local Docker deployment and checks changed behavior in a browser. Use for local application testing and screenshots.
---

# Test application

Use the committed worktree. The fixed Compose project is `notesapp-local`.
Stop an older local core application before starting this one.
Keep unrelated projects and remote hosts outside this task.

Create local secrets and Compose settings:

```sh
mkdir -p .local-app
sudo tools/ops/create-secrets.sh "$PWD/.local-app/secrets"
cat > .local-app/compose.env <<EOF
NOTESAPP_ORIGIN=http://localhost:3000
NOTESAPP_BIND_HOST=127.0.0.1
NOTESAPP_PORT=3000
NOTESAPP_IMAGE=notesapp-local:latest
NOTESAPP_SECRETS_DIR=$PWD/.local-app/secrets
NOTESAPP_DATABASE_DIR=$PWD/.local-app/unused-database
NOTESAPP_STORAGE_DIR=$PWD/.local-app/unused-storage
NOTESAPP_BREACH_CHECK=off
EOF
docker compose --env-file .local-app/compose.env -p notesapp-local -f docker-compose.yml -f compose.local.yaml down --volumes --remove-orphans
docker compose --env-file .local-app/compose.env -p notesapp-local -f docker-compose.yml -f compose.local.yaml up --build -d --wait
```

The local override replaces host data mounts with disposable named volumes.
The deployment uses the production image, entry point, migrations, and health check.
On a later run, reuse the secret files and settings. The volume reset still gives fresh data.

Create the first account. The command asks for its password:

```sh
docker compose --env-file .local-app/compose.env -p notesapp-local -f docker-compose.yml -f compose.local.yaml exec app node /app/server/dist/cli/bootstrap.js --email owner@example.com
```

Open `http://localhost:3000` in the available browser tool.
Sign in and drive the exact changed behavior. Check errors and the server result.
Inspect screenshots of each changed screen in light and dark.
Keep screenshots in `.local-app/`. Attach them to the PR with the available
attachment tool or the optional `tools/pr-screenshots.mjs` uploader.

Stop the deployment and remove its data after merge:

```sh
docker compose --env-file .local-app/compose.env -p notesapp-local -f docker-compose.yml -f compose.local.yaml down --volumes --rmi all --remove-orphans
```
