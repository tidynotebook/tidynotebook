#!/usr/bin/env bash
# Print the fixed image of one official tidy notebook release.
#
# Run it from a checkout of that release. It downloads the release manifest
# with the GitHub CLI, checks that the manifest belongs to this repository,
# this tag and this checkout, and prints one NOTESAPP_IMAGE line with the
# image digest. The digest names one image for good, so a later pull cannot
# get a different image.
set -euo pipefail

REPOSITORY='tidynotebook/tidynotebook'
IMAGE='ghcr.io/tidynotebook/core'

fail() {
  printf 'notesapp image: %s\n' "$1" >&2
  exit 1
}

if [[ "${1:-}" == --help ]]; then
  printf '%s\n' 'Usage: tools/ops/select-image.sh TAG' \
    '  Prints the NOTESAPP_IMAGE line of one release, for example v1.2.3.'
  exit 0
fi
[[ $# -eq 1 ]] || fail 'name one release tag, for example v1.2.3.'
TAG="$1"
[[ "$TAG" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || \
  fail "$TAG is not a release tag. A release tag looks like v1.2.3."
command -v gh >/dev/null 2>&1 || fail 'the GitHub CLI, gh, is required.'
command -v jq >/dev/null 2>&1 || fail 'jq is required.'

commit="$(git rev-parse --verify --quiet "$TAG^{commit}")" || fail "this checkout has no tag $TAG."
[[ "$(git rev-parse HEAD)" == "$commit" ]] || fail "this checkout is not at $TAG. Check out $TAG first."

directory="$PWD/.tooling/published-release/$TAG"
mkdir -p "$directory"
gh release download "$TAG" --repo "$REPOSITORY" \
  --pattern release-manifest.json --dir "$directory" --clobber

image="$(jq -ser --arg tag "$TAG" --arg commit "$commit" \
  --arg repository "$REPOSITORY" --arg image "$IMAGE" '
  select(length == 1) | .[0]
  | select(.repository == $repository
    and .tag == $tag and .version == ($tag | ltrimstr("v"))
    and .source.commit == $commit
    and .image.reference == $image
    and (.image.digest | type == "string" and length == 71
      and test("^sha256:[a-f0-9]{64}$")))
  | .image.reference + "@" + .image.digest' \
  "$directory/release-manifest.json")" || fail "the manifest of $TAG does not match this checkout."
[[ -n "$image" ]] || fail "the manifest of $TAG does not match this checkout."

printf 'NOTESAPP_IMAGE=%s\n' "$image"
