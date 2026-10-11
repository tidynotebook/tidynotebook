# Public material review

Date: 2026-10-11
Commit: `5c37a2a79c3ff49f4fa3c28d19f481b251afb560`

This review extends the [readiness audit](open-source-readiness.md). It reads
the public core material and the remote material that a visibility change can
expose. It does not copy the private cloud repository. Raw reports stay in
the owned worktree under `.tooling/public-material/`.

## Method and scope

- Read all 118 available GitHub Actions run log archives. Extract their 243
  text files and scan them with Gitleaks, with full redaction.
- Fetch the 39 GitHub release records and the two attached official assets.
  Scan the asset bytes. The source archives derive from the Git refs that
  the earlier all-ref history scan reads.
- Search the saved issue, PR, issue-comment and PR review-comment text for
  GitHub user attachment addresses. No such address is present. The review
  does not claim access to an attachment that the API does not expose.
- Inspect contact sheets of all 248 current screenshots, 38 additional
  historical screenshot blobs, and 32 other image blobs reachable from local
  refs. The other images are product icons and test evidence. The screenshot
  branch stays intact.
- Pull all nine existing core container digests. Save their configurations
  and all retained image layers. Inspect the paths of 158,848 layer files and
  scan the extracted bytes. A final file-system view alone cannot show a
  secret that a later layer removes, so this review reads each layer.
- Compare each image revision label with a commit in the repository history.
  Each of the nine revisions exists.

The scan reads the actual downloaded material. It does not run a historical
image. The scanner and visual review can find exposed data. They cannot prove
that no unknown secret exists.

## Results

The logs, image configurations and official assets have no secret match.
The log address inventory contains public build, package and source hosts.
It contains no private service host or person mail address.

The layer scan reports 212 matches at 18 distinct file paths. Each match is
classified against its extracted source line. None remains unclassified:

- Fixed core signing test values in `apps/server/src/auth/proof-of-work.test.ts`
  and `apps/server/src/auth/verification.test.ts`.
- The test address and rate-limit namespace in
  `apps/server/src/plugins/attempt-store.test.ts`.
- Fixed WebSocket handshake and string validation values in upstream tests.
- Public module hashes, certificate public key pins and a release key
  fingerprint in upstream documentation.
- SDK request placeholders, an attribute example and registry authentication
  examples in upstream documentation.
- Code identifiers and a size constant in the Node and npm files.

No layer path names a mounted secret, a Git or SSH directory, a database
file, a backup or one of the installation credential files.

The images show synthetic notes, test accounts, guide text and application
proof. Account addresses use example or invalid domains. The API key images
show the name and revoke controls. They do not show an issued key. No private
note, production credential or third-party person data is found in this visual
review. Small text in a contact sheet is a limit of the visual review.

Git author metadata retains the owner's personal and work mail addresses.
It also retains the T3 Code and Dependabot bot identities. These are ordinary
author records. The accepted intact-history policy keeps them. A work address
alone does not establish a third-party copyright claim. Record 0188 states
the existing ownership.

The core design and decision history describes the cloud boundaries and
business choices. It is the retained core record of the accepted design.
The review finds no copied private cloud source, credential or private
runbook in this material. No additional owner approval is required solely
because this accepted history exists.

## Controls read back

Dependabot alerts are enabled. Their readback returns success with no content.
Automatic security fixes are enabled and are not paused. The alert list is
empty at this read; this is not a substitute for the local dependency audit.

The CI workflow was manually disabled. It is now active. The first readiness
PR has only its sign-off run, so the final candidate still needs the source,
image and performance jobs of the active workflow.

The default Actions token is read-only and cannot approve pull requests.
Current workflow actions use commit pins. Repository issues are enabled.
The owner has administrator access. The other collaborator has read access.
The shared project stays private, and the contribution guide gives a public
issue path without exposing the cloud work.

The private repository plan refuses branch protection and ruleset reads.
Private vulnerability reporting is unavailable. These controls need public
visibility or the appropriate private plan. They are not complete.

## Open work

The legacy image license and notice findings of
[issue 317](https://github.com/tidynotebook/tidynotebook/issues/317) remain.
No secret finding clears those rights requirements. Keep the existing
container package private while its launch strategy is unresolved. Preserve
all fixed image digests and signed tags.

The accepted launch timing of record 0188 and
[issue 284](https://github.com/tidynotebook/tidynotebook/issues/284) still applies.
The public branch controls, reporting and anonymous access checks remain in
[issue 319](https://github.com/tidynotebook/tidynotebook/issues/319).
The final candidate and its new image need a fresh secret review and standalone
setup proof in [issue 320](https://github.com/tidynotebook/tidynotebook/issues/320).

This review completes the retained-material inspection for
[issue 318](https://github.com/tidynotebook/tidynotebook/issues/318). It does not
claim that the final candidate or the public launch is complete.
