/**
 * The one port of every byte that outlives one request (record 0192).
 *
 * A finished attachment, the staged bytes of an upload that a second request
 * finalizes, and the parts of an import all live behind this port, so any
 * server instance of an installation reads what another one wrote. Two
 * adapters implement it: `file-store.ts`, the directory of
 * `NOTESAPP_STORAGE_ROOT`, and `s3-store.ts`, an S3 compatible store such as
 * Cloudflare R2, MinIO or AWS.
 *
 * A key is a relative path of lower case segments, built by `keys.ts` only.
 * The key of a finished attachment is the relative path that the file store
 * uses, so an installation moves between the two adapters by copying files.
 */
import type { Readable } from 'node:stream';

/** One object of the store and when it was last written. */
export type StoredObject = {
  readonly key: string;
  readonly modifiedAt: Date;
};

/** One upload in parts that nobody completed or aborted yet. */
export type PendingUpload = {
  readonly key: string;
  readonly startedAt: Date;
};

/** One part of an upload that the store holds. */
export type StoredPart = {
  readonly partNumber: number;
  readonly size: number;
  /**
   * What names this one write of the part: the entity tag of an S3 store,
   * the size and the time of the file of a file store. A part sent again
   * has another tag.
   */
  readonly tag: string;
};

/** What a completion of an upload did. */
export type UploadCompletion =
  /** The parts are one object at the key of the upload now. */
  | 'completed'
  /** No upload of the key is open. */
  | 'missing'
  /** A part is not the part that the caller checked: it was sent again. */
  | 'changed';

/** Which adapter answers. */
export type ObjectStoreKind = 'filesystem' | 's3';

export type ObjectStore = {
  readonly kind: ObjectStoreKind;

  /**
   * Writes the whole object at `key` from a body of exactly `size` bytes.
   *
   * A body that ends early or runs long is refused, and the store keeps no
   * part of it. An object that is already there is replaced.
   */
  write(key: string, body: Readable, size: number): Promise<void>;

  /** A stream of the object, or `null` when the store holds none. */
  read(key: string): Promise<Readable | null>;

  /** The bytes of the object, or `null` when the store holds none. */
  size(key: string): Promise<number | null>;

  /**
   * Moves the object at `from` to `to`.
   *
   * When `to` already holds an object, that object stays and `from` goes,
   * because a key of a finished attachment names its digest. Answers whether
   * `to` holds an object afterwards.
   */
  promote(from: string, to: string): Promise<boolean>;

  /** Removes one object. An object that is not there needs no removal. */
  remove(key: string): Promise<void>;

  /** Removes every object whose key starts with `prefix`. */
  removePrefix(prefix: string): Promise<void>;

  /** Every object whose key starts with `prefix`, in no stated order. */
  list(prefix: string): AsyncIterable<StoredObject>;

  /**
   * Starts an upload in parts that completes into the object at `key`, and
   * keeps `size`, the bytes that the whole object declares, with it.
   */
  startUpload(key: string, size: number): Promise<void>;

  /**
   * The size that the open upload of `key` declared at its start, or `null`
   * when no upload of `key` is open.
   */
  declaredSize(key: string): Promise<number | null>;

  /**
   * Writes one part of the upload of `key` from a body of exactly `size`
   * bytes. A part of the same number is replaced. Answers `false`, and reads
   * no byte of the body, when no upload of `key` is open.
   */
  writePart(
    key: string,
    partNumber: number,
    body: Readable,
    size: number,
  ): Promise<boolean>;

  /** The parts of the open upload of `key`, or `null` when none is open. */
  listParts(key: string): Promise<readonly StoredPart[] | null>;

  /**
   * Joins exactly `parts`, which the caller read with `listParts` and
   * checked, in the order of their numbers, into the object at `key`. A part
   * that another write replaced since then answers `changed` and joins
   * nothing. The parts stay until the object is whole.
   */
  completeUpload(
    key: string,
    parts: readonly StoredPart[],
  ): Promise<UploadCompletion>;

  /** Removes the open upload of `key` and its parts, when there is one. */
  abortUpload(key: string): Promise<void>;

  /** Every open upload whose key starts with `prefix`. */
  listUploads(prefix: string): AsyncIterable<PendingUpload>;

  /** Whether the store answers a read and takes a write now. */
  probe(): Promise<boolean>;

  /**
   * The bytes that the store can still take, or `null` when the store states
   * no bound. The file store answers the free space of its volume, which
   * every other file of the server shares.
   */
  room(): Promise<number | null>;

  /** Closes the connections of the store, when it holds any. */
  close(): void;
};
