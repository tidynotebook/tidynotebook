/**
 * A disposable bucket of the test MinIO service (record 0192).
 *
 * `tools/test-database/ensure-minio.sh` starts the service of
 * `compose.test.yaml` on port 59000, and `pnpm test:integration` runs it
 * first. Each test file makes a bucket of its own with a random name and
 * removes it, so the files of several worktrees share the one service, as
 * they share PostgreSQL.
 */
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import {
  AbortMultipartUploadCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  openS3ObjectStore,
  type ObjectStore,
  type S3StoreSettings,
} from '@notesapp/storage-server';

/** The address of the test MinIO service. */
export const testS3Endpoint =
  process.env['NOTESAPP_TEST_S3_ENDPOINT'] ?? 'http://127.0.0.1:59000';

/** The key pair of the test service, from `compose.test.yaml`. */
const testKeys = {
  accessKeyId: 'notesapp',
  secretAccessKey: 'notesapp_test_secret',
} as const;

/** One bucket of the test service and the call that removes it. */
export type TestBucket = {
  readonly settings: S3StoreSettings;
  /** A store on the bucket, which `destroy` closes. */
  readonly store: ObjectStore;
  /**
   * The settings of a server on this bucket, with the two files of the key
   * pair written to a folder that `destroy` removes.
   */
  readonly environment: Readonly<Record<string, string>>;
  /**
   * Aborts the multipart uploads of one key and leaves their marker, as a
   * rule of the service that ends a stale upload does.
   */
  abortBehindTheStore(key: string): Promise<void>;
  /** Removes every upload, every object, the bucket and the key files. */
  destroy(): Promise<void>;
};

/** Makes a bucket of its own on the test service. */
export async function createTestBucket(): Promise<TestBucket> {
  const settings: S3StoreSettings = {
    bucket: `notesapp-test-${randomBytes(8).toString('hex')}`,
    region: 'us-east-1',
    endpoint: testS3Endpoint,
    ...testKeys,
  };
  const client = new S3Client({
    region: settings.region,
    endpoint: testS3Endpoint,
    forcePathStyle: true,
    credentials: testKeys,
  });
  await client.send(new CreateBucketCommand({ Bucket: settings.bucket }));
  const keys = await mkdtemp(join(tmpdir(), 'notesapp-s3-keys-'));
  await writeFile(join(keys, 'access_key_id'), `${testKeys.accessKeyId}\n`);
  await writeFile(
    join(keys, 'secret_access_key'),
    `${testKeys.secretAccessKey}\n`,
  );
  const store = openS3ObjectStore(settings);
  return {
    settings,
    store,
    environment: {
      NOTESAPP_OBJECT_STORE: 's3',
      NOTESAPP_S3_BUCKET: settings.bucket,
      NOTESAPP_S3_REGION: settings.region,
      NOTESAPP_S3_ENDPOINT: testS3Endpoint,
      NOTESAPP_S3_ACCESS_KEY_ID_FILE: join(keys, 'access_key_id'),
      NOTESAPP_S3_SECRET_ACCESS_KEY_FILE: join(keys, 'secret_access_key'),
    },
    abortBehindTheStore: async (key) => {
      const uploads = await client.send(
        new ListMultipartUploadsCommand({
          Bucket: settings.bucket,
          Prefix: key,
        }),
      );
      for (const upload of uploads.Uploads ?? [])
        await client.send(
          new AbortMultipartUploadCommand({
            Bucket: settings.bucket,
            Key: upload.Key,
            UploadId: upload.UploadId,
          }),
        );
    },
    destroy: async () => {
      store.close();
      try {
        const uploads = await client.send(
          new ListMultipartUploadsCommand({ Bucket: settings.bucket }),
        );
        for (const upload of uploads.Uploads ?? [])
          await client.send(
            new AbortMultipartUploadCommand({
              Bucket: settings.bucket,
              Key: upload.Key,
              UploadId: upload.UploadId,
            }),
          );
        for (;;) {
          const page = await client.send(
            new ListObjectsV2Command({ Bucket: settings.bucket }),
          );
          for (const item of page.Contents ?? [])
            await client.send(
              new DeleteObjectCommand({
                Bucket: settings.bucket,
                Key: item.Key,
              }),
            );
          if (page.IsTruncated !== true) break;
        }
        await client.send(new DeleteBucketCommand({ Bucket: settings.bucket }));
      } finally {
        client.destroy();
        await rm(keys, { recursive: true, force: true });
      }
    },
  };
}
