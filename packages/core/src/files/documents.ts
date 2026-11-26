/**
 * How the workspace accepts the text work of a save (record 0081).
 *
 * Every accepted text of a note comes through here: a save from a device, an
 * import, a restore from History or Trash, and the link rewrites that follow
 * a move. The rule is the same for each of them, so no writer can reach the
 * text of a note by another path.
 *
 * The order of the checks is the rule:
 *
 * 1. The generation must match. Identities of one generation say nothing
 *    about another, so a save of another epoch is refused before anything
 *    else reads its bytes.
 * 2. The complete observed state decides two questions: whether this save
 *    joins work that the device had not seen, which marks the revision as
 *    merged, and whether a deletion would hide such work, which refuses the
 *    deletion (record 0083).
 * 3. The update applies to a trial document. A refusal leaves the stored
 *    document exactly as it was.
 * 4. A save keeps one state in each task box that it and another editor
 *    wrote into, so two toggles of one box never leave it with two states
 *    (record 0134).
 * 5. The workspace derives the text of the revision from the result, so the
 *    stored text and the document can never disagree.
 */
import { contentDigest } from './digest.ts';
import {
  fail,
  ok,
  type AcceptedChangeset,
  type ChangesetInput,
  type DocumentWrite,
  type Result,
  type RevisionInput,
  type StoredRevisionInput,
  type SupersededHead,
} from './model.ts';
import type {
  AppliedDocument,
  DocumentService,
  HeadState,
  StoredDocument,
  WorkspaceTransaction,
} from './ports.ts';
import type { Actor } from '../identity/actor.ts';
import { doubledTaskBoxes } from './task-boxes.ts';

/** What the acceptance of one changeset produced for its documents. */
export type AcceptedDocuments = {
  readonly revisions: readonly StoredRevisionInput[];
  readonly documents: readonly DocumentWrite[];
};

/** Whether two byte strings hold the same value. */
function sameBytes(one: Uint8Array, other: Uint8Array): boolean {
  if (one.byteLength !== other.byteLength) return false;
  return one.every((value, index) => value === other[index]);
}

/**
 * Keeps one state in each task box that two editors wrote into.
 *
 * Two devices that toggle one box before either sees the other each write a
 * state, and the document keeps both, so the box is no task box any more.
 * The two can meet here or on a device before it saves, so every save of
 * text work asks. The save that the workspace accepts last sets the box
 * (record 0134). The document service changes a box only when its states
 * come from more than one editor, so a text that one person wrote stays as
 * they wrote it.
 */
function settleTaskBoxes(
  service: DocumentService,
  before: Uint8Array,
  applied: AppliedDocument,
): Result<AppliedDocument> {
  const slots = doubledTaskBoxes(applied.text);
  if (slots.length === 0) return ok(applied);
  return service.keepWrittenCharacter(before, applied.bytes, slots);
}

/** The document that a note holds now, or a started one for a new note. */
function currentDocument(
  service: DocumentService,
  stored: StoredDocument | undefined,
  epoch: number,
): StoredDocument {
  return stored ?? { bytes: service.start(''), epoch };
}

/**
 * Applies the document work of every revision of one changeset.
 *
 * The revisions of one file apply in submission order, so two saves of one
 * file in one changeset build on each other exactly as the device wrote them.
 */
export async function acceptDocumentWork(
  service: DocumentService,
  stored: ReadonlyMap<string, StoredDocument>,
  heads: ReadonlyMap<string, HeadState>,
  revisions: readonly RevisionInput[],
): Promise<Result<AcceptedDocuments>> {
  const working = new Map<string, StoredDocument>();
  /** The state vector of each note before this changeset touched it. */
  const vectorsBefore = new Map<string, Uint8Array>();
  const merged = new Set<string>();
  const states = new Map<string, Uint8Array>();
  const accepted: StoredRevisionInput[] = [];

  for (const revision of revisions) {
    if (revision.content.kind !== 'markdown') {
      accepted.push({ ...revision, content: revision.content });
      continue;
    }
    const save = revision.content.document;
    const before =
      working.get(revision.fileId) ??
      currentDocument(service, stored.get(revision.fileId), save.epoch);
    if (before.epoch !== save.epoch)
      return fail('epoch_mismatch', [revision.fileId]);
    const beforeVector = service.stateVector(before.bytes);
    if (!vectorsBefore.has(revision.fileId))
      vectorsBefore.set(revision.fileId, beforeVector);

    // The workspace itself has seen everything it holds, so a text that it
    // writes is never a merge and never hides work.
    const covered =
      save.observed === null
        ? ok(true)
        : service.covers(save.observed, before.bytes);
    if (!covered.ok) return covered;
    // A deletion that hides text the device never saw is refused, in either
    // arrival order. The person reads that text before they can remove it.
    if (revision.deleted && !covered.value)
      return fail('unseen_work', [revision.fileId]);

    // A deletion carries no work at all. Work under a tombstone would add
    // text while the revision claims to remove the note, and the quota rule
    // that keeps a full workspace manageable reserves capacity for operations
    // that add nothing. The document therefore stays exactly as it is.
    const work = revision.deleted ? { kind: 'none' as const } : save.work;
    const applied =
      work.kind === 'update'
        ? service.apply(before.bytes, work.update)
        : work.kind === 'text'
          ? service.replaceText(before.bytes, work.text)
          : // A save with no text work, which is how a deletion states what
            // the device had seen, leaves the document exactly as it is.
            ok({
              bytes: before.bytes,
              text: service.readText(before.bytes),
              state: service.observe(before.bytes),
            });
    if (!applied.ok) return applied;
    const result =
      work.kind === 'update'
        ? settleTaskBoxes(service, before.bytes, applied.value)
        : applied;
    if (!result.ok) return result;
    // Work that the document already held adds nothing. A save that repeats
    // it is a duplicate, and a duplicate never brings a note back from Trash.
    const beforeObserved = service.observe(before.bytes);
    const newWork = !sameBytes(result.value.state, beforeObserved);
    const head = heads.get(revision.fileId);
    // The text work of a device brings a note back from Trash, and a save
    // with no work leaves it there. A restore and an import state what they
    // want, and the workspace writes their text into the document rather than
    // deciding from it (records 0083, 0084).
    const deleted =
      work.kind !== 'text' && head?.deleted === true && !revision.deleted
        ? !newWork
        : revision.deleted;
    const text = deleted ? '' : result.value.text;
    working.set(revision.fileId, {
      bytes: result.value.bytes,
      epoch: save.epoch,
    });
    states.set(revision.fileId, result.value.state);
    if (!covered.value) merged.add(revision.fileId);
    accepted.push({
      ...revision,
      // Text work against a tombstone brings the note back: the edit is the
      // later write, and the tombstone kept the document behind it. A
      // duplicate update leaves the note in Trash.
      deleted,
      ...(work.kind === 'update' && newWork
        ? {
            contribution: {
              update: work.update,
              beforeVector,
              beforeObserved,
              epoch: save.epoch,
            },
          }
        : {}),
      content: {
        kind: 'markdown',
        digest: await contentDigest(text),
        text,
      },
    });
  }

  const documents: DocumentWrite[] = [];
  for (const [fileId, document] of working) {
    const state = states.get(fileId);
    if (state === undefined) continue;
    const vectorBefore = vectorsBefore.get(fileId) ?? new Uint8Array();
    documents.push({
      fileId,
      bytes: document.bytes,
      epoch: document.epoch,
      state,
      merged: merged.has(fileId),
      update: service.delta(document.bytes, vectorBefore),
      vector: service.stateVector(document.bytes),
    });
  }
  return ok({ revisions: accepted, documents });
}

/**
 * Accepts one changeset with the text work of its notes.
 *
 * This is the one door of an accepted text (record 0081). Every writer calls
 * it: the changeset operation, a restore from History or Trash, an import,
 * and the link rewrites of a move. It reads the documents of the changed
 * notes, applies their work, and writes the revisions and the documents in
 * the one savepoint of `accept`.
 */
export async function acceptWithDocuments(
  service: DocumentService,
  tx: WorkspaceTransaction,
  actor: Actor,
  input: ChangesetInput,
  digest: string,
  superseded: readonly SupersededHead[] = [],
): Promise<Result<AcceptedChangeset>> {
  const noteIds = [
    ...new Set(
      input.revisions
        .filter((revision) => revision.content.kind === 'markdown')
        .map((revision) => revision.fileId),
    ),
  ];
  const fileIds = [
    ...new Set(input.revisions.map((revision) => revision.fileId)),
  ];
  const work = await acceptDocumentWork(
    service,
    await tx.documents(noteIds),
    await tx.headStates(fileIds),
    input.revisions,
  );
  if (!work.ok) return work;
  return tx.accept(
    actor,
    {
      ...input,
      revisions: work.value.revisions,
      documents: work.value.documents,
    },
    digest,
    superseded,
  );
}
