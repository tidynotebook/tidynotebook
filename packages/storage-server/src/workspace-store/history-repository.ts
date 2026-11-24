/**
 * The history repository: the revisions of the open workspace.
 *
 * It is the history slice of the port. It reads revision paths, revision
 * owners, one revision record, whether a revision is on the accepted history
 * of a file, and one page of history for a file.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  maxPageSize,
  snapshotRevisionBatchBytes,
  type HistoryPage,
  type PageRequest,
  type RevisionRecord,
  type WorkspaceTransaction,
} from '@notesapp/core';
import {
  contents,
  files,
  noteDocuments,
  revisionParents,
  revisions,
} from '../schema.ts';
import { assertUuid } from './errors.ts';
import type { RepositoryContext } from './context.ts';

/** Builds the history slice of the port over one open transaction. */
export function historyRepository(
  context: RepositoryContext,
): Pick<
  WorkspaceTransaction,
  | 'revisionPaths'
  | 'parents'
  | 'revision'
  | 'snapshotRevisions'
  | 'isAcceptedRevision'
  | 'listHistory'
> {
  const { client, db, workspaceId } = context;
  return {
    async revisionPaths(
      ids: readonly string[],
    ): Promise<ReadonlyMap<string, string>> {
      const result = new Map<string, string>();
      if (ids.length === 0) return result;
      for (const id of ids) assertUuid(id, 'a revision');
      const rows = await db
        .select({ id: revisions.id, path: revisions.path })
        .from(revisions)
        .where(
          and(
            eq(revisions.workspaceId, workspaceId),
            inArray(revisions.id, [...ids]),
          ),
        );
      for (const row of rows) result.set(row.id, row.path);
      return result;
    },

    async parents(
      ids: readonly string[],
    ): Promise<ReadonlyMap<string, string>> {
      const result = new Map<string, string>();
      if (ids.length === 0) return result;
      for (const id of ids) assertUuid(id, 'a revision');
      const rows = await db
        .select({ id: revisions.id, fileId: revisions.fileId })
        .from(revisions)
        .where(
          and(
            eq(revisions.workspaceId, workspaceId),
            inArray(revisions.id, [...ids]),
          ),
        );
      for (const row of rows) result.set(row.id, row.fileId);
      return result;
    },

    async revision(revisionId: string): Promise<RevisionRecord | null> {
      assertUuid(revisionId, 'the revision');
      const rows = await db
        .select({
          id: revisions.id,
          fileId: revisions.fileId,
          path: revisions.path,
          deleted: revisions.deleted,
          digest: revisions.contentDigest,
          message: revisions.message,
          restoredFrom: revisions.restoredFrom,
          clientTime: revisions.clientTime,
          serverTime: revisions.serverTime,
          kind: contents.kind,
          size: contents.size,
          markdown: contents.markdown,
          objectId: contents.objectId,
          epoch: revisions.documentEpoch,
          merged: revisions.merged,
          document: noteDocuments.bytes,
          headRevisionId: files.headRevisionId,
        })
        .from(revisions)
        .innerJoin(
          contents,
          and(
            eq(contents.workspaceId, revisions.workspaceId),
            eq(contents.digest, revisions.contentDigest),
          ),
        )
        .innerJoin(
          files,
          and(
            eq(files.workspaceId, revisions.workspaceId),
            eq(files.id, revisions.fileId),
          ),
        )
        // The document of a note belongs to its head. An older revision joins
        // no row, so it carries none (record 0081).
        .leftJoin(
          noteDocuments,
          and(
            eq(noteDocuments.workspaceId, revisions.workspaceId),
            eq(noteDocuments.fileId, revisions.fileId),
          ),
        )
        .where(
          and(
            eq(revisions.workspaceId, workspaceId),
            eq(revisions.id, revisionId),
          ),
        );
      const row = rows[0];
      if (row === undefined) return null;
      const parentRows = await db
        .select({ parentId: revisionParents.parentId })
        .from(revisionParents)
        .where(
          and(
            eq(revisionParents.workspaceId, workspaceId),
            eq(revisionParents.childId, revisionId),
          ),
        )
        .orderBy(revisionParents.ordinal);
      return {
        epoch: row.epoch,
        merged: row.merged,
        document: row.headRevisionId === row.id ? (row.document ?? null) : null,
        revisionId: row.id,
        fileId: row.fileId,
        path: row.path,
        kind: row.kind === 'markdown' ? 'note' : 'attachment',
        deleted: row.deleted,
        parents: parentRows.map((parent) => parent.parentId),
        digest: row.digest,
        size: Number(row.size),
        text: row.markdown,
        objectId: row.objectId,
        message: row.message,
        restoredFrom: row.restoredFrom,
        clientTime: row.clientTime.toISOString(),
        serverTime: row.serverTime.toISOString(),
      };
    },

    async snapshotRevisions(revisionIds) {
      for (const id of revisionIds) assertUuid(id, 'a revision');
      // Count Markdown and document bytes before sending bodies to Node.
      // Always include the first revision, even if it exceeds the batch
      // target. Join a document only when it belongs to the requested head.
      const result = await client.query<{
        revision_id: string;
        file_id: string;
        path: string;
        deleted: boolean;
        digest: string;
        kind: string;
        markdown: string | null;
        document: Buffer | null;
        epoch: number | null;
        server_time: Date;
        batch_count: string;
      }>(
        `with sized as (
           select q.ordinality, r.id as revision_id, r.file_id, r.path,
                  r.deleted, r.content_digest as digest, c.kind, c.markdown,
                  d.bytes as document, r.document_epoch as epoch, r.server_time,
                  sum(case when c.kind = 'markdown' then c.size else 0 end
                      + coalesce(octet_length(d.bytes), 0))
                    over (order by q.ordinality) as body_bytes
             from unnest($2::uuid[]) with ordinality q(id, ordinality)
             left join revisions r on r.workspace_id = $1 and r.id = q.id
             left join contents c
               on c.workspace_id = r.workspace_id and c.digest = r.content_digest
             left join files f
               on f.workspace_id = r.workspace_id and f.id = r.file_id
             left join note_documents d
               on d.workspace_id = f.workspace_id and d.file_id = f.id
              and f.head_revision_id = r.id
         ), batch as (
           select sized.*, count(*) over () as batch_count
             from sized
            where ordinality = 1 or body_bytes <= $3
         )
         select revision_id, file_id, path, deleted, digest, kind, markdown,
                document, epoch, server_time, batch_count
           from batch where kind is not null order by ordinality`,
        [workspaceId, revisionIds, snapshotRevisionBatchBytes],
      );
      if (result.rows.length !== Number(result.rows[0]?.batch_count))
        return null;
      return result.rows.map((row) => ({
        revisionId: row.revision_id,
        fileId: row.file_id,
        path: row.path,
        deleted: row.deleted,
        digest: row.digest,
        kind: row.kind === 'markdown' ? 'note' : 'attachment',
        text: row.markdown,
        document: row.document,
        epoch: row.epoch,
        serverTime: row.server_time.toISOString(),
      }));
    },

    async isAcceptedRevision(
      fileId: string,
      revisionId: string,
    ): Promise<boolean> {
      assertUuid(fileId, 'the shared file');
      assertUuid(revisionId, 'the shared revision');
      const result = await client.query<{ accepted: boolean }>(
        `with recursive accepted(id) as (
           select head_revision_id
             from public.files
            where workspace_id = $1 and id = $2 and deleted = false
           union
           select parent.parent_id
             from accepted current
             join public.revision_parents parent
               on parent.workspace_id = $1 and parent.child_id = current.id
         )
         select exists(
           select 1 from accepted where id = $3
         ) as accepted`,
        [workspaceId, fileId, revisionId],
      );
      return result.rows[0]?.accepted ?? false;
    },

    async listHistory(fileId: string, page: PageRequest): Promise<HistoryPage> {
      assertUuid(fileId, 'the file');
      const limit = Math.max(1, Math.min(page.limit, maxPageSize));

      let cursorCondition = sql`true`;
      if (page.cursor !== null && page.cursor !== '') {
        assertUuid(page.cursor, 'the cursor');
        cursorCondition = sql`(${revisions.serverTime}, ${revisions.id}) < (
          SELECT r_cur.server_time, r_cur.id FROM ${revisions} r_cur
          WHERE r_cur.workspace_id = ${workspaceId}::uuid AND r_cur.id = ${page.cursor}::uuid
        )`;
      }

      const rows = await db
        .select({
          id: revisions.id,
          fileId: revisions.fileId,
          path: revisions.path,
          deleted: revisions.deleted,
          contentDigest: revisions.contentDigest,
          actorAccountId: revisions.actorAccountId,
          clientTime: revisions.clientTime,
          serverTime: revisions.serverTime,
          message: revisions.message,
          restoredFrom: revisions.restoredFrom,
          merged: revisions.merged,
          size: contents.size,
          markdown: contents.markdown,
          objectId: contents.objectId,
        })
        .from(revisions)
        .innerJoin(
          contents,
          and(
            eq(contents.workspaceId, revisions.workspaceId),
            eq(contents.digest, revisions.contentDigest),
          ),
        )
        .where(
          and(
            eq(revisions.workspaceId, workspaceId),
            eq(revisions.fileId, fileId),
            cursorCondition,
          ),
        )
        .orderBy(sql`${revisions.serverTime} DESC`, sql`${revisions.id} DESC`)
        .limit(limit + 1);

      const wanted = rows.slice(0, limit);
      const revIds = wanted.map((r) => r.id);

      const parentsByChild = new Map<string, string[]>();
      if (revIds.length > 0) {
        const parentRows = await db
          .select({
            childId: revisionParents.childId,
            parentId: revisionParents.parentId,
            ordinal: revisionParents.ordinal,
          })
          .from(revisionParents)
          .where(
            and(
              eq(revisionParents.workspaceId, workspaceId),
              inArray(revisionParents.childId, revIds),
            ),
          )
          .orderBy(revisionParents.ordinal);
        for (const p of parentRows) {
          const list = parentsByChild.get(p.childId) ?? [];
          list.push(p.parentId);
          parentsByChild.set(p.childId, list);
        }
      }

      return {
        revisions: wanted.map((row) => ({
          revisionId: row.id,
          fileId: row.fileId,
          path: row.path,
          deleted: row.deleted,
          parents: parentsByChild.get(row.id) ?? [],
          digest: row.contentDigest,
          size: Number(row.size),
          actorAccountId: row.actorAccountId,
          clientTime: row.clientTime.toISOString(),
          serverTime: row.serverTime.toISOString(),
          message: row.message,
          isCheckpoint: row.message !== null,
          checkpointName: row.message,
          restoredFrom: row.restoredFrom,
          text: row.markdown,
          objectId: row.objectId,
          merged: row.merged,
        })),
        nextCursor: rows.length > limit ? (wanted.at(-1)?.id ?? null) : null,
      };
    },
  };
}
