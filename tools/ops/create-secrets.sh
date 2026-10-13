#!/usr/bin/env bash
# Create the secret files of one tidy notebook installation.
#
# Compose reads seven secret files and creates none of them. This command
# writes those seven with new random passwords. It also writes the backup key
# and the installation ID that tools/ops/backup.sh reads. It never replaces a
# file that exists, so a second run cannot change a password that the database
# already holds.
#
# Each file gets mode 0600 and owner uid 10001, the user of the image, because
# the application cannot read a file of another owner. Only root can give a
# file to another user, so this command runs with sudo.
set -euo pipefail

# The seven files that docker-compose.yml reads, then the two backup files.
SECRET_NAMES=(
  postgres_password
  migration_database_url
  runtime_database_password
  auth_database_password
  runtime_database_url
  auth_database_url
  auth_secret
  backup_key
  installation_id
)
APP_UID=10001

usage() {
  printf '%s\n' 'Usage: sudo tools/ops/create-secrets.sh DIR' \
    '  Writes the secret files of one installation into DIR.'
}

fail() {
  printf 'notesapp secrets: %s\n' "$1" >&2
  exit 1
}

if [[ "${1:-}" == --help ]]; then
  usage
  exit 0
fi
[[ $# -eq 1 && -n "$1" && "$1" != -* ]] || { usage >&2; fail 'name one directory.'; }
DIR="$1"

[[ "$(id -u)" == 0 ]] || fail "run this command with sudo. Only root can give the files to uid $APP_UID, the user of the container."
command -v openssl >/dev/null 2>&1 || fail 'openssl is required.'
[[ ! -e "$DIR" || -d "$DIR" ]] || fail "$DIR exists and is not a directory."
for name in "${SECRET_NAMES[@]}"; do
  [[ ! -e "$DIR/$name" ]] || fail "$DIR/$name exists. This command never replaces a secret."
done

umask 077
if [[ ! -d "$DIR" ]]; then
  mkdir -p "$DIR"
  chmod 700 "$DIR"
fi

# A hexadecimal password needs no escape inside a database URL.
postgres_password="$(openssl rand -hex 24)"
runtime_password="$(openssl rand -hex 24)"
auth_password="$(openssl rand -hex 24)"

# A random UUID of version 4, as tools/ops/backup.sh requires.
uuid_hex="$(openssl rand -hex 16)"
uuid_variant="$(printf '%x' $(( (16#${uuid_hex:16:1} & 3) | 8 )))"
installation_id="${uuid_hex:0:8}-${uuid_hex:8:4}-4${uuid_hex:13:3}-${uuid_variant}${uuid_hex:17:3}-${uuid_hex:20:12}"

write_secret() {
  printf '%s\n' "$2" > "$DIR/$1"
  chmod 600 "$DIR/$1"
  chown "$APP_UID:$APP_UID" "$DIR/$1"
}

write_secret postgres_password "$postgres_password"
write_secret migration_database_url "postgres://postgres:$postgres_password@postgres:5432/notesapp"
write_secret runtime_database_password "$runtime_password"
write_secret auth_database_password "$auth_password"
write_secret runtime_database_url "postgres://notesapp_app:$runtime_password@postgres:5432/notesapp"
write_secret auth_database_url "postgres://notesapp_auth:$auth_password@postgres:5432/notesapp"
write_secret auth_secret "$(openssl rand -hex 32)"
write_secret backup_key "$(openssl rand -base64 48 | tr -d '\n')"
write_secret installation_id "$installation_id"

printf 'notesapp secrets: wrote %s files to %s.\n' "${#SECRET_NAMES[@]}" "$DIR"
printf '%s\n' \
  'notesapp secrets: copy backup_key and installation_id to a safe place off this host.' \
  'notesapp secrets: without them, no backup of this installation can be restored.'
