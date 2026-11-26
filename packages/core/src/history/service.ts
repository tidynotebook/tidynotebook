/**
 * Domain services for revision history and restoration.
 *
 * This module coordinates history pagination and revision restoration.
 */
import { authorize, type Actor } from '../identity/actor.ts';
import { acceptWithDocuments } from '../files/documents.ts';
import { validateGraph } from '../files/graph.ts';
import { workspaceText } from '../files/operations.ts';
import {
  fail,
  ok,
  type AcceptedChangeset,
  type ChangesetInput,
  type ContentRef,
  type Result,
  type RevisionInput,
} from '../files/model.ts';
import { normalizePath, type PathKind } from '../files/path.ts';
import type { HistoryPage, WorkspaceStore } from '../files/ports.ts';

/** Default limit for history queries. */
export const defaultHistoryLimit = 50;

/** Maximum limit for history queries. */
export const maxHistoryLimit = 100;

/** Normalizes a requested limit value. */
function historyLimit(limit?: number | null): number {
  if (limit === null || limit === undefined || !Number.isFinite(limit)) {
    return defaultHistoryLimit;
  }
  return Math.min(Math.max(1, Math.trunc(limit)), maxHistoryLimit);
}

/** Path kind derived from content kind. */
function pathKind(content: ContentRef): PathKind {
  return content.kind === 'markdown' ? 'note' : 'attachment';
}

/** Reads history revisions for one file with cursor pagination. */
export async function listHistory(
  store: WorkspaceStore,
  actor: Actor,
  workspaceId: string,
  fileId: string,
  options?: { readonly cursor?: string | null; readonly limit?: number },
): Promise<Result<HistoryPage>> {
  return store.transact<Result<HistoryPage>>(actor, workspaceId, async (tx) => {
    const role = await tx.role(actor.accountId);
    if (role === null) return fail('forbidden');
    const permitted = authorize(actor, workspaceId, role, 'history');
    if (!permitted.ok) return fail('forbidden');

    const purged = await tx.purgedFiles([fileId]);
    if (purged.length > 0) return fail('purged', [fileId]);

    const file = await tx.file(fileId);
    if (file === null) return fail('not_found', [fileId]);

    const limit = historyLimit(options?.limit);
    const page = await tx.listHistory(fileId, {
      cursor: options?.cursor ?? null,
      limit,
    });
    return ok(page);
  });
}

/** Input payload for restoring a revision. */
export type RestoreRevisionInput = {
  readonly workspaceId: string;
  readonly fileId: string;
  readonly targetRevisionId: string;
  readonly expectedHead: string | null;
  readonly revisionId: string;
  readonly ids: {
    readonly mutationId: string;
    readonly deviceId: string;
    readonly clientTime: string;
  };
  readonly path?: string;
  readonly message?: string | null;
};

/**
 * Restores a file to an earlier historic revision.
 *
 * It appends a new revision as a child of the current head, referencing the
 * target revision via `restoredFrom`. It reuses existing content without
 * rewinding history or republishing content blobs.
 */
export async function restoreRevision(
  store: WorkspaceStore,
  actor: Actor,
  input: RestoreRevisionInput,
  digest: string,
): Promise<Result<AcceptedChangeset>> {
  return store.transact<Result<AcceptedChangeset>>(
    actor,
    input.workspaceId,
    async (tx) => {
      const role = await tx.role(actor.accountId);
      if (role === null) return fail('forbidden');
      const permitted = authorize(actor, input.workspaceId, role, 'write');
      if (!permitted.ok) return fail('forbidden');

      const receipt = await tx.receipt(input.ids.mutationId, actor.accountId);
      if (receipt !== null) {
        if (receipt.digest === digest) return ok(receipt.outcome);
        return fail('mutation_reused', [input.fileId]);
      }

      const purged = await tx.purgedFiles([input.fileId]);
      if (purged.length > 0) return fail('purged', [input.fileId]);

      const heads = await tx.heads([input.fileId]);
      const currentHead = heads.get(input.fileId) ?? null;
      if (currentHead !== input.expectedHead) {
        return fail('stale_head', [input.fileId]);
      }

      const targetRev = await tx.revision(input.targetRevisionId);
      if (targetRev === null || targetRev.fileId !== input.fileId) {
        return fail('invalid_graph', [input.fileId]);
      }

      const chosenPath = input.path ?? targetRev.path;
      let chosenContent: ContentRef;
      if (targetRev.kind === 'note') {
        // A restore edits the document of the note, so the note keeps its
        // identities and every device merges the restore like any other work.
        const documents = await tx.documents([input.fileId]);
        chosenContent = workspaceText(
          targetRev.text ?? '',
          documents.get(input.fileId)?.epoch ?? 1,
        );
      } else {
        if (targetRev.objectId === null) {
          return fail('invalid_graph', [input.fileId]);
        }
        chosenContent = {
          kind: 'attachment',
          digest: targetRev.digest,
          objectId: targetRev.objectId,
        };
      }

      const normalized = normalizePath(chosenPath, pathKind(chosenContent));
      if (!normalized.ok) return fail('invalid_path', [input.fileId]);

      const parents = input.expectedHead === null ? [] : [input.expectedHead];

      const revision: RevisionInput = {
        id: input.revisionId,
        fileId: input.fileId,
        parents,
        path: normalized.value,
        deleted: false,
        content: chosenContent,
        clientTime: input.ids.clientTime,
        message:
          input.message ?? `Restored from revision ${input.targetRevisionId}`,
        restoredFrom: input.targetRevisionId,
      };

      const known =
        parents.length === 0
          ? new Map<string, string>()
          : await tx.parents(parents);
      const graph = validateGraph([revision], known);
      if (!graph.ok) return graph;

      const changeset: ChangesetInput = {
        workspaceId: input.workspaceId,
        mutationId: input.ids.mutationId,
        deviceId: input.ids.deviceId,
        expectedHeads: { [input.fileId]: input.expectedHead },
        revisions: [revision],
      };

      return acceptWithDocuments(store.documents, tx, actor, changeset, digest);
    },
  );
}
