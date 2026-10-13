# Public repository controls

This page owns the checks and control readback for the public core repository.

The [readiness plan](../plans/021-open-source-readiness.md) tracks the work.
[Record 0223](../decisions/0223-core-source-opens-before-distribution.md)
owns source opening. Image publication and cloud launch are separate work. [Record 0220](../decisions/0220-future-releases-use-a-new-public-image.md)
selects the new core package for future images. Keep the old package and all
its versions private and intact.
Complete the image rights proof in
[issue 317](https://github.com/tidynotebook/tidynotebook/issues/317) before the
new package becomes public. A source change does not start a release or deployment.

## Before visibility changes

- Read the final exact source and image proof from `tools/lifecycle.mjs`.
- Start `.github/workflows/ci.yml` by hand for the final commit, for example
  with `gh workflow run ci.yml --ref <branch>`. Read all its jobs, including
  the verify, performance and image jobs. A pull request runs only the fast
  check (record 0224). A local source receipt does not prove those jobs.
- Read the final source, image and release material secret review.
- Complete the fresh standalone setup of the exact candidate.
- Confirm the accepted launch dependencies and the authorized visibility scope.
- Keep the shared project private. Contributors use repository issues.
- Keep old signed tags, fixed image digests and `pr-screenshots` intact.
- After the switch, a follow-up change puts the full jobs back on each pull
  request (record 0224).

Inspect existing settings before a write. Keep each response and read back
every write. Stop when a response differs from the intended value. Never
disable a protection to permit a rejected landing.

## Controls that work while private

Use the administrator account of the core repository. These commands enable
the existing checks and then read their state:

```sh
gh api -X PUT repos/tidynotebook/tidynotebook/actions/workflows/ci.yml/enable
gh api repos/tidynotebook/tidynotebook/actions/workflows/ci.yml
gh api -X PUT repos/tidynotebook/tidynotebook/vulnerability-alerts
gh api -i repos/tidynotebook/tidynotebook/vulnerability-alerts
gh api -X PUT repos/tidynotebook/tidynotebook/automated-security-fixes
gh api repos/tidynotebook/tidynotebook/automated-security-fixes
gh api repos/tidynotebook/tidynotebook/actions/permissions/workflow
gh api repos/tidynotebook/tidynotebook/collaborators
```

The workflow must be active. Alerts readback must succeed. Automatic fixes
must be enabled and not paused. The default workflow token stays read-only
and cannot approve pull requests. Confirm that the owner keeps administrator
access. Do not grant access to a new person as a side effect of launch work.

## Legacy package access

Before the core repository opens, read the old package settings and its
versions. Save its inherited access, person and team grants, Actions access,
and Codespaces access. Package visibility and inherited access are separate.
[GitHub explains these controls](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).

An inheritance change overwrites existing grants. Preserve owner Admin access
and known private consumer Read grants. Remove inherited access from the core
repository. Remove its Actions and Codespaces grants when present. Read back
that the old package stays private and that each required private grant stays.
Core CI builds from source. Future releases use the new core package. Neither
needs access to the old package. Keep the new package's source grants separate.

```sh
gh api orgs/tidynotebook/packages/container/tidynotebook
gh api --paginate 'orgs/tidynotebook/packages/container/tidynotebook/versions?per_page=100'
```

Save every old version identity and digest before the access change. Compare
all of them after it and after opening. Do not delete a version or move a tag.
If the package settings cannot be read, keep this launch step open.

## Visibility and public controls

Run the visibility command only when the accepted launch scope permits it:

```sh
gh api -X PATCH repos/tidynotebook/tidynotebook -f visibility=public
gh api repos/tidynotebook/tidynotebook
```

Read the existing rulesets first. Update a matching rule instead of creating
a duplicate. The default branch must refuse deletion and a non-fast-forward
push, and require linear history. These rules fit the exact-head landing of
[record 0218](../decisions/0218-review-is-optional-for-landing.md).

```sh
gh api repos/tidynotebook/tidynotebook/rulesets
gh api -X POST repos/tidynotebook/tidynotebook/rulesets --input - <<'JSON'
{"name":"Public main","target":"branch","enforcement":"active","conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},"rules":[{"type":"deletion"},{"type":"non_fast_forward"},{"type":"required_linear_history"}]}
JSON
gh api repos/tidynotebook/tidynotebook/rulesets
gh api repos/tidynotebook/tidynotebook/rules/branches/main
```

Enable available secret protection and private vulnerability reporting:

```sh
gh api -X PATCH repos/tidynotebook/tidynotebook --input - <<'JSON'
{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}
JSON
gh api repos/tidynotebook/tidynotebook
gh api -X PUT repos/tidynotebook/tidynotebook/private-vulnerability-reporting
gh api repos/tidynotebook/tidynotebook/private-vulnerability-reporting
gh api -i repos/tidynotebook/tidynotebook/vulnerability-alerts
```

Read both secret protection states as enabled and reporting as enabled.
Read any returned alerts and handle each finding. Do not treat a feature that
the plan or token refuses as enabled.

## Anonymous access

Use a process with no GitHub or registry credential. Fetch the public source
at the final commit and its source guide. A signed-in read is not this proof.
For a separately authorized image publication, pull its fixed digest and check
its source revision, notices and source path.

For future image publication, package visibility is separate from repository
visibility. Read the new core package only after it exists and publication is
authorized. Read its visibility and test an anonymous pull:

```sh
gh api orgs/tidynotebook/packages/container/core
```

Read the old package and all its retained versions to confirm that they stay
private and keep the saved identities:

```sh
gh api orgs/tidynotebook/packages/container/tidynotebook
gh api --paginate 'orgs/tidynotebook/packages/container/tidynotebook/versions?per_page=100'
```

Use the credential-free process for an old fixed image pull. Access must be
refused. A DNS, network or registry failure does not prove private access.
Read back the separate grants as well as private visibility.

Never make the old package public as a shortcut. A new public image is not
required for source opening. Its future publication needs separate scope,
rights proof, current security review and retained-risk disposition.

After all readbacks pass, update the plan and the matching board issues.
Save the exact source, image and remote check references in the task context.
