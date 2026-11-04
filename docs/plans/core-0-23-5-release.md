# Core v0.23.5 publication plan

Status: proposed. Publication is not authorized.

This plan prepares core image and GitHub Release publication. It does not
permit a tag, workflow dispatch, registry write or deployment. The changelog
date is proposed. Confirm the actual publication date before approval.

## Decisions

Use the existing [core release process](../development/core-releases.md) and
[decision 0236](../decisions/0236-versioned-releases-publish-without-manual-approval.md).
The owner must approve publication before the operator pushes a stable tag.
The workflow has no later manual approval step. Keep the environment policy
and package permissions unchanged.

## Proposed scope and limits

The proposed [changelog](../../CHANGELOG.md) includes PRs
[552](https://github.com/tidynotebook/tidynotebook/pull/552),
[556](https://github.com/tidynotebook/tidynotebook/pull/556),
[553](https://github.com/tidynotebook/tidynotebook/pull/553),
[554](https://github.com/tidynotebook/tidynotebook/pull/554) and
[555](https://github.com/tidynotebook/tidynotebook/pull/555).
The preparation base is `7244f6bcbe9770d4d0b4abe2cb6c63cb8cb496c4`.
It contains all five merged changes. It is not the final release source:
the selected source must also contain the approved changelog.

Native library fixes do not prove worker memory limits or filesystem,
network and process isolation. Security issues
[332](https://github.com/tidynotebook/tidynotebook/issues/332),
[385](https://github.com/tidynotebook/tidynotebook/issues/385),
[386](https://github.com/tidynotebook/tidynotebook/issues/386) and
[387](https://github.com/tidynotebook/tidynotebook/issues/387) stay open.
The fixes do not establish that the image has no vulnerabilities. Custom
native libraries and bare Node have scanner coverage limits.
The checkout recipe does not prove real Paddle behavior.

## Fixed-source gates before owner approval

1. Merge the preparation PR only after chief approval and the normal checks
   and review. Select and record the exact full main SHA after merge. Check
   that it contains the scope above and the approved changelog. If the release
   date changes, correct it through review before source selection.
2. Require a successful `Check` from the latest same-repository push CI on
   that exact SHA, from GitHub Actions app `15368`. Record its run URL, event,
   repository, SHA and result. A prior PR head does not prove a different
   merge SHA. Cancelled CI does not meet this gate. Keep the selected source
   fixed if main advances and verify that it remains on main.
3. Recheck the remote tag, GitHub Releases and public image versions. The
   preparation check found latest stable `v0.23.4` and no `v0.23.5` tag,
   GitHub Release or `0.23.5` image. This does not reserve the version.
4. Read back package visibility, repository link and Actions Write access.
   Read back the release environment: custom `v*` tag policy, no required
   reviewers, no wait timer, no secrets and administrator bypass disabled.
   Stop for an owner decision if settings differ. Change no permissions.

Automatic main publication can run before this plan is approved. It can
update the `main` image, but does not prove stable publication. The observed
base push CI was cancelled. Its automatic main release run was in progress
at the single preparation check. Neither is final-source release evidence.

## Exact owner approval request

After all gates pass, replace the fields below with the actual values and
send the complete request to the owner. An unfilled request is not approval.

> Approve core v0.23.5 image and GitHub Release publication from source
> `<full selected main SHA>` with changelog date `<confirmed date>` and
> successful same-repository push CI `<run URL>` for that SHA. Approve an
> annotated `v0.23.5` tag at only that source and a push of only that tag to
> start the existing release workflow. Approve publication of
> `ghcr.io/tidynotebook/tidynotebook:0.23.5` for native amd64 and arm64, then
> creation of the GitHub Release only after image and provenance verification.
> Keep package versions unchanged. This approval excludes npm publication,
> permission changes, cloud pins, mirrors, checkout changes and deployments.

Record the owner's answer with the fixed source and CI receipt. If the source,
version or scope changes, obtain approval for the replacement request.

## Publication and verification after approval

1. Use only `.github/workflows/release.yml`. Create the annotated tag on the
   approved source and push only that tag. Do not dispatch another workflow.
   Never move or replace a tag or published digest.
2. Require both native builds and source, notice and loaded-library proofs.
   Record the successful workflow URL, source, tag, immutable artifact IDs
   and ZIP SHA-256 values. Preserve artifacts before their one-day expiry.
3. Require the workflow to verify artifact identity and hashes before copying
   the tested images without a rebuild. Require label and uncompressed-layer
   checks and an index with exactly the tested amd64 and arm64 child digests.
4. Read back the public index and both native child digests. Verify anonymous
   registry access and GitHub OIDC provenance for the exact index digest with
   `gh attestation verify`. Record commands, results and all digests outside
   the worktree. A local image ID is not a registry digest or provenance.
5. Generate notes from the fixed committed changelog with
   `node tools/release-notes.mjs 0.23.5`. Create the GitHub Release only after
   all publication and provenance checks pass. No new `latest` alias is part
   of this release. Workspace packages stay private; do not use npm publish.
6. If a final check fails after a registry write, preserve the fixed tag,
   digest and artifacts. Stop before GitHub Release creation or deployment.
   Follow the failed-publication process; do not replace the version to retry.

## Follow-up work

Prepare a separate guide PR with the verified source tag, image name, index
digest and tested platforms. Check `docs/guide/quickstart.md`,
`docs/guide/self-hosting.md`, `docs/guide/upgrade.md` and
`docs/guide/published-images.md`. Do not select an unverified stable digest.

Cloud [issue 173](https://github.com/tidynotebook/cloud/issues/173) stays open.
Cloud adoption needs a separate bound worktree and owner approval. Its PR must
use the fixed source and immutable index, update the required mirrors and
checkout recipe, and prove real Paddle loading, ready and error states at the
required screen sizes in both themes. Staging and production deployments each
need separate authorization. This plan authorizes no worker boundary test or
security issue closure.
