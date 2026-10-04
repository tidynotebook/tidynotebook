#!/usr/bin/env bash
# Ensure that exactly one healthy disposable MinIO service is available.
#
# The object store tests of record 0192 reach it on port 59000. Each test file
# makes a bucket of its own, so every worktree shares this one service.
set -euo pipefail

project_name='notesapp-test'

# A reachable service is all that a test needs. CI starts the Compose services
# itself, so the script must do nothing in that case.
if (exec 3<>/dev/tcp/127.0.0.1/59000) 2>/dev/null; then
  printf '%s\n' 'notesapp test object store: port 59000 already accepts connections.'
  exit 0
fi

if ! command -v docker > /dev/null 2>&1; then
  printf '%s\n' 'notesapp test object store: no service on port 59000 and Docker is not installed.' >&2
  exit 1
fi

mapfile -t containers < <(
  docker ps \
    --filter 'publish=59000' \
    --filter "label=com.docker.compose.project=${project_name}" \
    --filter 'label=com.docker.compose.service=minio' \
    --format '{{.ID}}'
)

if [[ ${#containers[@]} -gt 1 ]]; then
  printf '%s\n' 'notesapp test object store: more than one matching container is running.' >&2
  exit 1
fi

if [[ ${#containers[@]} -eq 1 ]]; then
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${containers[0]}")"
  if [[ "$health" != 'healthy' && "$health" != 'running' ]]; then
    printf 'notesapp test object store: the matching container is %s.\n' "$health" >&2
    exit 1
  fi
  printf 'notesapp test object store: using healthy container %s.\n' "${containers[0]}"
  exit 0
fi

# Only the MinIO service starts here. The PostgreSQL service of the same
# project belongs to every worktree, and this command leaves it as it is.
docker compose -p "$project_name" -f compose.test.yaml up -d --wait --no-deps minio
