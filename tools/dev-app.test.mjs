import assert from 'node:assert/strict';
import test from 'node:test';
import { readOptions } from './dev-app.mjs';

await test('the local port accepts only a valid TCP port', () => {
  assert.equal(readOptions([]).port, 3000);
  assert.equal(readOptions(['--port', '3123']).port, 3123);
  for (const args of [
    ['--port', '0'],
    ['--port', '65536'],
    ['--port', 'abc'],
    ['--port', '3123', 'extra'],
    ['--port', '3123', '--port', '3124'],
  ]) {
    assert.throws(() => readOptions(args));
  }
});

await test('the local object store is the file store unless S3 is named', () => {
  // Record 0192. A run on the test MinIO service drives the S3 store.
  assert.equal(readOptions([]).objectStore, 'filesystem');
  assert.deepEqual(readOptions(['--object-store', 's3', '--port', '3123']), {
    port: 3123,
    objectStore: 's3',
  });
  assert.equal(
    readOptions(['--object-store', 'filesystem']).objectStore,
    'filesystem',
  );
  assert.throws(() => readOptions(['--object-store', 'gcs']));
  assert.throws(() => readOptions(['--object-store']));
});
