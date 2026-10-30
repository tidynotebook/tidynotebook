# Fast forward merge

An admin or a user with repository push access can comment `ff-merge` on a
pull request to fast forward `main` to its current head. `/ff-merge` also
works. Either command accepts an optional lowercase commit SHA prefix of
12 to 40 characters. The prefix must match the current head.

The comment workflow checks the author's current permission through the
GitHub API. Read and triage access do not permit a merge. It reads the
comment again to confirm its author and pull request. Edited comments and
comments older than ten minutes are refused. Post a new comment to try again.

Both merge workflows run trusted code from `main`. They treat inputs as data
and never run PR code. They require no CodeRabbit approval, review state,
resolved threads, CI result, or status result. They do not read those results
or start tests, CI, or image publication.

The manual workflow accepts a PR number and the full head SHA. Its dry run
is on by default. A dry run checks the fast forward and makes no change.
Manual runs use GitHub's workflow dispatch access control.

The PR must be open and target `main` in this repository. The script reads
the PR head and `main` twice. It stops if the target changes. `main` must be
an ancestor of the head. The update uses `updateRefs` with the previous main
SHA and `force: false`. A concurrent change to `main` causes GitHub to refuse
the update. The script never forces or retries a write.

GitHub still enforces the repository rules on the ref update. The workflows
do not change or bypass those rules. A refusal appears in the result.
A successful update uses the PR commits without creating new commits.
GitHub marks the PR as merged. The workflow does not delete its branch.

The comment workflow posts the result and the run link on the PR. If that
reply fails, the job summary still records the result. The script reads
`main` after each write attempt to report the actual result, including when
the API response is lost.

Both workflows share one queue. A new request does not cancel an earlier
request. A write with `GITHUB_TOKEN` does not start a push workflow.
