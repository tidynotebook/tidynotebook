# Core images

`release.yml` is the only core image publication path. Each main push builds
and proves native amd64 and arm64 images, then publishes
`ghcr.io/tidynotebook/tidynotebook:main`. Fast forward merges use `GITHUB_TOKEN`, which
does not trigger push workflows. The merge workflows do not start image publication. Run this workflow
manually on main to publish an image after a fast forward merge. Late runs stop if main has moved. Each ref has its own
concurrency group, so publication on one ref cannot block another.

An existing stable tag `vMAJOR.MINOR.PATCH` selects a version. Push the tag or
run the workflow manually on that tag. The source must be on main. The latest
same-repository push CI must have a successful `Check` on that exact SHA from
GitHub Actions app `15368`. A PR branch push supplies this proof after a fast
forward merge. Fork runs and checks from other apps cannot supply it.

Both native images pass the distribution source and notice proofs before
publication. Builds restore the Actions API v2 caches `core-amd64` and
`core-arm64`; release builds do not write caches. Tested image archives expire
after one day.
Publication checks each immutable artifact ID and the SHA-256 of its ZIP
against the native build outputs before extraction. It uses Skopeo to copy the
tested images by digest without a rebuild or public architecture tags. Conversion
rewrites the config and recompresses layers. Publication checks that labels and
uncompressed layer digests match the tested image, then checks that the final
index contains exactly the pushed image digests. Publish jobs use Ubuntu 24.04
and require Skopeo `1.13.3`; a missing or different version stops publication. Version `v1.2.3` publishes
`:1.2.3`. Existing version tags cannot be replaced. New publication does not write a `latest` alias. Historical `latest` aliases
remain at their old images; do not use them for a new installation.
The index has GitHub OIDC provenance, with no stored signing key.

Version publication requires the `release` environment, with no required
reviewers. Allow only tags `v*` through its custom branch policy. Disable
administrator bypass. Use no wait timer and no environment secrets. Create
this environment before the first version run. The workflow checks its
protection before building and again before publication. A required-reviewer
rule or wait-timer rule stops the workflow, even with an empty reviewer list
or a zero timer. Versioned releases
publish without manual approval, under
[decision 0236](../decisions/0236-versioned-releases-publish-without-manual-approval.md).
Automatic main publication also has no environment approval.

The run summary gives the source SHA and image index digest. In a separate
cloud PR, set `core.json.ref` to that SHA and `core.json.image` to
`ghcr.io/tidynotebook/tidynotebook@sha256:<index digest>`. Cloud source sync and deployment
then use the same core version. This workflow does not deploy cloud.

This activates image publication from decision 0228 with stable tags supplied
by the maintainer. It replaces its local dispatch command, SSH tag signing,
release notes, and resumable publication design. It creates no Git
tags or GitHub Releases. Distribution and notice checks remain required.
Vulnerability scanning is follow-up work and is not a publication gate yet.

## Release maintenance

For each stable release, update the install example to its real source tag
and verify both install guides with its image index manifest and digest. Test the
published platforms before changing the platform list. Never replace an
existing version tag or digest to add a platform. Before the install guides
select a new stable release, update them with its exact tag and verified image
digest.

## Image package access

New main and version images publish only to the public
`ghcr.io/tidynotebook/tidynotebook` package. Before the image-name change
merges, verify these GitHub package settings:

- Visibility is Public.
- The package is linked to `tidynotebook/tidynotebook`.
- Manage Actions access gives that repository Write access.

The publication script checks public visibility and the linked repository
before any registry write. The workflow token has package write permission.
Both tested native images go into one index with GitHub OIDC provenance.
Existing `core` tags and digests are never copied, updated, or deleted by the
new workflow. [Decision 0237](../decisions/0237-new-images-use-the-public-tidynotebook-package.md)
replaces the earlier image-name policy. See the
[migration note](../guide/published-images.md#image-names-and-existing-pins)
before changing an existing pin.

## A failed publication

A version tag is fixed after the registry accepts it. A failed final check or
attestation can leave that tag published without a successful release run.
Do not delete, move, or replace the tag to retry. Do not create a GitHub
Release or deploy that image until the index, both native images, and its
provenance are verified.

Record the workflow URL, source SHA, image index digest, native child digests,
and tested artifact IDs. Use `docker buildx imagetools inspect` with the full
image address and digest to read the index. Use `gh attestation verify
oci://ghcr.io/tidynotebook/tidynotebook@sha256:<index digest> --repo
tidynotebook/tidynotebook` to check provenance. Keep the tested artifacts before
their one-day expiry. A recovery that writes missing provenance needs a
separate reviewed workflow for that exact published digest and its original
tested artifacts. The normal publication path has no resume mode and refuses
an existing fixed tag. This image-name change adds no recovery write path.

## Build cache

CI uses the GitHub Actions cache, with a separate scope for each architecture.
Only canonical repository main push and manual main CI builds export caches.
Branch and fork PR builds restore accessible default-branch caches or build
without them. Stable tags and native release builds only restore caches.
No build needs a GHCR cache package or registry login for cache access.
Existing public image names, version pins, publication, and provenance do not
change.

The local `cache-runtime` JavaScript action supplies `ACTIONS_RUNTIME_TOKEN`
and `ACTIONS_RESULTS_URL` to shell steps. The token is masked and stays out
of Compose files and command arguments. Missing runtime values select a build
without remote cache. Imports and exports use the bounded timeout in
`tools/ci-cache.mjs`. Export errors are ignored. A failed build with remote cache retries once with no
remote cache; the retry must pass. An absent or evicted cache is safe.

[Docker's API v2 requirements](https://docs.docker.com/build/ci/github-actions/cache/)
are Buildx 0.21.0, BuildKit 0.20.0, and Compose 2.33.1 or later. The pinned
Buildx setup action installs the current Buildx and a container builder with
current BuildKit. CI uses hosted runner Compose. Build logs show the installed
versions. An incompatible cache backend can fall back to the full build.
See [runtime authentication and cache scopes](https://docs.docker.com/build/cache/backends/gha/)
and [Compose cache support](https://docs.docker.com/reference/compose-file/build/#cache_from).

Before cache-package retirement, check main exports and later warm restores for
both scopes in hosted logs. Check a fork PR restore or full build too. A branch
PR cannot prove a main export. Local builds cannot prove the hosted runtime
authentication or default-branch cache access. Do not create a release tag for
cache validation. Keep the old public cache version until all consumers have
migrated and older jobs have finished.
