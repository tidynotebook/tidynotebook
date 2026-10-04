/**
 * The sync repository: the changesets, the receipts, the snapshots, and the
 * incremental change feed of the open workspace.
 *
 * It is the changesets and sync slice of the port. It reads a stored receipt,
 * performs the one atomic write of a validated changeset, captures a snapshot,
 * reads a snapshot page, and reads the ordered change feed. The write runs
 * inside the `notesapp_accept` savepoint that the unit of work manages.
 */
import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import {
  OperationalError,
  fail,
  ok,
  snapshotTtlMs,
  type AcceptedChangeset,
  type AcceptedRevision,
  type Actor,
  type MutationReceipt,
  type Result,
  type SnapshotPage,
  type SnapshotStart,
  type StartSnapshotInput,
  type SupersededHead,
  type SyncChangeFeed,
  type WorkspaceTransaction,
  type AcceptedInput,
  type StoredRevisionInput,
} from '@notesapp/core';
import {
  attachmentObjects,
  changesets,
  contents,
  files,
  livePaths,
  mutationReceipts,
  revisionParents,
  revisions,
  syncChanges,
  noteDocuments,
} from '../schema.ts';
import {
  captureSnapshot,
  readSnapshotPage,
  readSyncChanges,
} from '../snapshots.ts';
import { assertUuid, domainFailure, operational } from './errors.ts';
import { withAcceptSavepoint } from './transaction.ts';
import type { RepositoryContext } from './context.ts';
import {
  expandMovedReferences,
  updateAcceptedIndexes,
} from './portable-links.ts';

/**
 * Bytes charged for the metadata of one accepted revision.
 *
 * The charge covers the revision row, its parent rows, its incremental sync
 * record, and its entry in the stored mutation receipt, which repeats the
 * accepted record so a retry can be answered without a read.
 */
const revisionOverheadBytes = 1024n;

/** Bytes charged for one retained mutation receipt. */
const receiptOverheadBytes = 512n;

/**
 * Quota headroom that only a control operation may use.
 *
 * A changeset that adds no new content is a control operation: a deletion, a
 * rename, or a restore of content that the workspace already holds. Such an
 * operation may use the whole limit of the owner account, so a full account
 * stays manageable. A changeset that adds content must fit below the limit
 * minus this reserve, so the headroom cannot be consumed by new content
 * (record 0112).
 */
const controlReserveBytes = 1n << 20n;

/**
 * The bytes that `changesets` changesets of `revisions` new revisions and
 * `contentBytes` new content charge to the owner, by the rule of the write
 * below. An import reads it to check the room of the owner before its first
 * commit (record 0170).
 */
export function writeChargeBytes(
  contentBytes: bigint,
  revisions: number,
  changesets: number,
): bigint {
  return (
    contentBytes +
    BigInt(revisions) * revisionOverheadBytes +
    BigInt(changesets) * receiptOverheadBytes
  );
}

/** The headroom of the owner that a write of new content must leave. */
export const contentWriteReserveBytes = controlReserveBytes;

/** The SHA-256 digest of UTF-8 Markdown, in lower case hexadecimal. */
function markdownDigest(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Reads one accepted revision record out of a stored outcome. */
function parseAcceptedRevision(value: unknown): AcceptedRevision {
  const record: Record<string, unknown> =
    typeof value === 'object' && value !== null
      ? Object.fromEntries(Object.entries(value))
      : {};
  const parents = record.parents;
  if (
    typeof record.revisionId === 'string' &&
    typeof record.fileId === 'string' &&
    Array.isArray(parents) &&
    parents.every((entry: unknown) => typeof entry === 'string') &&
    typeof record.path === 'string' &&
    typeof record.deleted === 'boolean' &&
    typeof record.digest === 'string' &&
    typeof record.size === 'number' &&
    typeof record.actorAccountId === 'string' &&
    typeof record.serverTime === 'string' &&
    (record.message === null || typeof record.message === 'string')
  ) {
    return {
      revisionId: record.revisionId,
      fileId: record.fileId,
      parents: [...parents],
      path: record.path,
      deleted: record.deleted,
      digest: record.digest,
      size: record.size,
      epoch: typeof record.epoch === 'number' ? record.epoch : null,
      acceptedState:
        typeof record.acceptedState === 'string'
          ? new Uint8Array(Buffer.from(record.acceptedState, 'base64'))
          : null,
      merged: record.merged === true,
      actorAccountId: record.actorAccountId,
      serverTime: record.serverTime,
      message: record.message,
    };
  }
  throw new OperationalError(
    'unexpected',
    'notesapp: a stored accepted revision has an unknown shape.',
  );
}

/**
 * Reads the moved heads of a stored outcome.
 *
 * A receipt written before this member existed carries none, which reads as an
 * answer with no superseded head.
 */
function parseSuperseded(value: unknown): readonly SupersededHead[] {
  if (!Array.isArray(value)) return [];
  const entries: SupersededHead[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    // Only own enumerable members count, so an inherited member of a value
    // that another tool wrote cannot pass a check.
    const record: Record<string, unknown> = Object.fromEntries(
      Object.entries(entry),
    );
    const fileId = readString(record, 'fileId');
    const previous = readString(record, 'previousHeadRevisionId');
    const accepted = readString(record, 'acceptedRevisionId');
    if (fileId === null || previous === null || accepted === null) continue;
    entries.push({
      fileId,
      previousHeadRevisionId: previous,
      acceptedRevisionId: accepted,
    });
  }
  return entries;
}

/** One string member of an unknown stored record, or `null`. */
function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const member: unknown = record[key];
  return typeof member === 'string' ? member : null;
}

/**
 * Reads the stored outcome of a mutation receipt.
 *
 * The outcome column holds the JSON that `accept` wrote. A retry answers from
 * it without repeating the write, so the value must carry every member of an
 * accepted changeset. A value that does not is a defect of a writer, and the
 * refusal is loud: an unchecked outcome would reach the client as the answer
 * of a save that it cannot compare with its own state.
 */
function parseOutcome(value: unknown): AcceptedChangeset {
  if (
    typeof value === 'object' &&
    value !== null &&
    'mutationId' in value &&
    typeof value.mutationId === 'string' &&
    'cursor' in value &&
    typeof value.cursor === 'string' &&
    'revisionIds' in value &&
    Array.isArray(value.revisionIds) &&
    value.revisionIds.every((entry: unknown) => typeof entry === 'string') &&
    'revisions' in value &&
    Array.isArray(value.revisions)
  ) {
    return {
      mutationId: value.mutationId,
      cursor: value.cursor,
      revisionIds: [...value.revisionIds],
      revisions: value.revisions.map(parseAcceptedRevision),
      superseded: parseSuperseded(
        'superseded' in value ? value.superseded : undefined,
      ),
    };
  }
  throw new OperationalError(
    'unexpected',
    'notesapp: a stored mutation outcome has an unknown shape.',
  );
}

/** The last submitted revision of each file, which becomes its new head. */
function tips(input: AcceptedInput): ReadonlyMap<string, StoredRevisionInput> {
  const result = new Map<string, StoredRevisionInput>();
  for (const revision of input.revisions) result.set(revision.fileId, revision);
  return result;
}

/** Parses an informational client timestamp. */
function clientTime(revision: StoredRevisionInput): Date {
  const parsed = new Date(revision.clientTime);
  if (Number.isNaN(parsed.getTime())) {
    throw new OperationalError(
      'unexpected',
      'notesapp: a client timestamp is not a valid instant.',
    );
  }
  return parsed;
}

/** Builds the sync slice of the port over one open transaction. */
export function syncRepository(
  context: RepositoryContext,
): Pick<
  WorkspaceTransaction,
  'receipt' | 'accept' | 'startSnapshot' | 'snapshotPage' | 'syncChanges'
> {
  const { client, db, actor, workspaceId } = context;
  return {
    async receipt(
      mutationId: string,
      accountId: string,
    ): Promise<MutationReceipt | null> {
      assertUuid(mutationId, 'the mutation');
      assertUuid(accountId, 'the account');
      const rows = await db
        .select({
          digest: mutationReceipts.requestDigest,
          outcome: mutationReceipts.outcome,
        })
        .from(mutationReceipts)
        .where(
          and(
            eq(mutationReceipts.workspaceId, workspaceId),
            eq(mutationReceipts.actorAccountId, accountId),
            eq(mutationReceipts.mutationId, mutationId),
          ),
        );
      const row = rows[0];
      if (row === undefined) return null;
      return { digest: row.digest, outcome: parseOutcome(row.outcome) };
    },

    async accept(
      writer: Actor,
      input: AcceptedInput,
      digest: string,
      superseded: readonly SupersededHead[] = [],
    ): Promise<Result<AcceptedChangeset>> {
      if (input.workspaceId !== workspaceId) {
        throw new OperationalError(
          'unexpected',
          'notesapp: the changeset belongs to another workspace.',
        );
      }
      if (writer.accountId !== actor.accountId) {
        throw new OperationalError(
          'unexpected',
          'notesapp: the writing actor differs from the transaction actor.',
        );
      }
      if (input.revisions.length === 0) {
        throw new OperationalError(
          'unexpected',
          'notesapp: a changeset must carry at least one revision.',
        );
      }
      const expanded = await expandMovedReferences(
        db,
        workspaceId,
        input,
        context.documents,
      );
      if (!expanded.ok) return expanded;
      const acceptedInput = expanded.value;
      const fileIds = [
        ...new Set(acceptedInput.revisions.map((revision) => revision.fileId)),
      ].sort();
      return withAcceptSavepoint(
        client,
        () =>
          writeChangeset(
            client,
            db,
            writer,
            workspaceId,
            acceptedInput,
            digest,
            fileIds,
            superseded,
          ),
        (error) => domainFailure(error, fileIds),
      );
    },

    async startSnapshot(input: StartSnapshotInput): Promise<SnapshotStart> {
      if (!Number.isInteger(input.pageSize) || input.pageSize < 1) {
        throw new OperationalError(
          'unexpected',
          'notesapp: the snapshot page size is outside the served range.',
        );
      }
      try {
        return await captureSnapshot(client, {
          workspaceId,
          accountId: actor.accountId,
          pageSize: input.pageSize,
          now: new Date(),
          ttlMs: snapshotTtlMs,
        });
      } catch (error) {
        throw operational(error);
      }
    },

    async snapshotPage(
      token: string,
      position: number,
      limit: number,
    ): Promise<SnapshotPage | null> {
      if (
        !Number.isInteger(position) ||
        position < 0 ||
        !Number.isInteger(limit) ||
        limit < 1
      ) {
        throw new OperationalError(
          'unexpected',
          'notesapp: the snapshot page range is outside the served range.',
        );
      }
      try {
        return await readSnapshotPage(client, {
          workspaceId,
          token,
          position,
          limit,
          now: new Date(),
        });
      } catch (error) {
        throw operational(error);
      }
    },

    async syncChanges(
      afterCursor: string,
      limit: number,
    ): Promise<SyncChangeFeed> {
      if (!/^[0-9]{1,32}$/.test(afterCursor)) {
        throw new OperationalError(
          'unexpected',
          'notesapp: the sync cursor is not a decimal string.',
        );
      }
      if (!Number.isInteger(limit) || limit < 1) {
        throw new OperationalError(
          'unexpected',
          'notesapp: the sync limit is outside the served range.',
        );
      }
      try {
        return await readSyncChanges(client, {
          workspaceId,
          afterCursor,
          limit,
        });
      } catch (error) {
        throw operational(error);
      }
    },
  };
}

/** Performs the atomic write of one validated changeset. */
/** The document that one changeset wrote for a note, or undefined. */
function documentOf(
  input: AcceptedInput,
  fileId: string,
): AcceptedInput['documents'][number] | undefined {
  return input.documents.find((document) => document.fileId === fileId);
}

async function writeChangeset(
  client: pg.PoolClient,
  db: NodePgDatabase,
  actor: Actor,
  workspaceId: string,
  input: AcceptedInput,
  digest: string,
  fileIds: readonly string[],
  superseded: readonly SupersededHead[],
): Promise<Result<AcceptedChangeset>> {
  assertUuid(input.mutationId, 'the mutation');
  for (const revision of input.revisions) {
    assertUuid(revision.id, 'a revision');
    assertUuid(revision.fileId, 'a file');
    for (const parent of revision.parents) assertUuid(parent, 'a parent');
  }
  const heads = tips(input);

  // Lock every affected file in identifier order, so two changesets that share
  // files cannot deadlock.
  const locked = await db
    .select({ id: files.id })
    .from(files)
    .where(
      and(eq(files.workspaceId, workspaceId), inArray(files.id, [...fileIds])),
    )
    .orderBy(files.id)
    .for('update');
  const known = new Set(locked.map((row) => row.id));

  const missing = fileIds.filter((fileId) => !known.has(fileId));
  if (missing.length > 0) {
    await db
      .insert(files)
      .values(
        missing.map((fileId) => {
          const tip = heads.get(fileId);
          if (tip === undefined) {
            throw new OperationalError(
              'unexpected',
              'notesapp: a locked file has no submitted revision.',
            );
          }
          return {
            workspaceId,
            id: fileId,
            path: tip.path,
            kind: tip.content.kind === 'markdown' ? 'note' : 'attachment',
          } as const;
        }),
      )
      .onConflictDoNothing();
  }

  // Attachment content refers to a finalized object of the same workspace.
  const objectIds = [
    ...new Set(
      input.revisions.flatMap((revision) =>
        revision.content.kind === 'attachment'
          ? [revision.content.objectId]
          : [],
      ),
    ),
  ];
  const objects = new Map<string, { size: bigint; digest: string }>();
  if (objectIds.length > 0) {
    for (const objectId of objectIds) assertUuid(objectId, 'an attachment');
    const rows = await db
      .select({
        id: attachmentObjects.id,
        size: attachmentObjects.size,
        digest: attachmentObjects.digest,
        state: attachmentObjects.state,
      })
      .from(attachmentObjects)
      .where(
        and(
          eq(attachmentObjects.workspaceId, workspaceId),
          inArray(attachmentObjects.id, objectIds),
        ),
      );
    for (const row of rows) {
      if (row.state === 'finalized') {
        objects.set(row.id, { size: row.size, digest: row.digest });
      }
    }
    const unusable = input.revisions.filter(
      (revision) =>
        revision.content.kind === 'attachment' &&
        !objects.has(revision.content.objectId),
    );
    if (unusable.length > 0) {
      return fail(
        'invalid_graph',
        unusable.map((revision) => revision.fileId),
      );
    }
  }

  // The declared digest must match the submitted bytes. A wrong digest would
  // attach the revision to content that the client never sent, because content
  // is addressed by digest and deduplicated.
  const mismatched = input.revisions.filter((revision) => {
    const content = revision.content;
    if (content.kind === 'markdown') {
      return markdownDigest(content.text) !== content.digest.toLowerCase();
    }
    return objects.get(content.objectId)?.digest !== content.digest;
  });
  if (mismatched.length > 0) {
    return fail(
      'invalid_content',
      mismatched.map((revision) => revision.fileId),
    );
  }

  // Immutable content, deduplicated inside this workspace only.
  const contentRows = new Map<
    string,
    {
      workspaceId: string;
      digest: string;
      kind: 'markdown' | 'attachment';
      size: bigint;
      markdown: string | null;
      objectId: string | null;
    }
  >();
  for (const revision of input.revisions) {
    const content = revision.content;
    if (contentRows.has(content.digest)) continue;
    contentRows.set(content.digest, {
      workspaceId,
      digest: content.digest,
      kind: content.kind,
      size:
        content.kind === 'markdown'
          ? BigInt(Buffer.byteLength(content.text, 'utf8'))
          : (objects.get(content.objectId)?.size ?? 0n),
      markdown: content.kind === 'markdown' ? content.text : null,
      objectId: content.kind === 'attachment' ? content.objectId : null,
    });
  }
  const stored = await db
    .insert(contents)
    .values([...contentRows.values()])
    .onConflictDoNothing()
    .returning({ size: contents.size, kind: contents.kind });
  const contentBytes = stored.reduce((total, row) => total + row.size, 0n);
  const attachmentBytes = stored.reduce(
    (total, row) => (row.kind === 'attachment' ? total + row.size : total),
    0n,
  );

  // Retained metadata and receipts count toward the workspace quota. They
  // live in PostgreSQL beside the Markdown, so they count as text, and the
  // bytes of an attachment count toward the storage limit alone (record
  // 0189).
  const addedBytes =
    contentBytes +
    BigInt(input.revisions.length) * revisionOverheadBytes +
    receiptOverheadBytes;
  const textBytes = addedBytes - attachmentBytes;
  // The limit belongs to the account that owns the workspace, and the owner
  // pays for every workspace it owns (record 0112). The read takes the lock of
  // that account after the workspace lock this transaction holds, so two writes
  // to two workspaces of one owner check the sum one after the other.
  const usageRows = await client.query<{
    used_bytes: string;
    limit_bytes: string;
    text_bytes: string;
    text_limit_bytes: string | null;
    standing: string;
  }>(
    `select used_bytes, limit_bytes, text_bytes, text_limit_bytes, standing
       from notesapp_account_usage($1)`,
    [workspaceId],
  );
  const usageRow = usageRows.rows[0];
  if (usageRow === undefined) {
    throw new OperationalError(
      'unexpected',
      'notesapp: the workspace has no owner account.',
    );
  }
  // A locked owner writes nothing, whoever sends the write, and the function
  // below refuses the same write again (records 0189 and 0201).
  if (usageRow.standing !== 'active') return fail('account_locked', fileIds);
  const usage = {
    bytesUsed: BigInt(usageRow.used_bytes),
    limitBytes: BigInt(usageRow.limit_bytes),
    textBytes: BigInt(usageRow.text_bytes),
    textLimitBytes:
      usageRow.text_limit_bytes === null
        ? null
        : BigInt(usageRow.text_limit_bytes),
  };
  // Only a changeset that deletes every file it touches and adds no content
  // byte may use the control reserve. A deletion that carried new content
  // would otherwise reach the reserved capacity through a disguised write, and
  // the reserve exists so that a full workspace can still be managed by
  // operations that add nothing. Reusing a stored digest is not enough on its
  // own either: the revision rows and the receipt still grow the retained
  // bytes, so a changeset that keeps a file alive must fit under the reserve
  // line like any other write.
  const control =
    contentBytes === 0n &&
    input.revisions.every((revision) => revision.deleted);
  const reserve = control ? 0n : controlReserveBytes;
  if (usage.bytesUsed + addedBytes > usage.limitBytes - reserve) {
    return fail('quota', fileIds);
  }
  // The text limit sits inside the storage limit and keeps the same reserve,
  // so a deletion still works on an account whose text is full.
  if (
    usage.textLimitBytes !== null &&
    usage.textBytes + textBytes > usage.textLimitBytes - reserve
  ) {
    return fail('quota', fileIds);
  }
  // The runtime role holds no UPDATE right on the usage or the cursor record,
  // so both changes go through a membership checked function of the schema
  // owner. A member can therefore not raise its own quota or reset the commit
  // order.
  await client.query('select notesapp_add_usage($1, $2::bigint, $3::bigint)', [
    workspaceId,
    textBytes.toString(),
    attachmentBytes.toString(),
  ]);
  const allocated = await client.query<{ cursor: string }>(
    'select notesapp_next_cursor($1) as cursor',
    [workspaceId],
  );
  const allocatedCursor = allocated.rows[0]?.cursor;
  if (allocatedCursor === undefined) {
    throw new OperationalError(
      'unexpected',
      'notesapp: the workspace cursor was not allocated.',
    );
  }
  const cursor = BigInt(allocatedCursor);

  const changesetId = randomUUID();
  await db.insert(changesets).values({
    workspaceId,
    id: changesetId,
    mutationId: input.mutationId,
    actorAccountId: actor.accountId,
    deviceId: input.deviceId,
    requestDigest: digest,
    cursor,
  });

  // The acceptance time is assigned by the database, so it is read back here:
  // the answer to a write is built from the accepted rows, never from a later
  // read that would need the read permission the writer may not hold.
  const written = await db
    .insert(revisions)
    .values(
      input.revisions.map((revision) => ({
        workspaceId,
        id: revision.id,
        fileId: revision.fileId,
        contentDigest: revision.content.digest,
        path: revision.path,
        deleted: revision.deleted,
        changesetId,
        actorAccountId: actor.accountId,
        clientTime: clientTime(revision),
        message: revision.message,
        restoredFrom: revision.restoredFrom,
        // The feed sends one record per revision, so the work of this save
        // and the vector that follows it belong to the revision row.
        documentUpdate: documentOf(input, revision.fileId)?.update ?? null,
        documentVector: documentOf(input, revision.fileId)?.vector ?? null,
        documentEpoch: documentOf(input, revision.fileId)?.epoch ?? null,
        merged: documentOf(input, revision.fileId)?.merged ?? false,
      })),
    )
    .returning({ id: revisions.id, serverTime: revisions.serverTime });
  const serverTimes = new Map(
    written.map((row) => [row.id, row.serverTime.toISOString()]),
  );

  const parentRows = input.revisions.flatMap((revision) =>
    revision.parents.map((parent, ordinal) => ({
      workspaceId,
      childId: revision.id,
      parentId: parent,
      ordinal,
    })),
  );
  if (parentRows.length > 0) {
    await db.insert(revisionParents).values(parentRows);
  }

  // Advance every head in one statement, so a large folder change stays one
  // round trip.
  const headValues = sql.join(
    [...heads.values()].map(
      (tip) =>
        sql`(${tip.fileId}::uuid, ${tip.id}::uuid, ${tip.path}::text, ${tip.deleted}::boolean)`,
    ),
    sql`, `,
  );
  await db.execute(sql`
    update ${files} as f
    set head_revision_id = v.head_revision_id,
        path = v.path,
        deleted = v.deleted,
        updated_at = now()
    from (values ${headValues}) as v(file_id, head_revision_id, path, deleted)
    where f.workspace_id = ${workspaceId}::uuid and f.id = v.file_id
  `);

  // Accepted paths. A deleted file releases its path; a live file claims it.
  // The unique constraint is deferred, so two files can swap paths here.
  const removed = [...heads.values()].filter((tip) => tip.deleted);
  if (removed.length > 0) {
    await db.delete(livePaths).where(
      and(
        eq(livePaths.workspaceId, workspaceId),
        inArray(
          livePaths.fileId,
          removed.map((tip) => tip.fileId),
        ),
      ),
    );
  }
  const claimed = [...heads.values()].filter((tip) => !tip.deleted);
  if (claimed.length > 0) {
    await db
      .insert(livePaths)
      .values(
        claimed.map((tip) => ({
          workspaceId,
          fileId: tip.fileId,
          path: tip.path,
        })),
      )
      .onConflictDoUpdate({
        target: [livePaths.workspaceId, livePaths.fileId],
        set: { path: sql`excluded.path` },
      });
  }

  // The document of every note that this changeset changed commits with its
  // revisions, so an accepted text and the document it came from can never
  // disagree (record 0081).
  if (input.documents.length > 0) {
    await db
      .insert(noteDocuments)
      .values(
        input.documents.map((document) => ({
          workspaceId,
          fileId: document.fileId,
          epoch: document.epoch,
          bytes: document.bytes,
          state: document.state,
        })),
      )
      .onConflictDoUpdate({
        target: [noteDocuments.workspaceId, noteDocuments.fileId],
        set: {
          bytes: sql`excluded.bytes`,
          state: sql`excluded.state`,
          epoch: sql`excluded.epoch`,
          updatedAt: sql`now()`,
        },
      });
  }

  await updateAcceptedIndexes(db, workspaceId, heads);

  await db.insert(syncChanges).values(
    [...heads.values()].map((tip) => ({
      workspaceId,
      cursor,
      entityKind: 'file' as const,
      entityId: tip.fileId,
      revisionId: tip.id,
      deleted: tip.deleted,
    })),
  );

  const outcome: AcceptedChangeset = {
    mutationId: input.mutationId,
    revisionIds: input.revisions.map((revision) => revision.id),
    cursor: cursor.toString(),
    revisions: input.revisions.map((revision) => {
      const serverTime = serverTimes.get(revision.id);
      if (serverTime === undefined) {
        throw new OperationalError(
          'unexpected',
          'notesapp: an accepted revision was not written back.',
        );
      }
      const document = documentOf(input, revision.fileId);
      return {
        epoch: document?.epoch ?? null,
        acceptedState: document?.state ?? null,
        merged: document?.merged ?? false,
        revisionId: revision.id,
        fileId: revision.fileId,
        parents: [...revision.parents],
        path: revision.path,
        deleted: revision.deleted,
        digest: revision.content.digest,
        size: Number(contentRows.get(revision.content.digest)?.size ?? 0n),
        actorAccountId: actor.accountId,
        serverTime,
        message: revision.message,
      };
    }),
    // The receipt stores the moved heads with the outcome, so a retry after a
    // lost answer reports the same superseded heads instead of none.
    superseded: superseded.map((entry) => ({ ...entry })),
  };
  await db.insert(mutationReceipts).values({
    workspaceId,
    actorAccountId: actor.accountId,
    mutationId: input.mutationId,
    requestDigest: digest,
    // A replay answers exactly what the first attempt answered, so the stored
    // outcome keeps the complete accepted state as text (record 0085).
    outcome: {
      ...outcome,
      revisions: outcome.revisions.map((revision) => ({
        ...revision,
        acceptedState:
          revision.acceptedState === null
            ? null
            : Buffer.from(revision.acceptedState).toString('base64'),
      })),
    },
  });

  // Force the deferred checks now, so a path conflict is an expected outcome
  // of this call rather than a failure at commit time.
  await client.query('set constraints all immediate');
  await client.query('set constraints all deferred');
  return ok(outcome);
}
