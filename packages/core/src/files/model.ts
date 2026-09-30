/**
 * Shared file domain types.
 *
 * These types describe what a client asks the workspace to accept and what an
 * accepted change looks like. They are separate from HTTP request models and
 * from storage rows. A transport adapter maps its own validated types to these
 * types; it never passes a parsed request body through as a domain value.
 *
 * Every identifier is a UUID string that the transport and the storage
 * boundaries validate. Domain code compares identifiers; it does not parse
 * them.
 */

/**
 * The text work of one save of a note (record 0081).
 *
 * A save carries work, not text. The workspace applies the update to the
 * document of the note and derives the accepted text from the result, so two
 * devices that write at the same time keep both edits.
 *
 * `observed` is the complete state that the device had seen: the state vector
 * and the deletion set. It decides whether the save joins unseen work and
 * whether a deletion would hide an edit that the device never saw. A state
 * vector alone cannot answer either question, because it does not grow with a
 * deletion.
 */
export type DocumentWork =
  /** The work of one device, as an update of the document. */
  | { readonly kind: 'update'; readonly update: Uint8Array }
  /**
   * A text that the workspace writes into the document itself. A restore, an
   * import, and a link rewrite after a move take this form: they edit the
   * document of the note, so they keep its identities and its history.
   */
  | { readonly kind: 'text'; readonly text: string }
  /** No text work. A deletion states what the device had seen and no more. */
  | { readonly kind: 'none' };

export type DocumentSave = {
  readonly work: DocumentWork;
  readonly epoch: number;
  /**
   * The complete state that the device had seen, or null when the workspace
   * itself writes and therefore has seen everything.
   */
  readonly observed: Uint8Array | null;
};

/**
 * Immutable content of one revision.
 *
 * A note carries document work, and the workspace derives its text and digest
 * from the accepted document. Attachment content carries the identity of a
 * finalized immutable object, never its bytes, and keeps its declared digest.
 */
export type ContentRef =
  | {
      readonly kind: 'markdown';
      readonly document: DocumentSave;
    }
  | {
      readonly kind: 'attachment';
      readonly digest: string;
      readonly objectId: string;
    };

/**
 * The content of one revision as the workspace stores it.
 *
 * A note holds the text that its accepted document derives, with the digest
 * of that text. The domain never stores the update itself as content: the
 * document holds the work, and the revision holds what a reader sees.
 */
export type StoredContentRef =
  | {
      readonly kind: 'markdown';
      readonly digest: string;
      readonly text: string;
    }
  | {
      readonly kind: 'attachment';
      readonly digest: string;
      readonly objectId: string;
    };

/**
 * One revision that a client submits.
 *
 * `parents` holds zero identifiers for the first revision of a new file, one
 * for a normal revision, and two for an explicit merge. The actor and the
 * acceptance time are added by the workspace; a client cannot supply them.
 * `clientTime` stays informational.
 */
export type RevisionInput = {
  readonly id: string;
  readonly fileId: string;
  readonly parents: readonly string[];
  readonly path: string;
  readonly deleted: boolean;
  readonly content: ContentRef;
  readonly clientTime: string;
  readonly message: string | null;
  readonly restoredFrom: string | null;
};

/** One revision with the content that the workspace derived for it. */
export type StoredRevisionInput = Omit<RevisionInput, 'content'> & {
  readonly content: StoredContentRef;
};

/**
 * The document of one note after an accepted changeset.
 *
 * `merged` is true when the save joined work that the device had not seen.
 * Every device reads that mark in History, and the device that saved keeps
 * its own checkpoint for Review (record 0087).
 */
export type DocumentWrite = {
  readonly fileId: string;
  readonly bytes: Uint8Array;
  readonly epoch: number;
  readonly state: Uint8Array;
  readonly merged: boolean;
  /**
   * The work that this changeset added to the document, as the feed sends it.
   * It is the delta from the state before this changeset, so a reader that
   * holds that state needs nothing else.
   */
  readonly update: Uint8Array;
  /** The state vector after the change, so a reader can ask for a delta. */
  readonly vector: Uint8Array;
};

/**
 * One atomic operation over one or more files.
 *
 * `expectedHeads[fileId]` is the accepted head that the client saw. The value
 * `null` means that the file must not exist in accepted state. `mutationId`
 * identifies a retry of the same operation.
 */
export type ChangesetInput = {
  readonly workspaceId: string;
  readonly mutationId: string;
  readonly deviceId: string;
  readonly expectedHeads: Readonly<Record<string, string | null>>;
  readonly revisions: readonly RevisionInput[];
};

/**
 * One revision as the workspace accepted it.
 *
 * The record carries the values that the workspace assigned: the verified
 * actor and the acceptance time. It carries no note text. A client that
 * submitted the revision already holds its content, and a caller that may not
 * read the workspace must not receive content through a write answer.
 */
export type AcceptedRevision = {
  readonly revisionId: string;
  readonly fileId: string;
  readonly parents: readonly string[];
  readonly path: string;
  readonly deleted: boolean;
  readonly digest: string;
  /** Size of the content in bytes. */
  readonly size: number;
  readonly actorAccountId: string;
  readonly serverTime: string;
  readonly message: string | null;
  /** The generation of the document, or null for an attachment. */
  readonly epoch: number | null;
  /** The complete state of the document, or null for an attachment. */
  readonly acceptedState: Uint8Array | null;
  /**
   * True when this save joined work that the device had not seen. History
   * marks the revision on every device, and the device that saved keeps its
   * checkpoint for Review (record 0087).
   */
  readonly merged: boolean;
};

/**
 * One file whose accepted head moved between the client read and this commit.
 *
 * The workspace rebases a stale save on the current head, so a later save
 * still wins. The record says which head the save passed, so the client can
 * tell the person that text from another device is now only in history. It
 * carries no content and no path, because the accepted revision of the same
 * answer already names the path.
 */
export type SupersededHead = {
  readonly fileId: string;
  /** The accepted head that the client did not see, now a history entry. */
  readonly previousHeadRevisionId: string;
  /** The revision of this changeset that became the new accepted head. */
  readonly acceptedRevisionId: string;
};

/**
 * The outcome of an accepted changeset, also stored as a mutation receipt.
 *
 * The accepted revisions travel with the outcome, so an answer to a write is
 * built from the write itself rather than from a later read. A retry of the
 * same mutation therefore repeats the same records, and a caller that may
 * write but not read still receives its own acknowledgement.
 *
 * `superseded` is empty for the normal case. It names every file whose head
 * this changeset rebased, so the answer of a write reports a moved parent
 * instead of leaving the client to guess.
 */
export type AcceptedChangeset = {
  readonly mutationId: string;
  readonly revisionIds: readonly string[];
  readonly cursor: string;
  readonly revisions: readonly AcceptedRevision[];
  readonly superseded: readonly SupersededHead[];
};

/**
 * One changeset with everything that the workspace derived from it.
 *
 * Storage writes the revisions, the documents, the indexes, the cursor and
 * the receipt of this value in one savepoint, so an accepted text and the
 * document it came from can never disagree (record 0081).
 */
export type AcceptedInput = Omit<ChangesetInput, 'revisions'> & {
  readonly revisions: readonly StoredRevisionInput[];
  readonly documents: readonly DocumentWrite[];
};

/**
 * A stable domain failure code.
 *
 * Each code is an expected outcome of a valid request, so a caller can map it
 * to a documented problem response. An infrastructure failure is not a domain
 * error; see `OperationalError` in `./ports.ts`.
 *
 * `invalid_content` means that submitted content does not match its declared
 * digest. Storage checks this, because a wrong digest would attach a revision
 * to bytes that the client never sent.
 *
 * `snapshot_required` means that a snapshot expired, is unknown, was
 * invalidated by a purge, or that a sync cursor predates the retained event
 * window. The client starts a fresh snapshot and keeps its local work.
 *
 * `unsupported_version` means that the client asked for a sync protocol
 * version that this server does not serve. The request changes nothing.
 *
 * `epoch_mismatch` means that the note holds another generation of its
 * document, so the identities of the save say nothing about it. The device
 * reads the current document and saves again.
 *
 * `unseen_work` means that a deletion would hide text work that the device
 * has not seen. An edit wins over Trash in either arrival order, so the
 * deletion is refused and the device reads the text first (record 0083).
 *
 * `document_malformed`, `document_dependency_missing`, `document_unsupported`
 * and `document_too_large` are the refusals of one update: bytes that are not
 * an update, work that names an insertion or a deletion the document lacks,
 * work that writes anything other than the text of the note, and work that
 * passes a bound. Each leaves the accepted state exactly as it was.
 *
 * `published_link_unavailable` is the one refusal of the reader path of a
 * published link. A link that never existed, a revoked link, an expired link
 * and a wrong password all take it, as decision 0030 requires, so the answer
 * states nothing about the link. `publications/errors.ts` holds the one value
 * that carries this code.
 *
 * `note_too_large` and `note_too_deep` mean that the Markdown of a note is
 * above a fixed limit of the Markdown package, so the note cannot be read as
 * Markdown. Storage reports them when it indexes an accepted revision.
 *
 * `too_many_files` means that one changeset would rewrite more files than
 * `maxFilesPerChangeset` allows. It is its own code and not `invalid_graph`,
 * because the revisions are a valid change of the stored history and the only
 * problem is how many of them there are. A folder rename is the operation
 * that reaches the limit, and the person can act on it by moving fewer notes
 * at a time. A purge takes the same limit, because one purge is one commit of
 * the sync feed (record 0127).
 *
 * `last_administrator` refuses a change that leaves the installation with no
 * enabled administrator (record 0110). `invitation_invalid` is the one
 * refusal of an invitation: an expired, a used, a revoked and an unknown
 * token all take it, so the answer states nothing about the invitation.
 * `account_exists` refuses an invitation to an address that already signs
 * in. `open_registration_unavailable` refuses the open policy while the
 * installation lacks a part that record 0114 names. `password_breached`
 * refuses a new password that the breach service lists (record 0116).
 * `registration_closed` refuses an open sign-up while the policy is not
 * open, and `verification_invalid` is the one refusal of a verification link
 * (record 0114). `proof_invalid` refuses a sign-up whose proof of work does
 * not count (record 0115). `consent_required` refuses a sign-up or a consent
 * that does not name the current versions of the legal documents (record
 * 0120).
 */
export type DomainErrorCode =
  | 'forbidden'
  | 'stale_head'
  | 'path_conflict'
  | 'invalid_path'
  | 'invalid_graph'
  | 'invalid_content'
  | 'too_many_files'
  | 'quota'
  | 'purged'
  | 'mutation_reused'
  | 'snapshot_required'
  | 'unsupported_version'
  | 'epoch_mismatch'
  | 'unseen_work'
  | 'document_malformed'
  | 'document_dependency_missing'
  | 'document_unsupported'
  | 'document_too_large'
  | 'note_too_large'
  | 'note_too_deep'
  | 'published_link_unavailable'
  | 'not_found'
  | 'last_administrator'
  | 'invitation_invalid'
  | 'account_exists'
  | 'open_registration_unavailable'
  | 'password_breached'
  | 'registration_closed'
  | 'verification_invalid'
  | 'proof_invalid'
  | 'consent_required'
  | 'theme_limit';

/**
 * A domain failure and the files it refers to.
 *
 * `fileIds` names the files that a caller must show or resolve. It is empty
 * when the failure has no file, for example a denied permission check. The
 * error carries no note content and no path, so it is safe to log.
 */
export type DomainError = {
  readonly code: DomainErrorCode;
  readonly fileIds: readonly string[];
};

/**
 * The result of a domain operation.
 *
 * Expected failures are returned, not thrown. An exception in this package
 * means a defect or an infrastructure failure.
 */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };

/** Wraps a successful value. Use `ok(undefined)` for a `Result<void>`. */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** Wraps a domain failure. `fileIds` stays empty when no file is involved. */
export function fail<T>(
  code: DomainErrorCode,
  fileIds: readonly string[] = [],
): Result<T> {
  return { ok: false, error: { code, fileIds: [...fileIds] } };
}
