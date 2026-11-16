/**
 * The IndexedDB schema of one browser profile.
 *
 * Every private table is partitioned by the server origin, the account, and
 * the workspace, and every primary key starts with those three parts. One
 * browser profile can hold several accounts of several installations, so a
 * query that forgets a partition part would read another account's notes.
 * Compound keys make that mistake impossible: a range over one partition
 * cannot reach a row of another.
 *
 * Dexie owns the connection, the versioned schema, and the transaction. This
 * module owns the row shapes, the key ranges, and the mapping from a browser
 * failure to a typed `LocalStorageError`.
 */
// The named import is deliberate. The package's default export describes a
// CommonJS module, so a default import would be the module namespace under
// `module: NodeNext` without `esModuleInterop`. The named `Dexie` is the
// constructor, the database type, and the namespace of the static members.
import { Dexie, type DexieOptions, type Table } from 'dexie';
import {
  LocalStorageError,
  type CheckpointRecord,
  type Draft,
  type LocalAcceptedFile,
  type LocalContent,
  type LocalCursor,
  type LocalFileKind,
  type LocalReceipt,
  type Preference,
  type QueueState,
  type RecoveryRecord,
  type StagedSnapshot,
} from '@notesapp/sync';
import type { ChangesetInput } from '@notesapp/core';

/**
 * The stored form of one working copy.
 *
 * `lastCheckpointId` is the parent of the next checkpoint of this working
 * copy. It is storage state rather than editor state, so it stays out of the
 * `Draft` the editor supplies.
 */
export type DraftRow = Draft & {
  readonly serverOrigin: string;
  readonly lastCheckpointId: string | null;
  readonly savedAt: string;
};

/**
 * The stored form of one queued mutation.
 *
 * `sequence` fixes submission order inside one partition. A pending input can
 * advance its expected head when its queued parent is accepted. Once sending
 * starts and the digest is frozen, the input never changes.
 */
export type QueueRow = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly mutationId: string;
  readonly sequence: number;
  readonly input: ChangesetInput;
  readonly state: QueueState;
  readonly digest: string | null;
  readonly errorCode: string | null;
  readonly createdAt: string;
};

/**
 * The stored form of one local checkpoint.
 *
 * `sequence` orders the checkpoints of one partition. Two checkpoints can
 * carry the same client time, so a time alone would not order them.
 */
export type CheckpointRow = CheckpointRecord & { readonly sequence: number };

/** The stored form of the accepted and local knowledge of one file. */
export type FileRow = LocalAcceptedFile;

/** The stored form of one immutable content body. */
export type ContentRow = LocalContent;

/** The stored form of one acknowledgment. */
export type ReceiptRow = LocalReceipt;

/** The stored form of one staged snapshot. Task 11 fills this table. */
export type SnapshotRow = StagedSnapshot;

/**
 * The stored form of one staged snapshot item.
 *
 * One row per captured revision: the file metadata the snapshot pinned and
 * the digest whose body `storeSnapshotRevision` writes to the content table.
 * Activation joins these rows against the staged plan and the stored
 * content, so an incomplete download can never become accepted metadata.
 */
export type SnapshotItemRow = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly token: string;
  readonly revisionId: string;
  readonly fileId: string;
  readonly path: string;
  readonly kind: LocalFileKind;
  readonly deleted: boolean;
  readonly digest: string;
  readonly storedAt: string;
  /**
   * The whole document of the note, or `null` for an attachment revision and
   * for an item that an earlier release stored.
   */
  readonly document: Uint8Array | null;
  /** The generation of that document, or `null` when there is none. */
  readonly epoch: number | null;
  /**
   * When the server accepted the revision, or `null` for an item that an
   * earlier release stored.
   */
  readonly serverTime: string | null;
};

/**
 * The stored form of the single sync worker lease.
 *
 * One row coordinates every tab of this browser profile: the holding owner
 * and the millisecond epoch at which its lease expires. A worker whose lease
 * expired without renewal has failed, so another worker may take over.
 */
export type LeaseRow = {
  readonly key: 'worker';
  readonly ownerId: string;
  readonly expiresAt: number;
};

/** The stored form of one consumed change position. */
export type CursorRow = LocalCursor;

/** The stored form of one setting. */
export type PreferenceRow = Preference;

/** The stored form of one recovery entry. Task 17 fills this table. */
export type RecoveryRow = RecoveryRecord;

/**
 * One Review that waits on this device (record 0087).
 *
 * `sourceId` names what the event keeps: the checkpoint of a merged save, or
 * the kept text of the recovery area. `cursor` is the commit of a merged
 * save, so the saves of one sent batch make one event. A recovery event has
 * none.
 */
export type ReviewRow = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly reviewId: string;
  readonly fileId: string;
  readonly cause: 'merge' | 'recovery';
  readonly sourceId: string;
  readonly cursor: string | null;
  readonly createdAt: string;
};

/**
 * The document of one note on this device (records 0081, 0085).
 *
 * `bytes` is the whole document, which holds the text of the note and the
 * identity of every character. `appliedVector` names the state that the
 * server has of this document, so a save sends the work after it and nothing
 * else. `epoch` is the generation that the two agree on.
 */
export type DocumentRow = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly fileId: string;
  readonly bytes: Uint8Array;
  readonly epoch: number;
  readonly appliedVector: Uint8Array;
  /**
   * The insertions of this device that the server acknowledged and whose
   * accepted work the feed has not brought yet. It only tells a version that
   * this work is not unsent. It never moves `appliedVector` and never shapes
   * the update of a save (record 0085). A row without it, or with `null`,
   * knows nothing more.
   */
  readonly acknowledgedVector?: Uint8Array | null;
};

/**
 * One update of the open editor that waits to be folded into its document.
 *
 * The editor appends the work of each frame here with no decode of the
 * document, so a key reaches the disk at once (record 0175). `epoch` is the
 * generation of the document that the update was written for: a read folds
 * only the updates of the generation of its row, because identities of one
 * generation say nothing about another (record 0084). `updateId` orders
 * nothing and only keeps two updates apart: Yjs applies updates in any order.
 */
export type DocumentUpdateRow = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly fileId: string;
  readonly updateId: string;
  readonly epoch: number;
  readonly bytes: Uint8Array;
};

/**
 * One revision of a save that an earlier release queued (record 0088).
 *
 * A note revision of release 0.4 carries its text and the digest of that text
 * instead of work on the document of the note. The shape is kept exactly as
 * it was stored, so the text reaches placement unchanged.
 */
export type LegacyRevision = {
  readonly id: string;
  readonly fileId: string;
  readonly parents: readonly string[];
  readonly path: string;
  readonly deleted: boolean;
  readonly content:
    | {
        readonly kind: 'markdown';
        readonly digest: string;
        readonly text: string;
      }
    | {
        readonly kind: 'attachment';
        readonly digest: string;
        readonly objectId: string;
      };
  readonly clientTime: string;
  readonly message: string | null;
  readonly restoredFrom: string | null;
};

/**
 * One queued save of an earlier release that waits for placement.
 *
 * `sending` means release 0.4 froze `digest` and may have sent the request, so
 * the engine asks for its receipt before the save changes (record 0084).
 * `conflict` means the server refused it for good, and release 0.4 already
 * kept its text in the recovery area.
 */
export type LegacySaveRow = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly mutationId: string;
  readonly sequence: number;
  readonly deviceId: string;
  readonly expectedHeads: Readonly<Record<string, string | null>>;
  readonly revisions: readonly LegacyRevision[];
  readonly state: 'pending' | 'sending' | 'conflict';
  readonly digest: string | null;
  /** Why the server refused a `conflict` save, or `null`. */
  readonly errorCode: string | null;
  readonly createdAt: string;
};

/**
 * The text of one server revision that earlier work starts from.
 *
 * The mirror keeps only the current head of a file, and the snapshot after the
 * upgrade moves it. The upgrade therefore keeps the text of each head that a
 * moved save or a moved draft names as its parent, while the mirror still
 * knows it.
 */
export type LegacyBaseRow = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly revisionId: string;
  readonly text: string;
};

/** One working copy of an earlier release that waits for placement. */
export type LegacyDraftRow = {
  readonly serverOrigin: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly workingCopyId: string;
  readonly fileId: string;
};

/** Whether the recorded schema change finished. */
export type MigrationState = 'complete' | 'in-progress';

/**
 * The one bookkeeping row of the database.
 *
 * It is not partitioned, because it describes the database itself. It holds no
 * note content and no account identity beyond the device identifier this
 * browser profile uses when it submits a mutation.
 */
export type MetaRow = {
  readonly key: 'database';
  readonly schemaVersion: number;
  readonly migrationState: MigrationState;
  readonly deviceId: string;
};

/** The single key of the bookkeeping row. */
export const metaKey = 'database';

/** Every table of the local database. */
export type Tables = {
  readonly drafts: Table<DraftRow, [string, string, string, string]>;
  readonly checkpoints: Table<CheckpointRow, [string, string, string, string]>;
  readonly contents: Table<ContentRow, [string, string, string, string]>;
  readonly acceptedFiles: Table<FileRow, [string, string, string, string]>;
  readonly queue: Table<QueueRow, [string, string, string, string]>;
  readonly receipts: Table<ReceiptRow, [string, string, string, string]>;
  readonly stagedSnapshots: Table<
    SnapshotRow,
    [string, string, string, string]
  >;
  readonly snapshotItems: Table<
    SnapshotItemRow,
    [string, string, string, string, string]
  >;
  readonly leases: Table<LeaseRow, string>;
  readonly cursors: Table<CursorRow, [string, string, string]>;
  readonly preferences: Table<PreferenceRow, [string, string, string, string]>;
  readonly recovery: Table<RecoveryRow, [string, string, string, string]>;
  readonly meta: Table<MetaRow, string>;
  readonly documents: Table<DocumentRow, [string, string, string, string]>;
  readonly documentUpdates: Table<
    DocumentUpdateRow,
    [string, string, string, string, string]
  >;
  readonly legacySaves: Table<LegacySaveRow, [string, string, string, string]>;
  readonly legacyBases: Table<LegacyBaseRow, [string, string, string, string]>;
  readonly legacyDrafts: Table<
    LegacyDraftRow,
    [string, string, string, string]
  >;
  readonly reviews: Table<ReviewRow, [string, string, string, string]>;
};

/**
 * The schema of each version.
 *
 * A later task adds a version by appending an entry and a migration step in
 * `./migrations.ts`. An entry is never edited once it is released, because a
 * released browser already ran it.
 *
 * Version 2 adds the sync worker lease and the staged snapshot items. Both
 * tables start empty; the migration only revalidates. Version 4 drops the
 * `branches` table of the removed conflict-branch feature. Version 6 holds
 * the work of release 0.4 until it is placed on the documents of version 5
 * (record 0088). Version 7 holds the Reviews of this device (record 0087).
 * Version 8 holds the updates of an open editor that wait to be folded into
 * the document of their note (record 0175). Version 9 keeps, with a parked
 * save, the limit of the grammar that refused its note (record 0182). It
 * changes no index, and its step gives each earlier record no cause.
 * Version 10 names the path that the server holds on each file row (record
 * 0184). Version 11 moves each save off a checkpoint that an earlier release
 * removed (record 0183). Neither changes an index.
 */
export const schemaVersions: readonly {
  readonly version: number;
  /** An index specification, or `null` to delete the store. */
  readonly stores: Readonly<Record<string, string | null>>;
}[] = [
  {
    version: 1,
    stores: {
      drafts:
        '[serverOrigin+accountId+workspaceId+workingCopyId], [serverOrigin+accountId+workspaceId+fileId]',
      checkpoints:
        '[serverOrigin+accountId+workspaceId+revisionId], [serverOrigin+accountId+workspaceId+fileId], [serverOrigin+accountId+workspaceId+mutationId], [serverOrigin+accountId+workspaceId+sequence]',
      contents: '[serverOrigin+accountId+workspaceId+digest]',
      acceptedFiles:
        '[serverOrigin+accountId+workspaceId+fileId], [serverOrigin+accountId+workspaceId+path]',
      branches:
        '[serverOrigin+accountId+workspaceId+branchId], [serverOrigin+accountId+workspaceId+fileId]',
      queue:
        '[serverOrigin+accountId+workspaceId+mutationId], [serverOrigin+accountId+workspaceId+sequence], [serverOrigin+accountId+mutationId]',
      receipts: '[serverOrigin+accountId+workspaceId+mutationId]',
      stagedSnapshots: '[serverOrigin+accountId+workspaceId+token]',
      cursors: '[serverOrigin+accountId+workspaceId]',
      preferences: '[serverOrigin+accountId+workspaceId+name]',
      recovery:
        '[serverOrigin+accountId+workspaceId+recoveryId], [serverOrigin+accountId+workspaceId+createdAt]',
      meta: 'key',
    },
  },
  {
    version: 2,
    stores: {
      drafts:
        '[serverOrigin+accountId+workspaceId+workingCopyId], [serverOrigin+accountId+workspaceId+fileId]',
      checkpoints:
        '[serverOrigin+accountId+workspaceId+revisionId], [serverOrigin+accountId+workspaceId+fileId], [serverOrigin+accountId+workspaceId+mutationId], [serverOrigin+accountId+workspaceId+sequence]',
      contents: '[serverOrigin+accountId+workspaceId+digest]',
      acceptedFiles:
        '[serverOrigin+accountId+workspaceId+fileId], [serverOrigin+accountId+workspaceId+path]',
      branches:
        '[serverOrigin+accountId+workspaceId+branchId], [serverOrigin+accountId+workspaceId+fileId]',
      queue:
        '[serverOrigin+accountId+workspaceId+mutationId], [serverOrigin+accountId+workspaceId+sequence], [serverOrigin+accountId+mutationId]',
      receipts: '[serverOrigin+accountId+workspaceId+mutationId]',
      stagedSnapshots: '[serverOrigin+accountId+workspaceId+token]',
      snapshotItems:
        '[serverOrigin+accountId+workspaceId+token+revisionId], [serverOrigin+accountId+workspaceId+token]',
      leases: 'key',
      cursors: '[serverOrigin+accountId+workspaceId]',
      preferences: '[serverOrigin+accountId+workspaceId+name]',
      recovery:
        '[serverOrigin+accountId+workspaceId+recoveryId], [serverOrigin+accountId+workspaceId+createdAt]',
      meta: 'key',
    },
  },
  {
    version: 3,
    stores: {
      drafts:
        '[serverOrigin+accountId+workspaceId+workingCopyId], [serverOrigin+accountId+workspaceId+fileId]',
      checkpoints:
        '[serverOrigin+accountId+workspaceId+revisionId], [serverOrigin+accountId+workspaceId+fileId], [serverOrigin+accountId+workspaceId+mutationId], [serverOrigin+accountId+workspaceId+sequence]',
      contents: '[serverOrigin+accountId+workspaceId+digest]',
      acceptedFiles:
        '[serverOrigin+accountId+workspaceId+fileId], [serverOrigin+accountId+workspaceId+path]',
      branches:
        '[serverOrigin+accountId+workspaceId+branchId], [serverOrigin+accountId+workspaceId+fileId]',
      queue:
        '[serverOrigin+accountId+workspaceId+mutationId], [serverOrigin+accountId+workspaceId+sequence], [serverOrigin+accountId+mutationId]',
      receipts: '[serverOrigin+accountId+workspaceId+mutationId]',
      stagedSnapshots: '[serverOrigin+accountId+workspaceId+token]',
      snapshotItems:
        '[serverOrigin+accountId+workspaceId+token+revisionId], [serverOrigin+accountId+workspaceId+token]',
      leases: 'key',
      cursors: '[serverOrigin+accountId+workspaceId]',
      preferences: '[serverOrigin+accountId+workspaceId+name]',
      recovery:
        '[serverOrigin+accountId+workspaceId+recoveryId], [serverOrigin+accountId+workspaceId+createdAt]',
      meta: 'key',
    },
  },
  {
    version: 4,
    stores: {
      // `null` deletes the store. The conflict-branch feature left the
      // product, so the table it wrote has no reader and no writer.
      branches: null,
    },
  },
  {
    version: 5,
    stores: {
      // The document of each note on this device (records 0081, 0085). The
      // text of a note now comes from it, and a save sends the work that it
      // holds rather than the whole text.
      documents: '[serverOrigin+accountId+workspaceId+fileId]',
    },
  },
  {
    version: 6,
    stores: {
      // Saves and drafts of release 0.4, and the base texts they start from,
      // until the store places them on the documents of their notes (record
      // 0088).
      legacySaves:
        '[serverOrigin+accountId+workspaceId+mutationId], [serverOrigin+accountId+workspaceId+sequence], [serverOrigin+accountId+mutationId]',
      legacyBases: '[serverOrigin+accountId+workspaceId+revisionId]',
      legacyDrafts: '[serverOrigin+accountId+workspaceId+workingCopyId]',
    },
  },
  {
    version: 7,
    stores: {
      // The Reviews that wait on this device, each with the checkpoint or
      // the kept text that caused it (record 0087).
      reviews:
        '[serverOrigin+accountId+workspaceId+reviewId], [serverOrigin+accountId+workspaceId+fileId]',
    },
  },
  {
    version: 8,
    stores: {
      // The updates of an open editor, one small write for each frame, until
      // the store folds them into the document of their note (record 0175).
      documentUpdates:
        '[serverOrigin+accountId+workspaceId+fileId+updateId], [serverOrigin+accountId+workspaceId+fileId]',
    },
  },
  {
    // A recovery record names the limit of the grammar that refused its
    // note, or none (record 0182). No index changes.
    version: 9,
    stores: {},
  },
  {
    // A file row names the live path that the server holds for it (record
    // 0184). No index changes.
    version: 10,
    stores: {},
  },
  {
    // No save names a checkpoint that an earlier release removed (record
    // 0183). No index changes.
    version: 11,
    stores: {},
  },
];

/** The names of every table, in the order a whole database transaction uses. */
export const tableNames: readonly string[] = [
  'drafts',
  'checkpoints',
  'contents',
  'acceptedFiles',
  'queue',
  'receipts',
  'stagedSnapshots',
  'snapshotItems',
  'leases',
  'cursors',
  'preferences',
  'recovery',
  'meta',
  'documents',
  'documentUpdates',
  'legacySaves',
  'legacyBases',
  'legacyDrafts',
  'reviews',
];

/** The default database name. Tests pass their own to stay isolated. */
export const defaultDatabaseName = 'notesapp';

/** What an opened database offers. */
export type LocalDatabase = {
  readonly db: Dexie;
  readonly tables: Tables;
};

/**
 * Creates the Dexie database and declares every schema version.
 *
 * The IndexedDB factory can be injected, which is how Node tests run this code
 * against `fake-indexeddb`. Dexie reads the global factory when nothing is
 * injected, which is the browser case.
 */
export function createDatabase(
  name: string,
  backend?: {
    readonly indexedDB?: IDBFactory;
    readonly IDBKeyRange?: typeof IDBKeyRange;
  },
): LocalDatabase {
  const options: DexieOptions = { autoOpen: false };
  // `exactOptionalPropertyTypes` forbids an explicit `undefined`, so each
  // injected member is added only when the caller supplied it.
  if (backend?.indexedDB !== undefined) options.indexedDB = backend.indexedDB;
  if (backend?.IDBKeyRange !== undefined)
    options.IDBKeyRange = backend.IDBKeyRange;
  const db = new Dexie(name, options);
  for (const entry of schemaVersions)
    db.version(entry.version).stores(entry.stores);
  const tables: Tables = {
    documents: db.table<DocumentRow, [string, string, string, string]>(
      'documents',
    ),
    documentUpdates: db.table<
      DocumentUpdateRow,
      [string, string, string, string, string]
    >('documentUpdates'),
    drafts: db.table<DraftRow, [string, string, string, string]>('drafts'),
    checkpoints: db.table<CheckpointRow, [string, string, string, string]>(
      'checkpoints',
    ),
    contents: db.table<ContentRow, [string, string, string, string]>(
      'contents',
    ),
    acceptedFiles: db.table<FileRow, [string, string, string, string]>(
      'acceptedFiles',
    ),
    queue: db.table<QueueRow, [string, string, string, string]>('queue'),
    receipts: db.table<ReceiptRow, [string, string, string, string]>(
      'receipts',
    ),
    stagedSnapshots: db.table<SnapshotRow, [string, string, string, string]>(
      'stagedSnapshots',
    ),
    snapshotItems: db.table<
      SnapshotItemRow,
      [string, string, string, string, string]
    >('snapshotItems'),
    leases: db.table<LeaseRow, string>('leases'),
    cursors: db.table<CursorRow, [string, string, string]>('cursors'),
    preferences: db.table<PreferenceRow, [string, string, string, string]>(
      'preferences',
    ),
    recovery: db.table<RecoveryRow, [string, string, string, string]>(
      'recovery',
    ),
    meta: db.table<MetaRow, string>('meta'),
    legacySaves: db.table<LegacySaveRow, [string, string, string, string]>(
      'legacySaves',
    ),
    legacyBases: db.table<LegacyBaseRow, [string, string, string, string]>(
      'legacyBases',
    ),
    legacyDrafts: db.table<LegacyDraftRow, [string, string, string, string]>(
      'legacyDrafts',
    ),
    reviews: db.table<ReviewRow, [string, string, string, string]>('reviews'),
  };
  return { db, tables };
}

/** The lowest and the highest key of one partition, for a range query. */
export function partitionRange(
  serverOrigin: string,
  accountId: string,
  workspaceId: string,
): { readonly lower: unknown[]; readonly upper: unknown[] } {
  return {
    lower: [serverOrigin, accountId, workspaceId, Dexie.minKey],
    upper: [serverOrigin, accountId, workspaceId, Dexie.maxKey],
  };
}

/**
 * The lowest and the highest key of one account, across its workspaces.
 *
 * A read that answers for the whole account uses this with a three part index
 * whose last member is not the workspace, for example the account wide queue
 * index. A read of one workspace uses `partitionRange` instead.
 */
export function accountRange(
  serverOrigin: string,
  accountId: string,
): { readonly lower: unknown[]; readonly upper: unknown[] } {
  return {
    lower: [serverOrigin, accountId, Dexie.minKey],
    upper: [serverOrigin, accountId, Dexie.maxKey],
  };
}

/** The name of a thrown value, for failure classification. */
function errorName(value: unknown): string {
  if (value instanceof Error) return value.name;
  if (typeof value === 'object' && value !== null && 'name' in value) {
    const name: unknown = value.name;
    if (typeof name === 'string') return name;
  }
  return '';
}

/**
 * Maps a browser database failure to a typed local failure.
 *
 * The caller needs the kind, not the vendor's wording: a quota failure asks
 * the user to free space, an abort is a retry, and an unavailable database
 * stops the claim of persistence. The original error travels as the cause, so
 * a diagnostic keeps it, and the message carries no note text.
 */
export function toLocalStorageError(
  value: unknown,
  operation: string,
): LocalStorageError {
  if (value instanceof LocalStorageError) return value;
  const name = errorName(value);
  if (name === 'QuotaExceededError' || name === 'QuotaExceeded')
    return new LocalStorageError('quota', `${operation} ran out of space`, {
      cause: value,
    });
  if (name === 'AbortError' || name === 'TransactionInactiveError')
    return new LocalStorageError('aborted', `${operation} did not commit`, {
      cause: value,
    });
  if (
    name === 'DatabaseClosedError' ||
    name === 'MissingAPIError' ||
    name === 'InvalidStateError' ||
    name === 'NoSuchDatabaseError' ||
    name === 'OpenFailedError' ||
    name === 'UnknownError' ||
    name === 'VersionChangeError'
  )
    return new LocalStorageError(
      'unavailable',
      `${operation} found no usable database`,
      { cause: value },
    );
  if (
    name === 'VersionError' ||
    name === 'SchemaError' ||
    name === 'UpgradeError' ||
    name === 'DataError' ||
    name === 'ConstraintError'
  )
    return new LocalStorageError(
      'corrupt',
      `${operation} found an unreadable database`,
      { cause: value },
    );
  // An unrecognized failure did not commit either. Report the safe kind.
  return new LocalStorageError('aborted', `${operation} failed`, {
    cause: value,
  });
}

/** Runs one database operation and maps every failure to a typed one. */
export async function guard<T>(
  operation: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error: unknown) {
    throw toLocalStorageError(error, operation);
  }
}
