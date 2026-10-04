# Backup and restore

This page is for the person who runs the server. It covers encrypted backups,
the restore procedure, and account recovery.

A backup is not evidence until a restore test passes. Test a restore on a
separate empty installation, and do it again after every change to the storage
layout.

## Encrypted backups

Use separate encrypted storage for backups. Create these mode `0600` files outside the backup destination:

- A database URL file for the migration role.
- A backup passphrase file with at least 32 bytes of strong random data.
- A stable installation ID file that contains one UUID.

Keep the passphrase and installation ID in an external key store and in the recovery runbook. The backup contains only a hash of the installation ID. A backup from a different installation is rejected.

Run a backup from the repository:

```bash
./tools/ops/backup.sh \
  --storage-root /srv/notesapp/storage \
  --backup-root /mnt/separate-backups/notesapp \
  --database-url-file /etc/notesapp/backup-database-url \
  --key-file /etc/notesapp/backup-key \
  --installation-id-file /etc/notesapp/installation-id \
  --postgres-container notesapp-postgres-1
```

The storage root is the host directory named by `NOTESAPP_STORAGE_DIR`. An
installation that keeps its images in an S3 compatible store backs up the
bucket with the tools of the store, because this command copies a directory.
See [Object storage](self-hosting.md#object-storage). Omit
`--postgres-container` when compatible `pg_dump` and `psql` commands can reach
the database directly. The database URL does not appear in the host command
arguments.

The command performs these steps:

1. Query the referenced finalized attachment set.
2. Dump PostgreSQL.
3. Copy each referenced attachment and verify its database digest and size.
4. Create a manifest with database and object digests.
5. Encrypt the archive with GnuPG AES-256 symmetric encryption.
6. Decrypt and verify the completed archive.
7. Keep one backup for each of the newest seven UTC days and one backup for each of the newest four ISO weeks.

### Backup consistency

The database part is consistent on its own, because `pg_dump` reads one
transaction snapshot. The attachment files are content addressed by their
digest, so a file that the dump references is never rewritten in place. A save
that lands during the backup is therefore either fully in the archive or fully
absent from it.

For an archive that is also consistent across the two parts, stop the
application first and start it again after the backup:

```bash
docker compose stop app
./tools/ops/backup.sh ...
docker compose start app
```

Schedule at least one backup each day. Copy the encrypted archives to storage that is separate from the application host. Do not copy the backup key with the archives.

Check the age of the newest archive in the backup directory:

```bash
ls -t /mnt/separate-backups/notesapp/backup-*.tar.gpg | head -1
find /mnt/separate-backups/notesapp -name 'backup-*.tar.gpg' -mtime -1 | head -1
```

The second command prints nothing when no archive is newer than one day. Alert
on that empty result.

Verify an archive without a restore:

```bash
./tools/ops/verify-backup.sh \
  --backup-file /mnt/separate-backups/notesapp/backup-20260906-120000Z.tar.gpg \
  --key-file /etc/notesapp/backup-key \
  --installation-id-file /etc/notesapp/installation-id
```

## Restore

Stop the application with `docker compose stop app`. Create a new empty database and an empty attachment directory. Use the same installation ID and the correct backup key.

```bash
./tools/ops/restore.sh \
  --backup-file /mnt/separate-backups/notesapp/backup-20260906-120000Z.tar.gpg \
  --storage-root /srv/notesapp-restored/storage \
  --database-url-file /etc/notesapp/restore-database-url \
  --key-file /etc/notesapp/backup-key \
  --installation-id-file /etc/notesapp/installation-id \
  --postgres-container notesapp-postgres-1
```

Restore refuses a nonempty storage target or a database that contains a workspace. It verifies the encrypted archive before it changes the target. After restore, it checks every database-referenced attachment against the restored byte digest and size.

Give the restored storage directory to uid 10001 before you start the
application:

```bash
sudo chown -R 10001:10001 /srv/notesapp-restored/storage
```

Start the application only after the restore command succeeds. Check `/ready`, open representative notes and attachments, and run a new backup. Test restoration regularly on a separate empty installation. A backup is not accepted recovery evidence until this test passes.

If a volume key or backup key is unavailable, stop. Do not create a replacement key and claim that it can recover old data.

## Two facts a restore depends on

- The database row access policies name the migration role **by the name it had
  when the migration ran**. A restore into a cluster where the schema owner has
  a different name leaves that owner without a policy, and the forced row
  access then hides every row from it. Restore under the same role name, or
  repoint every owner policy before you use the installation.
- The migration sets the runtime password with a DDL statement. An installation
  that logs DDL, or captures it through an audit extension, holds that password
  in its log. Rotate the runtime password after you enable such logging, and
  keep the log under the same encryption policy as the data.

## Account recovery

A person who loses the account password has no path inside the application. If
a mail transport is configured, the sign-in page can send a reset link.
Otherwise run this on the host, which reads a password from a protected file or
a hidden prompt and revokes the old sessions:

```sh
pnpm account:recover
```

If a volume key or a backup key is unavailable, stop. Do not create a
replacement key and claim that it can recover old data.
