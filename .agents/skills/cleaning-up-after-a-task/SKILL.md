---
name: cleaning-up-after-a-task
description: Cleans the development machine of the owner after a task. It stops worktree applications, removes approved worktrees and branches, removes the shared test services, deploys main to local Docker, and prunes unused Docker data. Only the owner starts it, by name. It does not change a remote host.
disable-model-invocation: true
---

# Cleaning up after a task

Run this skill only when the owner invokes it by name. It is the one
exception to the rule that an agent stays inside its worktree. The machine is
for development only, so take no backup. Keep the local deployment data and
secrets. This task permits a local deploy, not a release or a remote deploy.

## Check first

Find the main checkout from `git worktree list --porcelain`. Fetch `origin`
with pruning. List the local and remote branches and the open pull requests.
Read each worktree's status, including untracked and ignored files. Do not
print secret values. Check detached heads too.

Keep `main` and `pr-screenshots` on this machine and on `origin`. Keep each
branch that has an open pull request. Keep its worktree too. Do not ask about
these branches.

Before removal, ask about changes that are nowhere else: uncommitted work,
an unmerged commit, or a local file such as `.env`. A change already in `main`
under another commit is safe to remove when its patch is equal. Build output,
installed dependencies, and disposable test files need no separate approval.
Use approval already given in this session for the named work. Keep an item
that still needs approval, and continue with the other items.

If the owner also asks for a skill update, make it in a separate worktree.
Follow the normal change workflow. Keep that worktree and branch until the
change lands or the owner approves their removal.

## Clean the worktrees and branches

For each worktree to remove, use the stop command from
[test-application](../test-application/SKILL.md) in that worktree:

```sh
node .agents/skills/test-application/scripts/app.mjs stop
```

Confirm that its application stops before removing its files. If an older
worktree has no stop script, identify its application by its working directory
and command before sending SIGTERM. Never select a process by port alone.

Remove each approved worktree except the main checkout with `git worktree
remove`. Use `--force` only for files approved for removal or disposable test
output. Prune stale worktree records whose directories no longer exist.
Delete the approved branches locally and on `origin`. Never move or delete a
release tag. Never force push.

## Clean the test services

When no worktree application or test still uses the shared services, remove
both PostgreSQL and MinIO from the Compose project `notesapp-test`. Run this
from the main checkout:

```sh
docker compose -p notesapp-test -f compose.test.yaml down --volumes --remove-orphans
```

If a retained worktree still uses them, keep the services and report why.
The next test starts them again.

## Deploy local main

Require a clean main checkout and bring it up to current `origin/main` with a
fast-forward only. Read `docker-compose.yml` and the local deployment settings.
Keep its database, file store, and secret paths. Check the existing containers'
Compose project and mounts before selecting the local deployment. Do not use
a remote Docker context.

Build from the main checkout. Use the existing local Compose project and any
existing override files. For the default project:

```sh
docker compose build app
docker compose up -d --remove-orphans --wait --wait-timeout 180
```

Check the application readiness endpoint and the running image against the
build of `main`. A build alone is not a ready deployment. On a failed deploy,
read the service logs and fix the cause before the final prune. Do not clear
the deployment data to make it start.

## Prune and report

After the local deployment is ready, prune unused containers, networks, images,
build cache, and volumes:

```sh
docker system prune --all --volumes --force
docker volume prune --all --force
```

The second command includes unused named volumes. Volumes of retained
containers stay in use. Do not remove a retained container to free its volume.

Start with the result. List the remaining worktrees, local and remote branches,
and containers. State the space reclaimed by each prune. Name each item that
stays and why. State any step that fails or still needs approval.
