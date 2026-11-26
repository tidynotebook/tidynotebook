# 0245. Revision contributors come from client ID bindings

- Status: Accepted
- Date: 2026-11-26

## Context

A checkpoint can depend on an operation from a peer who has yet to save.
Yjs identifies the source of inserted structures by client ID. A deletion
identifies the affected structures.

## Decision

Bind the room client ID to the verified account for the note and epoch.
Store whether it could write at bind time. At checkpoint acceptance, credit
new insertions to the accounts with write bindings. Claim unbound IDs for
the checkpoint actor under the workspace lock. Refuse new structs from a
view-only binding and use the recovery rules in design 013. Use the normal
document validator and savepoint.

Credit deletions to the checkpoint actor. Resolve History names against
current membership. Give former members the label Former member.

## Consequences

- A dependent edit can save before the original author saves.
- Deletion credit can name the checkpoint author when a peer made the edit.
- An editor can submit structs under a peer's bound ID in a checkpoint.
  This can change the History label. The editor already has write access.
- Checkpoint and receipt contracts keep their existing shapes.
- Tests cover foreign insertions, viewer-bound structs and deletion credit.

See [design 029](../design/029-workspace-collaboration.md).
