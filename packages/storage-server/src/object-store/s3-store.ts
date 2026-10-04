/**
 * The object store on an S3 compatible service (record 0192).
 *
 * Cloudflare R2, MinIO and AWS all speak this API, and the endpoint names
 * which one answers. The server streams every object itself, so no presigned
 * address leaves it and a revoked published link closes at once (record
 * 0030). An upload in parts is a multipart upload of the service, so any
 * server instance can send the next part.
 *
 * The client sends a checksum only where the API requires one. A service of
 * the S3 API that is not AWS often refuses the newer checksum headers.
 *
 * Each open upload has a marker object, `<key>.upload`, that holds the
 * identifier of the multipart upload on its first line and the declared size
 * on its second. A part finds its upload with one read of
 * the marker, and the daily cleanup finds a stale upload with a listing of
 * objects, which every service answers for a prefix. A listing of the
 * multipart uploads is not needed: MinIO answers it for one exact key only,
 * and a listing costs more than a read. The marker goes when the upload
 * completes or aborts.
 */
import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { exactLength } from './exact-length.ts';
import { isObjectKey, isObjectPrefix } from './keys.ts';
import type {
  ObjectStore,
  PendingUpload,
  StoredObject,
  StoredPart,
} from './port.ts';

/**
 * How long a call to the service may wait.
 *
 * A finalize calls the store while it holds the lock of its workspace, so a
 * call that never answers must end. `connectionMs` bounds the connection,
 * and `idleMs` bounds a gap with no byte in either direction, which ends a
 * call that hangs and still lets a large object stream for as long as it
 * keeps moving. The idle bound is longer than the idle bound of an upload
 * body, so a part that a slow sender feeds ends at the route first.
 */
export type S3Timeouts = {
  readonly connectionMs: number;
  readonly idleMs: number;
};

/** The timeouts of a deployment. */
export const defaultS3Timeouts: S3Timeouts = {
  connectionMs: 5_000,
  idleMs: 30_000,
};

/**
 * The most connections to the service at once.
 *
 * Every image that a reader opens streams through one connection while it
 * lasts. The client of the SDK allows 50, which a few published pages with
 * many images reach, so the pool is larger.
 */
const maxConnections = 256;

/** Where the store is and the key pair that signs each call. */
export type S3StoreSettings = {
  readonly bucket: string;
  readonly region: string;
  /** The address of the service, or `null` for AWS itself. */
  readonly endpoint: string | null;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
};

/** The most keys that one call of DeleteObjects takes. */
const deleteBatch = 1000;

/** A logger of the client that writes nothing. */
const silentLogger = {
  debug: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined,
};

/** The suffix of the marker of an open upload. */
const uploadMarker = '.upload';

/**
 * A body checked against its stated length, and the signal that stops the
 * call that sends it.
 *
 * The HTTP client of the SDK writes a body to the socket and waits for the
 * answer. A body that fails half way leaves that request open until the
 * service gives up, so the failure aborts the call, and the call answers the
 * failure of the body.
 */
function guardedBody(
  body: Readable,
  size: number,
): {
  readonly checked: Readable;
  readonly signal: AbortSignal;
  readonly failure: () => unknown;
} {
  const controller = new AbortController();
  let failure: unknown = null;
  const checked = exactLength(body, size);
  checked.once('error', (error) => {
    failure = error;
    controller.abort();
  });
  return { checked, signal: controller.signal, failure: () => failure };
}

/** Whether the service answered that the object or the upload is not there. */
function isMissing(error: unknown): boolean {
  return (
    error instanceof S3ServiceException &&
    error.$metadata.httpStatusCode === 404
  );
}

function checkedKey(key: string): string {
  if (!isObjectKey(key))
    throw new Error('notesapp: the object key has a shape that no key has.');
  return key;
}

function checkedPrefix(prefix: string): string {
  if (!isObjectPrefix(prefix))
    throw new Error('notesapp: the object prefix has no shape of a key.');
  return prefix;
}

/** Opens the object store on one bucket of an S3 compatible service. */
export function openS3ObjectStore(
  settings: S3StoreSettings,
  timeouts: S3Timeouts = defaultS3Timeouts,
): ObjectStore {
  const client = new S3Client({
    region: settings.region,
    ...(settings.endpoint === null
      ? {}
      : { endpoint: settings.endpoint, forcePathStyle: true }),
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    // The client writes a warning of its own to the console when a body
    // stops, which a stopped part does on purpose. The answer of the route
    // already states that failure, and the server logs through its one
    // module (record 0020), so the client logs nothing.
    logger: silentLogger,
    requestHandler: {
      connectionTimeout: timeouts.connectionMs,
      socketTimeout: timeouts.idleMs,
      httpAgent: { keepAlive: true, maxSockets: maxConnections },
      httpsAgent: { keepAlive: true, maxSockets: maxConnections },
    },
  });
  const Bucket = settings.bucket;

  /** The marker of the open upload of `key`, or `null`. */
  async function markerOf(
    key: string,
  ): Promise<{ readonly uploadId: string; readonly size: number } | null> {
    let text: string;
    try {
      const answer = await client.send(
        new GetObjectCommand({ Bucket, Key: `${key}${uploadMarker}` }),
      );
      text = (await answer.Body?.transformToString()) ?? '';
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    const [uploadId = '', size = ''] = text.split('\n');
    if (uploadId === '' || !/^[0-9]{1,16}$/.test(size))
      throw new Error('notesapp: the marker of an upload has no shape.');
    return { uploadId, size: Number(size) };
  }

  /** The identifier of the open upload of `key`, from its marker, or `null`. */
  async function uploadIdOf(key: string): Promise<string | null> {
    return (await markerOf(key))?.uploadId ?? null;
  }

  /** Every part of one open upload, with the tag that completes it. */
  async function partsOf(
    key: string,
    uploadId: string,
  ): Promise<readonly StoredPart[]> {
    const parts: StoredPart[] = [];
    let marker: string | undefined;
    for (;;) {
      const page = await client.send(
        new ListPartsCommand({
          Bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker,
        }),
      );
      for (const part of page.Parts ?? [])
        if (part.PartNumber !== undefined && part.ETag !== undefined)
          parts.push({
            partNumber: part.PartNumber,
            size: part.Size ?? 0,
            tag: part.ETag,
          });
      if (page.IsTruncated !== true)
        return parts.sort((a, b) => a.partNumber - b.partNumber);
      marker = page.NextPartNumberMarker;
    }
  }

  async function* objectsUnder(prefix: string): AsyncGenerator<StoredObject> {
    let token: string | undefined;
    for (;;) {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const item of page.Contents ?? [])
        if (item.Key !== undefined)
          yield { key: item.Key, modifiedAt: item.LastModified ?? new Date(0) };
      if (page.IsTruncated !== true || page.NextContinuationToken === undefined)
        return;
      token = page.NextContinuationToken;
    }
  }

  async function removeKeys(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    const answer = await client.send(
      new DeleteObjectsCommand({
        Bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if ((answer.Errors ?? []).length > 0)
      throw new Error('notesapp: the object store kept objects to remove.');
  }

  async function sizeOf(key: string): Promise<number | null> {
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket, Key: checkedKey(key) }),
      );
      return head.ContentLength ?? 0;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  return {
    kind: 's3',

    async write(key, body, size) {
      const guarded = guardedBody(body, size);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket,
            Key: checkedKey(key),
            Body: guarded.checked,
            ContentLength: size,
          }),
          { abortSignal: guarded.signal },
        );
      } catch (error) {
        throw guarded.failure() ?? error;
      }
    },

    async read(key) {
      try {
        const answer = await client.send(
          new GetObjectCommand({ Bucket, Key: checkedKey(key) }),
        );
        const body = answer.Body;
        if (body instanceof Readable) return body;
        throw new Error('notesapp: the object store answered no stream.');
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },

    size: sizeOf,

    async promote(from, to) {
      checkedKey(from);
      if ((await sizeOf(to)) === null) {
        try {
          await client.send(
            new CopyObjectCommand({
              Bucket,
              Key: to,
              CopySource: `${Bucket}/${from}`,
            }),
          );
        } catch (error) {
          if (isMissing(error)) return false;
          throw error;
        }
      }
      await client.send(new DeleteObjectCommand({ Bucket, Key: from }));
      return true;
    },

    async remove(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket, Key: checkedKey(key) }),
      );
    },

    async removePrefix(prefix) {
      let batch: string[] = [];
      for await (const item of objectsUnder(checkedPrefix(prefix))) {
        batch.push(item.key);
        if (batch.length === deleteBatch) {
          await removeKeys(batch);
          batch = [];
        }
      }
      await removeKeys(batch);
    },

    list(prefix) {
      return objectsUnder(checkedPrefix(prefix));
    },

    async declaredSize(key) {
      return (await markerOf(checkedKey(key)))?.size ?? null;
    },

    async startUpload(key, size) {
      const created = await client.send(
        new CreateMultipartUploadCommand({ Bucket, Key: checkedKey(key) }),
      );
      const identifier = created.UploadId;
      if (identifier === undefined || identifier === '')
        throw new Error('notesapp: the object store started no upload.');
      const marker = `${identifier}\n${String(size)}`;
      try {
        await client.send(
          new PutObjectCommand({
            Bucket,
            Key: `${key}${uploadMarker}`,
            Body: marker,
            ContentLength: Buffer.byteLength(marker),
          }),
        );
      } catch (error) {
        // An upload with no marker is one that nothing finds again, so it
        // goes at once.
        await client
          .send(
            new AbortMultipartUploadCommand({
              Bucket,
              Key: key,
              UploadId: identifier,
            }),
          )
          .catch(() => undefined);
        throw error;
      }
    },

    async writePart(key, partNumber, body, size) {
      const guarded = guardedBody(body, size);
      try {
        const uploadId = await uploadIdOf(checkedKey(key));
        if (uploadId === null) {
          guarded.checked.destroy();
          return false;
        }
        await client.send(
          new UploadPartCommand({
            Bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
            Body: guarded.checked,
            ContentLength: size,
          }),
          { abortSignal: guarded.signal },
        );
        return true;
      } catch (error) {
        const failure = guarded.failure();
        if (failure !== null) throw failure;
        // The service removed the upload itself, for example by a rule of
        // its own for an upload that waits too long.
        if (isMissing(error)) return false;
        throw error;
      }
    },

    async listParts(key) {
      const uploadId = await uploadIdOf(checkedKey(key));
      if (uploadId === null) return null;
      try {
        return await partsOf(key, uploadId);
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },

    async completeUpload(key, parts) {
      const uploadId = await uploadIdOf(checkedKey(key));
      if (uploadId === null) return 'missing';
      try {
        // The service joins exactly these writes of the parts. A part sent
        // again has another tag, which the service refuses.
        await client.send(
          new CompleteMultipartUploadCommand({
            Bucket,
            Key: key,
            UploadId: uploadId,
            MultipartUpload: {
              Parts: [...parts]
                .sort((a, b) => a.partNumber - b.partNumber)
                .map((part) => ({
                  PartNumber: part.partNumber,
                  ETag: part.tag,
                })),
            },
          }),
        );
      } catch (error) {
        if (isMissing(error)) return 'missing';
        if (error instanceof S3ServiceException && error.name === 'InvalidPart')
          return 'changed';
        throw error;
      }
      await client.send(
        new DeleteObjectCommand({ Bucket, Key: `${key}${uploadMarker}` }),
      );
      return 'completed';
    },

    async abortUpload(key) {
      const uploadId = await uploadIdOf(checkedKey(key));
      if (uploadId !== null) {
        try {
          await client.send(
            new AbortMultipartUploadCommand({
              Bucket,
              Key: key,
              UploadId: uploadId,
            }),
          );
        } catch (error) {
          if (!isMissing(error)) throw error;
        }
      }
      await client.send(
        new DeleteObjectCommand({ Bucket, Key: `${key}${uploadMarker}` }),
      );
    },

    async *listUploads(prefix): AsyncGenerator<PendingUpload> {
      for await (const item of objectsUnder(checkedPrefix(prefix)))
        if (item.key.endsWith(uploadMarker))
          yield {
            key: item.key.slice(0, -uploadMarker.length),
            startedAt: item.modifiedAt,
          };
    },

    async probe() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
        return true;
      } catch {
        return false;
      }
    },

    room() {
      return Promise.resolve(null);
    },

    close() {
      client.destroy();
    },
  };
}
