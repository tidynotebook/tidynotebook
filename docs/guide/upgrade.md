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

Run these commands in the installation's clone folder. They select the current
stable release. For another target release, use its installation instructions
and matching image selection. Keep the same tag for checkout and image selection.
Before you change the checkout, record the current release tag with the backup.
For a source-built installation, preserve the current local image under that tag:

```bash
(
  set -euo pipefail
  tag="$(git describe --tags --exact-match)"
  image="$(env -u NOTESAPP_IMAGE docker compose --env-file .env config --format json |
    jq -er '.services.app.image | select(test("^[^[:space:]#]+$"))')"
  docker image tag "$image" "notesapp-source:$tag"
)
```

For example, this tags `notesapp:latest` as `notesapp-source:v0.18.1` when the
current checkout is `v0.18.1`. Stop if this command fails. Keep the tagged image
on the Docker host until the upgrade and backup checks are complete.

1. Fetch the new tag and check it out:

   ```bash
   git fetch --depth 1 origin tag v0.21.0
   git checkout v0.21.0
   ```

   The checkout supplies the Compose files, operator scripts, and migrations
   that match the new image. Do not select an image from the old checkout.

2. Choose the path for the current installation:

   - **Built from source:** this includes installations on release 0.18.1 and
     older. Skip the save command below. Rollback uses the preserved local
     image, as [Contributor source builds](#contributor-source-builds) shows.
   - **Published image:** save the current image setting with this command:

   ```bash
   (
     set -euo pipefail
     image="$(env -u NOTESAPP_IMAGE docker compose --env-file .env config --format json |
       jq -er '.services.app.image | select(test("^[^[:space:]#]+$") and . != "notesapp:latest")')"
     printf 'NOTESAPP_IMAGE=%s\n' "$image" > notesapp-image-previous.txt
   )
   ```

   This saves the image value that Compose resolves from `.env`, without a
   shell override. An empty or invalid value, or the source-build fallback,
   stops the command before it changes the saved file. Stop if the command
   fails. Keep the saved file with the backup.

   For both paths, complete [Select the stable image](published-images.md#select-the-stable-image).
   Its tag, source commit, and image digest select the same current stable
   release as the checkout commands above. Stop if a check fails. Use another
   release's matching selector for that release; do not change only the tag or
   edit the digest by hand.

3. On an ARM host, complete the applicable
   [platform steps](published-images.md#supported-platforms) in this shell.
   Download the selected image and apply the release settings:

   ```bash
   docker compose pull app
   docker compose up -d --no-build --wait
   docker compose ps
   ```

   Compose replaces the application container and waits for it to be healthy.
   It does not build source. If startup fails, read the application log:

   ```bash
   docker compose logs app
   ```

## What happens at the start

The application container applies the database migrations before it serves.
The application does not report ready until the migrations are complete.

A migration moves forward only. If one fails, the container exits and the
restart policy repeats the attempt. The application stays not ready while that
happens. Read the log of the application, fix the cause, and the next attempt
completes.

## Going back

There is no downward migration. To go back to the old release:

Use a new, empty target. Do not reuse the upgraded database or start an old
image against it. A restore does not remove every object that a newer release
can add.

1. In the clone for the empty target, check out the old release tag. Prepare
   the target settings and empty data folders without starting the application.
   Select or prepare its old image **before** restore. For a source-built
   installation, run only the preparation block in
   [Contributor source builds](#contributor-source-builds). It reuses the
   preserved image when available and saves its per-tag name in `.env`.
   Do not run that section's startup command yet. Releases up to 0.18.1
   require this source-image path.

   For a published release, either [select its image again](published-images.md#select-the-stable-image),
   or restore the saved setting:

   ```bash
   (
     set -euo pipefail
     settings_file="$(mktemp .env.XXXXXX)"
     trap 'rm -f "$settings_file"' EXIT
     awk '!/^[[:space:]]*NOTESAPP_IMAGE[[:space:]]*=/' .env > "$settings_file"
     cat notesapp-image-previous.txt >> "$settings_file"
     env -u NOTESAPP_IMAGE docker compose --env-file "$settings_file" config --format json |
       jq -e '.services.app.image | select(test("^[^[:space:]#]+$") and . != "notesapp:latest")' > /dev/null
     chmod 600 "$settings_file"
     mv "$settings_file" .env
   )
   ```

   The command checks the proposed settings with Compose before it replaces
   `.env`. If the saved image is empty, invalid, or the source-build fallback, it
   stops and keeps the current settings.

2. Restore the verified backup from before the upgrade. In
   [Backup and restore](backup-and-restore.md#restore), keep the old checkout
   and selected image from rollback step 1. For the first startup in restore
   step 1, use this command instead of a build or image-selection command:

   ```bash
   docker compose up -d --no-build --wait
   ```

   This initializes the empty database with the old schema. Complete restore
   steps 2 through 6. Do not select the newer stable image or reuse its database.
   Skip restore step 7: rollback step 3 below replaces it.

3. Start the old release against the restored data:

   ```bash
   docker compose up -d --no-build --wait
   ```

   Then complete the readiness and backup checks in restore step 8.

Do not copy a database without its attachments. Do not copy attachments
without the database from the same moment. The two parts are one backup.

## Contributor source builds

Use a tagged checkout. For rollback, check out the old release tag first.
For example, `v0.18.1` selects `notesapp-source:v0.18.1`. The preparation block
reuses that local image if it exists. Otherwise, it builds the application.
It then saves the per-tag name in `.env` through a validated temporary file:

```bash
(
  set -euo pipefail
  tag="$(git describe --tags --exact-match)"
  image="notesapp-source:$tag"
  if ! docker image inspect "$image" > /dev/null 2>&1; then
    NOTESAPP_IMAGE="$image" docker compose build app
  fi
  settings_file="$(mktemp .env.XXXXXX)"
  trap 'rm -f "$settings_file"' EXIT
  awk '!/^[[:space:]]*NOTESAPP_IMAGE[[:space:]]*=/' .env > "$settings_file"
  printf '\nNOTESAPP_IMAGE=%s\n' "$image" >> "$settings_file"
  env -u NOTESAPP_IMAGE docker compose --env-file "$settings_file" config --format json |
    jq -e --arg image "$image" '.services.app.image == $image' > /dev/null
  chmod 600 "$settings_file"
  mv "$settings_file" .env
)
```

Stop if the build or settings check fails. The current settings stay in place.
For rollback, return to [Going back](#going-back) and complete the restore
before startup. For a new source installation, start the saved image:

```bash
docker compose up -d --no-build --wait
```

Later Compose commands read the same local image name from `.env`. They do not
switch back to the published image that was used before rollback.

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the contributor checks.
