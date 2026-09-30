/**
 * Public entry point of the notesapp server storage package.
 *
 * This package is Node only. It implements the workspace storage ports that
 * `@notesapp/core` owns, and it holds the PostgreSQL schema, the reviewed
 * migrations, and the roles and row access policies that protect the data.
 * A browser package must never import it.
 */
export { createDocumentService } from './document-service.ts';
export { openPool, poolSizes, processConnectionLimit } from './pool.ts';
export {
  listenerRetryMs,
  listenerTimerSchedule,
  openSyncListener,
  parseSyncHint,
  syncHintChannel,
  syncListenerName,
  type ListenerSchedule,
  type SyncHint,
  type SyncListener,
  type SyncListenerEvents,
  type SyncListenerOptions,
} from './sync-listener.ts';
export { deferHintsSetting, syncHintsSetting } from './sync-hints.ts';
export {
  DatabaseFailure,
  defaultConnectionTimeoutMs,
  openWorkspaceStore,
  WorkspaceUnavailableError,
  type DatabaseProbeResult,
  type OwnedPublishedLink,
  type PublicationReport,
  type PublicationCleanupResult,
  type PublicationUnlockAttempt,
  type PublicationUnlockResult,
  type PublishedLinkDraft,
  type PublishedLinkStore,
  type WorkspaceStoreHandle,
  type WorkspaceStoreOptions,
} from './workspace-store/index.ts';
export { readOnlyTransactionCode } from './workspace-store/publication-transaction.ts';
export { markdownLimitCode } from './markdown-limits.ts';
export {
  openAttachmentStore,
  type AttachmentBytes,
  type AttachmentStore,
  type AttachmentStoreHandle,
  type AttachmentStoreOptions,
} from './attachments.ts';
export {
  authRole,
  main as runMigrationCommand,
  migrationsFolder,
  requiredSchemaVersion,
  runMigrations,
  runtimeRole,
  testAuthPassword,
  testDatabaseUrl,
  testRuntimePassword,
  type MigrationRun,
} from './migrate.ts';
export {
  migratePortableMarkdown,
  type PortableMarkdownMigrationResult,
} from './portable-markdown-migration.ts';
export {
  migrateNoteDocuments,
  type NoteDocumentMigrationResult,
} from './note-document-migration.ts';
export {
  assertProfileDatabase,
  databaseName,
  isTestDatabaseName,
  parseProfile,
  testDatabasePrefix,
  withCredentials,
  withDatabaseName,
  type MigrationProfile,
} from './profiles.ts';
export { createTestDatabase, dropTestDatabase } from './admin.ts';
export {
  openIdentityStore,
  type IdentityStoreHandle,
  type IdentityStoreOptions,
} from './identity-store.ts';
export {
  accountAuditEvents,
  accountIdentities,
  accountPreferences,
  authAccount,
  authSession,
  authUser,
  authRateLimit,
  authVerification,
} from './schema.ts';
export {
  maxAttemptKeyLength,
  openCoordination,
  type AttemptCount,
  type CoordinationHandle,
} from './coordination.ts';
export {
  provisionAccounts,
  provisionWorkspace,
  type AccountSeed,
  type WorkspaceSeed,
} from './provision.ts';
