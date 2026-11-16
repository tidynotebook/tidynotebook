/**
 * The byte API of a note document (record 0082).
 *
 * Every export takes and returns bytes or text, so no Yjs type reaches core,
 * sync, storage, or a web feature. The live editor reads the private
 * `./editor-bridge` entry, which only `packages/editor` may import.
 */
export type { DocumentBounds } from './bounds.ts';
export { documentBounds } from './bounds.ts';
export type {
  AppliedDocument,
  DocumentRefusal,
  DocumentRangeEdit,
  DocumentResult,
} from './document.ts';
export {
  advanceCoverage,
  applyDocumentUpdate,
  compactDocument,
  editDocumentRanges,
  documentStateVector,
  encodeDocumentDelta,
  mergeDocumentUpdates,
  mergeStateVectors,
  noteTextRoot,
  readDocumentText,
  replaceDocumentText,
  startDocument,
  stateVectorCovers,
} from './document.ts';
export type { Coverage, DocumentInEpoch, ObservedInEpoch } from './observed.ts';
export {
  observeDocument,
  observedCoverage,
  observedCovers,
} from './observed.ts';
export type {
  DocumentSession,
  SessionChange,
  SessionOrigin,
} from './session.ts';
export { openDocumentSession } from './session.ts';
export type {
  RecoveryAmbiguity,
  RecoveryInput,
  RecoveryOutcome,
} from './recovery.ts';
export { recoverLegacyText } from './recovery.ts';
export type { TextSlot } from './written-character.ts';
export { keepWrittenCharacter } from './written-character.ts';
