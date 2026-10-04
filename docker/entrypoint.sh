#!/bin/sh
# Container entry point. It takes one optional command (record 0202):
#
#   migrate  applies the database migrations with the migration role and exits.
#   serve    starts the server with the restricted runtime role. It reads no
#            migration setting, so a serving replica needs no migration
#            credential.
#   (none)   applies the migrations and then serves, as one self-hosted
#            container does.
#
# The migration runs with the migration role and its own secret files. When a
# migration fails, this script exits with a nonzero status and the container
# stops. The Compose restart policy starts it again, so the container repeats
# the attempt until the cause is fixed. The readiness probe checks the schema
# version, so a container that serves without its migrations never reports
# ready.
#
# The migration entry point comes from the public package entry of
# @notesapp/storage-server, which Node resolves from the server directory. No
# path inside the package manager store is written here.
set -eu

app_root="${NOTESAPP_APP_ROOT:-/app}"
cd "$app_root/server"

migrate() {
  NOTESAPP_DATABASE_URL_FILE="${NOTESAPP_MIGRATION_DATABASE_URL_FILE:-/run/secrets/migration_database_url}" \
    NOTESAPP_RUNTIME_PASSWORD_FILE="${NOTESAPP_RUNTIME_PASSWORD_FILE:-/run/secrets/runtime_database_password}" \
    NOTESAPP_AUTH_PASSWORD_FILE="${NOTESAPP_AUTH_PASSWORD_FILE:-/run/secrets/auth_database_password}" \
    node --input-type=module -e "
      const { runMigrationCommand } = await import('@notesapp/storage-server');
      try {
        await runMigrationCommand(['--profile', 'deploy']);
      } catch (error) {
        process.stderr.write(
          (error instanceof Error
            ? error.message
            : 'notesapp: the migration failed.') + '\n',
        );
        process.exit(1);
      }
    "
}

serve() {
  exec node "$app_root/server/dist/main.js"
}

case "${1-}" in
  migrate)
    migrate
    ;;
  serve)
    serve
    ;;
  '')
    migrate
    serve
    ;;
  *)
    printf '%s\n' "notesapp: the entry point knows no command \"$1\". Give migrate, serve, or no command." >&2
    exit 2
    ;;
esac
