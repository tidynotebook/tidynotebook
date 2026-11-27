/**
 * Public entry point of the notesapp sync package.
 *
 * This package owns the local persistence port and the pure rules of offline
 * work. It runs in the browser, so it imports no Node module, no browser
 * database, and no server package. `@notesapp/storage-browser` implements the
 * port with IndexedDB; the sync engine of Task 11 uses the same port.
 */
export type { CheckpointComparison } from './checkpoints.ts';
export { saveCheckpointMessage, shouldCheckpoint } from './checkpoints.ts';
export type { NoteCreationStore } from './create-note.ts';
export { createNote } from './create-note.ts';
export type {
  AttachmentPin,
  CheckpointRecord,
  CheckpointSource,
  AccessRecoveryCopy,
  Draft,
  FileMove,
  HeldPath,
  LocalAcceptedFile,
  LocalCachedNote,
  LocalConflict,
  LocalContent,
  LegacyReceipt,
  LegacySave,
  LocalChange,
  LocalCursor,
  LocalFileKind,
  LocalFileSummary,
  LocalReceipt,
  LocalStorageErrorKind,
  LocalStore,
  FileSaveSnapshot,
  Partition,
  Preference,
  QueueEntry,
  QueueState,
  RecoveryInput,
  RecoveryReason,
  RecoveryRecord,
  ReviewCause,
  ReviewRecord,
  NoteDocument,
  ServerNote,
  StagedSnapshot,
} from './local-port.ts';
export {
  accountWide,
  isLocalStorageError,
  LocalStorageError,
} from './local-port.ts';
export type { ObservedCovers, ObservedSave } from './parked.ts';
export { observedOf, supersededSaves, supersedes } from './parked.ts';
export type {
  RemoteChange,
  RemoteFileChange,
  SnapshotRevision,
} from './local-port.ts';
export type {
  CommitResult,
  Problem,
  PullChanges,
  PushOutcome,
  QueueNetwork,
  ServiceOutcome,
  SyncContext,
  SyncNotice,
} from './queue.ts';
export {
  backoffBaseMs,
  backoffCapMs,
  backoffDelay,
  isRetryableStatus,
  maxAttempts,
  parkRefusedSave,
  pushQueue,
  sendWithRetry,
  SnapshotRestartNeeded,
  SyncFailedError,
  transportFailedCode,
  downloadLimitCode,
} from './queue.ts';
export type {
  ChangeRecord,
  PullOutcome,
  RevisionData,
  SnapshotItemData,
  SnapshotNetwork,
} from './snapshot.ts';
export {
  pagesPerTurn,
  pullNew,
  pullPages,
  snapshotFetchConcurrency,
} from './snapshot.ts';
export type { LeaseStore, WorkerLease } from './lease.ts';
export {
  createLeaseKeeper,
  timerSchedule,
  type LeaseKeeper,
  type Schedule,
} from './lease-keeper.ts';
export {
  createInterestTable,
  interestHeartbeatMs,
  interestTtlMs,
  subscriptionSet,
  type InterestTable,
  type TabInterest,
} from './interests.ts';
export {
  createNoticeCoordinator,
  engineInterval,
  maxSubscribedWorkspaces,
  offerRetryMs,
  type CoordinatorPorts,
  type NoticeCoordinator,
  type NoticeHandlers,
  type NoticeSocket,
  type StreamEnd,
} from './notice-coordinator.ts';
export {
  acquireWorkerLease,
  isLeaseExpired,
  readWorkerLease,
  releaseWorkerLease,
} from './lease.ts';
export type { ProtocolFit, ServedProtocol } from './protocol.ts';
export {
  legacySyncProtocolVersions,
  protocolFit,
  routeNotFoundCode,
  servedProtocolOfProblem,
} from './protocol.ts';
export type {
  EngineOptions,
  EngineOperations,
  LeaseGate,
  ProtocolNetwork,
  SessionNetwork,
  SyncEngine,
} from './engine.ts';
export { createSyncEngine } from './engine.ts';
export type { LocalBacklink } from './local-backlinks.ts';
export { localBacklinks } from './local-backlinks.ts';
export type { LocalSearchFile } from './local-search.ts';
export { searchLocal } from './local-search.ts';

export { base64, bytesOfBase64 } from './bytes.ts';
