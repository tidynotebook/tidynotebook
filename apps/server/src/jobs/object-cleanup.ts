/**
 * The daily cleanup of the object store (record 0192).
 *
 * It removes each staged upload and each import that nobody finished, older
 * than one day, with `removeStaleObjects` of the storage package, for the
 * file store and an S3 store alike. The hourly run of `app.ts` calls it, and
 * it does its work once a day in each process: a listing of an S3 store is a
 * call that costs, and nothing it removes is younger than a day.
 */
import {
  removeStaleObjects,
  type ObjectStore,
  type StaleObjectsRemoved,
} from '@notesapp/storage-server';

/** How often one process lists the store. */
export const objectCleanupIntervalMs = 24 * 60 * 60 * 1000;

/**
 * The job. It answers what it removed, or `null` when its last run in this
 * process is less than a day old.
 */
export function createObjectCleanup(
  objects: ObjectStore,
): (now?: Date) => Promise<StaleObjectsRemoved | null> {
  let lastRun: number | null = null;
  return async (now = new Date()) => {
    if (lastRun !== null && now.getTime() - lastRun < objectCleanupIntervalMs)
      return null;
    const removed = await removeStaleObjects(objects, now);
    lastRun = now.getTime();
    return removed;
  };
}
