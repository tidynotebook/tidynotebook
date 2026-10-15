# Git and GitHub

- Use conventional commits.
- Never force push.
- Do not use a bare `#N` in a GitHub comment or pull request body. Write
  `item 1`, `(2)`, or a plain list. Use `#NNNN` only for a real pull request or
  issue.
- Work happens in a git worktree on a short-lived branch.
- A change lands through a protected GitHub pull request and merge queue.
  Required hosted Check and Sign-off results prove the selected source.
  Resolve every review thread. Review is optional (record 0218).
  No actor bypasses protection. Never push a change directly to main.
- A build request includes landing only when the session permits it.
  It never permits release or live deployment.
- A pull request shows its screenshots through `tools/pr-screenshots.mjs`,
  which adds them to the `pr-screenshots` branch. Never delete that branch.
- Stay inside the active worktree. All edits, commits, and untracked files
  belong in that worktree.
- Only the owner starts the `cleaning-up-after-a-task` skill. Never run it on
  your own, and never remove another worktree, another branch, or Docker data
  outside it.
- Follow the `release-core` skill for an explicit release request.
  Release is unavailable during the transition to the hosted workflow
  (record 0228). The old commands are removed in step 4 of issue 390.
  A pushed signed tag is never moved and never deleted.
