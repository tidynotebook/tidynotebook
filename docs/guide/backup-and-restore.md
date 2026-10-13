# Backup and restore

This page is for the person who runs the server. It shows how to make an
encrypted backup, check it, restore it, and what to do when a person loses a
password.

A backup is not proof that you can recover until a restore test passes. Test a
restore on a separate empty installation. Test it again after every change to
the storage layout.

## What you need

- The three files that the backup commands read. The script
  `tools/ops/create-secrets.sh` made them in your secrets folder, as
  [Self-hosting](self-hosting.md#create-the-secret-files) states:
  - `migration_database_url`: the address of the database. It serves as the
    database address file, because the backup script replaces the host name
    when it runs inside the database container.
  - `backup_key`: the passphrase that encrypts the backups.
  - `installation_id`: the random ID of this installation.
- A separate encrypted folder for the backups, for example
  `/mnt/separate-backups/notesapp`. It must not be inside the storage folder.
- Node.js, GnuPG and `tar` on the host. The scripts run them there. Under
  `sudo`, the `PATH` must hold `node`.

If you made these files yourself, each one must have mode `0600`. The key file
holds at least 32 bytes of strong random data. The ID file holds one UUID.

Keep a copy of `backup_key` and `installation_id` in a key store that is not
on this host. A restore needs both. The backup holds only a hash of the
installation ID, and a backup from a different installation is refused. If a
volume key or the backup key is lost, stop. Never make a new key and claim
that it can recover old data.

## Make a backup

Run these steps in the clone folder. The application writes while it runs. The
database part of a backup is consistent on its own. The attachment files never
change after they are written, so a save that lands during the backup is in the
archive in full or not at all. To make the two parts consistent with each
other, stop the application first.

1. Stop the application:

   ```bash
   docker compose stop app
   ```

2. Find the name of the database container. Run this command and read the
   `NAME` column of the `postgres` row:

   ```bash
   docker compose ps
   ```

   The name starts with the name of the clone folder. It is
   `notesapp-postgres-1` only when the folder is named `notesapp`.

3. Run the backup. Use `sudo`, because the secret files belong to user 10001
   and only that user and `root` can read them. Put the name of your database
   container after `--postgres-container`.

   ```bash
   sudo tools/ops/backup.sh \
     --storage-root /srv/notesapp/storage \
     --backup-root /mnt/separate-backups/notesapp \
     --database-url-file /etc/notesapp/secrets/migration_database_url \
     --key-file /etc/notesapp/secrets/backup_key \
     --installation-id-file /etc/notesapp/secrets/installation_id \
     --postgres-container notesapp-postgres-1
   ```

4. Start the application again:

   ```bash
   docker compose start app
   ```

A new file named `backup-` with the date and time appears in the backup
folder.

The options mean this:

- `--storage-root` is the folder `NOTESAPP_STORAGE_DIR` in `.env`.
- `--backup-root` is the folder for the encrypted archives.
- `--postgres-container` runs the database dump inside the database container.
  The database port is not published, so use this option with Compose. Leave
  it out only when `pg_dump` and `psql` on the host can reach the database.
  The database address never appears in the arguments of a host command.

The command does these things:

1. It lists the attachments that the database references.
2. It dumps the database.
3. It copies each referenced attachment, and checks its digest and size.
4. It writes a manifest with the digests of the database and of each file.
5. It encrypts the archive with GnuPG AES-256.
6. It decrypts the finished archive and checks it.
7. It keeps one backup for each of the newest seven UTC days, and one for each
   of the newest four ISO weeks.

An installation that keeps its images in an S3 compatible store must back up
the bucket with the tools of the store, because this command copies a folder.
See [Object storage](operations.md#object-storage).

## Schedule and watch the backups

Make at least one backup each day. Use the scheduler of your host. Copy the
encrypted archives to storage that is separate from the application host. Never
copy the backup key with the archives.

To see the newest archive, list the backup folder. The newest file is first:

```bash
ls -lt /mnt/separate-backups/notesapp
```

Raise an alert when the newest archive is older than one day. Use your own
monitoring for that.

## Verify a backup

This command decrypts one archive and checks its contents, and restores
nothing. Use a file name from the listing above.

```bash
sudo tools/ops/verify-backup.sh \
  --backup-file /mnt/separate-backups/notesapp/backup-20260906-120000Z.tar.gpg \
  --key-file /etc/notesapp/secrets/backup_key \
  --installation-id-file /etc/notesapp/secrets/installation_id
```

## Restore

A restore puts one backup into a new, empty installation. It never replaces
data that exists. The easiest way is a fresh installation that has started
once and has no notes.

The script refuses to run when the database already has a workspace or the
storage folder is not empty. So the target is a new empty database and an empty
storage folder. The database address file points at the new database. It is the
file `migration_database_url` of the new installation.

1. Make the new installation. Follow [Self-hosting](self-hosting.md) up to
   [Start the server](self-hosting.md#start-the-server). Do not create an
   account.
2. Stop the application, so that nothing writes while you restore:

   ```bash
   docker compose stop app
   ```

3. Get the saved copies of `backup_key` and `installation_id` from your key
   store. The new installation made files of the same names with other values,
   and they cannot open the old archives. Put the saved copies in a folder on
   the host, for example `/root/restore`. Give each file mode `0600`, so that
   only its owner can read it.
4. Find the name of the new database container with `docker compose ps`, as in
   the backup steps.
5. Run the restore. The storage root is the empty storage folder of the new
   installation.

   ```bash
   sudo tools/ops/restore.sh \
     --backup-file /mnt/separate-backups/notesapp/backup-20260906-120000Z.tar.gpg \
     --storage-root /srv/notesapp/storage \
     --database-url-file /etc/notesapp/secrets/migration_database_url \
     --key-file /root/restore/backup_key \
     --installation-id-file /root/restore/installation_id \
     --postgres-container notesapp-postgres-1
   ```

   The script verifies the archive before it changes anything. It then loads
   the database and copies the attachments. At the end it checks each
   attachment against the digest and the size in the database.

6. Give the restored attachments to user 10001, the user inside the
   application container:

   ```bash
   sudo chown -R 10001:10001 /srv/notesapp/storage
   ```

7. Start the application:

   ```bash
   docker compose start app
   ```

8. Check that the server is ready. Open some notes and attachments. Then make a
   new backup.

   ```bash
   curl http://127.0.0.1:3000/ready
   ```

## Two facts a restore depends on

- The row access rules of the database name the migration role by the name it
  had when the migration ran. A restore into a database where the schema owner
  has a different name leaves that owner without a rule. The database then
  hides every row from it. Restore under the same role name, or change every
  owner rule before you use the installation.
- The migration sets the runtime password with a DDL statement. An
  installation that logs DDL, or captures it with an audit extension, holds that
  password in its log. Change the runtime password after you turn on such
  logging. Keep the log under the same encryption rules as the data.

## Account recovery

A person who loses the account password has no way to get it back inside the
application. When the server can send mail, the sign-in page sends a reset link
after the person selects **Forgot password**. Otherwise set a new password from
the server. The command asks for it on the terminal and signs the account out
everywhere. See [Account commands](operations.md#account-commands).

```bash
docker compose exec app node server/dist/cli/recover-account.js --email person@example.com
```
