# Fast forward merge

This document owns the two workflows that move `main` to the reviewed head of
one pull request, and their limits.

## Intent

The usual way is one comment. An admin writes `/ff-merge` in the pull request,
and `.github/workflows/ff-merge-comment.yml` replies there with the result.
The section "Comment command" below states its extra rules.

The maintenance way is a manual run. A person starts
`.github/workflows/ff-only-merge.yml` with a pull request number and the full
head SHA that they reviewed. The workflow uses the
checks that already ran on the pull request. It runs no test again.
A dry run is the default. It checks every gate twice and writes nothing, so
a person can see if a pull request is eligible before a real run. A dry run
does not prove that the token may write or that the rules accept the write.
`tools/ff-only-merge.mjs` holds every gate, and
`tools/ff-only-merge.test.mjs` proves each gate with a fake GitHub API.
`tools/ff-merge-comment.mjs` adds the comment rules, and
`tools/ff-merge-comment.test.mjs` proves them. `tools/ci-workflow.test.mjs`
holds the shape of both workflow files.

## Trust

- The workflow runs only from `main`, and only the code of the workflow
  commit. It checks out three files of that commit, keeps no credential in
  the checkout, and installs no package. It never reads the code of the pull
  request.
- The condition on the ref stops a run from another branch by mistake. A
  branch can change its own copy of the workflow, so the rules on `main`, and
  not this condition, protect `main` from such a copy.
- The inputs are data. They reach the script through the environment, and
  the script refuses anything but a positive integer and a full lowercase SHA.
- The manual job uses `GITHUB_TOKEN` with write access to contents and read
  access to pull requests, checks and statuses. It uses no other credential.
- One concurrency group holds every run of both workflows, and a run never
  cancels another.

## Gates

The script reads the pull request first and freezes its head H. Then it reads
the current `main` B. Each gate holds on exactly H:

- The pull request is open, not a draft, into `main`, and its head branch is
  in this repository. H is the expected SHA.
- The latest review of the CodeRabbit account approves H. The script matches
  the login, the account type and the user ID. A CodeRabbit comment and a
  green CodeRabbit status are not an approval.
- The newest CodeRabbit status on H is a success, and no other account wrote a
  status of that name. The name proves nothing about the writer, so the
  creator of each status must be the CodeRabbit account. The script reads the
  status list, because the combined status leaves the creator out. A status
  with no creator stops the script.
- Every required status check of the effective rules for `main` succeeded on
  H. A check that names an app counts only a check run from that app.
- No reviewer requests changes in their latest review.
- No review thread is open, also an outdated thread.
- B is an ancestor of H, and no commit after B is a merge commit.

A rule on `main` that the script does not evaluate stops it. So does a pull
request rule that requires approvals or named reviewers. Every list is read
to its last page, and a list that GitHub does not return in full stops the
script.

## The write

The script reads everything a second time and stops if any value changed. Then
it sends one `updateRefs` mutation for `refs/heads/main` with `beforeOid` B,
`afterOid` H and no force. GitHub applies it only if `main` still points to B,
so the write is a compare and swap on the server. The REST update has no
expected old value, so the script does not use it. The script never uses the
pull request merge endpoint, never forces, and never retries. After the write
it reads `main` back and writes the actual result to the job summary. When the
answer is lost, that read decides the report.

References:

- [updateRefs mutation](https://docs.github.com/en/graphql/reference/mutations#updaterefs)
  and [Git objects in GraphQL](https://docs.github.com/en/graphql/reference/git)
- [REST references](https://docs.github.com/en/rest/git/refs)
- [Rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
- [GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token)

## Comment command

GitHub starts the comment workflow from the workflow file on `main` for each
new pull request comment. An edited or deleted comment starts nothing. The job
condition is a cheap filter only: a person who is an owner, a member or a
collaborator, and a body that starts with `/ff-merge`. Before any write:

- The script reads the comment again by its ID. The author ID, the login, the
  account type, the pull request and the time must match the event. A comment
  that was edited, or that is older than `commentMaxAge`, stops the run, so a
  late re-run does nothing.
- The text must be exactly `/ff-merge`, or `/ff-merge` and a lowercase SHA
  prefix that the head must start with. The script never runs the text.
- The permission API must answer `admin` for the same user ID.

Until these hold, the script writes nothing and does not reply. Then it
freezes H and runs every gate twice. One gate is extra: the CodeRabbit
approval of H is older than the comment, and no force push of the head branch
is as new as that approval. A normal push moves the head away from H for good,
so H was the head when the person wrote the comment. A push after the comment
stops the run, also when CodeRabbit approves the new head later.

The script replies once in the pull request with the result and the run link.
The reply needs write access to pull requests. A reaction would need write
access to issues, so the script adds none. A failed reply never changes or
repeats the write, and the job summary keeps the actual result.

References: [comment events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
and [permissions of the token](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps).
A custom button needs a GitHub App and its own key, see
[check runs](https://docs.github.com/en/rest/checks/runs), so there is none.

## Limits

- The ruleset "Public main" (ruleset 25134765) holds the rules for `main`:
  no deletion, no non fast forward update, linear history, the required check
  `Lint` from the GitHub Actions app, a pull request with resolved threads and
  rebase merges only, no required approval, and no bypass actor. Classic branch
  protection answers "not found", which does not mean that `main` is open.
- The ruleset accepts the compare and swap from `GITHUB_TOKEN` for the head of
  an open pull request, and GitHub then shows the pull request as merged. If
  GitHub refuses a write, the job fails and shows the refusal. Nobody relaxes
  a rule to make it pass.
- The rebase merge button is not a fast forward: it writes new commits, so
  `main` does not get the reviewed head.
- The API cannot bind the reviews, the checks and the head to the ref update in
  one atomic step. The second read and the compare and swap on B make the
  window small, and the frozen H blocks new code that nobody reviewed. A
  review that changes inside the window is not seen.
- A push with `GITHUB_TOKEN` starts no `push` workflow and no Pages build.
  CI runs on pull requests only, so nothing runs after the update.
- A status creator comes from the REST status list, which the workflow token
  can read. If a creator is missing, the job stops. Nobody accepts the status
  name in place of the creator.
- Anyone can comment on a public pull request. The job condition skips a
  stranger, and the script stops a member who is not an admin, without a
  reply.
- The workflow does not close the pull request and does not delete a branch.
