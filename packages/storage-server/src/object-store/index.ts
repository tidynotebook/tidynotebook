/**
 * The object store of an installation (record 0192): the port, its two
 * adapters, the keys, and the cleanup of what nobody finished.
 */
import { openFileObjectStore } from './file-store.ts';
import type { ObjectStore } from './port.ts';
import { openS3ObjectStore, type S3StoreSettings } from './s3-store.ts';

export { openFileObjectStore } from './file-store.ts';
export {
  defaultS3Timeouts,
  openS3ObjectStore,
  type S3StoreSettings,
  type S3Timeouts,
} from './s3-store.ts';
export { BodyLengthError } from './exact-length.ts';
export {
  accountImportPrefix,
  attachmentKey,
  importKey,
  legacyStagingKey,
  isObjectKey,
  stagingKey,
  stagingPrefix,
  workspacePrefix,
} from './keys.ts';
export {
  removeStaleObjects,
  stagingLifetimeMs,
  type StaleObjectsRemoved,
} from './cleanup.ts';
export type {
  ObjectStore,
  ObjectStoreKind,
  PendingUpload,
  StoredObject,
  StoredPart,
  UploadCompletion,
} from './port.ts';

/** Which store an installation names, with what that store needs. */
export type ObjectStoreSettings =
  | { readonly kind: 'filesystem'; readonly root: string }
  | ({ readonly kind: 's3' } & S3StoreSettings);

/** Opens the store that the settings name. */
export function openObjectStore(settings: ObjectStoreSettings): ObjectStore {
  return settings.kind === 'filesystem'
    ? openFileObjectStore(settings.root)
    : openS3ObjectStore(settings);
}
