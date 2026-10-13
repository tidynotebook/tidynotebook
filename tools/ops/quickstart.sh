#!/usr/bin/env bash
# Prepare the quick start test installation in this checkout.
#
# The quick start keeps every directory under .tooling/quickstart, which Git
# and the Docker build ignore. This command makes the three directories,
# writes the secret files, and writes .env last, so a failed run leaves no
# .env. Two steps need root, and this command runs them with sudo:
# tools/ops/create-secrets.sh, and the owner of the storage directory.
#
# It is for a new clone. It refuses a checkout that has a .env file or an
# earlier quick start directory, so it never changes an installation.
set -euo pipefail

ORIGIN='http://127.0.0.1:3000'
APP_UID=10001

fail() {
  printf 'notesapp quick start: %s\n' "$1" >&2
  exit 1
}

if [[ $# -gt 0 ]]; then
  printf '%s\n' 'Usage: tools/ops/quickstart.sh' \
    '  Prepares a test installation in .tooling/quickstart of this checkout.'
  [[ "$1" == --help ]] && exit 0
  exit 1
fi

REPOSITORY="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPOSITORY"
DATA="$REPOSITORY/.tooling/quickstart"

[[ ! -e .env ]] || fail '.env exists. Use a new clone for the quick start.'
[[ ! -e "$DATA" ]] || fail "$DATA exists from an earlier run. Remove it with: sudo rm -rf .tooling/quickstart. Then run this command again."
command -v openssl >/dev/null 2>&1 || fail 'openssl is required.'
command -v docker >/dev/null 2>&1 || fail 'docker is required.'

umask 077
mkdir -p "$DATA/secrets" "$DATA/postgres" "$DATA/storage"
# The database user of the container must pass through this directory to
# reach the private data directory that PostgreSQL makes inside it.
chmod 711 "$DATA/postgres"

printf '%s\n' 'notesapp quick start: the next two steps need root. sudo can ask for your password.'
sudo "$REPOSITORY/tools/ops/create-secrets.sh" "$DATA/secrets"
sudo chown "$APP_UID:$APP_UID" "$DATA/storage"

printf '%s\n' \
  "NOTESAPP_ORIGIN=$ORIGIN" \
  "NOTESAPP_DATABASE_DIR=$DATA/postgres" \
  "NOTESAPP_STORAGE_DIR=$DATA/storage" \
  "NOTESAPP_SECRETS_DIR=$DATA/secrets" > .env

printf '%s\n' \
  "notesapp quick start: wrote .env and the test data directories in $DATA." \
  'notesapp quick start: next, run docker compose build and docker compose up -d.'
