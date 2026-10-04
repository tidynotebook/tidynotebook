/**
 * Attachment persistence and cleanup.
 *
 * The metadata of each attachment lives in PostgreSQL, and its bytes live in
 * the object store of the installation (record 0192), partitioned by
 * workspace and addressed by their verified SHA-256 digest. Deduplication
 * stays strictly inside one workspace. An upload stages its checked bytes
 * under a key of its own, and a finalize on any server instance promotes
 * them to the key of the digest.
 */
import type { Readable } from 'node:stream';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { openPool, poolSizes } from './pool.ts';
import type {
  Actor,
  AttachmentMediaType,
  AttachmentObjectRecord,
} from '@notesapp/core';
import { OperationalError } from '@notesapp/core';
import { storedAttachmentState, storedMediaType } from './attachment-row.ts';
import { attachmentObjects } from './schema.ts';
import {
  attachmentKey,
  legacyStagingKey,
  stagingKey,
  workspacePrefix,
  type ObjectStore,
} from './object-store/index.ts';
import { contentWriteReserveBytes } from './workspace-store/sync-repository.ts';
import {
  defaultConnectionTimeoutMs,
  WorkspaceUnavailableError,
} from './workspace-store/index.ts';

export type AttachmentStore = {
  /** Saves metadata for an uploaded temporary attachment object. */
  saveTemporaryAttachment(
    actor: Actor,
    workspaceId: string,
    object: {
      readonly id: string;
      readonly digest: string;
      readonly size: bigint;
      readonly mediaType: AttachmentMediaType;
      readonly width: number;
      readonly height: number;
    },
  ): Promise<void>;

  /**
   * One page of the live files of a workspace, in path order, after `after`,
   * with the size of the content of each head. An export plans its archive
   * from them before its first byte (record 0170).
   */
  archivePlan(
    actor: Actor,
    workspaceId: string,
    after: string | null,
    limit: number,
  ): Promise<readonly ArchivePlanRow[]>;

  /**
   * The bytes of new content that the owner of the workspace can still take,
   * after the headroom that a write of new content must leave.
   */
  workspaceRoom(actor: Actor, workspaceId: string): Promise<bigint>;

  /** Reads metadata of one attachment object in a workspace. */
  getAttachmentObject(
    actor: Actor,
    workspaceId: string,
    objectId: string,
  ): Promise<AttachmentObjectRecord | null>;

  /**
   * Promotes a temporary attachment object to finalized.
   * Moves bytes to immutable storage if needed.
   */
  finalizeAttachmentObject(
    actor: Actor,
    workspaceId: string,
    objectId: string,
    expectedDigest: string,
  ): Promise<
    | { readonly ok: true; readonly object: AttachmentObjectRecord }
    | {
        readonly ok: false;
        readonly error: 'not_found' | 'invalid_content' | 'already_unavailable';
      }
  >;

  /**
   * Reads the binary content and metadata of an accepted attachment revision.
   *
   * `path` is the stored path of the revision. Its last segment is the name
   * that the person gave the file, which the download names in its
   * `Content-Disposition` header.
   */
  readAttachmentRevision(
    actor: Actor,
    workspaceId: string,
    revisionId: string,
  ): Promise<AttachmentBytes | null>;

  /**
   * Reads one attachment revision for a reader of a published link.
   *
   * A reader has no account, so this call takes no `Actor`. The digest of the
   * token is what it takes instead: the narrow lookup function of the
   * migration answers the link of that digest, the call adopts the owner
   * account of the link for its own read-only transaction, and it reads
   * nothing outside the workspace of that link. A workspace that the link does
   * not belong to answers nothing, so a caller cannot widen the read by naming
   * another one.
   *
   * It proves that the address holds a live token, and no more. The scope of
   * the link and the reference from the note are the rules of
   * `packages/core`, and `apps/server` proves both before it calls this.
   */
  readPublishedAttachmentRevision(
    tokenDigest: string,
    workspaceId: string,
    revisionId: string,
  ): Promise<AttachmentBytes | null>;

  /**
   * Reclaims attachment bytes. This is the only code that deletes them.
   *
   * It takes an abandoned temporary object, an unreferenced finalized object
   * older than 24 hours, an object that a purge marked unavailable, and the
   * attachments of a deleted workspace. Every deletion runs inside the locked
   * transaction that claims the row, so a concurrent finalize cannot lose its
   * bytes. Returns how many objects were reclaimed.
   */
  reclaimAttachments(now: Date): Promise<number>;

  /**
   * Writes the checked bytes of an upload to its staging key, before the
   * upload answers, so a finalize on any server instance finds them.
   */
  stageAttachmentBytes(
    objectId: string,
    body: Readable,
    size: number,
  ): Promise<void>;

  /** The object store that holds the bytes. */
  readonly objects: ObjectStore;
};

/** The bytes of one accepted attachment revision, and what names them. */
export type AttachmentBytes = {
  readonly stream: Readable;
  readonly size: bigint;
  readonly mediaType: AttachmentMediaType;
  readonly digest: string;
  readonly revisionId: string;
  readonly path: string;
};

/** One live file of a workspace with the size of its head (record 0170). */
export type ArchivePlanRow = {
  readonly fileId: string;
  readonly path: string;
  readonly kind: 'note' | 'attachment';
  readonly headRevisionId: string;
  readonly size: number;
  readonly updatedAt: Date;
};

export type AttachmentStoreHandle = AttachmentStore & {
  readonly close: () => Promise<void>;
};

export type AttachmentStoreOptions = {
  readonly poolSize?: number;
  readonly statementTimeoutMs?: number;
  /**
   * Runs inside the locked reclaim transaction, after the object was claimed
   * and before its bytes are deleted.
   *
   * The concurrency check of the reclaim needs to act in that window, which no
   * public call can reach. Production composition leaves this undefined.
   */
  readonly onReclaimMarked?: (objectId: string) => Promise<void>;
};

/** How many queued objects of deleted workspaces one reclaim batch takes. */
const reclaimBatchSize = 100;

/** True when the value is a lowercase hexadecimal SHA-256 digest. */
function isDigest(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/** True when the value has the shape of a UUID. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Opens an attachment store backed by PostgreSQL and the object store.
 *
 * The caller owns `objects` and closes it after this store.
 */
export function openAttachmentStore(
  databaseUrl: string,
  objects: ObjectStore,
  options: AttachmentStoreOptions = {},
): AttachmentStoreHandle {
  const pool = openPool({
    connectionString: databaseUrl,
    max: options.poolSize ?? poolSizes.attachments,
    // Every pool of this server takes the same bound, for the reason stated
    // beside `defaultConnectionTimeoutMs`.
    connectionTimeoutMillis: defaultConnectionTimeoutMs,
    ...(options.statementTimeoutMs === undefined
      ? {}
      : { statement_timeout: options.statementTimeoutMs }),
  });

  /**
   * The bytes of one accepted revision, inside an open transaction.
   *
   * The account path and the reader path of a published link both read the
   * same row and the same file, so one statement serves both. The caller sets
   * the identity that the row policies read before it calls.
   */
  async function revisionBytes(
    client: pg.PoolClient,
    workspaceId: string,
    revisionId: string,
  ): Promise<AttachmentBytes | null> {
    const query = `
      SELECT r.id AS revision_id, r.deleted, r.content_digest AS digest,
             r.path,
             c.size, c.object_id,
             ao.media_type, ao.state
      FROM revisions r
      JOIN contents c ON c.workspace_id = r.workspace_id AND c.digest = r.content_digest
      JOIN attachment_objects ao ON ao.workspace_id = c.workspace_id AND ao.id = c.object_id
      WHERE r.workspace_id = $1 AND r.id = $2
    `;
    if (!isUuid(revisionId)) return null;
    const result = await client.query<{
      revision_id: string;
      deleted: boolean;
      digest: string;
      path: string;
      size: string;
      object_id: string;
      media_type: string;
      state: string;
    }>(query, [workspaceId, revisionId]);

    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    if (!row || row.deleted || row.state === 'unavailable') return null;

    const stream =
      (await objects.read(attachmentKey(workspaceId, row.digest))) ??
      (await objects.read(stagingKey(row.object_id)));
    if (stream === null) return null;

    return {
      stream,
      size: BigInt(row.size),
      mediaType: storedMediaType(row.media_type),
      digest: row.digest,
      revisionId: row.revision_id,
      path: row.path,
    };
  }

  /**
   * Deletes the attachment bytes that a workspace deletion queued.
   *
   * The workspace row and its attachment rows are already gone, so the whole
   * workspace directory is dead. The queue row is taken and the bytes are
   * deleted inside one transaction, so a failed deletion returns the row.
   */
  async function reclaimDeletedWorkspaces(
    client: pg.PoolClient,
  ): Promise<number> {
    let count = 0;
    for (;;) {
      let taken: readonly { workspace_id: string; object_id: string }[] = [];
      try {
        await client.query('begin');
        const result = await client.query<{
          workspace_id: string;
          object_id: string;
          digest: string;
        }>(
          'SELECT workspace_id, object_id, digest FROM public.notesapp_take_attachment_reclaim($1)',
          [reclaimBatchSize],
        );
        taken = result.rows;
        if (taken.length === 0) {
          await client.query('rollback');
          return count;
        }
        for (const row of taken) {
          if (isUuid(row.object_id))
            await objects.remove(stagingKey(row.object_id));
        }
        const workspaces = new Set(taken.map((row) => row.workspace_id));
        for (const id of workspaces) {
          if (!isUuid(id)) continue;
          await objects.removePrefix(workspacePrefix(id));
        }
        await client.query('commit');
      } catch {
        try {
          await client.query('rollback');
        } catch {
          // The connection is unusable; the next run repeats the work.
        }
        return count;
      }
      count += taken.length;
      if (taken.length < reclaimBatchSize) return count;
    }
  }

  async function withClient<T>(
    actor: Actor,
    workspaceId: string,
    action: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    let client: pg.PoolClient;
    try {
      client = await pool.connect();
    } catch {
      throw new OperationalError(
        'unavailable',
        'notesapp: database connection refused.',
      );
    }
    try {
      await client.query('begin');
      await client.query("select set_config('notesapp.account_id', $1, true)", [
        actor.accountId,
      ]);
      await client.query(
        'select pg_advisory_xact_lock(hashtext($1::text)::bigint)',
        [workspaceId],
      );
      const seen = await client.query<{ id: string }>(
        'select id from workspaces where id = $1',
        [workspaceId],
      );
      if (seen.rowCount === 0) {
        throw new WorkspaceUnavailableError(workspaceId);
      }
      const result = await action(client);
      await client.query('commit');
      return result;
    } catch (err: unknown) {
      try {
        await client.query('rollback');
      } catch {
        // Rollback failure is ignored after an error.
      }
      throw err;
    } finally {
      client.release();
    }
  }

  return {
    objects,

    async stageAttachmentBytes(objectId, body, size): Promise<void> {
      await objects.write(stagingKey(objectId), body, size);
    },

    async saveTemporaryAttachment(actor, workspaceId, object): Promise<void> {
      await withClient(actor, workspaceId, async (client) => {
        const db = drizzle({ client });
        await db.insert(attachmentObjects).values({
          workspaceId,
          id: object.id,
          digest: object.digest.toLowerCase(),
          size: object.size,
          mediaType: object.mediaType,
          width: object.width,
          height: object.height,
          state: 'temporary',
        });
      });
    },

    async getAttachmentObject(
      actor,
      workspaceId,
      objectId,
    ): Promise<AttachmentObjectRecord | null> {
      return withClient(actor, workspaceId, async (client) => {
        const db = drizzle({ client });
        const rows = await db
          .select()
          .from(attachmentObjects)
          .where(
            and(
              eq(attachmentObjects.workspaceId, workspaceId),
              eq(attachmentObjects.id, objectId),
            ),
          );
        const row = rows[0];
        if (!row) return null;
        return {
          workspaceId: row.workspaceId,
          id: row.id,
          digest: row.digest,
          size: Number(row.size),
          mediaType: storedMediaType(row.mediaType),
          width: row.width,
          height: row.height,
          state: storedAttachmentState(row.state),
          createdAt: row.createdAt.toISOString(),
          finalizedAt: row.finalizedAt ? row.finalizedAt.toISOString() : null,
        };
      });
    },

    async finalizeAttachmentObject(
      actor,
      workspaceId,
      objectId,
      expectedDigest,
    ): Promise<
      | { readonly ok: true; readonly object: AttachmentObjectRecord }
      | {
          readonly ok: false;
          readonly error:
            'not_found' | 'invalid_content' | 'already_unavailable';
        }
    > {
      return withClient(actor, workspaceId, async (client) => {
        const selectResult = await client.query<{
          id: string;
          workspace_id: string;
          digest: string;
          size: string;
          media_type: string;
          width: number | null;
          height: number | null;
          state: string;
          created_at: Date;
          finalized_at: Date | null;
        }>(
          'SELECT * FROM attachment_objects WHERE workspace_id = $1 AND id = $2 FOR UPDATE',
          [workspaceId, objectId],
        );
        if (selectResult.rowCount === 0) {
          return { ok: false, error: 'not_found' };
        }
        const row = selectResult.rows[0];
        if (!row) return { ok: false, error: 'not_found' };

        if (row.state === 'unavailable') {
          return { ok: false, error: 'already_unavailable' };
        }
        if (row.digest !== expectedDigest.toLowerCase()) {
          return { ok: false, error: 'invalid_content' };
        }

        if (row.state === 'temporary') {
          // The staged bytes move to the key of their digest. When that key
          // already holds the same bytes, the staged copy goes. An upload
          // that was in flight across the upgrade to record 0192 staged its
          // bytes at the older path of the file store. An object whose bytes
          // are in no place has nothing to finalize.
          const target = attachmentKey(workspaceId, row.digest);
          const present =
            (await objects.promote(stagingKey(objectId), target)) ||
            (await objects.promote(legacyStagingKey(objectId), target));
          if (!present) return { ok: false, error: 'not_found' };
          const updateResult = await client.query<{ finalized_at: Date }>(
            "UPDATE attachment_objects SET state = 'finalized', finalized_at = clock_timestamp() WHERE workspace_id = $1 AND id = $2 RETURNING finalized_at",
            [workspaceId, objectId],
          );
          const finalizedAt = updateResult.rows[0]?.finalized_at ?? new Date();
          return {
            ok: true,
            object: {
              workspaceId: row.workspace_id,
              id: row.id,
              digest: row.digest,
              size: Number(row.size),
              mediaType: storedMediaType(row.media_type),
              width: row.width,
              height: row.height,
              state: 'finalized',
              createdAt: row.created_at.toISOString(),
              finalizedAt: finalizedAt.toISOString(),
            },
          };
        }

        // Already finalized
        return {
          ok: true,
          object: {
            workspaceId: row.workspace_id,
            id: row.id,
            digest: row.digest,
            size: Number(row.size),
            mediaType: storedMediaType(row.media_type),
            width: row.width,
            height: row.height,
            state: 'finalized',
            createdAt: row.created_at.toISOString(),
            finalizedAt: (row.finalized_at ?? row.created_at).toISOString(),
          },
        };
      });
    },

    async archivePlan(actor, workspaceId, after, limit) {
      return withClient(actor, workspaceId, async (client) => {
        const rows = await client.query<{
          id: string;
          path: string;
          kind: string;
          head_revision_id: string;
          size: string;
          updated_at: Date;
        }>(
          `SELECT f.id, f.path, f.kind, f.head_revision_id, c.size, f.updated_at
           FROM files f
           JOIN revisions r
             ON r.workspace_id = f.workspace_id AND r.id = f.head_revision_id
           JOIN contents c
             ON c.workspace_id = r.workspace_id AND c.digest = r.content_digest
           WHERE f.workspace_id = $1 AND NOT f.deleted AND NOT r.deleted
             AND ($2::text IS NULL OR f.path > $2::text)
           ORDER BY f.path
           LIMIT $3`,
          [workspaceId, after, Math.max(1, Math.trunc(limit))],
        );
        return rows.rows.map((row) => ({
          fileId: row.id,
          path: row.path,
          kind: row.kind === 'attachment' ? 'attachment' : 'note',
          headRevisionId: row.head_revision_id,
          size: Number(row.size),
          updatedAt: row.updated_at,
        }));
      });
    },

    async workspaceRoom(actor, workspaceId) {
      return withClient(actor, workspaceId, async (client) => {
        const rows = await client.query<{
          used_bytes: string;
          limit_bytes: string;
        }>('select used_bytes, limit_bytes from notesapp_account_usage($1)', [
          workspaceId,
        ]);
        const row = rows.rows[0];
        if (row === undefined)
          throw new OperationalError(
            'unexpected',
            'notesapp: the workspace has no owner account.',
          );
        const room =
          BigInt(row.limit_bytes) -
          contentWriteReserveBytes -
          BigInt(row.used_bytes);
        return room > 0n ? room : 0n;
      });
    },

    async readAttachmentRevision(
      actor,
      workspaceId,
      revisionId,
    ): Promise<AttachmentBytes | null> {
      return withClient(actor, workspaceId, (client) =>
        revisionBytes(client, workspaceId, revisionId),
      );
    },

    async readPublishedAttachmentRevision(
      tokenDigest,
      workspaceId,
      revisionId,
    ): Promise<AttachmentBytes | null> {
      // A digest of another shape is at rest nowhere, so it opens no link.
      if (!isDigest(tokenDigest) || !isUuid(workspaceId)) return null;
      let client: pg.PoolClient;
      try {
        client = await pool.connect();
      } catch {
        throw new OperationalError(
          'unavailable',
          'notesapp: database connection refused.',
        );
      }
      try {
        await client.query('begin');
        // The reader writes nothing, and the database holds that here as it
        // holds it for the note of the same page. See decision 0031.
        await client.query('set transaction read only');
        const link = await client.query<{
          workspace_id: string;
          owner_account_id: string;
        }>(
          'select workspace_id, owner_account_id from public.notesapp_publication_by_token($1)',
          [tokenDigest],
        );
        const row = link.rows[0];
        if (row === undefined || row.workspace_id !== workspaceId) {
          await client.query('rollback');
          return null;
        }
        // The row policies of the attachment tables read the identity of the
        // transaction, which is the owner of this one link from here on. The
        // setting is transaction local, so it reaches no later user of the
        // pooled connection.
        await client.query(
          "select set_config('notesapp.account_id', $1, true)",
          [row.owner_account_id],
        );
        const bytes = await revisionBytes(client, workspaceId, revisionId);
        await client.query('commit');
        return bytes;
      } catch (error) {
        try {
          await client.query('rollback');
        } catch {
          // The connection is already unusable; report the first failure.
        }
        throw error;
      } finally {
        client.release();
      }
    },

    async reclaimAttachments(now: Date): Promise<number> {
      const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      let client: pg.PoolClient;
      try {
        client = await pool.connect();
      } catch {
        return 0;
      }

      try {
        const candidatesResult = await client.query<{
          id: string;
          workspace_id: string;
          digest: string;
          state: string;
        }>(
          'SELECT id, workspace_id, digest, state FROM public.notesapp_reclaim_attachments($1)',
          [cutoff],
        );

        let count = 0;
        for (const candidate of candidatesResult.rows) {
          try {
            await client.query('begin');
            await client.query(
              'select pg_advisory_xact_lock(hashtext($1::text)::bigint)',
              [candidate.workspace_id],
            );

            // A reference may have appeared after the candidate was listed.
            const refResult = await client.query<{ exists: boolean }>(
              'SELECT public.notesapp_has_attachment_content_ref($1, $2) as exists',
              [candidate.workspace_id, candidate.id],
            );
            if (refResult.rows[0]?.exists) {
              await client.query('rollback');
              continue;
            }

            // The mark claims the row for this run. A second run, and a run in
            // another process, gets no row and therefore deletes no bytes.
            const updated = await client.query<{ ok: boolean }>(
              'SELECT public.notesapp_mark_attachment_unavailable($1, $2) as ok',
              [candidate.workspace_id, candidate.id],
            );
            if (!updated.rows[0]?.ok) {
              await client.query('rollback');
              continue;
            }

            await options.onReclaimMarked?.(candidate.id);

            // The digest check and both deletions stay inside this locked
            // transaction. A finalize of another object with the same digest
            // holds the same workspace lock, so it cannot pass between the
            // check and the deletion and lose its bytes. It waits, sees no
            // object at the key of the digest, and moves its own upload there.
            const digestStillUsed = await client.query<{ exists: boolean }>(
              'SELECT public.notesapp_is_attachment_digest_used($1, $2) as exists',
              [candidate.workspace_id, candidate.digest],
            );

            if (isUuid(candidate.id))
              await objects.remove(stagingKey(candidate.id));
            if (
              !digestStillUsed.rows[0]?.exists &&
              isDigest(candidate.digest) &&
              isUuid(candidate.workspace_id)
            ) {
              await objects.remove(
                attachmentKey(candidate.workspace_id, candidate.digest),
              );
            }

            await client.query('commit');
            count++;
          } catch {
            try {
              await client.query('rollback');
            } catch {
              // The connection is unusable; the next run repeats the work.
            }
          }
        }

        return count + (await reclaimDeletedWorkspaces(client));
      } finally {
        client.release();
      }
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}
