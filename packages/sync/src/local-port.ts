/**
 * The local persistence port.
 *
 * The sync package owns these interfaces; `@notesapp/storage-browser`
 * implements them with IndexedDB, and the web application connects the two.
 * Nothing here imports a browser database, so the rules and the record shapes
 * stay testable without one.
 *
 * Every private record belongs to one partition: the server origin, the
 * account, and the workspace. The design requires that partition, because one
 * browser profile can hold several accounts of several installations and one
 * account must never read the records of another. A `LocalStore` is opened for
 * one server origin, so `Draft` and `QueueEntry` name only the account and the
 * workspace; the store adds its own origin to every row it writes.
 *
 * Local browser data is not a backup. It is the working copy of one device.
 */
import type { AcceptedChangeset, ChangesetInput } from '@notesapp/core';
import type { LocalSearchFile } from './local-search.ts';

/**
 * The partition of one set of private local records.
 *
 * `serverOrigin` is the origin of the installation, for example
 * `https://notes.example.com`. It is part of every key, so two installations
 * in one browser profile cannot mix their records.
 */
export type Partition = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
};

/**
 * The reserved workspace identifier of a value that belongs to the account
 * rather than to one workspace, for example the theme choice.
 *
 * An IndexedDB key cannot be `null`, so the partition keeps three parts and
 * this value fills the workspace part. It is not a valid UUID, so it cannot
 * collide with a real workspace.
 */
export const accountWide = '';

/**
 * The working text of one open editor.
 *
 * Each open editor of one file gets its own `workingCopyId`, so two tabs on
 * one file never write to one draft record. `baseRevisionId` is the accepted
 * revision the editor started from, or `null` for a file that the server has
 * not accepted yet. `sequence` increases with every save of that working copy,
 * so a late write cannot overwrite a newer one.
 *
 * A draft is mutable and coalesced. A checkpoint is not.
 */
export type Draft = {
  readonly accountId: string;
  readonly workspaceId: string;
  readonly workingCopyId: string;
  readonly fileId: string;
  readonly baseRevisionId: string | null;
  readonly text: string;
  readonly path: string;
  readonly deleted: boolean;
  readonly sequence: number;
};

/**
 * Where one queued mutation stands.
 *
 * `conflict` means that the server refused the mutation for good and that the
 * body is kept for the person to place again.
 */
export type QueueState = 'pending' | 'sending' | 'conflict';

/**
 * One mutation that waits for the server.
 *
 * `input` is fixed once the entry exists. The design requires that a sent
 * mutation cannot change its identity or its body, so a retry after a lost
 * answer repeats the same operation instead of writing a second one.
 * `digest` is the request digest, frozen when the entry is first sent.
 */
export type QueueEntry = {
  readonly accountId: string;
  readonly input: ChangesetInput;
  readonly state: QueueState;
  readonly digest: string | null;
  readonly errorCode: string | null;
};

/**
 * A queued save of release 0.4 that waits for placement (record 0088).
 *
 * It holds text rather than work on a document, so it cannot be sent as it
 * is. `sending` means release 0.4 froze `digest` and may have sent it, so the
 * engine asks for its receipt before the store changes it.
 */
export type LegacySave = {
  readonly mutationId: string;
  readonly state: 'pending' | 'sending' | 'conflict';
  readonly digest: string | null;
};

/** What the server knows about one moved save that release 0.4 sent. */
export type LegacyReceipt =
  /** The server accepted exactly this request. It is not sent again. */
  | { readonly kind: 'accepted'; readonly result: AcceptedChangeset }
  /** The server holds no receipt, so the save is unsent work. */
  | { readonly kind: 'absent' }
  /** The identity belongs to another request, so this one is kept aside. */
  | { readonly kind: 'other-request' };

/**
 * Content-free notice that durable local state changed.
 *
 * `conflict` names a change of the Needs attention list: a save the server
 * refused for good, or a recovery copy that was kept or removed. `review`
 * names a Review of the note that was recorded or cleared.
 */
export type LocalChange = {
  readonly accountId: string;
  readonly workspaceId: string;
  readonly fileId: string | null;
  readonly kind:
    | 'draft'
    | 'queue'
    | 'file'
    | 'purge'
    | 'conflict'
    | 'review'
    | 'cursor'
    | 'reset';
};

/** One file as it must appear in local navigation. */
export type LocalFileSummary = {
  readonly fileId: string;
  readonly path: string;
  readonly kind: LocalFileKind;
  readonly deleted: boolean;
  readonly updatedAt: string;
  readonly acceptedHeadRevisionId: string | null;
  readonly localHeadRevisionId: string | null;
  readonly localOnly: boolean;
};

/** Durable save facts for one file only. */
export type FileSaveSnapshot = {
  readonly fileId: string;
  /**
   * The path the store holds for the file, or `null` when it holds none.
   *
   * The open editor reads it rather than keeping a path of its own, so a move
   * from any surface reaches it. The value is read after a write of that
   * editor commits, so it is never older than what the editor last wrote.
   */
  readonly path: string | null;
  /**
   * Whether the newest state of the file on this device is a tombstone.
   *
   * The open editor reads it, so a note that the sidebar or another device
   * moved to Trash cannot be brought back by the next save of an editor that
   * still believed it was live.
   */
  readonly deleted: boolean;
  readonly latestDraftSequence: number | null;
  readonly latestMutationId: string | null;
  readonly queueState: QueueState | null;
  readonly acceptedHeadRevisionId: string | null;
  readonly localHeadRevisionId: string | null;
  readonly hasUncheckpointedDraft: boolean;
};

/**
 * One queued mutation that the server refused for good.
 *
 * The Needs attention list reads these. The body is kept, so the person can
 * place the text again or discard it.
 */
export type LocalConflict = {
  readonly accountId: string;
  readonly fileId: string;
  readonly mutationId: string;
  readonly input: ChangesetInput;
  readonly errorCode: string | null;
};

/**
 * One locally created revision.
 *
 * Every field except `accepted` is immutable. A checkpoint names one state of
 * one file for as long as it is stored, and acknowledgment only records that
 * the server took it. Nothing rewrites `parents`, so the local graph stays
 * stable while work is pending.
 */
export type CheckpointRecord = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly revisionId: string;
  readonly fileId: string;
  /** The editor that created it. */
  readonly workingCopyId: string;
  /** Zero identifiers for a first revision, one otherwise. */
  readonly parents: readonly string[];
  readonly path: string;
  readonly deleted: boolean;
  /** The content digest, which names the row in the content table. */
  readonly digest: string;
  /** A named checkpoint carries a message; an automatic one does not. */
  readonly message: string | null;
  readonly clientTime: string;
  /** The mutation that submits this checkpoint. */
  readonly mutationId: string;
  /** Set when the server acknowledged the mutation. */
  readonly accepted: boolean;
};

/** Whether a file holds Markdown or an attachment. */
export type LocalFileKind = 'note' | 'attachment';

/**
 * One file that moves, with the path it moves to.
 *
 * A folder is not a stored object, so a folder move is a set of these. The
 * path carries the one `.md` suffix, as every stored note path does.
 */
export type FileMove = {
  readonly fileId: string;
  readonly toPath: string;
};

/**
 * What a caller supplies to keep pending work after access ends.
 *
 * The store adds the partition, the identifier, and the creation time, so
 * the caller names only the file and the reason it was preserved.
 */
export type RecoveryInput = {
  readonly fileId: string;
  readonly path: string;
  readonly text: string;
  readonly reason: RecoveryReason;
  /** The server answer code that refused the save, when there was one. */
  readonly code?: string | null;
  /** The parked queue entry this text came from, when there is one. */
  readonly mutationId?: string | null;
  readonly recoveryId?: string;
  readonly createdAt?: string;
};

/** The pin state of one attachment digest inside one workspace. */
export type AttachmentPin = {
  readonly digest: string;
  readonly pinned: boolean;
};

/**
 * What this device knows about one file.
 *
 * The record mirrors accepted server metadata and adds the local head. The
 * accepted head is what the server last confirmed, and it is the value that a
 * submission puts in `expectedHeads`. The local head is the newest checkpoint
 * this device created; it stays ahead of the accepted head while work is
 * pending, and it never moves backwards on acknowledgment.
 */
export type LocalAcceptedFile = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly fileId: string;
  readonly path: string;
  readonly kind: LocalFileKind;
  /** The accepted head, or `null` when the server has no revision of it. */
  readonly acceptedHeadRevisionId: string | null;
  /** The content digest of the accepted head, when it is known. */
  readonly acceptedHeadDigest: string | null;
  /** The newest local checkpoint, or `null` when none exists. */
  readonly localHeadRevisionId: string | null;
  readonly deleted: boolean;
  readonly updatedAt: string;
};

/**
 * One Markdown note that is ready to open from local storage.
 *
 * `text` is what the editor opens. A draft of this device wins over the
 * accepted head, because only an explicit Save creates a server version.
 *
 * `stale` states that the draft was written over an older accepted head and
 * that its text differs from the current one. The caller then holds both
 * texts: `text` is the draft of this device, and `acceptedText` is the
 * current accepted head. The person chooses; nothing is dropped silently.
 */
export type LocalCachedNote = {
  readonly fileId: string;
  readonly path: string;
  readonly text: string;
  readonly deleted: boolean;
  /** Reuses the newest draft instead of opening a second working copy. */
  readonly workingCopyId?: string | undefined;
  /** Continues the reused draft sequence so later writes stay monotonic. */
  readonly sequence: number;
  /** The local parent that the next checkpoint must name. */
  readonly baseRevisionId: string | null;
  /** A draft over an older accepted head whose text differs from it. */
  readonly stale: boolean;
  /** The current accepted head text, present only for a stale draft. */
  readonly acceptedText: string | null;
  /** The path of the current accepted head, when it is known. */
  readonly acceptedPath: string | null;
  /** The current accepted head revision, when the server confirmed one. */
  readonly acceptedRevisionId: string | null;
};

/**
 * Immutable content, addressed by its digest inside one partition.
 *
 * Markdown carries `text`. An attachment carries `bytes`. Exactly one of the
 * two is set, which the validator checks.
 */
export type LocalContent = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly digest: string;
  readonly text: string | null;
  readonly bytes: Blob | null;
  readonly size: number;
};

/** The stored outcome of one acknowledged mutation. */
export type LocalReceipt = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly mutationId: string;
  readonly revisionIds: readonly string[];
  readonly cursor: string;
  readonly acknowledgedAt: string;
};

/** The commit ordered position this device has consumed. */
export type LocalCursor = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly cursor: string;
  readonly updatedAt: string;
};

/**
 * One downloaded workspace snapshot, staged before it becomes usable.
 *
 * Task 11 owns staging and activation. The table exists here so the schema
 * does not change when that task lands, and so a partly downloaded snapshot
 * is already separated from local drafts.
 */
export type StagedSnapshot = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly token: string;
  readonly revisionIds: readonly string[];
  readonly cursor: string;
  readonly state: 'staging' | 'complete' | 'active';
  readonly createdAt: string;
};

/**
 * One file revision downloaded as part of a staged snapshot.
 *
 * `text` carries Markdown bodies. It is `null` for an attachment revision,
 * whose bytes are fetched on use, and for a tombstone, which carries none.
 */
export type SnapshotRevision = {
  readonly token: string;
  readonly revisionId: string;
  readonly fileId: string;
  readonly path: string;
  readonly kind: LocalFileKind;
  readonly deleted: boolean;
  readonly digest: string;
  readonly text: string | null;
  /**
   * The whole document of the note, or `null` for an attachment revision.
   *
   * A device that joins by snapshot needs the document itself, not only the
   * text: without it the first save of that device would carry a document of
   * its own and merge as two texts rather than one (record 0081).
   */
  readonly document: Uint8Array | null;
  /** The generation of that document, or `null` for an attachment. */
  readonly epoch: number | null;
  /**
   * When the server accepted the revision, or `null` when the answer did not
   * state it. The file keeps this instant, so a snapshot does not make every
   * note read as changed when it arrived.
   */
  readonly serverTime: string | null;
};

/** The document of one note on this device, with its generation. */
export type NoteDocument = {
  readonly bytes: Uint8Array;
  readonly epoch: number;
};

/**
 * One note that a screen read from the server, ready to cache.
 *
 * A device that opens a note it has not received yet reads it over HTTP. The
 * store keeps that read, so every later action on the note starts from a local
 * row instead of from nothing. Without it a save, a move, or a deletion would
 * name a create precondition for a file the server already has.
 */
export type ServerNote = {
  readonly fileId: string;
  readonly path: string;
  readonly kind: LocalFileKind;
  readonly revisionId: string;
  readonly digest: string;
  readonly text: string;
  /**
   * The document of the note at that revision, or `null` for an attachment.
   *
   * The device keeps it, so the editor it opens next starts from the document
   * of the workspace. A device that started a document of its own would hold
   * characters that the server never saw (records 0081, 0084).
   */
  readonly document?: Uint8Array | null | undefined;
  /** The generation of that document, or `null`. */
  readonly epoch?: number | null | undefined;
};

/**
 * One file change read from the ordered change feed.
 *
 * `file` is `null` for a membership record, which advances the cursor
 * without touching file metadata.
 */
export type RemoteFileChange = {
  readonly fileId: string;
  readonly revisionId: string;
  readonly path: string;
  readonly fileKind: LocalFileKind;
  readonly deleted: boolean;
  readonly digest: string;
  /**
   * The accepted work of a note, which the device applies to the document it
   * holds (record 0085). `update` carries the work that follows the state the
   * device already had, and `document` carries a whole document, which a new
   * generation and a snapshot both send. A record of an attachment has none.
   */
  readonly document: ServerDocumentWork | null;
  /** The text of an attachment change, which is always null. */
  readonly text: string | null;
};

/** The accepted document work of one note, as the feed states it. */
export type ServerDocumentWork = {
  readonly kind: 'update' | 'document';
  readonly bytes: Uint8Array;
  readonly epoch: number;
};

/**
 * One applied position of the ordered change feed.
 *
 * `file` is `null` for a membership record, which advances the cursor
 * without touching file metadata, and for a permanent deletion, which has no
 * revision left to name. `purgedFileId` names the file of such a deletion, so
 * the local cache can forget it.
 */
export type RemoteChange = {
  readonly file: RemoteFileChange | null;
  /** The file that a permanent deletion removed, or `null`. */
  readonly purgedFileId: string | null;
};

/**
 * One stored setting.
 *
 * `workspaceId` is `accountWide` for a setting that belongs to the account.
 */
export type Preference = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly value: string;
};

/**
 * Why pending work was moved into the recovery area.
 *
 * `save_refused` covers every save the server can never accept. Its `code`
 * names the server answer, so the interface can explain the cause in words.
 * An unknown code stays valid: the interface falls back to one general
 * sentence rather than refusing the record.
 *
 * `stale_draft` is text a person left behind on purpose: the draft of this
 * device was written over an older version, and the person took the newer
 * server text instead. The old text is kept so the choice is reversible.
 */
export type RecoveryReason =
  'purged' | 'sign_out' | 'save_refused' | 'stale_draft';

/**
 * Pending work that the server can no longer accept.
 *
 * A purge and a sign-out keep the user's text for clipboard copying or
 * explicit removal, bound to the account that wrote it.
 */
export type RecoveryRecord = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly recoveryId: string;
  readonly fileId: string;
  readonly path: string;
  readonly text: string;
  readonly reason: RecoveryReason;
  /** The server answer code that refused the save, or `null`. */
  readonly code: string | null;
  /** The parked queue entry this text came from, or `null`. */
  readonly mutationId: string | null;
  readonly createdAt: string;
};

/**
 * The event that makes one note offer Review on this device (record 0087).
 *
 * `merge` is a save of this device that joined work the device had not seen.
 * `revisionId` names the exact checkpoint of that save, so a later draft or a
 * later save cannot become the base of the comparison. `recovery` is earlier
 * work that the upgrade kept aside because it could not join the note.
 * `recoveryId` names that kept text in the recovery area.
 */
export type ReviewCause =
  | { readonly kind: 'merge'; readonly revisionId: string }
  | { readonly kind: 'recovery'; readonly recoveryId: string };

/**
 * One Review that waits on this device.
 *
 * The record lives on this device only, so opening or dismissing it on one
 * device leaves every other device as it is. `text` is the text that the
 * event keeps, the checkpoint of the save or the kept text, read in the same
 * transaction as the event. It is `null` when this device no longer holds it.
 */
export type ReviewRecord = {
  readonly reviewId: string;
  readonly fileId: string;
  readonly cause: ReviewCause;
  readonly text: string | null;
  readonly createdAt: string;
};

/**
 * Why a local write failed.
 *
 * - `aborted`: the transaction did not commit. Nothing was written.
 * - `quota`: the browser refused the write for lack of space.
 * - `unavailable`: the database is closed, blocked, or absent.
 * - `corrupt`: a stored record does not match its schema, or the stored
 *   schema version is one this application cannot read.
 * - `stale`: the caller supplied a working copy that is older than the
 *   stored one. Nothing was written, so the newer text stays intact.
 */
export type LocalStorageErrorKind =
  'aborted' | 'quota' | 'unavailable' | 'corrupt' | 'stale';

/**
 * A typed local persistence failure.
 *
 * The caller keeps its in-memory buffer, shows Save failed, and stops claiming
 * persistence. It must not discard the text and must not reload the page.
 * The message names no note text and no path, so it is safe to log.
 */
export class LocalStorageError extends Error {
  readonly kind: LocalStorageErrorKind;

  constructor(
    kind: LocalStorageErrorKind,
    detail: string,
    options?: { readonly cause?: unknown },
  ) {
    super(
      `notesapp local storage ${kind}: ${detail}`,
      options?.cause === undefined ? {} : { cause: options.cause },
    );
    this.name = 'LocalStorageError';
    this.kind = kind;
  }
}

/** Whether a thrown value is a local persistence failure. */
export function isLocalStorageError(
  value: unknown,
): value is LocalStorageError {
  return value instanceof LocalStorageError;
}

/**
 * Local persistence for one server origin.
 *
 * Every method is partition bound: the caller names the account, and the
 * workspace comes from the record or from the argument. A method never reads
 * or writes outside that partition.
 *
 * Every method rejects with a `LocalStorageError` when the browser database
 * fails. No method returns a partial result.
 */
export type LocalStore = {
  /** The origin this store belongs to. */
  readonly serverOrigin: string;

  /**
   * The device identity that submissions carry.
   *
   * It is stored with the database, so it survives a restart and a mutation
   * retry keeps naming the same device.
   */
  readonly deviceId: string;

  /** Subscribes to committed local changes. */
  subscribe(listener: (change: LocalChange) => void): () => void;

  /**
   * Writes the working text of one editor in one transaction.
   *
   * The design's target is at most 150 ms after input. A write with a lower
   * `sequence` than the stored one is ignored, so a late save cannot undo a
   * newer one.
   */
  saveDraft(draft: Draft): Promise<void>;

  /**
   * The text of one local revision, or `null` when this device holds none.
   *
   * A save carries work and not text, so the text of a refused save comes
   * from the checkpoint that froze it. The Needs attention list and a
   * recovered note both read it (records 0081, 0085).
   */
  readRevisionText(
    accountId: string,
    workspaceId: string,
    revisionId: string,
  ): Promise<string | null>;

  /** Reads one working copy, or `null` when it has no stored draft. */
  readDraft(
    accountId: string,
    workspaceId: string,
    workingCopyId: string,
  ): Promise<Draft | null>;

  /**
   * Moves the base of one working copy to the current accepted head.
   *
   * Used when a person keeps a draft that was written over an older head.
   * The text is untouched; only the parent that the next checkpoint names
   * changes, so the following Save reaches the server instead of naming a
   * head the server no longer has. Does nothing when no draft is stored.
   */
  rebaseDraft(
    accountId: string,
    workspaceId: string,
    workingCopyId: string,
  ): Promise<void>;

  /**
   * Removes one working copy draft.
   *
   * Used when a person takes the accepted head instead of a stale draft.
   * The caller keeps the text first, in the recovery area or the clipboard.
   * Checkpoints and queue entries are never touched.
   */
  dropDraft(
    accountId: string,
    workspaceId: string,
    workingCopyId: string,
  ): Promise<void>;

  /**
   * Creates one immutable checkpoint and queues its mutation.
   *
   * Content, the checkpoint, the local head, and the queue entry commit in one
   * transaction, so a queued mutation always has its content. Returns `null`
   * when the checkpoint is suppressed because the content, the path, and the
   * deletion state are unchanged and no message was given.
   *
   * Rejects with a `stale` failure when the stored draft of the same working
   * copy is newer than the supplied one. An older buffer must never become
   * an immutable version, so nothing is written and the caller flushes its
   * newest text first.
   *
   * A new checkpoint always becomes the local head. The server rebases it on
   * the current accepted head when another save reached the server first.
   */
  checkpoint(draft: Draft, message: string | null): Promise<QueueEntry | null>;

  /**
   * Gives every named file a new path in one transaction.
   *
   * A move is one operation of this port and not a draft that a caller
   * composes, because the path of a note lives on every working copy of that
   * note. Each file gets one checkpoint that keeps the text the note reads
   * with right now and carries the new path, and every stored draft of that
   * file takes the new path as well, keeping its text, its sequence, and its
   * parent. No working copy of a moved file can hold the old path, so a later
   * save of an open editor cannot write the move back. See decision record
   * 0032.
   *
   * Either every named file moves or none does. A file that already carries
   * its target path is skipped and produces no checkpoint. The answer holds
   * one queue entry per file that moved, in the order of `moves`.
   *
   * Rejects with a `stale` failure when a named file is unknown on this
   * device or is deleted, because the caller read a list that has moved on.
   */
  moveFiles(
    accountId: string,
    workspaceId: string,
    moves: readonly FileMove[],
  ): Promise<readonly QueueEntry[]>;

  /**
   * Moves every named file to Trash in one transaction.
   *
   * A deletion is one operation of this port for the same reason a move is:
   * the deletion state of a note lives on every working copy of that note.
   * Each file gets one tombstone checkpoint, which carries no text, and every
   * stored draft of that file is marked deleted as well, so no open editor can
   * bring the note back with its next save. See decision record 0032.
   *
   * Either every named file reaches Trash or none does. A file that is
   * already deleted is skipped and produces no checkpoint. The answer holds
   * one queue entry per file that moved, in the order of `fileIds`.
   *
   * Rejects with a `stale` failure when a named file is unknown on this
   * device, because the caller read a list that has moved on.
   */
  trashFiles(
    accountId: string,
    workspaceId: string,
    fileIds: readonly string[],
  ): Promise<readonly QueueEntry[]>;

  /**
   * Keeps one note that a screen read from the server.
   *
   * The write is refused for a file this device already holds, so it never
   * touches local work and never moves an accepted head backwards. It advances
   * no cursor: the ordered feed stays the one source of the mirror. It exists
   * so that a note a person can open is a note they can act on.
   */
  cacheServerNote(
    accountId: string,
    workspaceId: string,
    note: ServerNote,
  ): Promise<void>;

  /** The queued mutations of one workspace, in submission order. */
  pending(
    accountId: string,
    workspaceId: string,
  ): Promise<readonly QueueEntry[]>;

  /**
   * Every workspace of one account that still holds a queued mutation.
   *
   * A save is durable when it reaches this store and it reaches the server
   * when the sync engine of its workspace sends it. A person who switches to
   * another workspace must not leave a save behind, so the application runs an
   * engine for the open workspace and for every workspace this call names
   * (record 0050). The answer holds no duplicate and its order is not
   * meaningful.
   */
  queuedWorkspaces(accountId: string): Promise<readonly string[]>;

  /**
   * Freezes the request digest of one queued mutation and marks it sending.
   *
   * The body cannot change after this point, so a retry repeats the same
   * operation.
   */
  markSending(
    accountId: string,
    mutationId: string,
    digest: string,
  ): Promise<void>;

  /**
   * Marks one queued mutation as conflicting, keeping its body.
   *
   * `errorCode` is optional, so a caller that does not know why the server
   * refused the mutation keeps the stored reason.
   */
  markConflict(
    accountId: string,
    mutationId: string,
    details?: { readonly errorCode?: string | null },
  ): Promise<void>;

  /**
   * Removes one queued mutation and the local work that only it held.
   *
   * Used when the server refused the mutation for good and repeating it can
   * never help, for example a deletion that the server refused because the
   * note changed on another device. The queue entry, the checkpoints of the
   * mutation, and the local head that they set are removed in one
   * transaction, so the file goes back to its accepted state. A deletion flag
   * that the discarded mutation set is cleared as well, because the accepted
   * head that the server kept is not a tombstone.
   *
   * Discarding an unknown mutation does nothing.
   */
  discardQueueEntry(accountId: string, mutationId: string): Promise<void>;

  /**
   * Moves the preconditions of one queued mutation to the current heads.
   *
   * Used after the server refused a mutation with a failed precondition and
   * the client has read the accepted state again. Only a mutation that still
   * waits may move, so a frozen body is never rewritten: the answer is `null`
   * when the mutation is unknown or already sent. The frozen digest is
   * cleared with the change, because the body that the next send covers is
   * not the body that the digest names.
   */
  reparentQueueEntry(
    accountId: string,
    mutationId: string,
    expectedHeads: Readonly<Record<string, string | null>>,
  ): Promise<QueueEntry | null>;

  /**
   * Applies one server acknowledgment.
   *
   * Removes exactly the acknowledged mutation's queue entry, marks its
   * checkpoints accepted, moves the accepted heads to the acknowledged
   * revisions, advances the mutable precondition of its first pending child,
   * and stores the receipt, in one transaction. Drafts and checkpoints created
   * after the submission are preserved. Acknowledging the same mutation twice
   * does nothing.
   *
   * A note whose accepted revision is merged gets a Review that names the
   * newest checkpoint of this mutation for that note. The answers of one
   * commit share its cursor, so the mutations of one sent batch make one
   * Review for a note and its base is the last checkpoint of the batch.
   */
  acknowledge(accountId: string, result: AcceptedChangeset): Promise<void>;

  /** The moved saves of release 0.4 in one workspace, in their order. */
  legacySaves(
    accountId: string,
    workspaceId: string,
  ): Promise<readonly LegacySave[]>;

  /**
   * Applies the receipt of one moved save that release 0.4 sent.
   *
   * An accepted save marks its checkpoints accepted and leaves the moved
   * saves. An absent save becomes unsent. A save whose identity names another
   * request goes to the recovery area with its text. Settling an unknown save
   * does nothing.
   */
  settleLegacySave(
    accountId: string,
    mutationId: string,
    receipt: LegacyReceipt,
  ): Promise<void>;

  /**
   * Places the work of release 0.4 on the documents of its notes.
   *
   * Each moved save whose notes have their documents becomes a queued save
   * under its own identity, and each moved draft takes the joined text. Work
   * that cannot be placed goes to the recovery area. `waiting` counts the
   * moved saves and drafts that still wait, for a document or a receipt.
   * Nothing in the workspace may be sent while it is above zero, because a
   * later save can depend on an earlier one.
   */
  placeLegacyWork(
    accountId: string,
    workspaceId: string,
  ): Promise<{ readonly waiting: number }>;

  /** The local checkpoints of one file, oldest first. */
  listCheckpoints(
    accountId: string,
    workspaceId: string,
    fileId: string,
  ): Promise<readonly CheckpointRecord[]>;

  /**
   * The recovery area of one account and workspace.
   *
   * Recovery records stay bound to the account that wrote them. A caller
   * shows them only after that same account signs in again.
   */
  recover(
    accountId: string,
    workspaceId: string,
  ): Promise<readonly RecoveryRecord[]>;

  /**
   * Keeps one pending text in the account-bound recovery area.
   *
   * Used when a purge or a sign-out leaves local work that the server can no
   * longer accept. The record stays under the original account for clipboard
   * copying or explicit removal.
   */
  addRecovery(
    accountId: string,
    workspaceId: string,
    entry: RecoveryInput,
  ): Promise<RecoveryRecord>;

  /**
   * Removes one recovery record of the calling account.
   *
   * A Review that names the record goes with it in the same transaction, so
   * no note offers a comparison with text that is gone.
   */
  removeRecovery(
    accountId: string,
    workspaceId: string,
    recoveryId: string,
  ): Promise<void>;

  /**
   * The Reviews that wait for one note on this device, oldest first.
   *
   * `acknowledge` writes a merge event in the transaction that applies the
   * answer, and the placement of earlier work writes a recovery event in the
   * transaction that keeps the text, so an event exists exactly when its
   * cause does (record 0087).
   */
  listReviews(
    accountId: string,
    workspaceId: string,
    fileId: string,
  ): Promise<readonly ReviewRecord[]>;

  /**
   * Clears one Review on this device. Every other Review stays.
   *
   * The work that the event names is not touched: a checkpoint stays in local
   * history and kept text stays in the recovery area. Clearing an unknown
   * Review does nothing.
   */
  clearReview(
    accountId: string,
    workspaceId: string,
    reviewId: string,
  ): Promise<void>;

  /** The accepted file metadata of one workspace, ordered by path. */
  listAcceptedFiles(
    accountId: string,
    workspaceId: string,
  ): Promise<readonly LocalAcceptedFile[]>;

  /** Files known from accepted metadata or durable drafts. */
  listLocalFiles(
    accountId: string,
    workspaceId: string,
  ): Promise<readonly LocalFileSummary[]>;

  /** Save state derived only from records of one file. */
  readFileSaveSnapshot(
    accountId: string,
    workspaceId: string,
    fileId: string,
  ): Promise<FileSaveSnapshot>;

  /** Refused queue records of one workspace, for the Needs attention list. */
  listLocalConflicts(
    accountId: string,
    workspaceId: string,
  ): Promise<readonly LocalConflict[]>;

  /**
   * Reads one cached note, with the newest saved draft applied.
   *
   * The draft is compared with the accepted head before it is returned. A
   * draft that matches the accepted head is removed and the head is
   * returned, so one keystroke cannot shadow newer server text for good. A
   * draft over an older head whose text differs is returned with `stale`
   * set and with the accepted head text beside it.
   */
  readCachedNote(
    accountId: string,
    workspaceId: string,
    fileId: string,
  ): Promise<LocalCachedNote | null>;

  /**
   * The live document of one note, as this device holds it (record 0081).
   *
   * The open editor binds to this document, so the text a person edits and
   * the text of the note are one value. A note this device has not received
   * yet answers `null`.
   */
  readNoteDocument(
    accountId: string,
    workspaceId: string,
    fileId: string,
  ): Promise<NoteDocument | null>;

  /**
   * Merges the work of the open editor into the stored document of a note.
   *
   * Every write reads the stored row again inside the same transaction and
   * merges into it, so two tabs that write before either reads the other
   * cannot lose work (record 0085). The answer is the document after the
   * merge, so the caller can join the work of the other tab.
   */
  mergeNoteWork(
    accountId: string,
    workspaceId: string,
    fileId: string,
    update: Uint8Array,
  ): Promise<NoteDocument>;

  /** Accepted local note bodies with current drafts applied over them. */
  listSearchFiles(
    accountId: string,
    workspaceId: string,
  ): Promise<readonly LocalSearchFile[]>;

  /** Whether the content body of one digest is stored locally. */
  hasContent(
    accountId: string,
    workspaceId: string,
    digest: string,
  ): Promise<boolean>;

  /** Pins or unpins one attachment digest for offline use. */
  setAttachmentPinned(
    accountId: string,
    workspaceId: string,
    digest: string,
    pinned: boolean,
  ): Promise<void>;

  /** Whether one attachment digest is pinned for offline use. */
  isAttachmentPinned(
    accountId: string,
    workspaceId: string,
    digest: string,
  ): Promise<boolean>;

  /** Pins or unpins one historic revision for offline use. */
  setHistoryPinned(
    accountId: string,
    workspaceId: string,
    revisionId: string,
    pinned: boolean,
  ): Promise<void>;

  /** Whether one historic revision is pinned for offline use. */
  isHistoryPinned(
    accountId: string,
    workspaceId: string,
    revisionId: string,
  ): Promise<boolean>;

  /**
   * Records that one account signed out while offline.
   *
   * The marker survives `clearPrivateData` so reconnect can revoke the
   * server session before any private content is restored. It is cleared
   * only after that revocation succeeds.
   */
  setSignOutMarker(accountId: string): Promise<void>;

  /** Whether one account carries a pending offline sign-out marker. */
  hasSignOutMarker(accountId: string): Promise<boolean>;

  /** Clears the offline sign-out marker after revocation succeeds. */
  clearSignOutMarker(accountId: string): Promise<void>;

  /**
   * Deletes the private local data of one account.
   *
   * With a workspace ID only that partition is cleared, otherwise every
   * workspace of the account. Drafts, checkpoints, contents, accepted
   * metadata, queue entries, receipts, staged snapshots, cursors, recovery
   * records, and workspace preferences are removed. The account-wide
   * sign-out marker and the device identity survive.
   */
  clearPrivateData(accountId: string, workspaceId?: string): Promise<void>;

  /**
   * Deletes the private data of every other account of this origin that
   * holds no work, when one account signs in (record 0113). After a sign-out
   * no account is signed in, and `null` names that: the private data of every
   * account of the origin that holds no work goes.
   *
   * A partition holds work when it has a queued save in any state, a
   * recovery record, a save or a draft of release 0.4 that waits for
   * placement, or a draft whose text no checkpoint holds. Such a partition
   * stays, out of view, until its own account signs in or signs out. Every
   * other partition of another account goes, as `clearPrivateData` removes
   * one, and so do the account-wide settings of an account that keeps no
   * partition. The sign-out marker and the device identity survive.
   *
   * The check and the deletion are one transaction, so no write of another
   * tab lands between them. Answers the accounts that keep a partition.
   */
  clearIdleAccounts(
    signedInAccountId: string | null,
  ): Promise<readonly string[]>;

  /** The current sync worker lease, or `null` when none is stored. */
  readLeaseState(): Promise<{
    readonly ownerId: string;
    readonly expiresAt: number;
  } | null>;

  /**
   * Takes the single sync worker lease of this store.
   *
   * Returns `true` and records `ownerId` with `expiresAt` (milliseconds since
   * the Unix epoch) when no lease exists, when the stored one already expired,
   * or when this owner already holds it. Returns `false` when another owner
   * holds a live lease. A worker whose lease expired without renewal has
   * failed, so another worker may take over.
   */
  acquireLease(ownerId: string, expiresAt: number): Promise<boolean>;

  /**
   * Gives up the sync worker lease.
   *
   * Removes the lease only when `ownerId` holds it. Releasing a lease that
   * another worker took over does nothing.
   */
  releaseLease(ownerId: string): Promise<void>;

  /**
   * Records the plan of one downloaded snapshot before its content arrives.
   *
   * `revisionIds` names every immutable revision the snapshot captured, and
   * `cursor` is the captured high-water position. Staging never touches
   * drafts, checkpoints, the queue, or accepted metadata.
   *
   * The plan sketch names only the token, the revisions, and the cursor. The
   * account and the workspace travel explicitly because every port method is
   * partition bound: the token alone cannot place the staged row.
   */
  stageSnapshot(
    accountId: string,
    workspaceId: string,
    token: string,
    revisionIds: readonly string[],
    cursor: string,
  ): Promise<void>;

  /**
   * Stores one downloaded snapshot revision in the staging area.
   *
   * Markdown text is stored by its digest; attachment revisions keep their
   * metadata so their bytes can be fetched on use. Nothing becomes accepted
   * metadata until `activateSnapshot` runs.
   */
  storeSnapshotRevision(
    accountId: string,
    workspaceId: string,
    revision: SnapshotRevision,
  ): Promise<void>;

  /**
   * Makes a fully downloaded snapshot the accepted state.
   *
   * Rejects with an `aborted` failure when any staged revision or its
   * required content is still missing; the caller then restarts the download
   * and keeps its local work. Otherwise advances accepted heads and the
   * cursor in one transaction. Files with unsubmitted local work keep their
   * local head, their drafts, and their queued mutations: a remote head never
   * replaces a dirty working copy. A draft that differs from the snapshot
   * head counts as local work.
   */
  activateSnapshot(token: string): Promise<void>;

  /** The commit ordered position this device consumed, or `null`. */
  readCursor(accountId: string, workspaceId: string): Promise<string | null>;

  /**
   * Applies ordered remote changes and advances the cursor.
   *
   * Every file change updates the accepted head and stores its content;
   * files with unsubmitted local work keep their local head and drafts. A
   * file counts as having local work when its local head is ahead of its
   * accepted head, and also when a draft of it differs from the incoming
   * head.
   * Records without a file only advance the cursor. The whole batch and the
   * cursor commit in one transaction.
   */
  applyRemoteChanges(
    accountId: string,
    workspaceId: string,
    changes: readonly RemoteChange[],
    nextCursor: string,
  ): Promise<void>;

  /**
   * Forgets every local trace of files that the server purged.
   *
   * A permanently deleted file leaves no row on the server, so a client that
   * still holds its accepted metadata, its drafts, its checkpoints, its queued
   * mutations, or its recovery copies would keep the note in the tree or revive
   * it on the next re-send. This removes all of them for the named files in one
   * transaction. Content bodies stay, because one body can back several files.
   */
  forgetPurgedFiles(
    accountId: string,
    workspaceId: string,
    fileIds: readonly string[],
  ): Promise<void>;

  /** Closes the database connection. A schema upgrade needs every tab to. */
  close(): Promise<void>;
};
