/** Checks the readiness probe of an S3 store (record 0192). */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWriteProbe,
  failedWriteCheckMs,
  writeCheckMs,
} from './write-probe.ts';

/** A service whose answers and calls a test sets and reads. */
function fakeService(): {
  head: boolean;
  write: boolean;
  time: number;
  heads: number;
  writes: number;
  readonly probe: () => Promise<boolean>;
} {
  const state = {
    head: true,
    write: true,
    time: 0,
    heads: 0,
    writes: 0,
    probe: async (): Promise<boolean> => false,
  };
  state.probe = createWriteProbe({
    head: () => {
      state.heads += 1;
      return Promise.resolve(state.head);
    },
    writeReadRemove: () => {
      state.writes += 1;
      return state.write
        ? Promise.resolve()
        : Promise.reject(new Error('AccessDenied'));
    },
    now: () => state.time,
  });
  return state;
}

await test('a key pair that sees the bucket and cannot write fails the probe', async () => {
  // Codex review of PR 288. The probe asked the bucket only, so a key pair
  // that could not write reported a store that took every upload, and every
  // upload and import then failed.
  const service = fakeService();
  service.write = false;
  assert.equal(await service.probe(), false);
  assert.equal(service.writes, 1);
});

await test('the first probe writes, and a passed write holds for a while', async () => {
  const service = fakeService();
  assert.equal(await service.probe(), true);
  assert.equal(service.writes, 1);
  // The probes of the next minutes ask the bucket only.
  for (let step = 1; step < 10; step += 1) {
    service.time = step * 60 * 1000 - 1;
    assert.equal(await service.probe(), true);
  }
  assert.equal(service.writes, 1);
  assert.equal(service.heads, 10);
  service.time = writeCheckMs;
  assert.equal(await service.probe(), true);
  assert.equal(service.writes, 2);
});

await test('a bucket that does not answer fails the probe at once', async () => {
  const service = fakeService();
  assert.equal(await service.probe(), true);
  service.head = false;
  assert.equal(await service.probe(), false);
  assert.equal(service.writes, 1);
});

await test('a failed write is tried again sooner than a passed one', async () => {
  const service = fakeService();
  service.write = false;
  assert.equal(await service.probe(), false);
  service.write = true;
  service.time = failedWriteCheckMs - 1;
  assert.equal(await service.probe(), false);
  assert.equal(service.writes, 1);
  service.time = failedWriteCheckMs;
  assert.equal(await service.probe(), true);
  assert.equal(service.writes, 2);
});
