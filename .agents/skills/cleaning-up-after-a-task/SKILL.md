---
name: cleaning-up-after-a-task
description: Removes completed core task worktrees and local Docker resources after merge, or when the owner requests cleanup.
---

# Clean up after a task

Confirm that the PR is merged before automatic cleanup.
Remove the completed task worktree and its local and remote branch.
Keep the main checkout, `pr-screenshots`, and work with an open PR or unsaved changes.
Do not update the main checkout or start a replacement deployment.

Stop the local core deployment with its Compose files and settings:

```sh
docker compose --env-file .local-app/compose.env -p notesapp-local -f docker-compose.yml -f compose.local.yaml down --volumes --rmi all --remove-orphans
docker compose -p notesapp-test -f compose.test.yaml down --volumes --rmi all --remove-orphans
```

Run the Docker commands before removing the task worktree.
Remove its ignored local files, including disposable secrets and screenshots
that are already attached to the PR.
Remove remaining core development images, volumes, networks, and build cache.
Use Docker labels and image references to select core resources.
Keep resources used by another active task or an unrelated project.
Do not use a machine-wide prune that can remove unrelated resources.
Never change a remote Docker context, release tag, or published asset.
Report what remains and why.
