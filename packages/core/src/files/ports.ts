/**
 * Storage ports for workspace content.
 *
 * The core owns these interfaces; a server storage package implements them.
 * The core imports no database driver, no HTTP framework, and no generated
 * client, so the same rules run in the browser and on the server.
 *
 * Every port method belongs to one open workspace transaction. The lock order
 * of a change is the workspace, then the mutation identity, then the affected
 * files sorted by identifier. `transact` acquires the workspace lock, and the
 * use case runs its reads and its `accept` call inside that one transaction.
 */
import type { Actor, Role } from '../identity/actor.ts';
import type {
  AcceptedChangeset,
  AcceptedInput,
  DomainErrorCode,
  Result,
  SupersededHead,
} from './model.ts';
import type { DailyNoteSettings } from '../daily-notes/model.ts';
import type { TemplateSettings } from '../templates/model.ts';
import type { SearchHit } from '../search/service.ts';
import type { Backlink } from './backlinks.ts';
import type { TextSlot } from './task-boxes.ts';

/**
 * The document of one note, as the workspace holds it now.
 *
 * `bytes` is the whole document and `epoch` its generation. A note that has
 * no document yet reads as `null`, which happens only before the migration of
 * record 0084 reaches it.
 */
export type StoredDocument = {
  readonly bytes: Uint8Array;
  readonly epoch: number;
};

/** One document after an accepted update, with what the workspace derived. */
export type AppliedDocument = {
  /** The document after the update. */
  readonly bytes: Uint8Array;
  /** The text that the document derives, which the revision stores. */
  readonly text: string;
  /** The complete state of the document after the update. */
  readonly state: Uint8Array;
};

/** One range resolved against the original UTF-16 text of a document. */
export type DocumentRangeEdit = {
  readonly offset: number;
  readonly length: number;
  readonly text: string;
};

/**
 * The document service of the workspace (records 0081, 0082).
 *
 * `packages/core` states this port and never implements it: the server
 * composition root supplies the adapter over the document package, so no Yjs
 * type reaches the domain. Every value here is bytes or text.
 */
export type DocumentService = {
  /** Starts the document of a note that has none yet. */
  start(text: string): Uint8Array;
  /**
   * Applies one update to a document, or names the refusal.
   *
   * The update applies to a trial document, so a refusal leaves the bytes of
   * the caller exactly as they were, and refused work is never kept as work
   * that a later update could activate.
   */
  apply(document: Uint8Array, update: Uint8Array): Result<AppliedDocument>;
  /**
   * Writes one text into a document and keeps its identities.
   *
   * The workspace uses it where it authors text itself: a restore from
   * History or Trash, an import into a note that exists, and the link
   * rewrites that follow a move (record 0081).
   */
  replaceText(document: Uint8Array, text: string): Result<AppliedDocument>;
  /** Edits exact character identities in bounded, disjoint original ranges. */
  editRanges(
    document: Uint8Array,
    edits: readonly DocumentRangeEdit[],
  ): Result<AppliedDocument>;
  /**
   * Leaves one character in each slot that two editors wrote into (record
   * 0134).
   *
   * `before` is the document before the save and `after` holds the save. In
   * a slot that the save wrote into and whose characters come from more than
   * one editor, the last character that the save wrote stays and the others
   * are deleted. Any other slot stays as it is.
   */
  keepWrittenCharacter(
    before: Uint8Array,
    after: Uint8Array,
    slots: readonly TextSlot[],
  ): Result<AppliedDocument>;
  /** The complete observed state of a document. */
  observe(document: Uint8Array): Uint8Array;
  /** The state vector of a document, which names its insertions. */
  stateVector(document: Uint8Array): Uint8Array;
  /** The work of a document that a reader with one state vector lacks. */
  delta(document: Uint8Array, stateVector: Uint8Array): Uint8Array;
  /** The text that a document derives. */
  readText(document: Uint8Array): string;
  /**
   * Whether an observed state covers every insertion and deletion of a
   * document of the same generation.
   */
  covers(observed: Uint8Array, document: Uint8Array): Result<boolean>;
};

/** The refusal codes that a document service may answer. */
export const documentRefusals: readonly DomainErrorCode[] = [
  'document_malformed',
  'document_dependency_missing',
  'document_unsupported',
  'document_too_large',
];

/** A stored outcome of an earlier accepted changeset, kept for safe retries. */
export type MutationReceipt = {
  readonly digest: string;
  readonly outcome: AcceptedChangeset;
};

/** Whether a file holds Markdown or an attachment. */
export type FileKind = 'note' | 'attachment';

/**
 * The accepted head of one file, with the two members that decide a rebase.
 *
 * A rebase has to know more than the identifier of the head: a tombstone head
 * is a boundary that no stale save may cross, and the path of the head is
 * content that a stale save must not revert. Both members come from the same
 * row as the identifier, so reading them costs no extra query.
 */
export type HeadState = {
  readonly revisionId: string;
  readonly path: string;
  readonly deleted: boolean;
};

/**
 * The accepted state of one file.
 *
 * These are the public members of a file. A storage row also holds the
 * workspace and internal bookkeeping, which never leaves the storage layer.
 */
export type FileRecord = {
  readonly fileId: string;
  readonly path: string;
  readonly kind: FileKind;
  /** The accepted head, or `null` for a file that has no accepted revision. */
  readonly headRevisionId: string | null;
  readonly deleted: boolean;
  /** Instant at which the file was created, as an ISO 8601 string. */
  readonly createdAt: string;
  /** Instant of the last accepted change, as an ISO 8601 string. */
  readonly updatedAt: string;
};

/**
 * How a file listing is ordered.
 *
 * `updated` puts the newest accepted change first, which is what a notes list
 * shows by default. `path` orders by the stored path, which is the order of
 * the folder tree. Both orders are total, because the file identifier breaks
 * a tie, so a keyset cursor can continue either of them.
 */
export type FileSort = 'updated' | 'path';

/** One page of accepted files. */
export type FilePage = {
  readonly files: readonly FileRecord[];
  /** The cursor of the next page, or `null` when this page is the last. */
  readonly nextCursor: string | null;
};

/**
 * The accepted state of one deleted file, as the trash lists it.
 *
 * A deleted file always has a head: the tombstone that deleted it. The record
 * therefore states the head as a plain identifier rather than a nullable one,
 * so a restore does not have to handle a case that cannot occur.
 */
export type DeletedFileRecord = {
  readonly fileId: string;
  /** The path that the file held when it was deleted. */
  readonly path: string;
  readonly kind: FileKind;
  /** The tombstone revision, which is the accepted head of the file. */
  readonly headRevisionId: string;
  /** Instant at which the file was created, as an ISO 8601 string. */
  readonly createdAt: string;
  /** Instant of the accepted deletion, as an ISO 8601 string. */
  readonly deletedAt: string;
};

/** One page of deleted files. */
export type DeletedFilePage = {
  readonly files: readonly DeletedFileRecord[];
  /** The cursor of the next page, or `null` when this page is the last. */
  readonly nextCursor: string | null;
};

/** What a caller asks for when it reads a page of records. */
export type PageRequest = {
  /** The position of the previous page, or `null` to start at the front. */
  readonly cursor: string | null;
  readonly limit: number;
};

/**
 * What a caller asks for when it reads a page of files.
 *
 * The cursor is opaque. It carries the sort key and the identifier of the last
 * row of the previous page, so the next page continues the same order instead
 * of scanning from the front. A cursor belongs to the sort that produced it.
 */
export type FilePageRequest = PageRequest & {
  readonly sort: FileSort;
};

/**
 * One immutable revision and the content it names.
 *
 * `text` carries Markdown. An attachment revision carries `objectId` instead,
 * and its bytes are transferred through the attachment operations.
 */
export type RevisionRecord = {
  readonly revisionId: string;
  readonly fileId: string;
  readonly path: string;
  readonly kind: FileKind;
  readonly deleted: boolean;
  readonly parents: readonly string[];
  readonly digest: string;
  /** Size of the content in bytes. */
  readonly size: number;
  readonly text: string | null;
  readonly objectId: string | null;
  readonly message: string | null;
  readonly restoredFrom: string | null;
  readonly clientTime: string;
  readonly serverTime: string;
  /** The generation of the document at this revision, or null. */
  readonly epoch: number | null;
  /**
   * The document of the note, when this revision is its head.
   *
   * A reader starts from it and stays able to merge later work. An older
   * revision and an attachment carry none: the text of an older revision is
   * history, and only the head has a live document (record 0081).
   */
  readonly document: Uint8Array | null;
  /** True when this save joined work that its device had not seen. */
  readonly merged: boolean;
};

/** The revision fields that a snapshot needs to open a note. */
export type SnapshotRevisionRecord = Pick<
  RevisionRecord,
  | 'revisionId'
  | 'fileId'
  | 'path'
  | 'kind'
  | 'deleted'
  | 'digest'
  | 'text'
  | 'document'
  | 'epoch'
  | 'serverTime'
>;

/** Reads and the one write of an open workspace transaction. */
export type WorkspaceTransaction = {
  /** The account's current role in this workspace, or `null` for a stranger. */
  role(accountId: string): Promise<Role | null>;
  /**
   * The receipt of an earlier mutation of the same actor, or `null`. The
   * lookup is bound to the actor, so a replay cannot use another account's
   * outcome.
   */
  receipt(
    mutationId: string,
    accountId: string,
  ): Promise<MutationReceipt | null>;
  /**
   * The accepted head of each requested file. The value is `null` when the
   * file does not exist in accepted state. A missing key means the same.
   */
  /**
   * The documents of the named notes, by file identifier. A note with no
   * document yet is absent from the map.
   */
  documents(
    fileIds: readonly string[],
  ): Promise<ReadonlyMap<string, StoredDocument>>;
  heads(
    fileIds: readonly string[],
  ): Promise<ReadonlyMap<string, string | null>>;
  /**
   * The accepted head of each requested file, with its path and its deletion
   * state. A file that holds no accepted revision is absent from the result.
   *
   * A rebase reads this instead of `heads`, because it must respect the
   * deletion boundary of the head and must keep the path that the head holds.
   */
  headStates(
    fileIds: readonly string[],
  ): Promise<ReadonlyMap<string, HeadState>>;
  /**
   * The accepted path of each requested stored revision.
   *
   * A rebase compares the path of the head that the client saw with the path
   * that the client submitted, so it can tell a rename made elsewhere from a
   * rename made by this save. A revision that this workspace does not hold is
   * absent from the result.
   */
  revisionPaths(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /**
   * The owning file of each requested stored revision. A revision that this
   * workspace does not hold is absent from the result. The value feeds the
   * `known` argument of `validateGraph`.
   */
  parents(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /**
   * The requested file identifiers that were permanently purged.
   *
   * The lookup takes every file of a changeset at once, because a folder
   * change asks about up to 1000 files and one query per file would be one
   * round trip per file.
   */
  purgedFiles(fileIds: readonly string[]): Promise<readonly string[]>;
  /**
   * One page of the live files of this workspace, in the requested order.
   *
   * A deleted file is left out, because it holds no place in the file tree.
   * Its history stays reachable through its revisions.
   */
  listFiles(page: FilePageRequest): Promise<FilePage>;
  /**
   * One page of the deleted files of this workspace, in the requested order.
   *
   * This is the complement of `listFiles`: a file that a tombstone removed
   * from the file tree is listed here, so the trash can offer it back. A
   * permanently purged file is not listed, because it holds no row any more.
   */
  listDeletedFiles(page: FilePageRequest): Promise<DeletedFilePage>;
  /**
   * The requested paths that a live file already holds.
   *
   * A restore needs this to pick a free path without writing and rolling back
   * a refused changeset. Every candidate travels in one call, because one
   * query per candidate would be one round trip per candidate.
   */
  takenPaths(paths: readonly string[]): Promise<readonly string[]>;
  /** One file of this workspace, or `null` when it holds no such file. */
  file(fileId: string): Promise<FileRecord | null>;
  /**
   * The daily note settings that the actor of this transaction keeps in this
   * workspace, or `null` when the actor stored none (record 0099).
   */
  dailyNoteSettings(): Promise<DailyNoteSettings | null>;
  /** Replaces the daily note settings of the actor of this transaction. */
  saveDailyNoteSettings(settings: DailyNoteSettings): Promise<void>;
  /**
   * The template settings that the actor of this transaction keeps in this
   * workspace, or `null` when the actor stored none (record 0149).
   */
  templateSettings(): Promise<TemplateSettings | null>;
  /** Replaces the template settings of the actor of this transaction. */
  saveTemplateSettings(settings: TemplateSettings): Promise<void>;
  /** One revision of this workspace, or `null` when it holds no such one. */
  revision(revisionId: string): Promise<RevisionRecord | null>;

  /** Reads a bounded, nonempty prefix in request order, or null after a purge. */
  snapshotRevisions(
    revisionIds: readonly string[],
  ): Promise<readonly SnapshotRevisionRecord[] | null>;
  /** Searches the accepted live note index of this workspace. */
  search(query: string, limit: number): Promise<readonly SearchHit[]>;
  /** Lists accepted live notes that link to one resolved target path. */
  backlinks(targetPath: string, limit: number): Promise<readonly Backlink[]>;
  /** True when the revision is in the current accepted history of the file. */
  isAcceptedRevision(fileId: string, revisionId: string): Promise<boolean>;
  /**
   * Performs the atomic write of one changeset.
   *
   * The implementation writes the immutable content and revisions, advances
   * every head, updates the indexes, allocates the sync cursor, and stores the
   * receipt. It enforces the persistent invariants that only storage can
   * check: uniqueness of the final accepted paths, including a valid atomic
   * path swap, and the workspace quota. It assigns the verified actor and the
   * server time; a client supplied actor or acceptance time is ignored.
   *
   * Either every file change commits or none does. `accept` runs inside the
   * transaction that `transact` opened and does not start a nested
   * transaction. An expected failure such as `path_conflict` or `quota` is
   * returned as a `Result`; an infrastructure failure throws an
   * `OperationalError`.
   *
   * `superseded` names the files whose accepted head this changeset rebased.
   * The implementation copies it into the outcome and into the stored
   * receipt, so a retry of the same mutation reports the moved parent again.
   */
  accept(
    actor: Actor,
    input: AcceptedInput,
    digest: string,
    superseded?: readonly SupersededHead[],
  ): Promise<Result<AcceptedChangeset>>;
  /**
   * Removes the accepted side records of files that a changeset deleted.
   *
   * A deletion removes the file from search and from the link index, and both
   * have to happen in the transaction that accepted the tombstone. Otherwise a
   * crash between two transactions would leave a stale index row behind.
   *
   * There is one port method rather than one per index, because every caller
   * needs all of them and a later index must not be forgotten at a call site.
   *
   * The call runs after `accept` inside the same transaction. It never adds
   * content, so a full workspace can still delete a file.
   */
  onFilesDeleted(fileIds: readonly string[]): Promise<void>;
  /** One page of history revisions for one file, ordered newest first. */
  listHistory(fileId: string, page: PageRequest): Promise<HistoryPage>;
  /** Previews permanent deletion of the requested files. */
  previewPurge(fileIds: readonly string[]): Promise<Result<PurgePreview>>;
  /** Permanently deletes files and writes purge markers. */
  purgeFiles(
    actor: Actor,
    mutationId: string,
    fileIds: readonly string[],
    digest: string,
  ): Promise<Result<PurgedFilesResult>>;
  /**
   * Captures accepted metadata and the high-water cursor in one transaction.
   *
   * The implementation reads the live files and the workspace cursor under
   * repeatable read (see `TransactOptions`), materializes one item per live
   * file with its immutable head revision, stores the rows under a random
   * opaque token kept as a hash, and returns the token with the captured
   * cursor. It evicts the oldest open snapshot past the admission limit
   * instead of refusing the call.
   */
  startSnapshot(input: StartSnapshotInput): Promise<SnapshotStart>;
  /**
   * Reads one page of a materialized snapshot.
   *
   * The read runs in its own short transaction: no transaction stays open
   * across network pages. The answer is `null` when the token is unknown, the
   * snapshot expired, or a purge removed one of its pinned revisions. The
   * caller maps `null` to `snapshot_required`.
   */
  snapshotPage(
    token: string,
    position: number,
    limit: number,
  ): Promise<SnapshotPage | null>;
  /**
   * Reads the ordered change records after one cursor.
   *
   * The rows hold whole commits only: every row of one cursor, or none of
   * them. The rows stop before a commit that would pass `limit`, and hold the
   * first commit whole when it alone passes `limit` (record 0127). The answer
   * also carries the current high-water cursor and the oldest retained
   * cursor, so the caller can tell an empty poll from a cursor that predates
   * the retained window.
   */
  syncChanges(afterCursor: string, limit: number): Promise<SyncChangeFeed>;
};

/** One historic revision item for history listing. */
export type HistoryRevision = {
  readonly revisionId: string;
  readonly fileId: string;
  readonly path: string;
  readonly deleted: boolean;
  readonly parents: readonly string[];
  readonly digest: string;
  readonly size: number;
  readonly actorAccountId: string;
  readonly clientTime: string;
  readonly serverTime: string;
  readonly message: string | null;
  readonly isCheckpoint: boolean;
  readonly checkpointName: string | null;
  readonly restoredFrom: string | null;
  readonly text: string | null;
  readonly objectId: string | null;
  /** True when the save joined work that its device had not seen (0087). */
  readonly merged: boolean;
};

/** One page of history revisions. */
export type HistoryPage = {
  readonly revisions: readonly HistoryRevision[];
  readonly nextCursor: string | null;
};

/** A reference that prevents permanent deletion of a file. */
export type BlockingReference = {
  readonly kind: 'revision';
  readonly targetId: string;
  readonly referrerId: string;
  readonly description: string;
};

/** Preview summary of an intended purge operation. */
export type PurgePreview = {
  readonly fileIds: readonly string[];
  readonly revisionIds: readonly string[];
  readonly contentDigests: readonly string[];
  readonly attachmentObjectIds: readonly string[];
  readonly blockingReferences: readonly BlockingReference[];
  readonly dependentRevisionCount: number;
  readonly reclaimableBytes: number;
  readonly canPurge: boolean;
};

/** Outcome of an executed permanent file purge. */
export type PurgedFilesResult = {
  readonly mutationId: string;
  readonly purgedFileIds: readonly string[];
  readonly purgedRevisionIds: readonly string[];
  readonly reclaimedBytes: number;
};

/** The kind of entity that one incremental sync record refers to. */
export type SyncEntityKind = 'file' | 'membership';

/** What a caller asks for when it starts a snapshot. */
export type StartSnapshotInput = {
  /** Largest number of items in one snapshot page. */
  readonly pageSize: number;
};

/**
 * One pinned file inside a snapshot.
 *
 * The revision identifier is immutable: later commits cannot change what a
 * page shows. Content transfer reuses the revision read by this identifier,
 * never the later current head.
 */
export type SnapshotItem = {
  readonly fileId: string;
  readonly revisionId: string;
  readonly path: string;
  readonly kind: FileKind;
  readonly deleted: boolean;
};

/** The captured state that a snapshot start returns. */
export type SnapshotStart = {
  /** Opaque token that addresses the materialized pages. */
  readonly token: string;
  /** Instant at which the snapshot expires, as an ISO 8601 string. */
  readonly expiresAt: string;
  /** The captured high-water cursor, as a decimal string. */
  readonly cursor: string;
  /** How many items the snapshot captured. */
  readonly itemCount: number;
  /** The page size stored with the snapshot. */
  readonly pageSize: number;
};

/** One page of a materialized snapshot. */
export type SnapshotPage = {
  /** The token of the snapshot, echoed for the client. */
  readonly token: string;
  /** The captured high-water cursor, as a decimal string. */
  readonly cursor: string;
  /** Instant at which the snapshot expires, as an ISO 8601 string. */
  readonly expiresAt: string;
  /** Ordinal of the first item of this page. */
  readonly position: number;
  /** Ordinal of the next page, or `null` when this page is the last. */
  readonly nextPosition: number | null;
  /** How many items the snapshot holds now. */
  readonly totalItems: number;
  readonly items: readonly SnapshotItem[];
};

/**
 * One commit ordered incremental change record.
 *
 * The feed states everything a reader needs, so no reader fetches a revision
 * to learn what changed (record 0081). A save of a note carries the work that
 * follows the state the reader already holds. A note whose generation changed
 * carries the whole document, because identities of one generation say
 * nothing about another. A purge names the note alone, because its revisions
 * are gone. A membership record only moves the cursor.
 */
export type SyncChange =
  | {
      readonly kind: 'update';
      /** The commit ordered position of this record, as a decimal string. */
      readonly cursor: string;
      readonly fileId: string;
      readonly revisionId: string;
      readonly path: string;
      readonly deleted: boolean;
      readonly digest: string;
      readonly kindOfFile: FileKind;
      /** The generation of the work, or `null` for an attachment. */
      readonly epoch: number | null;
      /** The work of this save, or `null` for an attachment. */
      readonly update: Uint8Array | null;
      /** The state vector at this revision, or `null` for an attachment. */
      readonly stateVector: Uint8Array | null;
    }
  | {
      readonly kind: 'document';
      readonly cursor: string;
      readonly fileId: string;
      readonly revisionId: string;
      readonly path: string;
      readonly deleted: boolean;
      readonly digest: string;
      readonly epoch: number;
      readonly document: Uint8Array;
    }
  | { readonly kind: 'purge'; readonly cursor: string; readonly fileId: string }
  | {
      readonly kind: 'membership';
      readonly cursor: string;
      readonly accountId: string;
      readonly removed: boolean;
    };

/** The raw feed that one incremental sync read returns. */
export type SyncChangeFeed = {
  /** Ordered changes after the requested cursor, oldest first. */
  readonly changes: readonly SyncChange[];
  /** The current high-water cursor, as a decimal string. */
  readonly highWater: string;
  /** The oldest retained cursor, or `null` when no record is retained. */
  readonly oldestRetained: string | null;
};

/** One page of incremental changes with the cursor to continue from. */
export type SyncPage = {
  readonly changes: readonly SyncChange[];
  /** The cursor the client sends to continue, as a decimal string. */
  readonly nextCursor: string;
};

/** Options of one open workspace transaction. */
export type TransactOptions = {
  /**
   * The isolation level of the transaction.
   *
   * A snapshot capture asks for `repeatable-read`, so the captured metadata
   * and its high-water cursor come from one stable view. Every other use case
   * leaves this absent and keeps the default level.
   */
  readonly isolation?: 'repeatable-read';
  /**
   * True when the callback cannot change workspace state.
   *
   * A read-only transaction does not take the exclusive workspace write lock,
   * so independent readers can run together. PostgreSQL also rejects a write
   * if a caller marks a callback incorrectly.
   */
  readonly readOnly?: true;
};

/** Opens one workspace transaction for a verified actor. */
export type WorkspaceStore = {
  /**
   * The document service of this deployment (records 0081, 0082).
   *
   * The composition root supplies it, so the domain reads and writes the
   * document of a note without importing the library that implements it.
   */
  readonly documents: DocumentService;
  /**
   * Runs `run` inside one workspace transaction and commits when it returns.
   * The transaction rolls back when `run` throws. The actor identity is set on
   * the connection, so row access policies apply to every statement.
   */
  transact<T>(
    actor: Actor,
    workspaceId: string,
    run: (tx: WorkspaceTransaction) => Promise<T>,
    options?: TransactOptions,
  ): Promise<T>;
};

/** The kind of infrastructure failure that an adapter reports. */
export type OperationalErrorKind =
  'unavailable' | 'timeout' | 'serialization' | 'unexpected';

/**
 * An infrastructure failure, such as an unreachable database or a lock
 * timeout.
 *
 * This is not a `DomainError`. A domain error is an expected outcome of a
 * valid request and is returned as a `Result`. An `OperationalError` is thrown,
 * and the HTTP adapter maps it to a generic server error that carries the
 * request identifier and no stored content. Keep the message free of note
 * content, paths, and secrets.
 */
export class OperationalError extends Error {
  readonly kind: OperationalErrorKind;

  constructor(
    kind: OperationalErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'OperationalError';
    this.kind = kind;
  }
}

/** Whether a caught value is an infrastructure failure of a storage port. */
export function isOperationalError(value: unknown): value is OperationalError {
  return value instanceof OperationalError;
}
