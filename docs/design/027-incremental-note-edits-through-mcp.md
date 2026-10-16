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
refuses the call. An append is always whole lines, so the tool adds line
breaks by two rules.

- It adds a line break before the text when text precedes the insert point
  and that text does not end with one. An append to an empty note adds no
  line break before its text.
- It adds a line break after the text when text follows the insert point and
  the appended text does not end with one. A section append inserts before the
  line of the next heading, so this rule keeps that heading on its own line.
  With `# A`, `body` and `# B` on three lines, an append of `new item` to
  section A gives `new item` on its own line before `# B`.

`patch_note` adds no line breaks. Its text is exact.

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
the anchor runs against the head that the tool reads. The tool resolves each
anchor to an offset and a length in that head. An insert removes nothing. A
replacement removes only the characters of that range, because a Yjs
deletion names the identities of the characters that it removes. A character
that the person inserts inside the range after the read has a new identity,
so the replacement does not remove it. The result can then hold the new text
of the assistant and the new characters of the person side by side. The
design does not promise more than this.

This property needs a range edit. The existing document service cannot give
it. `replaceDocumentText` in `packages/note-document/src/document.ts` takes a
whole new text and computes a character difference against the current text.
With repeated characters, that difference can delete other identities than
the resolved range. For the source `aba` and the deletion of the unique
anchor `ab`, the difference keeps the first `a` and deletes `ba`, which
includes the last `a` outside the anchor. When another device replaces that
last `a` with `X` at the same time, the merge gives `aX`. A deletion of the
exact range gives `X`. An insert has the same problem, because the difference
can place new text next to another copy of the same characters.

So the implementation adds a bounded range edit to `packages/note-document`.
It takes a document and a list of edits, each an offset, a length and a text,
resolved against the text of that document. It applies them in one
transaction directly at their offsets, from the last offset to the first, so
an earlier edit does not move a later one. It refuses ranges that overlap,
ranges outside the text, ranges that split a Unicode pair, and a list or a
result past its bounds. The document service of `packages/storage-server`
exposes it. The new tools use only this edit. This pull request does not add
it.

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
The request digest covers the body, so it differs too. The tool therefore
cannot know the digest of the first request, and it must not build a request
before it knows whether the call already wrote. A replacement can remove its
own anchor, and a note can move to Trash or be purged after the first commit.
A retry that read the note first would then fail its anchor check, or find no
note, and never learn that it succeeded. `readMutationReceipt` in
`packages/core/src/files/read.ts` reads a receipt before the current head for
the same reason.

The lookup uses a probe digest. `getMutationReceipt` answers `absent` when
the account holds no receipt for the identity, and `other_request` when it
holds one with another digest. So any digest that can never be the digest of
a changeset tells the tool whether the identity was used. The probe digest is
the request digest of `packages/core/src/files/digest.ts` over a reserved
operation name of the tool and its canonical input. A changeset digest always
names `commitChangeset`, so the probe never matches one. The tool computes the
probe from its input alone, before it reads anything.

1. The tool checks its input schema. It derives the mutation identity and the
   probe digest from the input.
2. It reads the receipt through `getMutationReceipt`. This checks the write
   right of the actor on the workspace, before any read of the note. A status
   other than `absent` means that this call already wrote. The tool ends the
   call there. It reads no note, checks no anchor, builds no update and sends
   no changeset.
3. Only for `absent` does the tool read the head, check the anchors, build
   the update and commit.
4. Two copies of one call can both find `absent`. Copy A can then commit
   before copy B reads the head. A can remove its own anchor, and the note can
   move to Trash or be purged after A commits. B then fails before it reaches
   `commitChangeset`. So when step 3 refuses because of the state of the note,
   the tool reads the receipt again, with the same identity and probe digest,
   before it answers. This covers a note that is not available or not live,
   an anchor or a heading that is missing or occurs more than once, and a text
   that the document cannot hold. When the status is now other than `absent`,
   the tool ends as in step 2. When it is still `absent`, the tool returns the
   original error. That error states only what the tool found. It does not
   claim that another copy of the call cannot commit later. A refusal of
   authorization or of a locked account, from either receipt read or from the
   note read, is returned as it is, with no second read.
5. When B reaches `commitChangeset` after A committed, the workspace lock
   orders the commits. The receipt check of the commit runs first, so B gets
   `mutation_reused`. The tool then ends as in step 2. Both `mutation_reused`
   and `epoch_mismatch` answer a conflict, so the tool reads the code of the
   problem and not only the status.
6. A refused changeset writes no receipt. The tool can read the head again
   and build again under the same identity. It does this once for a new
   document generation ([record 0084](../decisions/0084-compaction-keeps-identities-and-recovery-keeps-original-work.md)),
   and then it refuses. A refusal of the note state on that second read
   follows step 4.

A call that ends as in step 2 is a success. Its answer names the
workspace and the file from the input, says that the change was made by an
earlier attempt, and sets `changed` to false. It carries no version and no
text. The probe answer holds no outcome, and the note can be in Trash or gone,
so the tool states no state of the note. The answer is the same in each of
these cases. It tells the client to read the note for its current version
and not to send the change again. A read of a note in Trash or a purged note
then says that the note is not available. A workspace that no longer exists,
or a lost write right, refuses at step 2 with the existing tool errors.

This deduplicates a retry of one call. It cannot tell a retry from a second
call that has the same input and the same version. The tool treats both as
one change, so a client that wants the same text twice names the new version.

## The rules that the merge keeps

The tool sends the path of the head that it read. A rename on another device
between the read and the commit therefore survives, because a rebased update
takes the path of the current head.

The tool refuses a note that is not live when it reads it, after the second
receipt read of step 4. A move to Trash
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
- The delegation of each new tool names `getMutationReceipt`, `getFile` and
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
  `packages/storage-server`, with the range edit above. They do not use the
  whole text replacement that `edit_note` uses.

## Verification

Unit tests in `packages/note-document` prove the range edit: repeated
characters, edits applied from the last offset to the first, overlapping
ranges, ranges outside the text, a split Unicode pair, and the bounds. One
case starts from `aba`, deletes the range of `ab` in one session, replaces
the last `a` with `X` in another session, and merges both to `X`.

Unit tests in `apps/server/src/mcp/write-tools.test.ts` prove the input
schemas, the anchor and heading rules, the order of a patch list, the refusal
of overlapping changes, and the shape of the one changeset. They prove both
line break rules, including an append to an empty note, which adds no line
break before its text, and a section append before the next heading, which
keeps that heading on its own line. They prove that a used identity ends the
call before any note read, and that the probe digest depends only on the
input.

Integration tests in `tests/integration/mcp-endpoint.test.ts` prove:

- an append that commits while another device saves an edit of the same note,
  with the text of both in the head;
- a replacement whose span the other device changed, with the inserted
  characters of the device in the head;
- a repeated call, a lost answer and two concurrent copies of one call, each
  with one write;
- a lost answer after a replacement that removed its own anchor, where the
  retry ends with the earlier attempt answer and writes nothing;
- a lost answer followed by a move to Trash, and by a purge, where the retry
  ends the same way;
- two copies of one call in a fixed order: copy B pauses after its first
  receipt read finds `absent`, copy A commits, then B resumes. B ends with the
  earlier attempt answer, and the note has one write. One variant has A
  remove its own anchor. Two more variants move the note to Trash, or purge
  it, after A commits and before B resumes;
- a refusal of the note state with no other copy, where the second receipt
  read finds `absent` and the tool returns the original error;
- a concurrent device edit next to repeated characters, where the merge
  keeps the result of the exact range;
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
