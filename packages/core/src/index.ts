/**
 * Public entry point of the notesapp domain core.
 *
 * This package holds the rules that both runtimes share: the role and action
 * matrix, path rules, revision graph rules, and the storage ports that the
 * server implements. It must stay free of Node built-in modules, a database
 * driver, an HTTP framework, a browser database, and the generated HTTP
 * client, because the browser also runs these rules.
 *
 * Only the names below are public. The verified actor marker stays internal,
 * so an actor can be built only through `verifyActor`. The publications
 * context exports no name that builds an actor and no name that opens a link
 * record without its four checks, so the reader path of decision 0031 stays
 * closed.
 */
export type {
  Action,
  Actor,
  Grant,
  Role,
  StoredGrant,
} from './identity/actor.ts';
export { actionsForRole, authorize, verifyActor } from './identity/actor.ts';
export { generateUUID } from './identity/uuid.ts';
export type {
  AcceptedChangeset,
  AcceptedRevision,
  ChangesetInput,
  ContentRef,
  DomainError,
  DomainErrorCode,
  Result,
  RevisionInput,
  SupersededHead,
} from './files/model.ts';
export { fail, ok } from './files/model.ts';
export type { PathKind } from './files/path.ts';
export { normalizePath } from './files/path.ts';
export { validateGraph } from './files/graph.ts';
export type { FileCursor } from './files/cursor.ts';
export { decodeFileCursor, encodeFileCursor } from './files/cursor.ts';
export {
  CanonicalJsonError,
  canonicalJson,
  contentDigest,
  requestDigest,
} from './files/digest.ts';
export type {
  BlockingReference,
  DeletedFilePage,
  DeletedFileRecord,
  FileKind,
  FilePage,
  FilePageRequest,
  FileRecord,
  FileSort,
  HeadState,
  HistoryPage,
  HistoryRevision,
  MutationReceipt,
  OperationalErrorKind,
  PageRequest,
  PurgePreview,
  PurgedFilesResult,
  RevisionRecord,
  SnapshotItem,
  SnapshotPage,
  SnapshotStart,
  StartSnapshotInput,
  SyncChange,
  SyncChangeFeed,
  SyncEntityKind,
  SyncPage,
  TransactOptions,
  WorkspaceStore,
  WorkspaceTransaction,
} from './files/ports.ts';
export { isOperationalError, OperationalError } from './files/ports.ts';
export { commitChangeset, maxFilesPerChangeset } from './files/commit.ts';
export { listBacklinks, type Backlink } from './files/backlinks.ts';
export type {
  CreateFileInput,
  FolderMember,
  RenameFolderInput,
  SubmissionIds,
  UpdateFileInput,
} from './files/operations.ts';
export {
  createFileChangeset,
  markdownContent,
  renameFolderChangeset,
  tombstoneContent,
  updateFileChangeset,
} from './files/operations.ts';
export type {
  AttachmentMediaType,
  AttachmentObjectRecord,
  AttachmentState,
} from './files/attachments.ts';
export {
  allowedMediaTypes,
  attachmentStates,
  createAttachmentChangeset,
  isAllowedMediaType,
  isAttachmentState,
} from './files/attachments.ts';
export type { RestoreFileInput } from './files/trash.ts';
export {
  listDeletedFiles,
  restoreCandidates,
  restoreFile,
} from './files/trash.ts';
export type { FileWithHead } from './files/read.ts';
export {
  defaultFileSort,
  defaultPageSize,
  fileSort,
  listFiles,
  maxListedFiles,
  maxPageSize,
  pageSize,
  readFile,
  readHeadForWrite,
  readMutationReceipt,
  readRevision,
} from './files/read.ts';
export type {
  AccountTransaction,
  AppearanceChoice,
  Preferences,
  StoredPreferences,
  WorkspaceAdminStore,
  WorkspaceAdminTransaction,
  WorkspaceSummary,
} from './workspaces/ports.ts';
export {
  appearanceChoices,
  createWorkspace,
  deleteWorkspace,
  isThemeFamilyId,
  listWorkspaces,
  readPreferences,
  sessionGrants,
  themeFamilyMaximumLength,
  themeFamilyPattern,
  updatePreferences,
  updateWorkspace,
} from './workspaces/service.ts';
export type { RestoreRevisionInput } from './history/service.ts';
export {
  defaultHistoryLimit,
  listHistory,
  maxHistoryLimit,
  restoreRevision,
} from './history/service.ts';
export { previewPurge, purgeFiles } from './history/purge.ts';
export type {
  SnapshotPageOptions,
  StartSnapshotOptions,
  SyncChangesOptions,
} from './files/snapshot.ts';
export {
  formatSyncCursor,
  getChanges,
  getSnapshotPage,
  isSupportedSyncVersion,
  maxOpenSnapshots,
  parseSyncCursor,
  snapshotDefaultPageSize,
  snapshotMaxPageSize,
  snapshotPageSize,
  snapshotPosition,
  snapshotTtlMs,
  startSnapshot,
  supportedSyncVersions,
  syncDefaultLimit,
  syncLimit,
  syncMaxLimit,
  syncProtocolVersion,
  syncRetentionDays,
} from './files/snapshot.ts';
export type { ExcerptPart, SearchHit } from './search/service.ts';
export {
  defaultSearchLimit,
  maxSearchLimit,
  searchFiles,
  searchLimit,
} from './search/service.ts';
export type {
  PublicationScope,
  PublishedAttachmentReference,
  PublishedLink,
  PublishedNote,
  PublishedNoteContent,
  ReadingTicket,
  ScopedNote,
} from './publications/model.ts';
export { maxPublishedLinksPerWorkspace } from './publications/model.ts';
export type {
  ReaderRefusalCause,
  ReaderRefusalLog,
} from './publications/errors.ts';
export {
  publishedLinkUnavailable,
  readerRefusalCauses,
} from './publications/errors.ts';
export type {
  Clock,
  PasswordHasher,
  PublicationContext,
  PublicationReader,
  PublicationStore,
  SecretDigest,
} from './publications/ports.ts';
export {
  folderScopePrefix,
  isNoteInScope,
  normalizeScope,
} from './publications/scope.ts';
export {
  isTicketUsable,
  readingTicketExpiry,
  readingTicketLifetimeMs,
} from './publications/ticket.ts';
export type { NewPublishedLink } from './publications/create-link.ts';
export { planPublishedLink } from './publications/create-link.ts';
export type { ReaderCredentials } from './publications/resolve-link.ts';
export {
  linkRefusalCause,
  resolvePublishedLink,
} from './publications/resolve-link.ts';
export type { PublishedNoteRead } from './publications/read-note.ts';
export { readPublishedNote } from './publications/read-note.ts';
export type { PublishedPage } from './publications/read-page.ts';
export { readPublishedPage } from './publications/read-page.ts';
export type { PublishedNoteList } from './publications/list-scope.ts';
export { listPublishedNotes } from './publications/list-scope.ts';
export type {
  PublishedAttachment,
  PublishedAttachmentRequest,
} from './publications/attachment-reference.ts';
export { resolvePublishedAttachment } from './publications/attachment-reference.ts';
