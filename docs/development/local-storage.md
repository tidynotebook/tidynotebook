# Local drafts and explicit saves

The browser stores working text before it sends anything, so a lost connection
or a page reload cannot take current work. Local browser data is a working
copy, not a backup. The server holds the durable version history.

See [decision 0007](../decisions/0007-keep-the-save-model.md).

## Where the code is

| File                                         | Responsibility                       |
| -------------------------------------------- | ------------------------------------ |
| `packages/sync/src/local-port.ts`            | Local record shapes and storage port |
| `packages/sync/src/checkpoints.ts`           | The explicit version rule            |
| `packages/sync/src/engine.ts`                | Queue push and server pull           |
| `packages/sync/src/protocol.ts`              | Whether client and server fit        |
| `packages/storage-browser/src/database.ts`   | Dexie schema and row shapes          |
| `packages/storage-browser/src/migrations.ts` | Validation and schema migration      |
| `packages/storage-browser/src/local-store/`  | IndexedDB transactions               |
| `apps/web/src/lib/save-state.ts`             | The state the person is shown        |

## The rule

Typing writes a draft. Save creates a version. Nothing else creates a version:
there is no idle timer, no interval timer, and no page-leave timer.

A draft write is coalesced, so typing does not write once per keystroke. Save
first finishes the current draft write, then creates one immutable local
version and wakes the sync engine. An unchanged manual Save still creates a
version, because the person asked for one.

A draft write carries a sequence number, and storage ignores an older sequence,
so a late transaction cannot replace newer text.

## The save transaction

Save writes the content, the immutable local revision, the new local head, the
queue entry with its stable mutation identifier, and the draft link, in one
IndexedDB transaction. The whole transaction succeeds or fails, so a queue
entry can never refer to missing content.

Save uses the working copy's last version as its parent. Two open tabs can
still send versions based on the same accepted head, and the server places the
later accepted save after its current head. Every explicit save therefore stays
in one linear history, with no conflict workflow. See
[Files, revisions, and atomic changes](files-and-revisions.md).

## Queue and acknowledgment

The queue sends versions in local order. The request body and its digest freeze
on the first send, so a retry repeats the same mutation rather than a new one.
A network failure uses a bounded retry delay and a later cycle tries again.

An acknowledgment removes the matching queue item, marks its revision as
accepted, advances the accepted head, and stores the receipt. It never removes
a newer draft or a newer queued save.

A save that the server refuses for good stays on the device as failed work. It
is parked in the recovery area and listed on the "Needs attention" screen,
where the person can retry it, keep it as a new note, copy it, or discard it.
The editor keeps the current text either way.

## Stale drafts

A draft written over an accepted head that the server has since moved is
returned as stale, together with the current accepted head text. The note
screen states that and lets the person choose. Taking the latest version copies
the older draft into the recovery area before it rebases, so no text is lost.

## Offline behaviour

A draft write and a save transaction need no connection. The sync engine wakes
when a queue transaction commits and also runs a periodic safety check. A lease
stops two tabs from sending the same browser queue at the same time.

Snapshot activation changes accepted server state only. It never deletes a
draft or a queued version.

## Protocol check

Before each push and each pull, the sync engine reads the sync protocol
versions that the server serves. A client that does not fit sends nothing and
reads nothing, and it keeps every draft and queued save. A server that answers
this read with the unknown path refusal predates the check and serves version
1 only. `packages/sync/src/protocol.ts` holds the rule, and
`packages/core/src/files/snapshot.ts` holds the one version of the build. See
[decision 0086](../decisions/0086-protocol-upgrades-precede-the-breaking-sync-format.md).

## Storage failures

Every local method reports a failure kind: the transaction did not commit, the
browser has no space, IndexedDB is closed or absent, or stored data does not
match its schema. The editor keeps its in-memory text after every one of them.
It does not reload the page and it does not replace the buffer with server
content.

## Compatibility data

The local database has no branch store and no conflict store. A schema version
removed the branch table of the withdrawn conflict-branch feature. A queued
mutation that the server refuses for good keeps the state name `conflict` with
the reason of the refusal, which is the only meaning that word still has.
