# 0123. PostgreSQL notifies the sync gateways

- Status: Accepted
- Date: 2026-09-26

## Context

Feed writes span the sync repository, snapshots, and the identity store in
`packages/storage-server/src`. An in-memory save hook misses other writers
and processes. The existing feed already supplies durable recovery. See
[design 017](../design/017-websocket-sync.md).

## Decision

- Use native PostgreSQL LISTEN and NOTIFY. A statement trigger on feed insertion
  emits one workspace hint per changed workspace. PostgreSQL delivers after
  commit. Savepoint and outer rollback emit no notice; receipt replay adds none.
- Every gateway listens and routes hints to its authorized local subscriptions.
  Hints contain no content or credential. No custom queue, relay, external
  broker, notification receipt, or second replay cursor enters this design.
- A dedicated client uses `packages/storage-server/src/pool.ts`, under record
  0090, with error, reconnect, and close ownership. No connection per browser.
- Commit LISTEN before readiness. Listener recovery forces catch-up of local
  subscriptions. A listener gap closes streams into HTTP fallback.
- Session and account changes with no feed row emit transactional invalidation
  hints. Current access checks and expiry timers cover missed hints too.
- Notification queue exhaustion can fail a save transaction. Keep the mutation
  queued and report no success. A shared database publishing switch disables
  trigger notifications while preserving feed writes and HTTP sync. Test this
  path; disabling socket admission alone does not stop database notification.
- Keep record 0121's PostgreSQL choice. Measure queue use and listener load.
  A later broker must preserve fan-out, authorization, and feed catch-up.

## Consequences

This reuses built-in delivery and the durable feed. It adds a migration and
listener management, with a known notification availability cost. Real database
tests prove each writer, rollback, recovery, and publishing disablement.
Two servers prove fan-out. [Plan 016](../plans/016-websocket-sync.md) owns delivery.
