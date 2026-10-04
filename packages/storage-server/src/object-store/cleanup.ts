/**
 * The cleanup of what nobody finished (record 0192).
 *
 * An upload stages its bytes for a finalize that may never come, and an
 * import may never send its last part. Each one waits under `stagingPrefix`,
 * and this cleanup removes what is older than `stagingLifetimeMs`, in either
 * adapter. The reclaim of `attachments.ts` takes the row of an abandoned
 * upload after the same day, so the two agree about what is abandoned.
 */
import { stagingPrefix } from './keys.ts';
import type { ObjectStore } from './port.ts';

/** How long a staged object or an open upload waits for its next request. */
export const stagingLifetimeMs = 24 * 60 * 60 * 1000;

/** What one run of the cleanup removed. */
export type StaleObjectsRemoved = {
  readonly objects: number;
  readonly uploads: number;
};

/** Removes every staged object and every open upload older than a day. */
export async function removeStaleObjects(
  store: ObjectStore,
  now: Date,
): Promise<StaleObjectsRemoved> {
  const cutoff = now.getTime() - stagingLifetimeMs;
  // Each list is read whole before the first removal, so a store that pages
  // its list never skips an entry that a removal moved.
  const uploads: string[] = [];
  for await (const upload of store.listUploads(stagingPrefix))
    if (upload.startedAt.getTime() < cutoff) uploads.push(upload.key);
  for (const key of uploads) await store.abortUpload(key);
  const objects: string[] = [];
  for await (const item of store.list(stagingPrefix))
    if (item.modifiedAt.getTime() < cutoff) objects.push(item.key);
  for (const key of objects) await store.remove(key);
  return { objects: objects.length, uploads: uploads.length };
}
