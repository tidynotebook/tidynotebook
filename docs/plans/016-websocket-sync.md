# WebSocket sync implementation

Status: active

The [GitHub project board](https://github.com/users/bkhanale/projects/2) owns
priority and release assignment. Each issue carries the release milestone
chosen by the owner. This plan follows
[design 017](../design/017-websocket-sync.md). Documentation completion does
not complete implementation or establish a capacity claim.

## Decisions

- [0124](../decisions/0124-websockets-wake-the-durable-sync-engine.md): wake the existing engine; keep HTTP durability.
- [0125](../decisions/0125-postgresql-notifies-the-sync-gateways.md): native PostgreSQL notices and process fan-out.
- [0126](../decisions/0126-websocket-messages-use-the-generated-contract.md): one generated contract for the transport.

## Ordered work

| Item | Work                                                          | Depends on                   | Board issue                                                  |
| ---- | ------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------ |
| 1    | Contract and generated transport boundary                     | None                         | [Issue 188](https://github.com/bkhanale/notesapp/issues/188) |
| 2    | Database notices and authorized server channel                | Item 1                       | [Issue 189](https://github.com/bkhanale/notesapp/issues/189) |
| 3    | Account coordinator, tab interests, and engine wake policy    | Items 1 and 2                | [Issue 190](https://github.com/bkhanale/notesapp/issues/190) |
| 4    | Failure proof, capacity comparison, proxy checks, and rollout | Items 2 and 3, and issue 193 | [Issue 191](https://github.com/bkhanale/notesapp/issues/191) |

## Which issue to pick next

Fix [issue 193](https://github.com/bkhanale/notesapp/issues/193) first. It is
a defect of the polling sync that ships today, so it is a prerequisite and not
an item of this plan, and it does not wait for this plan. Then use this default
order: **188, 189, 190, then 191**. Start with the first issue in that sequence
that is open and has no accepted completion evidence.
Check its current code and board state before work; an issue can be complete
in code while its board state is stale. Do not repeat completed work.

The dependency table states technical dependencies. It permits some overlap,
but overlap is not the default execution order. Complete and land each issue
before starting the next one. Keep notification publishing and admission off
through the first four issues. Only issue 191 enables a measured rollout.

| Pick                                                   | Start condition                       | Work order inside the issue                                                                                                                                  | Required hand-off                                                                                                                      |
| ------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| [193](https://github.com/bkhanale/notesapp/issues/193) | Prerequisite; start here              | Reproduce skipped rows; decide bounded continuation; record any contract decision; fix storage and cursor handling; prove compatibility                      | A failing-before-fix served regression now passes; every page preserves all accepted changes; existing clients have a proved safe path |
| [188](https://github.com/bkhanale/notesapp/issues/188) | Feed repair is landed                 | Prove library and schema compatibility; define messages; generate types and validators; extend layout, reference, and boundary checks                        | Contract and generated client entry are committed; negative fixtures pass; server and client work can use the declared interface       |
| [189](https://github.com/bkhanale/notesapp/issues/189) | Contract work is landed               | Add domain ports; add migration and publishing control; add listener; add authorized gateway and shared limits; test two servers                             | Two servers prove wake delivery, access loss, bounded load, and fallback; publishing and admission remain off                          |
| [190](https://github.com/bkhanale/notesapp/issues/190) | Server work is landed                 | Centralize lease ownership; add tab interests and library adapter; add subscription catch-up and page draining; add fallback; test account and lease changes | One connection serves the account; a single wake drains the backlog; offline drafts and queues survive every tested transition         |
| [191](https://github.com/bkhanale/notesapp/issues/191) | All four prior hand-offs are accepted | Set load goals; run failure and proxy tests; record browser evidence; compare load; prove rollback; enable a small cohort; assess wider use                  | Acceptance evidence and shipped guides are complete; only then mark this plan and its design complete                                  |

For each hand-off, link the landed commit and test evidence on the issue.
Run focused checks during work and `pnpm verify` before landing. Close an issue
only when its acceptance checks pass. A blocked check keeps the issue open;
do not pass it to the last issue as unfinished work. A runtime defect found
in the last issue gets a failing regression and a fix before rollout continues.

## Prerequisite: feed correctness

`readSyncChanges` in `packages/storage-server/src/snapshots.ts` limits rows
inside a cursor group. `getChanges` in `packages/core/src/files/snapshot.ts`
then advances past that cursor. Prove this skipped-row defect with a failing
served regression test and repair it before enabling push. A higher page
limit alone is not a fix. Require bounded, lossless continuation, including
large changesets and a page boundary inside a smaller changeset. Record any
contract change before code and prove compatibility with old clients.
[Issue 193](https://github.com/bkhanale/notesapp/issues/193) owns this repair.
Close it on its own acceptance checks, not on the progress of this plan. The
default sequence completes this repair first. Item 4 cannot enable push until
its served regression and compatibility evidence pass.

## Item 1: Contract and generation

Read `packages/api-contract/AGENTS.md`, `packages/api-client/AGENTS.md`, and
`tools/sdk-codegen/AGENTS.md`. Define the upgrade, frame meanings, subscription
generations, compatibility, close handling, and all wire bounds first.
Use AsyncAPI under record 0126. Lint and bundle it with the pinned Redocly CLI.
List the payload schemas as shared components of both roots, so Hey API writes
their types and Ajv compiles their validators. Add no AsyncAPI parser and no
Modelina. Prove that the lint refuses a keyword outside the shared dialect.
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
limits must meet record 0121 before enablement. Commit 3e6e1b0 shipped that
record through `packages/storage-server/src/coordination.ts`, and
[issue 186](https://github.com/bkhanale/notesapp/issues/186) is closed. That
file holds the shared attempt counters and the job locks, but no connection
reservation. Add expiring shared connection reservations to that coordination
handle, and release them on failure and shutdown.

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
