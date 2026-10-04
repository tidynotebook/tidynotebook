/**
 * The daily cleanup of the object store (record 0192).
 *
 * It removes each staged upload and each import that nobody finished, older
 * than one day, with `removeStaleObjects` of the storage package, for the
 * file store and an S3 store alike. It also removes each file older than one
 * day from the folder of the files of one request, `routes/scratch.ts`: a
 * file that a process left there when it stopped in the middle of a request,
 * a file that the file store wrote before it moved it into place, and an
 * upload that the file store staged there before record 0192.
 *
 * The hourly run of `app.ts` calls it, and it does its work once a day in
 * each process: a listing of an S3 store is a call that costs, and nothing
 * it removes is younger than a day.
 */
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  removeStaleObjects,
  stagingLifetimeMs,
  type ObjectStore,
  type StaleObjectsRemoved,
} from '@notesapp/storage-server';

/** How often one process lists the store. */
export const objectCleanupIntervalMs = 24 * 60 * 60 * 1000;

/** What one run removed. */
export type ObjectCleanupRun = StaleObjectsRemoved & {
  /** The files of the scratch folder that it removed. */
  readonly files: number;
};

/** Removes each file of `folder` that was last written before `cutoff`. */
export async function removeStaleFiles(
  folder: string,
  cutoff: Date,
): Promise<number> {
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    // A folder that is not there holds nothing to remove.
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    const path = join(folder, name);
    try {
      const found = await stat(path);
      if (!found.isFile() || found.mtime.getTime() >= cutoff.getTime())
        continue;
      await rm(path, { force: true });
      removed += 1;
    } catch {
      // A file that another run removed first needs no report.
    }
  }
  return removed;
}

/**
 * The job. It answers what it removed, or `null` when its last run in this
 * process is less than a day old.
 *
 * @param scratch the folder of the files of one request, from
 * `routes/scratch.ts`.
 */
export function createObjectCleanup(
  objects: ObjectStore,
  scratch: string,
): (now?: Date) => Promise<ObjectCleanupRun | null> {
  let lastRun: number | null = null;
  return async (now = new Date()) => {
    if (lastRun !== null && now.getTime() - lastRun < objectCleanupIntervalMs)
      return null;
    const removed = await removeStaleObjects(objects, now);
    const files = await removeStaleFiles(
      scratch,
      new Date(now.getTime() - stagingLifetimeMs),
    );
    lastRun = now.getTime();
    return { ...removed, files };
  };
}
