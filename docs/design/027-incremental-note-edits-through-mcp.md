# Incremental note edits through MCP

Status: active

An AI assistant adds to notes more often than it rewrites them. It appends a
line to a log, adds a task under a heading, or changes one sentence. The MCP
server of [design 026](026-a-remote-mcp-server.md) makes each of these changes
expensive and fragile. This design moves the merge of an assistant edit to the
server, through the same document path that the sync engine uses.

## The problem

`edit_note` in `apps/server/src/mcp/write-tools.ts` accepts the whole text or
one exact replacement. Both forms name the version that the client read, and
the tool refuses when the head is another version
([record 0227](../decisions/0227-a-tool-calls-the-contract-as-the-actor-of-its-grant.md)).
Three costs follow.

- To add one line, an assistant must read the note, find a unique anchor,
  and send it back. For a note without a good anchor, it sends the whole
  text. A long note costs a full read and a full write for each line.
- The guard is the version of the whole note. A person who types anywhere
  in the note while the assistant works moves the head, and the tool refuses.
  The assistant reads again and tries again, and it can lose this race on
  each try. The guide tells the person to ask the assistant to read again.
- A whole replacement is a large edit for a small intent. When the
  assistant copies the text badly, the change is in History, but the person
  must find it.

The server already solves the same problem for devices. The text of a note is
one CRDT document
([record 0081](../decisions/0081-accepted-text-and-observed-state-belong-to-one-document.md)).
A device sends an update with the observed state of the head that it saw.
`commitChangeset` applies the update to the current document under the
workspace lock and keeps the work of both sides. An old observed head is the
normal path for an offline save
([Accepting a changeset](../development/accepting-a-changeset.md)). The MCP
tools do not use this path. Design 026 says why: a merge would make a
repeated edit apply twice, so the first version refuses instead.

## The goal

- An assistant appends or inserts text with no copy of the note in its input.
- An assistant edit and a person who types in the same note both reach the
  server, and the assistant does not have to try again. The merge keeps the
  characters that each side inserted. It does not promise that the result
  reads well (record 0081).
- A repeated call writes nothing. A retry after a lost answer is safe.
- No assistant edit removes text that the assistant did not name.
- The open editor shows the assistant edit in place, with no new editor, no
  lost caret and no entry in local undo.

## Options for the write path

**A. A retry loop over `updateFile`.** The tool keeps the version check. When
the head moves, it reads the head again, makes the edit again and sends it
again, a bounded number of times. No contract changes. The window between the
read and the commit is inside one process, so most calls win. But a busy note
can still refuse, each retry reads the whole document again, and the version
check protects nothing that the anchor check does not already protect. It
also does not use the merge that the server already has.

**B. A merged changeset through `commitChangeset`.** The tool reads the head
document, builds the update in `packages/note-document`, and sends one
changeset with one revision. The expected head and the observed state are
those of the head that the tool read. When the head moves before the commit,
the server merges the update into the current document, as it does for a
device. `updateFile` checks its precondition in strict mode and
`commitChangeset` rebases, both in `packages/core/src/files/commit.ts`. No
retry is necessary, and the rules of record 0081 and
[record 0083](../decisions/0083-metadata-conflicts-preserve-unseen-text-work.md)
apply with no copy. The cost is a wider operation in the delegation of the
tool. `commitChangeset` can change many files, so the tool code must build a
changeset of exactly one revision of one note.

**C. A new contract operation for a text patch.** The server accepts a list of
plain text operations and builds the update itself. Other clients, such as a
script with a personal key, could use it too. It is a new public surface, a
new rights check and a new set of tests, for a need that the MCP server has
today and no other client asks for.

**D. Raw document updates in the tool input.** The client sends a Yjs update.
No AI client can make one, and the server would need to trust structure that
it did not build. This option fails the problem.

Option B is the proposal. It reuses the sync path and keeps the new surface
inside `apps/server/src/mcp/`. Option C stays open for a later need outside
MCP.

## The tools

Two new write tools, both with the scope `notes:write`.

**`append_to_note`** adds text at the end of the note, or at the end of one
section. The input names the workspace, the file, the version that the client
read and the text. An optional heading names the section, as the exact text
of a heading line. The tool finds headings with the Markdown parser of
`packages/markdown`, not with a line match, so a line inside a code block is
not a heading. The section ends before the next heading of the same level or
a higher level. A heading that occurs more than once, or not at all,
refuses the call. The tool adds a line break before the text when the text
before the insert point does not end with one, so an append always starts a
new line.

**`patch_note`** applies an ordered list of changes in one revision. Each
change is one of these:

- insert text before or after an exact anchor;
- replace an exact anchor with new text;
- insert text at the start or at the end of the note.

Each anchor must occur exactly once in the head that the tool reads. The
tool counts overlapping matches too, as `edit_note` does. The tool
resolves every anchor before it changes the text, so a later change of the
list cannot find text that an earlier change wrote. Two changes that touch the
same span refuse the call. The list has a bound.

`edit_note` stays as it is, with its input, its output, its description and
its refusals. A whole replacement touches every character, so the version
check is correct for it. Its exact replacement form also stays, for the
clients that use it today.

## What the version means

The tools still require the version that the client read, but the version is
no longer a precondition. It has two purposes.

- It is part of the identity of the call. Two identical appends with the same
  version are one change. To append the same text again on purpose, the
  client names the version that the first answer returned.
- The answer states whether the head had moved past that version. A client
  then knows that it must read the note before a whole replacement.

The guard against an edit of unseen text moves from the whole note to the
span. The anchor is text that the assistant names exactly, and the check of
the anchor runs against the head that the tool reads. An insert removes
nothing. A replacement removes only the characters of the anchor in that
head, because a Yjs deletion names the identities of the characters that it
removes. A character that the person inserts inside the span after the read
has a new identity, so the replacement does not remove it. The result can
then hold the new text of the assistant and the new characters of the person
side by side. The design does not promise more than this.

## Retries and receipts

A changeset carries a mutation identity, and the workspace keeps a receipt of
each accepted mutation. Receipts do not change and are not removed
([Database](../development/database.md)). A receipt belongs to the account of
the actor (`commitChangeset` in `packages/core/src/files/commit.ts`). The tool
derives its mutation identity as a name based identifier over the grant, the
tool name and the canonical input. So a retry of one call has the same
identity, and a call with other input has another. A retry through a new grant
is a new call.

The update bytes of a retry are not the same as the first bytes, because each
document session has a new client identity
([record 0082](../decisions/0082-yjs-has-a-byte-api-and-a-private-editor-bridge.md)).
The request digest covers the body, so it differs too. The commit of a retry
therefore gets `mutation_reused`, and the tool uses that fact.

1. The tool builds the request and its digest through the request digest of
   `packages/core/src/files/digest.ts`. It then reads the receipt of its
   identity and that digest through `getMutationReceipt`. A status other
   than absent means that this call already wrote. The tool sends nothing.
   It returns the current head with an answer that says the change was
   already made.
2. Two copies of one call can both find no receipt. The first commit wins.
   The workspace lock orders them, so the second finds the receipt of the
   first and gets `mutation_reused`. The tool then answers as in step 1. Both
   `mutation_reused` and `epoch_mismatch` answer a conflict, so the tool reads
   the code of the problem and not only the status.
3. A refused changeset writes no receipt. The tool can read the head again
   and build again under the same identity. It does this once for a new
   document generation ([record 0084](../decisions/0084-compaction-keeps-identities-and-recovery-keeps-original-work.md)),
   and then it refuses.

This deduplicates a retry of one call. It cannot tell a retry from a second
call that has the same input and the same version. The tool treats both as
one change, so a client that wants the same text twice names the new version.

## The rules that the merge keeps

The tool sends the path of the head that it read. A rename on another device
between the read and the commit therefore survives, because a rebased update
takes the path of the current head.

The tool refuses a note that is not live when it reads it. A move to Trash
between the read and the commit is a different case. An update with new text
work against a tombstone does not refuse. It brings the note back, because an
edit wins over a concurrent Trash in either order
([record 0083](../decisions/0083-metadata-conflicts-preserve-unseen-text-work.md),
`acceptDocumentWork` in `packages/core/src/files/documents.ts`). The tool keeps
this rule, as a device does. The window is the time between one read and one
commit in the same process. The answer of the tool states that the note is
live, and History holds both the Trash version and the assistant version.

The parent of the new revision is the current head, so History stays one
line. The revision records that it merged work that the tool did not see.

## The browser

The open editor joins every new document of the store and takes the new head
when it holds no work of its own
([record 0179](../decisions/0179-an-open-note-follows-a-new-head-in-its-one-editor.md)).
An assistant edit therefore appears in place. A remote change does not enter
local undo, so the undo key of the person does not remove the assistant text.
The draft and the queued saves of the person stay intact
([record 0085](../decisions/0085-local-document-writes-merge-and-receipts-do-not-advance-reads.md)).

## Cost and limits

- Each accepted call is one version in History. An assistant that appends
  many small lines makes many versions. The request bounds of record 0227
  limit the rate.
- The delegation of each new tool names `getFile`, `getMutationReceipt` and
  `commitChangeset`. A unit test must prove that the tool code builds one
  revision of one note and no other change.
- The input text has the bound of the existing write tools. The update has
  the bounds of `packages/note-document`.
- Yjs decides the order of concurrent inserts at the same point. Two appends
  at the end of a note at the same moment can appear in either order. The
  design does not promise an order, a line break between them, or valid
  Markdown structure after the merge.
- A save also keeps one state in each task box that two editors changed
  (record 0134), so a merged task box can differ from the text of the call.
- `tools/check-boundaries.mjs` already limits Yjs to `packages/note-document`.
  The tools build every update through the document service of
  `packages/storage-server`, as `edit_note` does.

## Verification

Unit tests in `apps/server/src/mcp/write-tools.test.ts` prove the input
schemas, the anchor and heading rules, the line break rule, the order of a
patch list, the refusal of overlapping changes, and the shape of the one
changeset.

Integration tests in `tests/integration/mcp-endpoint.test.ts` prove:

- an append that commits while another device saves an edit of the same note,
  with the text of both in the head;
- a replacement whose span the other device changed, with the inserted
  characters of the device in the head;
- a repeated call, a lost answer and two concurrent copies of one call, each
  with one write;
- a move to Trash between the read and the commit, which brings the note
  back with both versions in History;
- a rename between the read and the commit, which keeps the new path;
- a new document generation between the read and the commit;
- a read grant that gets the challenge for write.

A browser check proves that an append appears in the open note in light and
in dark, with the caret kept and with no entry in local undo.

## Compatibility

`edit_note` keeps its input, its output and its refusals. The tool list grows
by two tools, and clients see them on the next list. No setting, stored data,
contract operation or image command changes. `docs/guide/mcp.md` must
explain that an append or a patch does not refuse while the person types, and
that the whole text form still does.

## Initial scope

The owner set these choices for the first version.

- Each accepted call is a separate version in History. No append joins an
  earlier version.
- `edit_note` keeps its current interface, for compatibility with the
  clients that use it.
- The anchors are a heading of a section and exact text that occurs once.
  Anchors for a list item or a task wait for a concrete need.

## Open questions

None for the initial scope.

## Decisions

None yet. The owner accepts or changes this proposal first. The records then
follow, and they refine record 0227.
