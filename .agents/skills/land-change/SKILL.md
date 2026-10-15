---
name: land-change
description: Lands an authorized core PR through the protected GitHub merge queue after hosted checks. A review is optional. It does not release or deploy.
---

# Land change

Start with an authorized PR. Read its current head, required hosted checks and
review threads. Resolve each open thread. Review is optional. Never bypass a
protection, push directly to main, or force push.

Add the PR to the queue with the head that you read:

```sh
gh pr merge "$PR" --auto --match-head-commit "$HEAD"
```

GitHub runs checks on the merge group before it lands. Do not rebase just
because main advances. A conflict needs a fix and new hosted proof.
Use the PR watcher when available and end the turn while checks run. Otherwise,
read status with a bound. Read back the merged commit before reporting success.
An uncertain write needs a read before another write. Branch and worktree
cleanup stays an owner action. No local receipt is a landing requirement.
