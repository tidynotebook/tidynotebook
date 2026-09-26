# WebSocket sync implementation

Status: active

The [GitHub project board](https://github.com/users/bkhanale/projects/2) owns
priority and release assignment. Each issue carries the release milestone
chosen by the owner. This plan follows
[design 017](../design/017-websocket-sync.md). Documentation completion does
not complete implementation or establish a capacity claim.

## Decisions

- [0122](../decisions/0122-websockets-wake-the-durable-sync-engine.md): wake the existing engine; keep HTTP durability.
- [0123](../decisions/0123-postgresql-notifies-the-sync-gateways.md): native PostgreSQL notices and process fan-out.
- [0124](../decisions/0124-websocket-messages-use-the-generated-contract.md): one generated contract for the transport.

## Ordered work

| Item | Work                                                          | Depends on       | Board issue                                                  |
| ---- | ------------------------------------------------------------- | ---------------- | ------------------------------------------------------------ |
| 0    | Repair feed pagination before transport rollout               | None             | [Issue 193](https://github.com/bkhanale/notesapp/issues/193) |
| 1    | Contract and generated transport boundary                     | None             | [Issue 188](https://github.com/bkhanale/notesapp/issues/188) |
| 2    | Database notices and authorized server channel                | Item 1           | [Issue 189](https://github.com/bkhanale/notesapp/issues/189) |
| 3    | Account coordinator, tab interests, and engine wake policy    | Items 1 and 2    | [Issue 190](https://github.com/bkhanale/notesapp/issues/190) |
| 4    | Failure proof, capacity comparison, proxy checks, and rollout | Items 0, 2 and 3 | [Issue 191](https://github.com/bkhanale/notesapp/issues/191) |

## Item 0: Feed correctness prerequisite

`readSyncChanges` in `packages/storage-server/src/snapshots.ts` limits rows
inside a cursor group. `getChanges` in `packages/core/src/files/snapshot.ts`
then advances past that cursor. Prove this skipped-row defect with a failing
served regression test and repair it before enabling push. A higher page
limit alone is not a fix. Require bounded, lossless continuation, including
large changesets and a page boundary inside a smaller changeset. Record any
contract change before code and prove compatibility with old clients.
Items 1 through 3 can proceed, but item 4 cannot enable push until this passes.

## Item 1: Contract and generation

Read `packages/api-contract/AGENTS.md`, `packages/api-client/AGENTS.md`, and
`tools/sdk-codegen/AGENTS.md`. Define the upgrade, frame meanings, subscription
generations, compatibility, close handling, and all wire bounds first.
Use AsyncAPI, its official parser, and Modelina under record 0124. Share payload
schemas with OpenAPI by reference and reuse Ajv. Prove tool dialect compatibility.
Generate the client entry, frame validators, and server metadata.
Extend `tools/sdk-codegen/src/contract-layout.ts` and
`tools/sdk-codegen/src/orphans.ts` across both roots. Accept message-only
references while still refusing schemas unused by either contract.
Update `tools/check-boundaries.mjs` and affected guides with the new boundary.

Prove that malformed frames, unlisted references, missing frame handlers,
incompatible dialects, and stale generated output fail. Prove both directions
validate against the same source. Keep HTTP operation coverage intact.

## Item 2: Storage and server

Follow contract, domain port, storage, then handler order. Read the core,
server, and storage guides. Add the migration and raised schema requirement.
Cover every feed insertion with a statement notification trigger. Add identity
invalidation for changes with no workspace feed row. Keep lock ordering,
row access, and migration policy intact.

Implement native multicast notification, listener lifecycle,
authorized subscription replacement, buffer coalescing, heartbeat, and drain.
Use the existing pool factory and generated registration. Shared admission
limits must meet record 0121 before enablement; check the current implementation
rather than assuming that its decision record is shipped.
[Issue 186](https://github.com/bkhanale/notesapp/issues/186) currently tracks
that work in a later milestone. Deliver the required shared limits in this
release through this item; do not wait for that later release or close all of
issue 186 when only the notification limits are complete. Use expiring shared
connection reservations and release them on failure and shutdown.

Real PostgreSQL tests cover rollback, missed notices, concurrent commits,
publishing disablement, deletion, and each feed writer. Two listening servers
prove fan-out,
listener recovery, cross-process invalidation, and shared admission limits.
Test no content or credential reaches a notification or a log.

## Item 3: Browser coordination

Read the sync, browser storage, and web guides. Preserve the queue, receipt,
CRDT, checkpoint, and snapshot rules. Own one socket with the account sender
lease. The coordinator alone acquires, renews, and releases it. Stopping one
workspace engine must not release it for the other engines. Combine live tab interests
with queued workspace work; expire abandoned interests.

Use PartySocket for reconnects with disconnected buffering disabled. Its
source has fixed retry settings; supply bounded random delay settings through
its options and prove the pinned library's schedule. Stop reconnect on a
terminal session or protocol refusal.
Implement subscription acknowledgement before catch-up, pending wakes during
a read, one in-flight cycle, fallback, jitter, and timer cancellation.
`packages/sync/src/snapshot.ts` currently reads one incremental page per call.
Expose page progress and drain to an empty page after one wake, with bounded
turns, fair scheduling, and retained pending work. Test a multi-page backlog
with no later notice and a membership-only page. A local
checkpoint sends promptly without a socket. Session change stops the old
coordinator and leaves its queue in its account partition.

Use driven-clock unit tests for every state transition. Use real browser store
transactions for missed invalidations, pending drafts, snapshot activation,
lease transfer, and different open workspaces. Test old server capabilities and
unknown subprotocols without changing the durable sync format.

## Item 4: Verification and rollout

Set the target connected population, workload mix, latency goal, and resource
budget on the issue before tuning. Put enforceable bounds in the performance
tool; keep measured results on the issue. Compare the same idle, active, hot
workspace, slow-reader, and reconnect workloads with polling and push.
Include authorization and safety-read cost, not only socket memory.

Drive the real proxy path and two browser sessions. Cover offline return,
sleep, concurrent edits, account switch, revoked access, server drain,
listener restart, queue exhaustion, duplicate notices, missed notices, expired
cursors, and backlogs that span pages. Use observable conditions, not fixed
delays. Every discovered defect needs a regression test that fails first.

Roll out additively with admission off, then a small cohort, then broader use.
Prove the switch back to polling with queued offline work and old clients.
No notification outage can require a CRDT rollback. Update development and
hosting guides only when the feature exists. Record manual evidence and light
and dark screenshots for changed screens. Run `pnpm verify` before each landing.
Complete this plan and its design only after the issue acceptance evidence exists.
