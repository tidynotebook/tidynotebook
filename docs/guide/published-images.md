# Published images

This page is for the person who runs the server. It shows how to run an
official release image with Compose, and how to fix the image by its digest, so
that a later pull cannot change it.

Use this path when a public release and its image exist. Until then, build the
image on your own machine with the [Quick start](quickstart.md) or with
[Self-hosting](self-hosting.md).

Set up the installation with [Self-hosting](self-hosting.md) first. Before you
move to a new release, make and verify a backup. See [Upgrade](upgrade.md).

## What you need

- The GitHub CLI (`gh`) and `jq`. The script below uses both. Sign in to the
  GitHub CLI once with `gh auth login`.
- A clone of the code that is checked out at the release tag. The release must
  hold `tools/ops/select-image.sh`. Releases up to 0.18.1 do not hold it.

## 1. Check out the release tag

Choose one release tag from the releases of the official repository, for
example `v1.2.3`. These commands get the tags and go to the one you chose.

```bash
git fetch --tags
git checkout v1.2.3
```

## 2. Get the image address

This script downloads the manifest of the release and prints the image address
with its digest. It checks that the manifest belongs to this repository, to
this tag and to this checkout, and it stops when one does not match. It must
run in the clone that you checked out in step 1.

```bash
tools/ops/select-image.sh v1.2.3
```

It prints one line that starts with `NOTESAPP_IMAGE=`.

## 3. Save the image address

Open `.env` in a text editor. `.env.example` has a line
`NOTESAPP_IMAGE=notesapp:latest`. Replace that line with the line that the
script printed. Keep one `NOTESAPP_IMAGE` line only. Later commands of this
installation read the digest from `.env`.

Only the owner of the installation should read `.env`.

## 4. Pull and start the image

The first command downloads the image. The second command starts the
application from it, and does not build the code.

```bash
docker compose pull app
docker compose up -d --no-build
```

The digest names one image for good. Keep this `NOTESAPP_IMAGE` line for all
later commands of this installation. Never replace it with a moving tag such
as `latest`. The settings, the secret files and the migration commands stay the
same. [Configuration](configuration.md) names every setting.
