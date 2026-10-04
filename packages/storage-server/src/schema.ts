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
  date,
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
 * A PostgreSQL text search vector.
 *
 * The database writes it from other columns, so the application never reads
 * or writes it and the type carries no conversion.
 */
const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
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

/** Whether an account uses every operation or a fixed list (record 0189). */
export const accountStanding = pgEnum('account_standing', ['active', 'locked']);

/** What happened to an account, for the operator API (record 0190). */
export const accountEventKind = pgEnum('account_event_kind', [
  'made',
  'verified',
  'removed',
]);

/** Who can make an account (record 0108). */
/** How the connection to the mail server is protected (record 0148). */
export const mailSecurity = pgEnum('mail_security', [
  'tls',
  'starttls',
  'none',
]);

/** The source of one legal document (record 0148). */
export const legalDocumentKind = pgEnum('legal_document_kind', [
  'text',
  'address',
]);

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
 *
 * The controls of record 0189 live here too: the text limit, the published
 * transfer and download limits of one month, the standing, the removal time
 * of a locked account, and one switch for each switchable feature. A null
 * limit is no limit. `controls_revision` rises on each change of a control,
 * and a write names the revision that it read. `removal_notices` counts the
 * mails that went before the removal time (record 0201), and a new removal
 * time sets it back to zero.
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
    textLimitBytes: bigint('text_limit_bytes', { mode: 'bigint' }),
    publishedTransferLimitBytes: bigint('published_transfer_limit_bytes', {
      mode: 'bigint',
    }),
    downloadLimitBytes: bigint('download_limit_bytes', { mode: 'bigint' }),
    standing: accountStanding('standing').notNull().default('active'),
    removalAt: timestamp('removal_at', { withTimezone: true }),
    removalNotices: integer('removal_notices').notNull().default(0),
    teams: boolean('teams').notNull().default(true),
    collaboration: boolean('collaboration').notNull().default(true),
    controlsRevision: bigint('controls_revision', { mode: 'bigint' })
      .notNull()
      .default(sql`1`),
  },
  (table) => [
    check('accounts_limit_bytes_check', sql`${table.limitBytes} > 0`),
    check(
      'accounts_text_limit_bytes_check',
      sql`${table.textLimitBytes} is null or ${table.textLimitBytes} > 0`,
    ),
    check(
      'accounts_published_transfer_limit_bytes_check',
      sql`${table.publishedTransferLimitBytes} is null or ${table.publishedTransferLimitBytes} > 0`,
    ),
    check(
      'accounts_download_limit_bytes_check',
      sql`${table.downloadLimitBytes} is null or ${table.downloadLimitBytes} > 0`,
    ),
    check(
      'accounts_removal_at_check',
      sql`${table.removalAt} is null or ${table.standing} = 'locked'`,
    ),
    check(
      'accounts_removal_notices_check',
      sql`${table.removalNotices} between 0 and 2`,
    ),
    check(
      'accounts_controls_revision_check',
      sql`${table.controlsRevision} > 0`,
    ),
    index('accounts_administrator_idx').on(table.installationRole, table.state),
    index('accounts_removal_idx').on(table.removalAt),
  ],
);

/**
 * One event of an account, which the operator API lists after a cursor
 * (record 0190).
 *
 * The cursor is allocated under one lock that the writer holds until it
 * commits, so the cursors follow the order of the commits and a reader that
 * continues after the last cursor that it read misses no event. The runtime
 * role reaches the table through functions only.
 */
export const accountEvents = pgTable(
  'account_events',
  {
    cursor: bigint('cursor', { mode: 'bigint' }).primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    kind: accountEventKind('kind').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check('account_events_cursor_check', sql`${table.cursor} > 0`)],
);

/**
 * One portal handoff of record 0190: the digest of a single-use token that
 * expires after 60 seconds. The token itself is never at rest.
 */
export const accountHandoffs = pgTable(
  'account_handoffs',
  {
    tokenDigest: text('token_digest').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'account_handoffs_token_digest_check',
      sql`${table.tokenDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    index('account_handoffs_expiry_idx').on(table.expiresAt),
  ],
);

/**
 * The counts of one calendar month in UTC, for each account and for the
 * installation (record 0193). The row of the installation has no account.
 *
 * Each process adds its counts in memory and writes them here, and a check
 * reads the stored total of the month. Plan 019 item 9 adds the counting and
 * the flush; until then nothing writes a row, and every total reads zero.
 */
export const monthlyUsage = pgTable(
  'monthly_usage',
  {
    month: date('month').notNull(),
    accountId: uuid('account_id').references(() => accounts.id),
    publishedTransferBytes: bigint('published_transfer_bytes', {
      mode: 'bigint',
    })
      .notNull()
      .default(sql`0`),
    downloadBytes: bigint('download_bytes', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    objectWrites: bigint('object_writes', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    objectReads: bigint('object_reads', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
  },
  (table) => [
    unique('monthly_usage_month_account_unique')
      .on(table.month, table.accountId)
      .nullsNotDistinct(),
    check(
      'monthly_usage_month_check',
      sql`extract(day from ${table.month}) = 1`,
    ),
    check(
      'monthly_usage_counts_check',
      sql`${table.publishedTransferBytes} >= 0 and ${table.downloadBytes} >= 0 and ${table.objectWrites} >= 0 and ${table.objectReads} >= 0`,
    ),
  ],
);

/**
 * The one row of the settings of the installation.
 *
 * The primary key is a boolean that a check holds true, so the table can hold
 * one row and no second. The registration policy lives here and not in the
 * environment, so the registration function reads it in its own transaction
 * (record 0108).
 *
 * The mail transport and the two legal documents that an administrator sets
 * live here too (record 0148). A group is whole or absent, which the checks
 * hold. The password of the mail server is sealed by the server, so the row
 * holds no password that a read of the database opens.
 */
export const installationSettings = pgTable(
  'installation_settings',
  {
    id: boolean('id').primaryKey().default(true),
    registrationPolicy: registrationPolicy('registration_policy')
      .notNull()
      .default('invitation'),
    mailHost: text('mail_host'),
    mailPort: integer('mail_port'),
    mailSecurity: mailSecurity('mail_security'),
    mailUsername: text('mail_username'),
    mailPasswordSealed: text('mail_password_sealed'),
    mailSender: text('mail_sender'),
    termsKind: legalDocumentKind('terms_kind'),
    termsText: text('terms_text'),
    termsUrl: text('terms_url'),
    termsVersion: text('terms_version'),
    privacyKind: legalDocumentKind('privacy_kind'),
    privacyText: text('privacy_text'),
    privacyUrl: text('privacy_url'),
    privacyVersion: text('privacy_version'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('installation_settings_one_row', sql`${table.id}`),
    check(
      'installation_settings_mail_check',
      sql`(${table.mailHost} is null and ${table.mailPort} is null and ${table.mailSecurity} is null and ${table.mailUsername} is null and ${table.mailPasswordSealed} is null and ${table.mailSender} is null) or coalesce((char_length(${table.mailHost}) between 1 and 253 and ${table.mailPort} between 1 and 65535 and ${table.mailSecurity} is not null and char_length(${table.mailSender}) between 3 and 320 and (${table.mailUsername} is null or char_length(${table.mailUsername}) between 1 and 320) and (${table.mailPasswordSealed} is null or ${table.mailUsername} is not null)), false)`,
    ),
    check(
      'installation_settings_terms_check',
      sql`(${table.termsKind} is null and ${table.termsText} is null and ${table.termsUrl} is null and ${table.termsVersion} is null) or coalesce((char_length(${table.termsVersion}) between 1 and 64 and ((${table.termsKind} = 'text' and ${table.termsUrl} is null and octet_length(${table.termsText}) between 1 and 262144) or (${table.termsKind} = 'address' and ${table.termsText} is null and ${table.termsUrl} ~ '^https?://' and char_length(${table.termsUrl}) <= 2048))), false)`,
    ),
    check(
      'installation_settings_privacy_check',
      sql`(${table.privacyKind} is null and ${table.privacyText} is null and ${table.privacyUrl} is null and ${table.privacyVersion} is null) or coalesce((char_length(${table.privacyVersion}) between 1 and 64 and ((${table.privacyKind} = 'text' and ${table.privacyUrl} is null and octet_length(${table.privacyText}) between 1 and 262144) or (${table.privacyKind} = 'address' and ${table.privacyText} is null and ${table.privacyUrl} ~ '^https?://' and char_length(${table.privacyUrl}) <= 2048))), false)`,
    ),
  ],
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
 * `text_bytes` is the part of `bytes_used` that is text and history, which
 * PostgreSQL holds, so the text limit of record 0189 checks it apart from
 * the bytes of the attachments.
 */
export const workspaceUsage = pgTable(
  'workspace_usage',
  {
    workspaceId: uuid('workspace_id')
      .primaryKey()
      .references(() => workspaces.id),
    bytesUsed: bigint('bytes_used', { mode: 'bigint' }).notNull(),
    textBytes: bigint('text_bytes', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
  },
  (table) => [
    check(
      'workspace_usage_text_bytes_check',
      sql`${table.textBytes} >= 0 and ${table.textBytes} <= ${table.bytesUsed}`,
    ),
  ],
);

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
    // The readable text of the note, from `readableText` of
    // `@notesapp/markdown`: the words a reader sees, with no mark and no link
    // address (record 0167).
    body: text('body').notNull(),
    // The version of the rule that made `body`. A row of an earlier rule is
    // made again by `src/search-index-migration.ts`, so a change of the rule
    // reaches every note and not only the notes that a person saves again.
    textRule: integer('text_rule').notNull().default(0),
    // The weighted vector of the title and the body, stored when the row is
    // written. A search matches, ranks and tests the title on it, so no
    // query parses the text of every match again (issue 207). The one text
    // configuration of record 0167 has no language rule and no accent, and
    // the search function names the same one.
    document: tsvector('document')
      .notNull()
      .generatedAlwaysAs(
        sql`setweight(to_tsvector('public.notesapp_text'::regconfig, title), 'A') || setweight(to_tsvector('public.notesapp_text'::regconfig, body), 'B')`,
      ),
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
    index('search_index_document_idx').using(
      'gin',
      table.workspaceId,
      table.document,
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
 * An identity is keyed by `provider_id` and `account_id`, which is the key
 * that Better Auth writes (record 0135). A matching address alone never joins
 * two identities.
 */
export const authAccount = pgTable(
  'auth_account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
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
    unique('auth_account_key').on(table.providerId, table.accountId),
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
 * One open notice stream of one account, in any server process (record 0129).
 *
 * A gateway renews its row while the stream is open and deletes it when the
 * stream closes. A process that stops without that leaves a row that expires,
 * so a limit per account holds across processes and across a crash.
 */
export const streamReservations = pgTable(
  'stream_reservations',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('stream_reservations_account_idx').on(table.accountId),
    index('stream_reservations_expiry_idx').on(table.expiresAt),
  ],
);

/**
 * The import and export jobs that run now, across every process (record 0170).
 *
 * An archive job holds one row while it runs and renews its expiry, so a
 * process that stops leaves a row that expires. The functions of migration
 * 0028 count the rows of an account and of the installation under one lock.
 * `disk_bytes` is the most that the job may write to the storage volume, so
 * the next import counts the room that the running ones may still take
 * (migration 0029).
 */
export const archiveJobs = pgTable(
  'archive_jobs',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    diskBytes: bigint('disk_bytes', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
  },
  (table) => [
    index('archive_jobs_account_idx').on(table.accountId),
    index('archive_jobs_expiry_idx').on(table.expiresAt),
    check('archive_jobs_disk_bytes_check', sql`${table.diskBytes} >= 0`),
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
 * The themes that one account imported (record 0143).
 *
 * `palettes` holds a `light` palette, a `dark` palette or both, each with
 * the `tokens` and the `syntax` colours of the client theme registry. The
 * server keeps them as data and never paints them. A row hangs from the
 * settings of its account, so the removal of an account, which deletes its
 * settings, deletes its themes too. The row policy binds a row to the account
 * of the transaction.
 */
export const accountThemes = pgTable(
  'account_themes',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountPreferences.accountId, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    palettes: jsonb('palettes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('account_themes_account_idx').on(table.accountId, table.createdAt),
    check(
      'account_themes_name_check',
      sql`char_length(${table.name}) between 1 and 60`,
    ),
    check(
      'account_themes_palettes_check',
      sql`jsonb_typeof(${table.palettes}) = 'object' and (${table.palettes} ? 'light' or ${table.palettes} ? 'dark') and octet_length(${table.palettes}::text) <= 16384`,
    ),
  ],
);

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

/**
 * The template settings that one member keeps in one workspace.
 *
 * Record 0149 states the settings: the folder whose notes are the templates
 * that the palette inserts. A row belongs to one membership, as a row of
 * `daily_note_settings` does, and the membership reference cascades, so a
 * member who leaves takes their settings with them and a workspace deletion
 * removes every row. The row policy binds a row to the account of the
 * transaction, so one member never reads the settings of another.
 *
 * The folder names no row of `files`: a folder holds no state of its own, so
 * a rename of the folder leaves the setting where it was, as a rename of the
 * daily note folder does.
 */
export const templateSettings = pgTable(
  'template_settings',
  {
    workspaceId: uuid('workspace_id').notNull(),
    accountId: uuid('account_id').notNull(),
    /** The folder whose notes are the templates. */
    folder: text('folder').notNull().default('Templates'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.accountId] }),
    foreignKey({
      name: 'template_settings_membership_fk',
      columns: [table.workspaceId, table.accountId],
      foreignColumns: [memberships.workspaceId, memberships.accountId],
    }).onDelete('cascade'),
    // The contract bounds the folder, and the database holds the same bounds,
    // so no statement can store a folder that no answer could carry.
    check(
      'template_settings_folder_check',
      sql`char_length(${table.folder}) between 1 and 1024`,
    ),
  ],
);
