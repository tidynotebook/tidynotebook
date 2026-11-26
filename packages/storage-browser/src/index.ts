/**
 * Public entry point of the notesapp browser storage package.
 *
 * It implements the local persistence port of `@notesapp/sync` with IndexedDB
 * through Dexie. The web application composes the two; nothing else opens a
 * browser database.
 */
export type {
  CheckpointRow,
  ContentRow,
  CursorRow,
  DraftRow,
  FileRow,
  LeaseRow,
  LocalDatabase,
  MetaRow,
  MigrationState,
  PreferenceRow,
  QueueRow,
  ReceiptRow,
  RecoveryRow,
  SnapshotItemRow,
  SnapshotRow,
  Tables,
} from './database.ts';
export {
  createDatabase,
  defaultDatabaseName,
  metaKey,
  partitionRange,
  schemaVersions,
  tableNames,
  toLocalStorageError,
} from './database.ts';
export type { SchemaState } from './migrations.ts';
export {
  blockedUpgradeInstructions,
  currentSchemaVersion,
  ensureSchema,
  isBlockedUpgradeError,
  migrationSteps,
  validateAcceptedFile,
  validateChangesetInput,
  validateCheckpoint,
  validateContent,
  validateCursor,
  validateDraft,
  validateLease,
  validateMeta,
  validatePreference,
  validateQueueRow,
  validateReceipt,
  validateRecovery,
  validateSnapshot,
  validateSnapshotItem,
} from './migrations.ts';
export type { LocalStoreOptions } from './local-store/index.ts';
export { openLocalStore } from './local-store/index.ts';

export { observeDocument, startDocument } from '@notesapp/note-document';
