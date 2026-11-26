/**
 * Domain services for permanent file deletion and purge preview.
 *
 * Purging a file removes all its revisions, writes content-free purge markers
 * to block subsequent mutations with 410 Gone, and reclaims unreferenced
 * content and attachment bytes. Only owners and admins can preview or execute a purge.
 */
import { authorize, type Actor } from '../identity/actor.ts';
import { maxFilesPerChangeset } from '../files/commit.ts';
import { fail, type Result } from '../files/model.ts';
import type {
  PurgePreview,
  PurgedFilesResult,
  WorkspaceStore,
} from '../files/ports.ts';

/**
 * Previews permanent deletion of the requested files.
 *
 * Reports affected files, dependent revisions, reclaimable bytes, and blocking
 * references such as external revisions holding shared attachments.
 */
export async function previewPurge(
  store: WorkspaceStore,
  actor: Actor,
  workspaceId: string,
  fileIds: readonly string[],
): Promise<Result<PurgePreview>> {
  return store.transact<Result<PurgePreview>>(
    actor,
    workspaceId,
    async (tx) => {
      const role = await tx.role(actor.accountId);
      if (role === null) return fail('forbidden');
      const permitted = authorize(actor, workspaceId, role, 'purge');
      if (!permitted.ok) return fail('forbidden');

      return tx.previewPurge(fileIds);
    },
  );
}

/**
 * Permanently deletes the requested files.
 *
 * It validates that no blocking reference exists, writes purge markers, and
 * reclaims unreferenced storage bytes.
 */
export async function purgeFiles(
  store: WorkspaceStore,
  actor: Actor,
  workspaceId: string,
  fileIds: readonly string[],
  mutationId: string,
  digest: string,
): Promise<Result<PurgedFilesResult>> {
  if (fileIds.length === 0) {
    return fail('invalid_graph', []);
  }
  // One purge writes one commit of the sync feed, and a feed page holds a
  // whole commit, so the changeset bound is also the bound of a page
  // (record 0127).
  if (fileIds.length > maxFilesPerChangeset)
    return fail('too_many_files', fileIds);

  return store.transact<Result<PurgedFilesResult>>(
    actor,
    workspaceId,
    async (tx) => {
      const role = await tx.role(actor.accountId);
      if (role === null) return fail('forbidden');
      const permitted = authorize(actor, workspaceId, role, 'purge');
      if (!permitted.ok) return fail('forbidden');

      const preview = await tx.previewPurge(fileIds);
      if (!preview.ok) return preview;
      if (!preview.value.canPurge) {
        return fail('invalid_graph', fileIds);
      }

      return tx.purgeFiles(actor, mutationId, fileIds, digest);
    },
  );
}
