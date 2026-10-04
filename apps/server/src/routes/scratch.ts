/**
 * The folder of the files of one request, on the disk of this server.
 *
 * An upload inspects its image in a file, and an import reads its archive
 * from a file, and each file lives only for its own request. Every byte that
 * a later request reads lives in the object store instead (record 0192), so
 * any server instance of an installation answers that request.
 */
import { join } from 'node:path';

/** The folder of the files of one request under `NOTESAPP_STORAGE_ROOT`. */
export function scratchFolder(storageRoot: string): string {
  return join(storageRoot, 'tmp');
}
