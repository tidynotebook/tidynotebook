# 0245. Checkpoints prove live contributions

- Status: Proposed
- Date: 2026-11-26

## Context

A separate account can save a checkpoint whose work depends on a live
operation that has yet to reach durable storage. A Yjs deletion identifies
the deleted structures. It does not identify the account that deleted them.

## Decision

Bind a live client's ID to its verified account for the note epoch. Validate
new live structs against that binding. The server issues an opaque proof
bound to the author, note epoch and exact update for each validated live
delta. A checkpoint may include bounded proofs for uncommitted peer
dependencies. Validate the operation coverage in the existing checkpoint
transaction. Preserve its revision, receipt and savepoint rules.

Store contributors for the newly accepted work in that transaction. Keep the
checkpoint actor. Attribute deletion-only input by the verified sender
instead of the ID of the deleted text. Resolve names through current
membership. Show Former member when that membership has ended.

## Consequences

- Peers can save dependent edits before the original author saves.
- Offline retry freezes its proofs with the existing checkpoint request.
- A bad proof or size refusal preserves work through design 013 recovery.
- Tests cover foreign structs, deletions, receipt replay and old revisions.

See [design 029](../design/029-workspace-collaboration.md).
