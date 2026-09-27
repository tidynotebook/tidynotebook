/**
 * Every limit and every job holds across server processes (record 0121).
 *
 * Two server instances over one database stand for two processes of one
 * installation. A limit that one of them counts must hold for the other, and
 * a maintenance job that both start must run once.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getSetupStatus, signInWithPassword } from '@notesapp/api-client';
import { createApp, loadServerConfig } from '@notesapp/server';
import { openCoordination } from '@notesapp/storage-server';
import { createDisposableDatabase, openSession } from './support/database.ts';

function responseOf(response: Response | undefined): Response {
  if (response === undefined)
    throw new Error('The generated client returned no HTTP response.');
  return response;
}

const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-shared-limits-'));
const config = loadServerConfig({
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'shared-limits-test-secret-0123456789ab',
  NOTESAPP_LOG_LEVEL: 'silent',
  NOTESAPP_MAX_BODY_BYTES: '1048576',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
  NOTESAPP_RATE_LIMIT_WINDOW_S: '60',
  NOTESAPP_RATE_LIMIT_MAX: '2',
});

/** One listening instance and the base address that reaches it. */
async function instance(): Promise<{
  readonly app: Awaited<ReturnType<typeof createApp>>;
  readonly baseUrl: string;
}> {
  const app = await createApp(config);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address: string | AddressInfo | null = app.server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The test server did not bind a TCP port.');
  return {
    app,
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
  };
}

const one = await instance();
const two = await instance();

await test('two instances share the count of a limited route', async () => {
  // The limit is two. One attempt on each instance uses it up, so the third
  // is refused wherever it arrives.
  const first = await getSetupStatus({ baseUrl: one.baseUrl });
  const second = await getSetupStatus({ baseUrl: two.baseUrl });
  const third = await getSetupStatus({ baseUrl: one.baseUrl });
  const fourth = await getSetupStatus({ baseUrl: two.baseUrl });
  assert.equal(responseOf(first.response).status, 200);
  assert.equal(responseOf(second.response).status, 200);
  assert.equal(responseOf(third.response).status, 429);
  assert.equal(responseOf(fourth.response).status, 429);
});

await test('two instances share the count of the sign-in route', async () => {
  const body = { email: 'missing@notes.invalid', password: 'missing-password' };
  const headers = { origin: config.origin };
  const statuses = [];
  for (const target of [one, two, one, two]) {
    const answer = await signInWithPassword({
      baseUrl: target.baseUrl,
      headers,
      body,
    });
    statuses.push(responseOf(answer.response).status);
  }
  // Two refused passwords, then the limit, on both instances.
  assert.deepEqual(statuses.slice(2), [429, 429]);
  assert.ok(statuses.slice(0, 2).every((status) => status !== 429));
  // Both instances run in this one process, where the memory of the library
  // is shared too, so the statuses alone cannot tell the two storages apart.
  // The row can: the count lives in the table that every process reads.
  const session = await openSession(database.migrationUrl);
  try {
    const rows = await session.query<{ count: number }>(
      `select count from auth_rate_limit where key like '%/sign-in/email'`,
    );
    assert.equal(rows.length, 1);
    assert.ok((rows[0]?.count ?? 0) >= 2);
  } finally {
    await session.close();
  }
});

await test('counts from two processes at the same time all count', async () => {
  const left = openCoordination(database.runtimeUrl, { poolSize: 4 });
  const right = openCoordination(database.runtimeUrl, { poolSize: 4 });
  try {
    const answers = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        (index % 2 === 0 ? left : right).countAttempt('race-key', 60_000),
      ),
    );
    const counts = answers.map((entry) => entry.current).sort((a, b) => a - b);
    assert.deepEqual(
      counts,
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    assert.equal((await left.readAttempt('race-key', 60_000)).current, 20);
    assert.ok(
      (await right.readAttempt('race-key', 60_000)).ttl > 0,
      'the window has time left',
    );
    // A pruned counter starts again.
    assert.ok((await left.pruneAttempts(new Date(Date.now() + 1000))) >= 1);
    assert.equal((await right.readAttempt('race-key', 60_000)).current, 0);
  } finally {
    await left.close();
    await right.close();
  }
});

await test('two instances run one job once', async () => {
  const left = openCoordination(database.runtimeUrl, { poolSize: 2 });
  const right = openCoordination(database.runtimeUrl, { poolSize: 2 });
  try {
    let runs = 0;
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = (): void => {};
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    const first = left.runExclusive('cleanup', async () => {
      runs += 1;
      started();
      await held;
    });
    await running;
    // The second process finds the job running and skips this run.
    assert.equal(
      await right.runExclusive('cleanup', async () => {
        runs += 1;
      }),
      false,
    );
    release();
    assert.equal(await first, true);
    assert.equal(runs, 1);
    // Once the run ends, the next run of either process goes ahead, and a job
    // of another name never waited on this one.
    assert.equal(
      await right.runExclusive('cleanup', async () => {
        runs += 1;
      }),
      true,
    );
    assert.equal(runs, 2);
  } finally {
    await left.close();
    await right.close();
  }
});

await one.app.close();
await two.app.close();
await database.destroy();
await rm(storageRoot, { recursive: true, force: true });
