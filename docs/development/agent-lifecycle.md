# Agent lifecycle

This page owns phase routing, hosted proof, and the public lifecycle boundary.

[Record 0228](../decisions/0228-hosted-proof-and-release.md) owns hosted proof,
protected landing and release. Skills route work through the catalog below.

## Scope and continuation

A feature or fix request starts preparation and includes build, proof, and PR
review. It includes landing when the session permits it. An agent continues
through those units without asking for the same permission again. A release
request waits for the hosted release transition below. An
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
| `prove-change`             | Clean source                             | Hosted proof and screen evidence           |
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

## Proof, review and landing

The [verification guide](verification.md) names the required hosted checks.
Local `pnpm verify` is optional. The PR records focused tests, hosted runs,
public compatibility effects and light and dark screen evidence when needed.
Screenshots go through `tools/pr-screenshots.mjs`.

Review is optional. Ask for it only when the owner or chief requests it.
Resolve every open thread. Main requires a PR, Check, Sign-off and linear
history. The merge queue tests combined changes before it lands them. No actor
bypasses protection. Main advancing alone does not require a manual rebase.
Use the `land-change` skill and read back the actual merged commit.

## Release transition

Release is unavailable between steps 3 and 4 of
[issue 390](https://github.com/tidynotebook/tidynotebook/issues/390).
The old release preparation calls a landing function that pushes directly to
main, which protection now refuses. No release is planned in this window.
Do not run the old commands or add a bypass.

Step 4 adds the hosted release workflow and removes `tools/lifecycle.mjs`,
its receipt helpers and the old release commands together. They remain on disk
only for that deletion. No compatibility code or new local process tool replaces
them. Historical release assets stay fixed and readable.

## Host procedures

Existing tools in `tools/ops/` own host checks, backup, archive verification,
and restore. They also own the setup steps that the guide asks a person to
run: the secret files, the quick start, and the selection of a published
image. A guide page names the script and states what it does, so the person
never runs a long block of shell that nobody tests. Restore targets are empty and name the same installation identity.
No lifecycle unit clears live data to make recovery pass. Credentials stay in
protected files. Machine cleanup stays outside the task lifecycle.
