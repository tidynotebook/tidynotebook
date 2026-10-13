# Agent lifecycle

This page owns phase routing, saved proof, and the public lifecycle boundary.

[Record 0212](../decisions/0212-agent-lifecycle-proof.md) sets the lifecycle.
[Record 0213](../decisions/0213-build-and-publish-one-release-image.md) sets image publication.
[Record 0214](../decisions/0214-read-the-completed-automatic-review.md) sets automatic review readback.
[Record 0218](../decisions/0218-review-is-optional-for-landing.md) makes review optional for landing.
Commands perform repeated operations. Skills make the choices of a unit.
Each skill has one start state and one end state. The catalog below routes work.
It does not repeat the instructions of a unit.

## Scope and continuation

A feature or fix request starts preparation and includes build, proof, and PR
review. It includes landing when the session permits it. An agent continues
through those units without asking for the same permission again. A release
request includes preparation when needed, then publication. An
interruption resumes the saved unit. A build request never starts a release,
live deploy, host restore, retirement, or machine cleanup.

Only a missing required input or a real conflict needs a question. The agent
continues work that does not depend on that answer. A review or image wait uses
a completion event or a bounded read. It does not repeat an expensive gate.

## Catalog

| Skill                      | Start                                    | End                                        |
| -------------------------- | ---------------------------------------- | ------------------------------------------ |
| `prepare-change`           | Core task or resume                      | Saved owner, context, scope, and phase     |
| `design-change`            | Architectural choice                     | Accepted record and linked work            |
| `build-change`             | Prepared approved change                 | Code and focused tests                     |
| `prove-change`             | Clean source                             | Exact input proof and screen evidence      |
| `test-application`         | Browser check request                    | Observed local application and screenshots |
| `review-change`            | Current proof or review findings         | Optional review and resolved threads       |
| `land-change`              | Proved head and landing scope            | Read back exact merged source              |
| `release-core`             | Explicit release or release resume       | Fixed tag, image, assets and notes         |
| `setup-project`            | Named new target                         | Ready contributor worktree or host         |
| `operate-host`             | Named host check or backup               | Health or verified archive evidence        |
| `recover-host`             | Named verified archive and empty target  | Proved restored target                     |
| `maintain-project`         | Named maintenance scope                  | Checked change through normal units        |
| `manage-host-credentials`  | Named credential operation and consumers | Verified replacement and revoke state      |
| `retire-host`              | Explicit named retirement                | Stopped service and stated retained data   |
| `cleaning-up-after-a-task` | Owner invokes this exact skill           | Owner machine cleanup                      |

The skill sources live in `.agents/skills/`. `.claude/skills/` links each source.
The cleanup skill remains owner-only. No unit invokes it.

## Context and ownership

`tools/task-prepare.mjs` saves the public context and the current actual diff.
A repeated task keeps its saved phase and paths when the caller omits them.
It keeps user context, dependencies, and remaining work. The explicit context
command refreshes the current commit and guide inputs. Internal resume leaves
omitted phase and paths to the private owner. This context grants no new permission.
`tools/agent-context.mjs` covers wire, domain, storage, migration, configuration,
and image effects. Its conservative impact result means read the operator guide
and state the consumer effect. It does not claim every flagged change breaks it.
Optional consumer context adds a guide when present. Standalone work passes
without it. Explicit internal work requires its private owner and sends context
there. Private guide contents never enter a public archive.

## Proof and review

`tools/lifecycle-state.mjs` binds a clean commit, tree, repository, environment
hash, runtime, package manager, and gate definitions. `tools/lifecycle.mjs` owns
canonical proof, saved logs, PR bodies, optional review reads, and exact landing.
A local receipt is a same-user cache. It is not an external attestation. A
partial receipt, missing log, changed log, changed input, or failed command
cannot permit landing. A gate must leave the checked inputs unchanged.
Image proof builds an archive of the checked commit for `linux/amd64` and tests
that image.

The PR states the result, proof, public compatibility effect, reviewed release
type and note, and light and dark screen evidence. Screenshots go through
`tools/pr-screenshots.mjs`. For a known automatic review integration, `--auto-review-on-ready` uses the
new PR trigger once. A changed head on an existing ready PR uses one manual
request. A saved automatic intent survives a lost PR creation response.
Landing needs no review (record 0218). A requested review keeps its rules.
Every thread must be resolved. All observed checks must pass. A fast-forward
push of the exact head refuses unseen main work. A rejected push never grants
permission to bypass protection. The merged commit and tree must match proved source. A saved validated write
attempt permits recovery of a successful push whose result was lost. A dry run
keeps that attempt unchanged.

## Release and consumers

[Record 0215](../decisions/0215-release-publishes-prepared-artifacts.md) separates
preparation and publication. `tools/release.mjs` prepares notes, reviews source,
runs source and image gates, and stores the prepared image and official assets
remotely. The source image name is fixed. The draft release holds the assets.
`tools/release-publish.mjs` publishes these artifacts from any runner. It uses
no local proof receipt or build image and starts no tests or source review.
It creates the signed tag, copies registry references, and publishes the draft.
Milestone work is separate. A readback checks each remote write.
[Record 0216](../decisions/0216-release-publication-has-one-remote-writer.md)
gives all runners one remote publication lock. Latest version checks and
writes run inside that lock. The release skill owns stopped-write recovery.

[Record 0220](../decisions/0220-future-releases-use-a-new-public-image.md)
sets the future image package. `tools/release-registry.mjs` owns its address
and read-only legacy selection. An old draft cannot publish. An old published
release permits status only. Its fixed manifest selects its image for diagnostics.
The [published images guide](../guide/published-images.md) reads the published digest for Compose.

`tools/release-check.mjs` keeps the older before and after diagnostic.
Publication does not run it. The after gate reads
the cryptographic tag result, immutable version digest, and image
revision for the exact source commit. A later latest alias does not invalidate that release.
`tools/release-manifest.mjs` validates the public asset. The release publishes
its manifest and operator contract. It reads both exact asset byte streams before the next write. The after gate
compares the assets with the fixed source, image, operator, migration, and proof.
Migration and operator digests bind source. Historical checks read the tagged
Git source and original public proof metadata. They need no current machine
receipt. Saved publication digests also hold the original asset bytes.
GitHub attestation is not a release requirement.
A consumer reads the published digest. It never rebuilds a released artifact.

A legacy release has no new manifest. A consumer keeps its existing pin under
its existing verification policy. Moving to this lifecycle requires a new
release with the manifest and exact published image. A missing legacy asset is not filled
with invented proof. The lifecycle change takes a feature release classification.

## Host procedures

Existing tools in `tools/ops/` own host checks, backup, archive verification,
and restore. They also own the setup steps that the guide asks a person to
run: the secret files, the quick start, and the selection of a published
image. A guide page names the script and states what it does, so the person
never runs a long block of shell that nobody tests. Restore targets are empty and name the same installation identity.
No lifecycle unit clears live data to make recovery pass. Credentials stay in
protected files. Machine cleanup stays outside the task lifecycle.
