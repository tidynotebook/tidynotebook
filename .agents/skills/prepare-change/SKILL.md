---
name: prepare-change
description: Loads the core task context and selects the next phase before a feature, fix, refactor, or review. Use when core work starts or resumes. Internal work routes to its private owner. It does not build, release, or deploy.
---

# Prepare change

Start with the problem, the owned worktree, and the paths. Run the context
command. Read every listed file before an edit. Restate the change, the guides,
the records, the board row, and the proof. Stop on a real rule conflict.

```sh
pnpm task:prepare --task task-name --phase build --path tools/agent-context.mjs
```

To resume, give the saved task name. Omit phase and paths to keep their saved
values. Read the saved user context, dependencies, and remaining work. The
command refreshes the current code and guides. It gives no new permission.

Save public task facts in the `contextFile` that the command returns:
`.tooling/lifecycle/tasks/<task-name>/context.json` in the owned worktree.
Update `userContext` with the approved scope and decisions, `dependencies`
with the inputs still needed, and `remaining` with the next work. Keep these
fields as one string and two lists of strings. Keep other fields unchanged.
Save these facts before handback or an interruption. Run the command again
to refresh the code facts. Never put private context or secrets in this file.

Use `--internal` only for an explicitly internal task. Set
`TIDYNOTEBOOK_CLOUD_DIR` to its private checkout. Missing private context blocks
internal work. Standalone core work needs no private checkout.

Read [the lifecycle catalog](../../../docs/development/agent-lifecycle.md) to
select a unit. Load only that unit. End when saved context names the owner,
inputs, scope, and next unit. Preparation gives no permission for later writes.
