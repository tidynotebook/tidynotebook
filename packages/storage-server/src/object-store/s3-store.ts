/**
 * The object store on an S3 compatible service (record 0192).
 *
 * Cloudflare R2, MinIO and AWS all speak this API, and the endpoint names
 * which one answers. The server streams every object itself, so no presigned
 * address leaves it and a revoked published link closes at once (record
 * 0030). An upload in parts is a multipart upload of the service, found by
 * its key, so any server instance can send the next part.
 *
 * The client sends a checksum only where the API requires one. A service of
 * the S3 API that is not AWS often refuses the newer checksum headers.
 *
 * MinIO lists the open uploads of one exact key only, so each upload also
 * writes a marker object, `<key>.upload`, that a listing of a prefix finds
 * in every service. The marker goes when the upload completes or aborts.
 */
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
  ListMultipartUploadsCommand,
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
export function openS3ObjectStore(settings: S3StoreSettings): ObjectStore {
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
  });
  const Bucket = settings.bucket;

  /** Every open upload whose key starts with `prefix`, with its identifier. */
  async function* uploadsUnder(
    prefix: string,
  ): AsyncGenerator<PendingUpload & { readonly uploadId: string }> {
    let keyMarker: string | undefined;
    let uploadIdMarker: string | undefined;
    for (;;) {
      const page = await client.send(
        new ListMultipartUploadsCommand({
          Bucket,
          Prefix: prefix,
          KeyMarker: keyMarker,
          UploadIdMarker: uploadIdMarker,
        }),
      );
      for (const upload of page.Uploads ?? [])
        if (upload.Key !== undefined && upload.UploadId !== undefined)
          yield {
            key: upload.Key,
            uploadId: upload.UploadId,
            startedAt: upload.Initiated ?? new Date(0),
          };
      if (page.IsTruncated !== true) return;
      keyMarker = page.NextKeyMarker;
      uploadIdMarker = page.NextUploadIdMarker;
    }
  }

  /** The newest open upload of exactly `key`, or `null`. */
  async function uploadIdOf(key: string): Promise<string | null> {
    let found: { id: string; at: number } | null = null;
    for await (const upload of uploadsUnder(key)) {
      if (upload.key !== key) continue;
      const at = upload.startedAt.getTime();
      if (found === null || at >= found.at) found = { id: upload.uploadId, at };
    }
    return found?.id ?? null;
  }

  /** Every part of one open upload, with the tag that completes it. */
  async function partsOf(
    key: string,
    uploadId: string,
  ): Promise<readonly (StoredPart & { readonly tag: string })[]> {
    const parts: (StoredPart & { readonly tag: string })[] = [];
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

    async startUpload(key) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: `${checkedKey(key)}${uploadMarker}`,
          Body: '',
          ContentLength: 0,
        }),
      );
      await client.send(new CreateMultipartUploadCommand({ Bucket, Key: key }));
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
        throw guarded.failure() ?? error;
      }
    },

    async listParts(key) {
      const uploadId = await uploadIdOf(checkedKey(key));
      if (uploadId === null) return null;
      return (await partsOf(key, uploadId)).map(({ partNumber, size }) => ({
        partNumber,
        size,
      }));
    },

    async completeUpload(key) {
      const uploadId = await uploadIdOf(checkedKey(key));
      if (uploadId === null) return false;
      const parts = await partsOf(key, uploadId);
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts.map((part) => ({
              PartNumber: part.partNumber,
              ETag: part.tag,
            })),
          },
        }),
      );
      await client.send(
        new DeleteObjectCommand({ Bucket, Key: `${key}${uploadMarker}` }),
      );
      return true;
    },

    async abortUpload(key) {
      const open: string[] = [];
      for await (const upload of uploadsUnder(checkedKey(key)))
        if (upload.key === key) open.push(upload.uploadId);
      for (const uploadId of open) {
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

    close() {
      client.destroy();
    },
  };
}
