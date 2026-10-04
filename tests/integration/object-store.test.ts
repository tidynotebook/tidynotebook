/**
 * The contract of the object store port, against both adapters (record
 * 0192).
 *
 * One suite runs against the file store on a temporary directory and against
 * the S3 store on a bucket of the test MinIO service, so the two adapters
 * cannot drift apart.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import {
  attachmentKey,
  BodyLengthError,
  importKey,
  openFileObjectStore,
  openS3ObjectStore,
  removeStaleObjects,
  stagingKey,
  stagingLifetimeMs,
  workspacePrefix,
  type ObjectStore,
} from '@notesapp/storage-server';
import { createTestBucket } from './support/object-store.ts';

/** The smallest part before the last one that an S3 store takes. */
const minimumPartBytes = 5 * 1024 * 1024;

/** The bytes of a stream. */
async function bytesOf(stream: Readable | null): Promise<Buffer> {
  assert.ok(stream !== null, 'the store holds the object');
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks);
}

/** Every key of a listing. */
async function keysOf(
  listing: AsyncIterable<{ readonly key: string }>,
): Promise<string[]> {
  const keys: string[] = [];
  for await (const item of listing) keys.push(item.key);
  return keys.sort();
}

/** A body that sends some bytes and then stops before its stated end. */
function cutBody(bytes: Buffer): Readable {
  const body = new PassThrough();
  body.write(bytes);
  setImmediate(() => body.destroy(new Error('The sender went away.')));
  return body;
}

const digest = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

/** The suite of the port, for one adapter. */
async function portContract(
  t: test.TestContext,
  store: ObjectStore,
): Promise<void> {
  const workspaceId = randomUUID();

  await t.test(
    'a write reads back whole, and a second write replaces it',
    async () => {
      const key = stagingKey(randomUUID());
      assert.equal(await store.size(key), null);
      assert.equal(await store.read(key), null);
      await store.write(key, Readable.from([Buffer.from('first')]), 5);
      assert.equal(await store.size(key), 5);
      assert.equal((await bytesOf(await store.read(key))).toString(), 'first');
      await store.write(key, Readable.from([Buffer.from('second!')]), 7);
      assert.equal(
        (await bytesOf(await store.read(key))).toString(),
        'second!',
      );
      await store.remove(key);
      assert.equal(await store.size(key), null);
      // A removal of an object that is not there needs nothing.
      await store.remove(key);
    },
  );

  await t.test(
    'a body that is not its stated length leaves nothing',
    async () => {
      const short = stagingKey(randomUUID());
      await assert.rejects(
        store.write(short, Readable.from([Buffer.from('abc')]), 10),
        BodyLengthError,
      );
      assert.equal(await store.size(short), null);
      const long = stagingKey(randomUUID());
      await assert.rejects(
        store.write(long, Readable.from([Buffer.from('abcdef')]), 3),
      );
      assert.equal(await store.size(long), null);
      const cut = stagingKey(randomUUID());
      await assert.rejects(store.write(cut, cutBody(Buffer.from('ab')), 10));
      assert.equal(await store.size(cut), null);
    },
  );

  await t.test(
    'a promotion moves the staged bytes to the key of the digest',
    async () => {
      const staged = stagingKey(randomUUID());
      const finished = attachmentKey(workspaceId, digest('image one'));
      await store.write(staged, Readable.from([Buffer.from('image one')]), 9);
      assert.equal(await store.promote(staged, finished), true);
      assert.equal(await store.size(staged), null);
      assert.equal(
        (await bytesOf(await store.read(finished))).toString(),
        'image one',
      );
      // A second upload of the same bytes keeps the finished object and
      // removes its own staged copy.
      const again = stagingKey(randomUUID());
      await store.write(again, Readable.from([Buffer.from('image one')]), 9);
      assert.equal(await store.promote(again, finished), true);
      assert.equal(await store.size(again), null);
      assert.equal(await store.size(finished), 9);
      // Bytes in neither place make nothing.
      const missing = attachmentKey(workspaceId, digest('never written'));
      assert.equal(
        await store.promote(stagingKey(randomUUID()), missing),
        false,
      );
      assert.equal(await store.size(missing), null);
    },
  );

  await t.test(
    'a listing and a removal by prefix stay inside the prefix',
    async () => {
      const other = randomUUID();
      const mine = [
        attachmentKey(workspaceId, digest('a')),
        attachmentKey(workspaceId, digest('b')),
      ];
      const theirs = attachmentKey(other, digest('c'));
      for (const key of [...mine, theirs])
        await store.write(key, Readable.from([Buffer.from('x')]), 1);
      const listed = await keysOf(store.list(workspacePrefix(workspaceId)));
      for (const key of mine) assert.ok(listed.includes(key), key);
      assert.ok(!listed.includes(theirs));
      for await (const item of store.list(workspacePrefix(workspaceId)))
        assert.ok(item.modifiedAt.getTime() > Date.now() - 60 * 60 * 1000);
      await store.removePrefix(workspacePrefix(workspaceId));
      assert.deepEqual(
        await keysOf(store.list(workspacePrefix(workspaceId))),
        [],
      );
      assert.equal(await store.size(theirs), 1);
      await store.removePrefix(workspacePrefix(other));
    },
  );

  await t.test(
    'an upload in parts joins its parts in the order of their numbers',
    async () => {
      const key = importKey(workspaceId, randomUUID(), randomUUID());
      const first = Buffer.alloc(minimumPartBytes, 0x61);
      const last = Buffer.from('the last part');
      // No upload is open, so a part reads nothing and is refused.
      assert.equal(
        await store.writePart(key, 1, Readable.from([first]), first.length),
        false,
      );
      assert.equal(await store.listParts(key), null);
      await store.startUpload(key);
      assert.deepEqual(await store.listParts(key), []);
      // The parts arrive out of order, and a part sent again replaces itself.
      assert.equal(
        await store.writePart(key, 2, Readable.from([Buffer.from('old')]), 3),
        true,
      );
      assert.equal(
        await store.writePart(key, 2, Readable.from([last]), last.length),
        true,
      );
      assert.equal(
        await store.writePart(key, 1, Readable.from([first]), first.length),
        true,
      );
      // A part that stops early is not a part.
      await assert.rejects(
        store.writePart(key, 3, cutBody(Buffer.from('x')), 9),
      );
      const parts = (await store.listParts(key)) ?? [];
      assert.deepEqual(
        parts.map(({ partNumber, size }) => ({ partNumber, size })),
        [
          { partNumber: 1, size: first.length },
          { partNumber: 2, size: last.length },
        ],
      );
      const open = await keysOf(store.listUploads('staging/'));
      assert.ok(open.includes(key));
      assert.equal(await store.completeUpload(key, parts), 'completed');
      assert.equal(await store.listParts(key), null);
      assert.ok(!(await keysOf(store.listUploads('staging/'))).includes(key));
      const joined = await bytesOf(await store.read(key));
      assert.equal(joined.length, first.length + last.length);
      assert.ok(joined.subarray(0, first.length).equals(first));
      assert.equal(joined.subarray(first.length).toString(), 'the last part');
      assert.equal(await store.completeUpload(key, parts), 'missing');
      await store.remove(key);
    },
  );

  await t.test(
    'a completion joins the parts that it checked, and no part sent after',
    async () => {
      // Review of record 0192. The store listed the parts again when it
      // joined them, so a part sent between the check and the join made an
      // archive that nobody checked.
      const key = importKey(workspaceId, randomUUID(), randomUUID());
      const first = Buffer.alloc(minimumPartBytes, 0x62);
      await store.startUpload(key);
      await store.writePart(key, 1, Readable.from([first]), first.length);
      await store.writePart(key, 2, Readable.from([Buffer.from('end')]), 3);
      const checked = (await store.listParts(key)) ?? [];
      assert.equal(checked.length, 2);
      await store.writePart(key, 2, Readable.from([Buffer.from('later')]), 5);
      assert.equal(await store.completeUpload(key, checked), 'changed');
      // The upload and its parts stay, so a new check can join them.
      const again = (await store.listParts(key)) ?? [];
      assert.deepEqual(
        again.map((part) => part.size),
        [first.length, 5],
      );
      assert.equal(await store.completeUpload(key, again), 'completed');
      assert.equal(await store.size(key), first.length + 5);
      await store.remove(key);
    },
  );

  await t.test(
    'a part that arrives after an abort leaves nothing behind',
    async () => {
      // Review of record 0192. The file store made the folder of the part
      // again when it moved the part into place, so a part that arrived
      // while the cleanup aborted its upload left a folder with no marker
      // that nothing removed.
      const key = importKey(workspaceId, randomUUID(), randomUUID());
      await store.startUpload(key);
      const body = new PassThrough();
      body.write(Buffer.from('par'));
      const written = store.writePart(key, 1, body, 4);
      await store.abortUpload(key);
      body.end(Buffer.from('t'));
      assert.equal(await written, false);
      assert.equal(await store.listParts(key), null);
      assert.ok(!(await keysOf(store.listUploads('staging/'))).includes(key));
    },
  );

  await t.test('an aborted upload leaves no part', async () => {
    const key = importKey(workspaceId, randomUUID(), randomUUID());
    await store.startUpload(key);
    await store.writePart(key, 1, Readable.from([Buffer.from('part')]), 4);
    await store.abortUpload(key);
    assert.equal(await store.listParts(key), null);
    assert.equal(await store.completeUpload(key, []), 'missing');
    assert.equal(await store.size(key), null);
    // An abort of an upload that is not open needs nothing.
    await store.abortUpload(key);
  });

  await t.test(
    'the cleanup takes what nobody finished after a day, and nothing else',
    async () => {
      const staged = stagingKey(randomUUID());
      const finished = attachmentKey(workspaceId, digest('kept'));
      const upload = importKey(workspaceId, randomUUID(), randomUUID());
      await store.write(staged, Readable.from([Buffer.from('s')]), 1);
      await store.write(finished, Readable.from([Buffer.from('f')]), 1);
      await store.startUpload(upload);
      await store.writePart(upload, 1, Readable.from([Buffer.from('p')]), 1);
      // Inside the day nothing goes.
      const early = await removeStaleObjects(store, new Date());
      assert.equal(await store.size(staged), 1);
      assert.notEqual(await store.listParts(upload), null);
      assert.ok(early.objects >= 0 && early.uploads >= 0);
      // A day later the staged object and the open upload go, and the
      // finished object stays.
      const later = new Date(Date.now() + stagingLifetimeMs + 60 * 60 * 1000);
      const removed = await removeStaleObjects(store, later);
      assert.ok(removed.objects >= 1);
      assert.ok(removed.uploads >= 1);
      assert.equal(await store.size(staged), null);
      assert.equal(await store.listParts(upload), null);
      assert.equal(await store.size(finished), 1);
      assert.deepEqual(await keysOf(store.list('staging/')), []);
      await store.removePrefix(workspacePrefix(workspaceId));
    },
  );

  await t.test('the probe answers', async () => {
    assert.equal(await store.probe(), true);
  });
}

await test('the file store keeps the contract of the port', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'notesapp-objects-'));
  const store = openFileObjectStore(root);
  try {
    await portContract(t, store);
    // A finished object is at the relative path of its key, which is the
    // path that the file store has always used.
    const key = attachmentKey(randomUUID(), digest('path'));
    await store.write(key, Readable.from([Buffer.from('p')]), 1);
    assert.equal((await readFile(join(root, key))).toString(), 'p');
    assert.equal(
      await openFileObjectStore(join(root, 'missing')).probe(),
      false,
    );
    // The file store states the free space of its volume.
    assert.ok(((await store.room()) ?? 0) > 0);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

await test('a join that fails keeps the parts of the file store', async () => {
  // Review of record 0192. The join removed each part as it went, so a join
  // that failed, for example on a full disk, lost the first parts, and the
  // next completion refused the archive.
  const root = await mkdtemp(join(tmpdir(), 'notesapp-objects-join-'));
  const store = openFileObjectStore(root);
  try {
    const key = importKey(randomUUID(), randomUUID(), randomUUID());
    await store.startUpload(key);
    await store.writePart(key, 1, Readable.from([Buffer.from('one')]), 3);
    await store.writePart(key, 2, Readable.from([Buffer.from('two')]), 3);
    const parts = (await store.listParts(key)) ?? [];
    // A folder at the key makes the last move of the join fail.
    await mkdir(join(root, key), { recursive: true });
    await assert.rejects(store.completeUpload(key, parts));
    assert.deepEqual(await store.listParts(key), parts);
    // No file of the join stays behind.
    assert.deepEqual(await readdir(join(root, 'tmp')), []);
    await rm(join(root, key), { recursive: true });
    assert.equal(await store.completeUpload(key, parts), 'completed');
    assert.equal((await readFile(join(root, key))).toString(), 'onetwo');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await test('the S3 store keeps the contract of the port', async (t) => {
  const bucket = await createTestBucket();
  try {
    await portContract(t, bucket.store);
    await t.test(
      'an upload that the service ended answers as no upload',
      async () => {
        // A rule of R2 or of MinIO ends an upload that waits too long, and
        // leaves the marker of the upload in place.
        const key = importKey(randomUUID(), randomUUID(), randomUUID());
        await bucket.store.startUpload(key);
        await bucket.store.writePart(
          key,
          1,
          Readable.from([Buffer.from('p')]),
          1,
        );
        const parts = (await bucket.store.listParts(key)) ?? [];
        await bucket.abortBehindTheStore(key);
        assert.equal(await bucket.store.listParts(key), null);
        assert.equal(
          await bucket.store.writePart(
            key,
            2,
            Readable.from([Buffer.from('q')]),
            1,
          ),
          false,
        );
        assert.equal(await bucket.store.completeUpload(key, parts), 'missing');
        await bucket.store.abortUpload(key);
        assert.deepEqual(
          await keysOf(bucket.store.listUploads('staging/')),
          [],
        );
      },
    );
    await t.test(
      'an upload whose marker cannot be written goes at once',
      async () => {
        // Review of record 0192. An upload whose marker write failed had no
        // marker, so nothing found it again and nothing aborted it. MinIO
        // refuses a name segment past 255 bytes, which the marker passes and
        // the upload does not.
        const key = `staging/imports/${'a'.repeat(250)}`;
        await assert.rejects(bucket.store.startUpload(key));
        assert.deepEqual(await bucket.uploadsOf(key), []);
      },
    );
    await t.test('the S3 store states no bound of its room', async () => {
      assert.equal(await bucket.store.room(), null);
    });
    await t.test('a service that never answers ends the call', async () => {
      // Review of record 0192. The client had no timeout, so a call that
      // hung held a finalize, and the lock of its workspace, for ever.
      const silent = createServer(() => undefined);
      const sockets: Socket[] = [];
      silent.on('connection', (socket) => sockets.push(socket));
      await new Promise<void>((resolve) =>
        silent.listen(0, '127.0.0.1', resolve),
      );
      const address = silent.address();
      assert.ok(address !== null && typeof address === 'object');
      const hung = openS3ObjectStore(
        {
          ...bucket.settings,
          endpoint: `http://127.0.0.1:${String(address.port)}`,
        },
        { connectionMs: 500, idleMs: 500 },
      );
      try {
        const started = Date.now();
        await assert.rejects(hung.size(stagingKey(randomUUID())));
        assert.equal(await hung.probe(), false);
        assert.ok(Date.now() - started < 10_000, 'the calls ended');
      } finally {
        hung.close();
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve) => silent.close(resolve));
      }
    });
    // A bucket that is not there does not answer the probe.
    const absent = openS3ObjectStore({
      ...bucket.settings,
      bucket: `${bucket.settings.bucket}-absent`,
    });
    try {
      assert.equal(await absent.probe(), false);
    } finally {
      absent.close();
    }
  } finally {
    await bucket.destroy();
  }
});
