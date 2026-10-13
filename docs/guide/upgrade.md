# Upgrade

This page is for the person who runs the server. It shows how to move an
installation to a new release, and how to go back.

A new release can change the database. A change moves forward only. So make a
verified backup before you start. An upgrade with no verified backup has no way
back.

## 1. Make and verify a backup

Make a backup and verify it, as [Backup and restore](backup-and-restore.md)
states. Keep the archive.

## 2. Install the new release

Use the steps that fit how you run the server.

### An installation built from source

You built the image from the code with `docker compose build`. Run these
commands in the clone folder. Replace `v1.2.3` with the tag of the new release.

1. Get the new tags from the repository, and go to the new release:

   ```bash
   git fetch --tags
   git checkout v1.2.3
   ```

2. Build the new image. Then start the application from it. Compose replaces
   the old container.

   ```bash
   docker compose build
   docker compose up -d
   ```

3. Check the state. Run this command again until the application shows as
   healthy:

   ```bash
   docker compose ps
   ```

4. When the application does not become healthy, read its log:

   ```bash
   docker compose logs app
   ```

### An installation that uses a published image

You run an official image. Follow [Published images](published-images.md) to
get the new `NOTESAPP_IMAGE` line with the script `tools/ops/select-image.sh`.
Then do these steps:

1. Open `.env` in a text editor. Replace the old `NOTESAPP_IMAGE` line with the
   new one.
2. Download the new image and start the application from it:

   ```bash
   docker compose pull app
   docker compose up -d --no-build
   ```

3. Check the state with `docker compose ps`, and read the log with
   `docker compose logs app`, as above.

## What happens at the start

The application container applies the database migrations before it serves.
The application does not report ready until the migrations are complete.

A migration moves forward only. If one fails, the container exits and the
restart policy repeats the attempt. The application stays not ready while that
happens. Read the log of the application, fix the cause, and the next attempt
completes.

## Going back

There is no downward migration. To go back to the old release:

1. Restore the verified backup from before the upgrade into an empty target.
   See [Backup and restore](backup-and-restore.md#restore).
2. Check out the old release tag, or set the old `NOTESAPP_IMAGE` line, and
   start the application against the restored data.

Do not copy a database without its attachments. Do not copy attachments
without the database from the same moment. The two parts are one backup.
