---
name: review-change
description: Opens a core PR and handles review feedback when review is requested. It does not merge, release or deploy.
---

# Review change

Start with focused tests and a committed branch. Use conventional commits.
Write a short PR body with the result, test evidence and public compatibility
effect. Push the branch and open the PR with `gh pr create --body-file`.
Hosted checks prove its current head. No local receipt or release metadata
trailer is needed (record 0228).

For a screen change, publish light and dark screenshots through
`tools/pr-screenshots.mjs`. Return the PR URL and link it to the session at once
when `link_pull_request` is available. Use `watch_pull_request` and end the turn
while checks run. Use `unwatch_pull_request` before final handback.

Review is optional. Request it only when the owner or chief asks. Read findings
from GitHub, fix each accepted finding and state evidence for a rejected one.
Resolve a thread only after its cause is fixed or its conclusion is supported.
New commits need new hosted proof. No automatic review parser or saved review
receipt is a landing requirement.
