# Published images

This page is for the person who runs the server.

Use the official stable image for an installation. The shell commands below
select the release. A digest fixes the image bytes, so a later pull cannot
change them. The public image needs no login.

## Supported platforms

The selected stable release has native `linux/amd64` and `linux/arm64`
images. Docker selects the host platform from the image index. Existing
release tags and digests keep their original platforms and bytes.

macOS needs Docker with Linux containers. On Windows, use WSL2 with Docker
Linux containers and the shell tools listed in the quick start. Native
Windows containers are not supported.

### Apple Silicon

Use Docker Desktop with Linux containers. The selected stable release runs
natively. Remove an earlier `DOCKER_DEFAULT_PLATFORM=linux/amd64` override
from the installation's `.env` when you move to the native image.

### ARM Linux

The selected stable release runs natively. Remove an earlier
`DOCKER_DEFAULT_PLATFORM=linux/amd64` override from the installation's `.env`
when you move to the native image. An older release can have different
platform requirements; use the guide shipped with that release.

## Select the stable image

Start with the release checkout and a prepared `.env` from
[Quick start](quickstart.md) or [Self-hosting](self-hosting.md). Run this
command in the root of the clone, in Bash. It selects the verified stable
image and refuses a different source checkout. An upgrade first checks out
the new tag, as [Upgrade](upgrade.md) states.

```bash
(
  set -euo pipefail
  tag=v0.23.0
  commit=4dee1c09ddb4f380d46247929acea414e41f2018
  image=ghcr.io/tidynotebook/tidynotebook@sha256:a70252e8fbcad2b74c9b4cab496584b4387d0f57d7e0eb2da72668de0a00c37f
  test "$(git rev-parse --verify "$tag^{commit}")" = "$commit"
  test "$(git rev-parse HEAD)" = "$commit"
  settings_file="$(mktemp .env.XXXXXX)"
  awk '!/^[[:space:]]*NOTESAPP_IMAGE[[:space:]]*=/' .env > "$settings_file"
  printf 'NOTESAPP_IMAGE=%s\n' "$image" >> "$settings_file"
  chmod 600 "$settings_file"
  mv "$settings_file" .env
)
```

Stop if a check fails. Keep one `NOTESAPP_IMAGE` line in `.env`. Keep the full
image address with the source checkout in your installation records.

## Select an older release from its manifest

For an older release that has a release manifest, the following command
checks its repository, source and image digest. Install `curl` and `jq` on
the host. Run it from that release checkout with its prepared `.env`.

```bash
(
  set -euo pipefail
  tag="$(git describe --tags --exact-match HEAD)"
  commit="$(git rev-parse --verify "$tag^{commit}")"
  test "$(git rev-parse HEAD)" = "$commit"
  mkdir -p .tooling/published-release
  release="https://github.com/tidynotebook/tidynotebook/releases/download/$tag"
  curl --fail --silent --show-error --location \
    --connect-timeout 10 --max-time 60 \
    "$release/release-manifest.json" \
    --output .tooling/published-release/release-manifest.json
  image="$(jq -ser --arg tag "$tag" --arg commit "$commit" '
    select(length == 1) | .[0]
    | select(.repository == "tidynotebook/tidynotebook"
      and .tag == $tag and .version == ($tag | ltrimstr("v"))
      and .source.commit == $commit
      and (.image.reference == "ghcr.io/tidynotebook/tidynotebook"
        or .image.reference == "ghcr.io/tidynotebook/core")
      and (.image.digest | type == "string" and length == 71
        and test("^sha256:[a-f0-9]{64}$")))
    | .image.reference + "@" + .image.digest
  ' .tooling/published-release/release-manifest.json)"
  test -n "$image"
  settings_file="$(mktemp .env.XXXXXX)"
  awk '!/^[[:space:]]*NOTESAPP_IMAGE[[:space:]]*=/' .env > "$settings_file"
  printf 'NOTESAPP_IMAGE=%s\n' "$image" >> "$settings_file"
  chmod 600 "$settings_file"
  mv "$settings_file" .env
)
```

The checks stop on a different repository, tag, version, source commit, image
name, or invalid digest. If a check fails, do not start the application.
Keep one `NOTESAPP_IMAGE` line in `.env`. Do not replace it with `latest` or
`main`. Neither tag fixes a stable release.

The current `tools/ops/select-image.sh` uses `curl` over HTTPS to download the
manifest and `jq` to check it. Older release checkouts can require the GitHub
CLI instead. The commands above work without a GitHub login in either case.

## Pull and start

```bash
docker compose pull app
docker compose up -d --no-build --wait
```

The primary install path does not build source. The settings, secret files,
and migrations use the same release checkout. Keep the image pin and release
files with your installation records. Keep its manifest when the release
provides one. Before an upgrade, make and verify a
backup. See [Upgrade](upgrade.md).

## Image names and existing pins

New releases and main images use the published image address for that
release. Existing tags and digests remain available. Keep the full existing
address when you stay on an older release.

For an upgrade, select the new release and use its complete image address
and digest. Do not replace only the package name in an old pin. An old digest
is not necessarily available under the new name. Follow the backup and
migration steps in [Upgrade](upgrade.md).

The selector keeps the image address from the fixed release manifest. Read
the release manifest for each release's image address.
Without a release manifest, take the verified image index digest from the run
summary of the matching release. Keep that digest with the matching source
checkout.

Historical `latest` aliases remain at their old images. They do not select a
current stable release. New publication does not update or delete them.
The image name change does not rename `NOTESAPP_*` settings, Compose projects,
storage folders, databases, or the local source-build image.
