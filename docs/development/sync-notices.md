# Sync notices

This page owns the operation of the sync notice stream: the parts, the bounds,
and the commands that prove them. The message contract
is in [Adding a WebSocket message](message-contract.md).

## What a notice is

A notice asks a device to read its feed. It holds no content and moves no
cursor, so a missed, a repeated, or a late notice changes no result. Only an
applied feed page moves a cursor, and only a server answer marks a save
accepted. See
[record 0124](../decisions/0124-websockets-wake-the-durable-sync-engine.md).

## The parts

| Part                                 | Where                                          |
| ------------------------------------ | ---------------------------------------------- |
| Triggers, reservations, access       | `packages/storage-server/migrations/`          |
| The one listener of a process        | `packages/storage-server/src/sync-listener.ts` |
| The gateway and its bounds           | `apps/server/src/notices/`                     |
| The browser transport                | `packages/api-client/src/socket.ts`            |
| The lease keeper and the coordinator | `packages/sync/src/`                           |
| The notices of one tab               | `apps/web/src/pwa/notices.ts`                  |

Records [0125](../decisions/0125-postgresql-notifies-the-sync-gateways.md),
[0129](../decisions/0129-the-notice-gateway-and-its-bounds.md),
[0130](../decisions/0130-one-notice-coordinator-per-account-tab.md) and
[0131](../decisions/0131-the-notice-stream-always-runs.md) state the choices.

## Invariants

- A trigger sends a hint only after commit. A rollback and a replayed receipt
  send nothing.
- Every process admits a stream while its listener listens. No setting and no
  switch turns the stream off (record 0131).
- The gateway reads the access of a stream before each batch and caches no
  answer. A lost session stops the stream.
- One tab of a browser profile holds the sender lease and the one stream of
  its account. A tab whose session serves another account gives the lease
  back and asks again later.
- A pass reads feed pages until an empty page, so one wake drains a backlog.
- A lost listener reconnects through its schedule. A test that proves a gap
  holds that schedule through the `listenerSchedule` option of `createApp`,
  so its commit falls in the gap by construction and not by a race.

## Proofs

| Command                   | What it proves                                       |
| ------------------------- | ---------------------------------------------------- |
| `pnpm verify`             | The unit and integration tests of each part          |
| `pnpm perf:notices`       | The load targets of issue 191, against polling       |
| `pnpm perf:notices-proxy` | The Caddy proxy path, two processes, and a reconnect |

The load command holds its targets as bounds and fails when one breaks. Its
connection bound is the sum of the pool sizes of `poolSizes` in
`packages/storage-server/src/pool.ts`. Measured results go on the board issue,
never here.

## Fallback and rollback

A device whose stream is down, refused, or not offered reads on its poll
interval, and a healthy stream keeps a long safety read. An emergency stop of
every notice is a deploy of an earlier release. The feed, the saves and the
queues do not depend on the stream.
