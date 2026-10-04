/**
 * The keys of the object store (record 0192).
 *
 * Every key comes from a function here, so no caller can name a key outside
 * the store or a key of another kind. A finished attachment keeps the
 * relative path that the file store has always used. Every byte that waits
 * for a later request lives under `stagingPrefix`, so the daily cleanup
 * finds what nobody finished in one place.
 */

/** The prefix of every staged object and every open upload. */
export const stagingPrefix = 'staging/';

/** The prefix of every finished object of one workspace. */
export function workspacePrefix(workspaceId: string): string {
  return `workspaces/${uuid(workspaceId)}/`;
}

/** The key of the finished bytes of one attachment, by digest. */
export function attachmentKey(workspaceId: string, digest: string): string {
  return `${workspacePrefix(workspaceId)}attachments/${sha256(digest)}`;
}

/** The key of the checked bytes of an upload that waits for its finalize. */
export function stagingKey(objectId: string): string {
  return `${stagingPrefix}attachments/${uuid(objectId)}`;
}

/**
 * The key of the archive of one import, and of the upload of its parts.
 *
 * It names the account that started the import, so another member of the
 * workspace cannot send a part to it or complete it.
 */
export function importKey(
  workspaceId: string,
  accountId: string,
  importId: string,
): string {
  return `${stagingPrefix}imports/${uuid(workspaceId)}/${uuid(accountId)}/${uuid(importId)}.zip`;
}

/**
 * Whether a key has the shape that this module writes: segments of lower
 * case letters, digits, dots, dashes and underscores, with no empty, `.` or
 * `..` segment.
 */
export function isObjectKey(key: string): boolean {
  if (key.length === 0 || key.length > 512) return false;
  return key
    .split('/')
    .every(
      (segment) =>
        /^[a-z0-9._-]+$/.test(segment) && segment !== '.' && segment !== '..',
    );
}

/** Whether a prefix is a key prefix that ends at a segment. */
export function isObjectPrefix(prefix: string): boolean {
  return prefix.endsWith('/') && isObjectKey(prefix.slice(0, -1));
}

function uuid(value: string): string {
  const lower = value.toLowerCase();
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(lower))
    throw new Error('notesapp: an object key needs a UUID.');
  return lower;
}

function sha256(value: string): string {
  const lower = value.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(lower))
    throw new Error('notesapp: an object key needs a SHA-256 digest.');
  return lower;
}
