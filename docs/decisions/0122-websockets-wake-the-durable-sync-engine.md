# 0122. WebSockets wake the durable sync engine

- Status: Accepted
- Date: 2026-09-26

## Context

`packages/sync/src/engine.ts` polls for remote changes. Faster polling costs
more empty reads. The durable queue, receipts, feed, and snapshots already
protect offline work. See [design 017](../design/017-websocket-sync.md).

## Decision

- WebSockets carry authorized workspace wake notices. Generated HTTP operations
  keep saves, receipt lookup, paged reads, snapshots, and attachment transfer.
- A notice requests a read. Only applied feed or snapshot data advances the
  local cursor. Missing or repeated notices do not change correctness.
- One account coordinator in the lease-owning tab shares one socket across
  engines. Live tab interests and queued work define its subscriptions.
  It alone owns lease acquisition, renewal, and release, independent of
  traffic and engine stop. This refines record 0050.
- Register subscriptions before acknowledgement, then catch up from durable
  state. A pending flag retains a wake during catch-up. Repeat on reconnect.
- Keep periodic safety reconciliation and polling fallback. A local checkpoint
  wakes HTTP sending even when the socket is unavailable. Reconnect uses
  bounded backoff and jitter; wakes never bypass server retry limits.
- The socket binds to one session and account. Current access gates each
  outbound batch. Expiry and revocation close it. Record 0113 keeps the queue
  of an account separate when the browser session changes.
- Keep records 0022 and 0081 through 0086. No live keystroke save, presence,
  stock Yjs provider, or second mutation acceptance path enters this change.

## Consequences

Lower discovery delay and fewer quiet reads are expected, not yet measured.
Sockets add lifecycle and resource costs. Tests must prove catch-up races,
lease transfer, fallback, access loss, and mixed deployments. Load evidence
must compare polling and push before rollout. This is a target decision;
[plan 016](../plans/016-websocket-sync.md) remains active until delivery.
