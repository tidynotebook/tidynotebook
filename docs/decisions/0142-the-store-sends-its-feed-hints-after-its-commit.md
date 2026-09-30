# 0142. The store sends its feed hints after its commit

- Status: Accepted
- Date: 2026-10-01

## Context

Record 0125 queues a hint with `pg_notify` in the transaction that writes a
feed row. PostgreSQL serializes every transaction that queued a notification
with one cluster-wide lock, and it holds that lock until the commit record is
flushed. Twenty saves of twenty workspaces therefore commit one after the
other. `pnpm perf:service` measured about 45 ms more for each round of twenty
saves with the trigger than without it, on the same corpus in one run
([issue 207](https://github.com/bkhanale/notesapp/issues/207)).

A hint is not data. A missed hint changes no result, because the reconcile and
the poll read the feed (record 0124).

## Decision

- The unit of work of the workspace store, `runTransaction` in
  `packages/storage-server/src/workspace-store/transaction.ts`, sets
  `notesapp.defer_hints` for its transaction. In such a transaction the feed
  trigger marks the changed workspaces in `notesapp.sync_hints` and queues no
  notification. A savepoint rollback and a rollback take the mark back.
- `commitWithHints` in `packages/storage-server/src/sync-hints.ts` reads the
  mark and commits in one round trip. After the commit it sends the hints in a
  transaction of its own with `synchronous_commit` off, so the lock is not held
  through a flush. A failure of that send loses the hint and never the save.
- Every other writer keeps the trigger of record 0125: a SQL function, the
  identity store, a job and a statement of an operator still send their hint
  in their own transaction, by construction.

This refines record 0125.

## Consequences

- The saves of different workspaces no longer wait for each other at commit.
- A hint of a store write can be lost when the server stops between the commit
  and the send. The reconcile and the poll cover it, as they cover a listener
  gap.
- A full notification queue no longer fails a save of the store, only its hint.
- `tests/integration/sync-notices.test.ts` proves that a store commit sends its
  hint, that a deferring transaction queues none, and that every other writer
  still sends one.
