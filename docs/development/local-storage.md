# Local drafts and automatic versions

The browser stores working text before it sends anything, so a lost connection
or a page reload cannot take current work. Local browser data is a working
copy, not a backup. The server holds the durable version history.

See [decision 0022](../decisions/0022-autosave-and-automatic-versions.md).

## Where the code is

| File                                             | Responsibility                        |
| ------------------------------------------------ | ------------------------------------- |
| `packages/sync/src/local-port.ts`                | Local record shapes and storage port  |
| `packages/sync/src/checkpoints.ts`               | The explicit version rule             |
| `packages/sync/src/create-note.ts`               | The one way to make a note            |
| `packages/sync/src/engine.ts`                    | Queue push and server pull            |
| `packages/sync/src/protocol.ts`                  | Whether client and server fit         |
| `packages/storage-browser/src/database.ts`       | Dexie schema and row shapes           |
| `packages/storage-browser/src/migrations.ts`     | Validation and schema migration       |
| `packages/storage-browser/src/legacy-records.ts` | Records of release 0.4 and their move |
| `packages/storage-browser/src/local-store/`      | IndexedDB transactions                |
| `apps/web/src/lib/save-state.ts`                 | The save facts of the open note       |
| `apps/web/src/lib/review.ts`                     | What Review offers and says           |

## The rule

Typing writes a draft. A version is a checkpoint on a natural boundary: a pause
in typing, leaving the note, a hidden tab, or Ctrl + S. The timers live in
`apps/web/src/features/editor/note-editor.tsx`. To make a note is a boundary
too: `packages/sync/src/create-note.ts` writes the first draft and its
checkpoint together. See
[decision 0104](../decisions/0104-a-new-note-is-a-version-when-it-is-made.md).

A draft write is coalesced, so typing does not write once per keystroke. A
checkpoint first finishes the current draft write, then creates one immutable
local version and wakes the sync engine. The store suppresses a checkpoint
whose content, path, and deletion state are unchanged.

A draft write carries a sequence number, and storage ignores an older sequence,
so a late transaction cannot replace newer text.

## The save transaction

A checkpoint writes the content, the immutable local revision, the new local head, the
queue entry with its stable mutation identifier, and the draft link, in one
IndexedDB transaction. The whole transaction succeeds or fails, so a queue
entry can never refer to missing content.

A checkpoint uses the working copy's last version as its parent. Two open tabs
can still send versions based on the same accepted head, and the server places
the later accepted save after its current head. Every save therefore stays in
one linear history, with no conflict workflow. See
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

## Review

A save carries work on the document of the note, so a save over a head that
moved joins that work and never replaces it (record 0081). The server marks a
save that joined work its device had not seen as merged. `acknowledge` then
records a Review in the transaction that applies the answer, naming the newest
checkpoint of that save, so a later draft cannot become its base. The answers
of one commit share its cursor, so a sent batch makes one Review. Placement
records a Review for each text of release 0.4 that it keeps aside. A Review is
cleared on this device only, when the person opens or dismisses it, and a later
merge records a new one. `src/local-store/reviews.ts` holds the table, and
`apps/web/src/lib/review.ts` decides what the note offers. See
[decision 0087](../decisions/0087-review-keeps-the-checkpoint-that-caused-it.md).

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
`packages/core/src/files/snapshot.ts` holds the one version of the build.

A client that is behind offers the update. `apps/web/src/pwa/update.ts` holds
its order: every open tab stores its text and closes before the waiting worker
starts, and a Web Lock proves that no tab is still open. A step that fails
keeps the text of every tab. See
[decision 0086](../decisions/0086-protocol-upgrades-precede-the-breaking-sync-format.md).

## Accounts on one browser

One browser profile holds one session cookie, so it serves the account of that
session. The session check of `packages/sync/src/engine.ts` compares the two
accounts. On a difference the engine pauses and keeps its queue in place. When
the server confirms an account, `clearIdleAccounts` deletes each partition of
another account that holds no work, and a sign-out that keeps work deletes
every such partition of the origin. `draftHoldsWork` in
`src/local-store/shared.ts` states what unsaved text is. See
[decision 0113](../decisions/0113-a-browser-serves-the-account-of-its-session.md).

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

## Upgrade from release 0.4

A store of release 0.4 holds saves with text and no document of any note. The
upgrade removes every cursor, so the next pull is a full snapshot, and it moves
those saves and the drafts aside. `src/local-store/legacy.ts` places them once
the documents are here, and the engine sends nothing in a workspace while any
of them waits. Work that does not fit goes to Needs attention. No save of an
existing note starts its document on the device. See
[decision 0088](../decisions/0088-an-earlier-browser-store-upgrades-through-placement.md).
