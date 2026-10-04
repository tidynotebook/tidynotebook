/**
 * The object store on a directory of the server (record 0192).
 *
 * It is the store of an installation that names no other, and the store that
 * every installation used before record 0192. An object lives at its key
 * under the root. A write goes to a file of `tmp/` first and moves into place
 * whole, so a reader never sees half an object. An upload in parts keeps one
 * folder under `uploads/`, named by the digest of its key, with the key in
 * the file `key` and one file for each part.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, type Stats } from 'node:fs';
import {
  access,
  constants,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { exactLength } from './exact-length.ts';
import { isObjectKey, isObjectPrefix } from './keys.ts';
import type {
  ObjectStore,
  PendingUpload,
  StoredObject,
  StoredPart,
} from './port.ts';

/** The stat of a path, or `null` when nothing is there. */
async function statOf(path: string): Promise<Stats | null> {
  try {
    return await stat(path);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/** Whether a file system failure says that the path is not there. */
function isMissing(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const code: unknown = Object.fromEntries(Object.entries(error))['code'];
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** The file name of one part, which sorts in the order of the numbers. */
function partName(partNumber: number): string {
  return `part-${String(partNumber).padStart(5, '0')}`;
}

/** The number of a part file, or `null` for another file. */
function partNumberOf(name: string): number | null {
  const match = /^part-([0-9]{5})$/.exec(name);
  return match === null ? null : Number(match[1]);
}

/** Opens the object store on the directory `root`. */
export function openFileObjectStore(root: string): ObjectStore {
  const scratch = join(root, 'tmp');
  const uploads = join(root, 'uploads');

  function pathOf(key: string): string {
    if (!isObjectKey(key))
      throw new Error('notesapp: the object key has a shape that no key has.');
    return join(root, ...key.split('/'));
  }

  function uploadFolder(key: string): string {
    if (!isObjectKey(key))
      throw new Error('notesapp: the object key has a shape that no key has.');
    return join(uploads, createHash('sha256').update(key).digest('hex'));
  }

  /**
   * Writes a checked body to `target`, through a file of `tmp/`.
   *
   * The caller checks the body with `exactLength` before its first await, so
   * a failure of the sender in between has a reader that takes it.
   */
  async function writeWhole(target: string, checked: Readable): Promise<void> {
    const temporary = join(scratch, `object-${randomUUID()}`);
    try {
      await mkdir(scratch, { recursive: true });
      await pipeline(checked, createWriteStream(temporary, { mode: 0o600 }));
      await mkdir(dirname(target), { recursive: true });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async function partsOf(key: string): Promise<readonly StoredPart[] | null> {
    const folder = uploadFolder(key);
    if ((await statOf(join(folder, 'key'))) === null) return null;
    const parts: StoredPart[] = [];
    for (const name of await readdir(folder)) {
      const partNumber = partNumberOf(name);
      if (partNumber === null) continue;
      const found = await statOf(join(folder, name));
      if (found !== null) parts.push({ partNumber, size: found.size });
    }
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  return {
    kind: 'filesystem',

    async write(key, body, size) {
      await writeWhole(pathOf(key), exactLength(body, size));
    },

    async read(key) {
      const path = pathOf(key);
      const found = await statOf(path);
      if (found === null || !found.isFile()) return null;
      return createReadStream(path);
    },

    async size(key) {
      const found = await statOf(pathOf(key));
      return found !== null && found.isFile() ? found.size : null;
    },

    async promote(from, to) {
      const source = pathOf(from);
      const target = pathOf(to);
      if ((await statOf(target)) !== null) {
        await rm(source, { force: true });
        return true;
      }
      await mkdir(dirname(target), { recursive: true });
      try {
        await rename(source, target);
        return true;
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
    },

    async remove(key) {
      await rm(pathOf(key), { force: true });
    },

    async removePrefix(prefix) {
      if (!isObjectPrefix(prefix))
        throw new Error('notesapp: the object prefix has no shape of a key.');
      await rm(join(root, ...prefix.slice(0, -1).split('/')), {
        recursive: true,
        force: true,
      });
    },

    async *list(prefix): AsyncGenerator<StoredObject> {
      if (!isObjectPrefix(prefix))
        throw new Error('notesapp: the object prefix has no shape of a key.');
      const folder = join(root, ...prefix.slice(0, -1).split('/'));
      if ((await statOf(folder)) === null) return;
      for (const entry of await readdir(folder, {
        recursive: true,
        withFileTypes: true,
      })) {
        if (!entry.isFile()) continue;
        const path = join(entry.parentPath, entry.name);
        const found = await statOf(path);
        if (found === null) continue;
        yield {
          key: relative(root, path).split(sep).join('/'),
          modifiedAt: found.mtime,
        };
      }
    },

    async startUpload(key) {
      const folder = uploadFolder(key);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await writeFile(join(folder, 'key'), key, { mode: 0o600 });
    },

    async writePart(key, partNumber, body, size) {
      const checked = exactLength(body, size);
      const folder = uploadFolder(key);
      if ((await statOf(join(folder, 'key'))) === null) {
        checked.destroy();
        return false;
      }
      await writeWhole(join(folder, partName(partNumber)), checked);
      return true;
    },

    listParts: partsOf,

    async completeUpload(key) {
      const parts = await partsOf(key);
      if (parts === null) return false;
      const folder = uploadFolder(key);
      await mkdir(scratch, { recursive: true });
      const temporary = join(scratch, `object-${randomUUID()}`);
      try {
        const out = createWriteStream(temporary, { mode: 0o600 });
        // Each part leaves the volume as soon as the whole file holds it, so
        // the join needs the room of one part beside the parts, not of the
        // whole archive.
        for (const part of parts) {
          const path = join(folder, partName(part.partNumber));
          await pipeline(createReadStream(path), out, { end: false });
          await rm(path, { force: true });
        }
        await new Promise<void>((resolve, reject) => {
          out.once('error', reject);
          out.end(resolve);
        });
        const target = pathOf(key);
        await mkdir(dirname(target), { recursive: true });
        await rename(temporary, target);
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
      await rm(folder, { recursive: true, force: true });
      return true;
    },

    async abortUpload(key) {
      await rm(uploadFolder(key), { recursive: true, force: true });
    },

    async *listUploads(prefix): AsyncGenerator<PendingUpload> {
      if ((await statOf(uploads)) === null) return;
      for (const name of await readdir(uploads)) {
        const marker = join(uploads, name, 'key');
        let key: string;
        try {
          key = await readFile(marker, 'utf8');
        } catch (error) {
          if (isMissing(error)) continue;
          throw error;
        }
        const found = await statOf(marker);
        if (found === null || !key.startsWith(prefix)) continue;
        yield { key, startedAt: found.mtime };
      }
    },

    async probe() {
      try {
        await access(root, constants.R_OK | constants.W_OK);
        return true;
      } catch {
        return false;
      }
    },

    close() {
      // A directory holds no connection.
    },
  };
}
