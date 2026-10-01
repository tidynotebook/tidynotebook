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
export type { PasswordProblem } from './identity/password.ts';
export type { SessionView } from './identity/sessions.ts';
export {
  listSessions,
  revokeOtherSessions,
  revokeSession,
} from './identity/sessions.ts';
export { passwordBounds, passwordProblem } from './identity/password.ts';
export type {
  AccountStanding,
  AccountState,
  InstallationAction,
  InstallationRole,
  RegistrationPolicy,
} from './identity/installation.ts';
export {
  accountStates,
  installationRoles,
  isEnabledAdministrator,
  leavesNoAdministrator,
  mayAdminister,
  registrationPolicies,
} from './identity/installation.ts';
export type {
  AccountRecord,
  InstallationSettingsReader,
  InstallationStore,
  InstallationTransaction,
  InvitationRecord,
  LinkReportRecord,
  NewInvitation,
  RegistrationGround,
  RegistrationRequest,
  RegistrationStore,
} from './identity/ports.ts';
export type {
  ExistingIdentity,
  OpenRegistrationPart,
  OpenRegistrationReadiness,
} from './identity/registration.ts';
export {
  defaultAccountLimitBytes,
  defaultInvitationLifetimeHours,
  defaultPendingAccountHours,
  maxPendingAccountHours,
  openSignUpAction,
  invitationExpiry,
  invitationState,
  invitationTokenPattern,
  maxAccountLimitBytes,
  maxEmailLength,
  maxInvitationLifetimeHours,
  normalizeEmail,
  openRegistrationMissing,
  personalWorkspaceName,
  readInvitation,
  registerAccount,
} from './identity/registration.ts';
export type {
  AccountChange,
  InvitationView,
} from './identity/administration.ts';
export {
  createInvitation,
  dismissReport,
  listAccounts,
  listInvitations,
  listReports,
  readRegistrationPolicy,
  removeAccount,
  removeOwnAccount,
  revokeInvitation,
  setRegistrationPolicy,
  takeDownReportedLink,
  updateAccount,
} from './identity/administration.ts';
export type {
  AcceptedChangeset,
  AcceptedInput,
  AcceptedRevision,
  ChangesetInput,
  DocumentSave,
  DocumentWork,
  DocumentWrite,
  StoredContentRef,
  StoredRevisionInput,
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
  AppliedDocument,
  DocumentService,
  HeadState,
  StoredDocument,
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
export {
  emptySubscription,
  noticeBatch,
  replaceSubscription,
  type NoticeSubscription,
  type SubscriptionRefusal,
} from './files/notices.ts';
export { acceptDocumentWork, acceptWithDocuments } from './files/documents.ts';
export type { TextSlot } from './files/task-boxes.ts';
export { doubledTaskBoxes } from './files/task-boxes.ts';
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
  workspaceText,
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
  SessionRecord,
  AccountOwnStanding,
  AccountSettings,
  AccountTransaction,
  AppearanceChoice,
  ImportedPalette,
  ImportedTheme,
  Preferences,
  PreferencesChange,
  ThemeImport,
  WorkspaceAdminStore,
  WorkspaceAdminTransaction,
  WorkspaceSummary,
} from './workspaces/ports.ts';
export {
  readOwnStanding,
  appearanceChoices,
  createWorkspace,
  defaultSpellCheck,
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
export {
  customThemeLimit,
  deleteTheme,
  importedFamilyOf,
  importedFamilyPrefix,
  importTheme,
} from './workspaces/themes.ts';
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
export type { ReportReason, ReportedLinkState } from './publications/report.ts';
export {
  isReportReason,
  maxReportNoteLength,
  reportNote,
  reportReasons,
  reportedLinkStates,
} from './publications/report.ts';
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
export type { DailyNoteSettings } from './daily-notes/model.ts';
export { defaultDailyNoteSettings } from './daily-notes/model.ts';
export type { CalendarDate, Weekday } from './daily-notes/calendar.ts';
export {
  addDays,
  addMonths,
  daysInMonth,
  formatCalendarDate,
  isCalendarDate,
  parseCalendarDate,
  sameCalendarDate,
  weekdayOf,
  weekdays,
} from './daily-notes/calendar.ts';
export type { DailyNoteFormatProblem } from './daily-notes/format.ts';
export {
  dailyNoteFormatProblem,
  formatDailyNoteName,
  isDateFormat,
  parseDailyNoteName,
} from './daily-notes/format.ts';
export type { TemplateContext } from './daily-notes/template.ts';
export { fillTemplate, templateVariableNames } from './daily-notes/template.ts';
export type {
  DailyNoteLayout,
  DailyNoteLayoutProblem,
} from './daily-notes/path.ts';
export {
  cleanDailyNoteFolder,
  dailyNoteDate,
  dailyNoteLayoutProblem,
  dailyNotePath,
  defaultDailyNoteLayout,
} from './daily-notes/path.ts';
export {
  isTemplateNote,
  readDailyNoteSettings,
  updateDailyNoteSettings,
} from './daily-notes/settings.ts';
export type { ProofFacts, ProofRefusal } from './identity/proof-of-work.ts';
export {
  defaultProofDifficulty,
  leadingZeroBits,
  maxProofDifficulty,
  maxProofSolutionLength,
  minProofDifficulty,
  proofInput,
  proofLifetimeMs,
  proofRefusal,
} from './identity/proof-of-work.ts';
export type {
  ConsentRecord,
  ConsentVersions,
  LegalDocument,
  LegalDocuments,
} from './identity/legal.ts';
export type {
  InstallationEnvironment,
  LegalDocumentInput,
  LegalDocumentName,
  LegalDocumentProblem,
  MailPasswordChange,
  MailSecurity,
  MailSettingsInput,
  MailSettingsProblem,
  StoredInstallationSettings,
  StoredLegalDocument,
  StoredMailSettings,
} from './identity/installation-settings.ts';
export {
  blankLabel,
  documentAddress,
  emptyInstallationSettings,
  fillBlanks,
  legalDocumentNames,
  mailHost,
  mailSecurities,
  mailSender,
  maxLegalTextBytes,
  readInstallationSettings,
  readLegalDocument,
  readMailSettings,
  removeMailSettings,
  senderAddress,
  setLegalDocument,
  setMailSettings,
  settingsReadiness,
  templateBlanks,
  utf8Length,
} from './identity/installation-settings.ts';
export type { LegalTemplateFacts } from './identity/legal-templates.ts';
export { legalTemplate } from './identity/legal-templates.ts';
export {
  acceptLegalDocuments,
  consentMatches,
  consentRequired,
  maxLegalVersionLength,
  readConsent,
} from './identity/legal.ts';
