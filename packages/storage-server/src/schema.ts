/**
 * PostgreSQL schema of the accepted workspace state.
 *
 * Every table that holds workspace content carries `workspace_id`, and every
 * child reference is a composite foreign key `(workspace_id, ...)` to its
 * parent. A row therefore cannot point at a row of another workspace, because
 * the pair would not exist in the parent table.
 *
 * Drizzle owns the tables, columns, keys, and indexes below. It cannot express
 * roles, row level security, immutability triggers, or a deferrable unique
 * constraint. The handwritten half of the single migration
 * `migrations/0000_initial.sql` carries those statements. See
 * `docs/development/database.md`.
 */
import {
  bigint,
  boolean,
  customType,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Raw bytes, as PostgreSQL `bytea`.
 *
 * A document and an observed state are bytes, never text: a base64 column
 * would store a third of its size again and would invite a reader to treat
 * the value as something a person reads.
 */
const bytes = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => 'bytea',
  toDriver: (value: Uint8Array) => Buffer.from(value),
  fromDriver: (value: Buffer) => new Uint8Array(value),
});

/**
 * A workspace membership role.
 *
 * Every workspace has one member, its owner, so `owner` is the only role. The
 * enum stays because the policies and the owner guard read it.
 */
export const membershipRole = pgEnum('membership_role', ['owner']);

/**
 * The role of an account in the installation (record 0109).
 *
 * It is a second matrix beside the workspace role and grants no workspace
 * access: every row policy reads membership only.
 */
export const installationRole = pgEnum('installation_role', [
  'administrator',
  'member',
]);

/** Whether an account can sign in (record 0111). */
export const accountState = pgEnum('account_state', ['enabled', 'disabled']);

/** Who can make an account (record 0108). */
export const registrationPolicy = pgEnum('registration_policy', [
  'invitation',
  'open',
]);

/**
 * What proved the address of an account (record 0108).
 *
 * `setup` is the address that the operator typed at the first run, `mail` an
 * invitation link that went by mail, and `administrator` a link that an
 * administrator copied, which proves only what the administrator states.
 */
export const addressProof = pgEnum('address_proof', [
  'setup',
  'mail',
  'administrator',
]);

/** Whether a file holds Markdown or an attachment. */
export const fileKind = pgEnum('file_kind', ['note', 'attachment']);

/** Whether stored content holds Markdown text or an attachment reference. */
export const contentKind = pgEnum('content_kind', ['markdown', 'attachment']);

/** The transfer state of an immutable attachment object. */
export const attachmentState = pgEnum('attachment_state', [
  'temporary',
  'finalized',
  'unavailable',
]);

/** What one published link opens: one note, or one folder and its notes. */
export const publicationScope = pgEnum('publication_scope', ['note', 'folder']);

/** Why a reader reports a published link (record 0119). */
export const reportReason = pgEnum('report_reason', [
  'phishing',
  'malware',
  'illegal',
  'harassment',
  'spam',
  'other',
]);

/** The kind of entity that one incremental sync record refers to. */
export const syncEntityKind = pgEnum('sync_entity_kind', [
  'file',
  'membership',
]);

/**
 * Application owned account identity.
 *
 * The row carries no personal data. The Better Auth tables hold the address
 * and the name, and `account_identities` maps a verified user to one of these
 * identifiers.
 *
 * `limit_bytes` is the byte limit of every workspace that the account owns
 * (record 0112). A removed account keeps its row as a tombstone with
 * `removed_at` set and nothing else that names a person (record 0111), so a
 * revision that names it keeps a valid reference.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    installationRole: installationRole('installation_role')
      .notNull()
      .default('member'),
    state: accountState('state').notNull().default('enabled'),
    limitBytes: bigint('limit_bytes', { mode: 'bigint' }).notNull(),
    addressProof: addressProof('address_proof'),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (table) => [
    check('accounts_limit_bytes_check', sql`${table.limitBytes} > 0`),
    index('accounts_administrator_idx').on(table.installationRole, table.state),
  ],
);

/**
 * The one row of the settings of the installation.
 *
 * The primary key is a boolean that a check holds true, so the table can hold
 * one row and no second. The registration policy lives here and not in the
 * environment, so the registration function reads it in its own transaction
 * (record 0108).
 */
export const installationSettings = pgTable(
  'installation_settings',
  {
    id: boolean('id').primaryKey().default(true),
    registrationPolicy: registrationPolicy('registration_policy')
      .notNull()
      .default('invitation'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check('installation_settings_one_row', sql`${table.id}`)],
);

/**
 * One invitation to make an account (record 0108).
 *
 * Only the SHA-256 digest of the token is at rest, as for a published link
 * (record 0030). The invitation binds one address in its written form, and
 * it carries a target: the installation now, and a workspace with a role in
 * the sharing design. `created_by` is null for an invitation of the operator
 * command. A used invitation names the account it made.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey(),
    tokenDigest: text('token_digest').notNull().unique(),
    email: text('email').notNull(),
    target: text('target').notNull().default('installation'),
    createdBy: uuid('created_by').references(() => accounts.id),
    mailed: boolean('mailed').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedBy: uuid('used_by').references(() => accounts.id),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'invitations_token_digest_check',
      sql`${table.tokenDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'invitations_email_check',
      sql`${table.email} = lower(${table.email}) and char_length(${table.email}) between 3 and 320`,
    ),
    check('invitations_target_check', sql`${table.target} = 'installation'`),
    check(
      'invitations_used_check',
      sql`(${table.usedAt} is null) = (${table.usedBy} is null)`,
    ),
    index('invitations_email_idx').on(table.email),
  ],
);

/** One workspace. Every content row below belongs to exactly one of these. */
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  /** True for the workspace that was created together with its account. */
  personal: boolean('personal').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Stored bytes of one workspace.
 *
 * The limit belongs to the account that owns the workspace, and a write
 * checks the sum of every workspace of that account (record 0112).
 */
export const workspaceUsage = pgTable('workspace_usage', {
  workspaceId: uuid('workspace_id')
    .primaryKey()
    .references(() => workspaces.id),
  bytesUsed: bigint('bytes_used', { mode: 'bigint' }).notNull(),
});

/**
 * The last allocated commit ordered cursor of one workspace.
 *
 * A plain sequence can skip a transaction that commits late, so the cursor is
 * allocated under the workspace row lock instead.
 */
export const workspaceCursors = pgTable('workspace_cursors', {
  workspaceId: uuid('workspace_id')
    .primaryKey()
    .references(() => workspaces.id),
  lastCursor: bigint('last_cursor', { mode: 'bigint' }).notNull(),
});

/** One role of one account in one workspace. */
export const memberships = pgTable(
  'memberships',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    role: membershipRole('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.accountId] }),
    index('memberships_account_idx').on(table.accountId),
  ],
);

/**
 * One file and its accepted state.
 *
 * `head_revision_id` is null while a file has no accepted revision. Such a
 * file holds no row in `live_paths`, so it cannot occupy an accepted path.
 */
export const files = pgTable(
  'files',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    id: uuid('id').notNull(),
    path: text('path').notNull(),
    kind: fileKind('kind').notNull(),
    headRevisionId: uuid('head_revision_id'),
    deleted: boolean('deleted').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    // The two keyset orders of the file listing. Each one carries the whole
    // sort key, so a page reads only the rows it returns and the count of
    // live files reads the index alone.
    index('files_recent_idx').on(
      table.workspaceId,
      table.deleted,
      table.updatedAt.desc(),
      table.id.desc(),
    ),
    index('files_path_idx').on(
      table.workspaceId,
      table.deleted,
      table.path,
      table.id,
    ),
  ],
);

/** One immutable attachment object on the private server volume. */
export const attachmentObjects = pgTable(
  'attachment_objects',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    id: uuid('id').notNull(),
    digest: text('digest').notNull(),
    size: bigint('size', { mode: 'bigint' }).notNull(),
    mediaType: text('media_type').notNull(),
    width: integer('width'),
    height: integer('height'),
    state: attachmentState('state').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    /** When the reclaim handled the bytes of this object. */
    reclaimedAt: timestamp('reclaimed_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index('attachment_objects_digest_idx').on(table.workspaceId, table.digest),
    check('attachment_objects_size_check', sql`${table.size} >= 0`),
  ],
);

/**
 * Attachment bytes that wait for the reclaim after a workspace deletion.
 *
 * A workspace deletion removes the attachment rows, so the digests move here
 * first. The row outlives the workspace row and therefore carries no foreign
 * key. Only the SECURITY DEFINER reclaim functions reach this table.
 */
export const attachmentReclaimQueue = pgTable(
  'attachment_reclaim_queue',
  {
    workspaceId: uuid('workspace_id').notNull(),
    objectId: uuid('object_id').notNull(),
    digest: text('digest').notNull(),
    queuedAt: timestamp('queued_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'attachment_reclaim_queue_pk',
      columns: [table.workspaceId, table.objectId],
    }),
  ],
);

/**
 * Immutable content, addressed by its digest inside one workspace.
 *
 * Deduplication stays inside a workspace, so one workspace cannot learn that
 * another holds the same bytes.
 */
export const contents = pgTable(
  'contents',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    digest: text('digest').notNull(),
    kind: contentKind('kind').notNull(),
    size: bigint('size', { mode: 'bigint' }).notNull(),
    markdown: text('markdown'),
    objectId: uuid('object_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.digest] }),
    foreignKey({
      name: 'contents_object_fk',
      columns: [table.workspaceId, table.objectId],
      foreignColumns: [attachmentObjects.workspaceId, attachmentObjects.id],
    }),
    check(
      'contents_body_check',
      sql`(${table.kind} = 'markdown' and ${table.markdown} is not null and ${table.objectId} is null)
        or (${table.kind} = 'attachment' and ${table.objectId} is not null and ${table.markdown} is null)`,
    ),
    check('contents_size_check', sql`${table.size} >= 0`),
  ],
);

/**
 * One atomic operation over one or more files.
 *
 * The mutation identity is bound to the actor, so a replay cannot reuse the
 * identity of another account. `server_time` is the acceptance time. It uses
 * `clock_timestamp()`, not `now()`, so two changesets of one transaction keep
 * the order of their cursors.
 */
export const changesets = pgTable(
  'changesets',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    id: uuid('id').notNull(),
    mutationId: uuid('mutation_id').notNull(),
    actorAccountId: uuid('actor_account_id')
      .notNull()
      .references(() => accounts.id),
    deviceId: text('device_id').notNull(),
    requestDigest: text('request_digest').notNull(),
    serverTime: timestamp('server_time', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    cursor: bigint('cursor', { mode: 'bigint' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    unique('changesets_mutation_key').on(
      table.workspaceId,
      table.actorAccountId,
      table.mutationId,
    ),
    unique('changesets_cursor_key').on(table.workspaceId, table.cursor),
  ],
);

/**
 * One immutable revision of one file.
 *
 * `client_time` stays informational. `server_time` is the acceptance time and
 * uses `clock_timestamp()`, so it is monotone with the cursor order.
 */
export const revisions = pgTable(
  'revisions',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    id: uuid('id').notNull(),
    fileId: uuid('file_id').notNull(),
    contentDigest: text('content_digest').notNull(),
    path: text('path').notNull(),
    deleted: boolean('deleted').notNull(),
    changesetId: uuid('changeset_id').notNull(),
    actorAccountId: uuid('actor_account_id')
      .notNull()
      .references(() => accounts.id),
    clientTime: timestamp('client_time', { withTimezone: true }).notNull(),
    serverTime: timestamp('server_time', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    message: text('message'),
    restoredFrom: uuid('restored_from'),
    // The document work of this revision, which the feed sends as one record
    // (record 0081). `documentUpdate` is null where no delta exists, for
    // example at the generation boundary that the migration writes; the feed
    // then sends the whole document instead.
    documentUpdate: bytes('document_update'),
    documentVector: bytes('document_vector'),
    documentEpoch: integer('document_epoch'),
    merged: boolean('merged').notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      name: 'revisions_file_fk',
      columns: [table.workspaceId, table.fileId],
      foreignColumns: [files.workspaceId, files.id],
    }),
    foreignKey({
      name: 'revisions_content_fk',
      columns: [table.workspaceId, table.contentDigest],
      foreignColumns: [contents.workspaceId, contents.digest],
    }),
    foreignKey({
      name: 'revisions_changeset_fk',
      columns: [table.workspaceId, table.changesetId],
      foreignColumns: [changesets.workspaceId, changesets.id],
    }),
    foreignKey({
      name: 'revisions_restored_from_fk',
      columns: [table.workspaceId, table.restoredFrom],
      foreignColumns: [table.workspaceId, table.id],
    }),
    index('revisions_file_idx').on(table.workspaceId, table.fileId),
    index('revisions_changeset_idx').on(table.workspaceId, table.changesetId),
    index('revisions_restored_from_idx').on(
      table.workspaceId,
      table.restoredFrom,
    ),
  ],
);

/**
 * The document of one note (records 0081, 0084).
 *
 * The row holds the whole document, its generation, and its complete state.
 * Routine compaction rewrites `bytes` and keeps every character identity and
 * the generation, so work written offline before it still applies.
 */
export const noteDocuments = pgTable(
  'note_documents',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    fileId: uuid('file_id').notNull(),
    epoch: integer('epoch').notNull().default(1),
    bytes: bytes('bytes').notNull(),
    state: bytes('state').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.fileId] }),
    foreignKey({
      name: 'note_documents_file_fk',
      columns: [table.workspaceId, table.fileId],
      foreignColumns: [files.workspaceId, files.id],
    }),
  ],
);

/**
 * The parents of one revision, in submitted order.
 *
 * A first revision has no row, a normal revision has one, and an explicit
 * merge has two.
 */
export const revisionParents = pgTable(
  'revision_parents',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    childId: uuid('child_id').notNull(),
    parentId: uuid('parent_id').notNull(),
    ordinal: integer('ordinal').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.childId, table.ordinal],
    }),
    foreignKey({
      name: 'revision_parents_child_fk',
      columns: [table.workspaceId, table.childId],
      foreignColumns: [revisions.workspaceId, revisions.id],
    }),
    foreignKey({
      name: 'revision_parents_parent_fk',
      columns: [table.workspaceId, table.parentId],
      foreignColumns: [revisions.workspaceId, revisions.id],
    }),
    unique('revision_parents_edge_key').on(
      table.workspaceId,
      table.childId,
      table.parentId,
    ),
    index('revision_parents_parent_idx').on(table.workspaceId, table.parentId),
    check('revision_parents_ordinal_check', sql`${table.ordinal} >= 0`),
    check(
      'revision_parents_self_check',
      sql`${table.childId} <> ${table.parentId}`,
    ),
  ],
);

/**
 * The accepted live path of one file.
 *
 * A partial unique index cannot be deferred, so accepted path uniqueness uses
 * this table instead. Its unique constraint on `(workspace_id, path)` is
 * `DEFERRABLE INITIALLY DEFERRED`, which permits an atomic swap of two paths
 * inside one transaction. A row exists only while the file is live, so a
 * deleted file holds no accepted path.
 */
export const livePaths = pgTable(
  'live_paths',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    fileId: uuid('file_id').notNull(),
    path: text('path').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.fileId] }),
    foreignKey({
      name: 'live_paths_file_fk',
      columns: [table.workspaceId, table.fileId],
      foreignColumns: [files.workspaceId, files.id],
    }),
  ],
);

/**
 * The stored outcome of an accepted mutation.
 *
 * A retry with the same identity and the same request digest returns this
 * outcome. A retry with a different digest is rejected. The record is bound to
 * the actor.
 */
export const mutationReceipts = pgTable(
  'mutation_receipts',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    actorAccountId: uuid('actor_account_id')
      .notNull()
      .references(() => accounts.id),
    mutationId: uuid('mutation_id').notNull(),
    requestDigest: text('request_digest').notNull(),
    outcome: jsonb('outcome').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.actorAccountId, table.mutationId],
    }),
  ],
);

/**
 * A content free marker of a permanently deleted file.
 *
 * The marker has no foreign key to `files`, because purge removes that row.
 * It stays until the workspace is deleted, so a late offline write cannot
 * recreate the identifier.
 */
export const purgeMarkers = pgTable(
  'purge_markers',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    fileId: uuid('file_id').notNull(),
    purgedAt: timestamp('purged_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.fileId] })],
);

/** One commit ordered incremental change record. */
export const syncChanges = pgTable(
  'sync_changes',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    cursor: bigint('cursor', { mode: 'bigint' }).notNull(),
    entityKind: syncEntityKind('entity_kind').notNull(),
    entityId: uuid('entity_id').notNull(),
    revisionId: uuid('revision_id'),
    deleted: boolean('deleted').notNull().default(false),
    committedAt: timestamp('committed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.workspaceId,
        table.cursor,
        table.entityKind,
        table.entityId,
      ],
    }),
  ],
);

/** A bounded materialized download snapshot, addressed by its token hash. */
export const snapshots = pgTable(
  'snapshots',
  {
    tokenHash: text('token_hash').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    cursor: bigint('cursor', { mode: 'bigint' }).notNull(),
    itemCount: integer('item_count').notNull(),
    pageSize: integer('page_size').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('snapshots_expiry_idx').on(table.workspaceId, table.expiresAt),
  ],
);

/** One pinned revision inside a snapshot page. */
export const snapshotItems = pgTable(
  'snapshot_items',
  {
    tokenHash: text('token_hash')
      .notNull()
      .references(() => snapshots.tokenHash, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    fileId: uuid('file_id').notNull(),
    revisionId: uuid('revision_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tokenHash, table.ordinal] }),
    foreignKey({
      name: 'snapshot_items_revision_fk',
      columns: [table.workspaceId, table.revisionId],
      foreignColumns: [revisions.workspaceId, revisions.id],
    }),
    index('snapshot_items_workspace_idx').on(table.workspaceId),
  ],
);

/**
 * The current accepted searchable text of one live note.
 *
 * The name of the note and its body are separate columns, because the search
 * document weights the name above the body. `title` is the last segment of
 * the path without the `.md` suffix, which is the name a person sees.
 */
export const searchIndex = pgTable(
  'search_index',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    fileId: uuid('file_id').notNull(),
    revisionId: uuid('revision_id').notNull(),
    path: text('path').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.fileId] }),
    foreignKey({
      name: 'search_index_file_fk',
      columns: [table.workspaceId, table.fileId],
      foreignColumns: [files.workspaceId, files.id],
    }),
    foreignKey({
      name: 'search_index_revision_fk',
      columns: [table.workspaceId, table.revisionId],
      foreignColumns: [revisions.workspaceId, revisions.id],
    }),
    // The workspace identifier leads the index, so a search of one workspace
    // never reads the postings of another. `btree_gin` supplies the operator
    // class of the uuid column; the migration installs it.
    //
    // The expression has to stay the same as the one in `notesapp_search`,
    // or the planner cannot use this index for the match.
    index('search_index_document_idx').using(
      'gin',
      table.workspaceId,
      sql`(setweight(to_tsvector('english', ${table.title}), 'A') || setweight(to_tsvector('english', ${table.body}), 'B'))`,
    ),
  ],
);

/** One accepted, path-based link from a live note. */
export const noteLinks = pgTable(
  'note_links',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    sourceFileId: uuid('source_file_id').notNull(),
    sourceRevisionId: uuid('source_revision_id').notNull(),
    sourcePath: text('source_path').notNull(),
    targetPath: text('target_path').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.sourceFileId, table.targetPath],
    }),
    foreignKey({
      name: 'note_links_source_file_fk',
      columns: [table.workspaceId, table.sourceFileId],
      foreignColumns: [files.workspaceId, files.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'note_links_source_revision_fk',
      columns: [table.workspaceId, table.sourceRevisionId],
      foreignColumns: [revisions.workspaceId, revisions.id],
    }).onDelete('cascade'),
    index('note_links_target_idx').on(table.workspaceId, table.targetPath),
  ],
);

/** One unresolved version 0.1.0 reference found by the data migration. */
export const portableMarkdownMigrationReport = pgTable(
  'portable_markdown_migration_report',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sourcePath: text('source_path').notNull(),
    reference: text('reference').notNull(),
    reportedAt: timestamp('reported_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.sourcePath, table.reference],
    }),
  ],
);

/**
 * One published read-only link over a note or a folder.
 *
 * Decision 0030 states the record. The row holds a digest of the opaque token
 * and never the token, so a read of this table opens nothing. The check
 * constraint holds that at the database: the column takes a SHA-256 in lower
 * case hexadecimal and refuses every other shape, including a token.
 *
 * The scope is one note, by its identifier, or one folder, by its stored path.
 * The check constraint keeps exactly one of the two, so no row states both and
 * no row states neither. `revoked_at` and `expires_at` each carry a partial
 * index, so the hourly cleanup finds a dead link without a scan.
 *
 * The workspace reference cascades, so a workspace deletion removes the links
 * of that workspace with it, as it removes the migration report.
 */
export const publications = pgTable(
  'publications',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    id: uuid('id').notNull(),
    /** The account that published the link. The reader path never reads it. */
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id),
    tokenDigest: text('token_digest').notNull(),
    scopeKind: publicationScope('scope_kind').notNull(),
    scopeFileId: uuid('scope_file_id'),
    scopePath: text('scope_path'),
    /** The slow salted hash of the optional password, or null. */
    passwordDigest: text('password_digest'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /**
     * When an administrator took the link down after a report (record 0119).
     * The owner sees it and cannot make the link live again.
     */
    takenDownAt: timestamp('taken_down_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      name: 'publications_scope_file_fk',
      columns: [table.workspaceId, table.scopeFileId],
      foreignColumns: [files.workspaceId, files.id],
    }).onDelete('cascade'),
    // The lookup of every published request. It is unique, so one digest
    // names at most one link and a repeated digest fails the insert instead
    // of making a second link that the lookup cannot tell apart.
    unique('publications_token_key').on(table.tokenDigest),
    index('publications_workspace_idx').on(table.workspaceId, table.createdAt),
    index('publications_scope_file_idx').on(
      table.workspaceId,
      table.scopeFileId,
    ),
    index('publications_expiry_idx')
      .on(table.expiresAt)
      .where(sql`${table.expiresAt} is not null`),
    index('publications_revoked_idx')
      .on(table.revokedAt)
      .where(sql`${table.revokedAt} is not null`),
    check(
      'publications_scope_check',
      sql`(${table.scopeKind} = 'note' and ${table.scopeFileId} is not null and ${table.scopePath} is null)
        or (${table.scopeKind} = 'folder' and ${table.scopePath} is not null and ${table.scopeFileId} is null)`,
    ),
    check(
      'publications_token_digest_check',
      sql`${table.tokenDigest} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

/**
 * One reading ticket of one published link.
 *
 * The unlock answer gives a reader the ticket, and the reader carries it in
 * every published address, as decision 0046 states. The row holds a digest of
 * that ticket and never the ticket, under the same check constraint as the
 * token above.
 *
 * The expiry is stored, so a read never computes a later one. The runtime role
 * holds no UPDATE right on this table, so a read cannot move the expiry even
 * if a caller asked it to, which is the rule of decision 0030.
 */
export const readingTickets = pgTable(
  'reading_tickets',
  {
    ticketDigest: text('ticket_digest').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    publicationId: uuid('publication_id').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: 'reading_tickets_publication_fk',
      columns: [table.workspaceId, table.publicationId],
      foreignColumns: [publications.workspaceId, publications.id],
    }).onDelete('cascade'),
    index('reading_tickets_publication_idx').on(
      table.workspaceId,
      table.publicationId,
    ),
    index('reading_tickets_expiry_idx').on(table.expiresAt),
    check(
      'reading_tickets_digest_check',
      sql`${table.ticketDigest} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

/**
 * One report of a published link (records 0119 and 0123).
 *
 * A reader writes it through one function that takes the digest of the
 * token, and an administrator reads it through another. The runtime role
 * holds no right on the table. The address of the link is sealed with a key
 * of the server, so the row holds no working link.
 */
export const publicationReports = pgTable(
  'publication_reports',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    publicationId: uuid('publication_id').notNull(),
    reason: reportReason('reason').notNull(),
    note: text('note'),
    sealedAddress: text('sealed_address'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: 'publication_reports_publication_fk',
      columns: [table.workspaceId, table.publicationId],
      foreignColumns: [publications.workspaceId, publications.id],
    }).onDelete('cascade'),
    index('publication_reports_open_idx')
      .on(table.createdAt)
      .where(sql`${table.closedAt} is null`),
    index('publication_reports_publication_idx').on(
      table.workspaceId,
      table.publicationId,
    ),
    check(
      'publication_reports_note_check',
      sql`${table.note} is null or char_length(${table.note}) between 1 and 2000`,
    ),
  ],
);

/**
 * Better Auth tables.
 *
 * Better Auth owns the shape of the four tables below. The column names use
 * the field names of the pinned Better Auth configuration, because its Drizzle
 * adapter reads a field through the property of this table object. The table
 * names carry an `auth_` prefix, so the identity tables never collide with the
 * application's own `accounts` table and `user` stays a reserved word that
 * this schema does not use.
 *
 * These tables are not scoped by a workspace. Sign-in has to find a user by an
 * address before any identity exists, so no row policy can narrow them by the
 * account of the transaction. `docs/development/identity.md` records that
 * exception and the table rights that bound it.
 */
export const authUser = pgTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** One browser session of one Better Auth user. */
export const authSession = pgTable(
  'auth_session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('auth_session_user_idx').on(table.userId)],
);

/**
 * One credential or one external identity of a Better Auth user.
 *
 * An external identity is keyed by `issuer` and `account_id`, which are the
 * OpenID Connect issuer and subject. Two identities of different issuers are
 * therefore never the same account, and a matching address alone never joins
 * them.
 */
export const authAccount = pgTable(
  'auth_account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('auth_account_user_idx').on(table.userId),
    unique('auth_account_key').on(
      table.issuer,
      table.providerId,
      table.accountId,
    ),
  ],
);

/** One short lived verification value, for example a password reset token. */
export const authVerification = pgTable(
  'auth_verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('auth_verification_identifier_idx').on(table.identifier)],
);

/**
 * The attempt counters of the rate limit of Better Auth (record 0121).
 *
 * The library keeps its own counters here, so every server process of one
 * installation reads one count. The table belongs to the identity role, like
 * the three tables above it.
 */
export const authRateLimit = pgTable('auth_rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});

/**
 * The attempt counters of the limited routes of this server (record 0121).
 *
 * One row counts the attempts of one key, which names the caller and the
 * group of the route, inside one window. Every server process of an
 * installation counts in this one table, so a limit holds across processes
 * and across a restart. The runtime role writes it through
 * `notesapp_count_attempt` only.
 */
export const attemptCounters = pgTable(
  'attempt_counters',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    windowStartedAt: timestamp('window_started_at', {
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    check('attempt_counters_key_check', sql`char_length(${table.key}) <= 512`),
    index('attempt_counters_window_idx').on(table.windowStartedAt),
  ],
);

/**
 * The digest of each challenge of the proof of work that a sign-up used
 * (record 0115). A row lives until the challenge expires, so one solution
 * makes one account. The runtime role reaches it through two functions only.
 */
export const usedChallenges = pgTable(
  'used_challenges',
  {
    digest: text('digest').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      'used_challenges_digest_check',
      sql`${table.digest} ~ '^[0-9a-f]{64}$'`,
    ),
    index('used_challenges_expiry_idx').on(table.expiresAt),
  ],
);

/**
 * The map from a Better Auth user to an application account.
 *
 * The application identifies an account by a UUID that never changes, so the
 * identity provider can change without rewriting every workspace row. One
 * Better Auth user maps to exactly one account and back.
 */
export const accountIdentities = pgTable('account_identities', {
  authUserId: text('auth_user_id')
    .primaryKey()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id')
    .notNull()
    .unique()
    .references(() => accounts.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A content free record of a protected action of one account.
 *
 * The trail belongs to an account and not to a workspace, so it can hold the
 * record of a workspace deletion and of a password recovery. The first removes
 * every row of the workspace it describes, and the second belongs to no
 * workspace at all.
 */
export const accountAuditEvents = pgTable(
  'account_audit_events',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    action: text('action').notNull(),
    targetKind: text('target_kind').notNull(),
    targetId: uuid('target_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('account_audit_events_account_idx').on(
      table.accountId,
      table.createdAt,
    ),
  ],
);

/**
 * Settings that follow one account to every device.
 *
 * The `theme` column holds the appearance choice: system, light, or dark.
 * It keeps its first name, so no stored row has to move. `theme_family`
 * names a palette family of the client theme registry and is an opaque slug
 * here; the server never holds a colour value. Its default is the family the
 * client also defaults to (record 0056), which this file cannot read, because
 * the registry is browser code. `spell_check` states whether the editor asks
 * the browser to check the spelling of a note (record 0103). Its default is
 * `defaultSpellCheck` of `@notesapp/core`, which SQL cannot read.
 */
/**
 * The legal documents that one account accepted (record 0120): the version
 * of the terms and of the privacy notice, and when. One row for each
 * account, which a new consent replaces. A row belongs to its account and to
 * nobody else.
 */
export const accountConsents = pgTable('account_consents', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  termsVersion: text('terms_version').notNull(),
  privacyVersion: text('privacy_version').notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accountPreferences = pgTable('account_preferences', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id),
  theme: text('theme').notNull().default('system'),
  themeFamily: text('theme_family').notNull().default('default'),
  spellCheck: boolean('spell_check').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * The daily note settings that one member keeps in one workspace.
 *
 * Record 0099 states the settings. A row belongs to one membership, and the
 * membership reference cascades, so a member who leaves takes their settings
 * with them and a workspace deletion, which removes every membership, removes
 * every row. The row policy binds a row to the account of the transaction, so
 * one member never reads the settings of another.
 *
 * The folder and the format are the layout of record 0101. Their defaults are
 * the fixed path of record 0099, so a row written before them keeps its path.
 *
 * The template is a note of the same workspace. A permanent deletion of that
 * note removes its `files` row, and the reference then clears the template
 * column alone. Drizzle states that action as `set null` over both columns,
 * which would clear the workspace as well, so the migration names the one
 * column that the action sets (`ON DELETE SET NULL (template_file_id)`).
 */
export const dailyNoteSettings = pgTable(
  'daily_note_settings',
  {
    workspaceId: uuid('workspace_id').notNull(),
    accountId: uuid('account_id').notNull(),
    templateFileId: uuid('template_file_id'),
    openOnStart: boolean('open_on_start').notNull().default(false),
    /** The folder of the daily notes, or an empty text for the top. */
    folder: text('folder').notNull().default('Daily notes'),
    /** The name format of a daily note, as the tokens of record 0101. */
    format: text('format').notNull().default('YYYY-MM-DD'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.accountId] }),
    foreignKey({
      name: 'daily_note_settings_membership_fk',
      columns: [table.workspaceId, table.accountId],
      foreignColumns: [memberships.workspaceId, memberships.accountId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'daily_note_settings_template_fk',
      columns: [table.workspaceId, table.templateFileId],
      foreignColumns: [files.workspaceId, files.id],
    }).onDelete('set null'),
    index('daily_note_settings_template_idx').on(
      table.workspaceId,
      table.templateFileId,
    ),
    // The contract bounds both texts, and the database holds the same bounds,
    // so no statement can store a layout that no answer could carry.
    check(
      'daily_note_settings_folder_check',
      sql`char_length(${table.folder}) <= 1024`,
    ),
    check(
      'daily_note_settings_format_check',
      sql`char_length(${table.format}) between 1 and 255`,
    ),
  ],
);
