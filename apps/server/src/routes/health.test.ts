/**
 * The readiness decision, without a database and without a server.
 *
 * Every input of the decision is injected here: the state that a pooled read
 * returns, the deadline of that read, and the lifecycle state. The pooled read
 * itself runs against real PostgreSQL in
 * `tests/integration/operations.test.ts`, and the four addresses answer
 * through a real listening server in `tests/integration/contract.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseProbeResult } from '@notesapp/storage-server';
import { requiredSchemaVersion } from '@notesapp/storage-server';
import { createServiceLifecycle, runningLifecycle } from '../lifecycle.ts';
import type { ProbeRequest, ReadinessCheck, ReadinessProbe } from './health.ts';
import {
  createServiceHandlers,
  databaseProbes,
  evaluateReadiness,
  livenessAnswer,
  probeOperations,
  readinessAnswer,
  singleFlight,
  withDeadline,
} from './health.ts';
import { problemMediaType } from '../plugins/problem.ts';

/** One readiness request, with the three members that the answer reads. */
function request(url = '/ready', query: unknown = {}): ProbeRequest {
  return { id: 'a-request-id', url, query };
}

/** The stable problem code of an answer, or an empty string. */
function problemCode(body: unknown): string {
  if (body === null || typeof body !== 'object' || !('code' in body)) return '';
  return typeof body.code === 'string' ? body.code : '';
}

/** The check of one name inside a readiness report. */
function checkNamed(body: unknown, name: string): ReadinessCheck {
  assert.ok(body !== null && typeof body === 'object' && 'checks' in body);
  const checks: unknown = body.checks;
  assert.ok(Array.isArray(checks));
  const found = checks.find(
    (check: unknown): check is ReadinessCheck =>
      check !== null &&
      typeof check === 'object' &&
      'name' in check &&
      check.name === name,
  );
  assert.ok(found !== undefined, `the report holds the ${name} check`);
  return found;
}

/** A read that answers the given state and counts how often it ran. */
function countedRead(state: DatabaseProbeResult): {
  read: () => Promise<DatabaseProbeResult>;
  calls: () => number;
} {
  let calls = 0;
  return {
    read: (): Promise<DatabaseProbeResult> => {
      calls += 1;
      return Promise.resolve(state);
    },
    calls: (): number => calls,
  };
}

await test('one function answers both addresses of each question', () => {
  const handlers = createServiceHandlers([], runningLifecycle);
  assert.equal(handlers.getHealth, handlers.getRootHealth);
  assert.equal(handlers.getReadiness, handlers.getRootReadiness);
  assert.notEqual(handlers.getHealth, undefined);
  assert.notEqual(handlers.getReadiness, undefined);
});

await test('the probe list names exactly the operations of the service handlers', () => {
  // The Host allowlist skips the operations of this list (record 0199), so a
  // probe that the list forgot would fail on the host of a platform, and an
  // extra entry would answer any host for an operation that is no probe.
  const handlers = createServiceHandlers([], runningLifecycle);
  assert.deepEqual([...probeOperations].sort(), Object.keys(handlers).sort());
});

await test('liveness reports that the process runs', () => {
  const answer = livenessAnswer();
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body, { status: 'ok' });
});

await test('a reachable database with the required schema reports ready', async () => {
  const counted = countedRead({
    reachable: true,
    schemaVersion: requiredSchemaVersion,
  });
  const answer = await readinessAnswer(
    databaseProbes(counted.read),
    runningLifecycle,
    request(),
  );
  assert.equal(answer.status, 200);
  assert.equal(checkNamed(answer.body, 'database').status, 'ok');
  assert.equal(checkNamed(answer.body, 'migration').status, 'ok');
  // Both checks read the state of one round trip.
  assert.equal(counted.calls(), 1);
});

await test('a database that does not answer reports degraded', async () => {
  const counted = countedRead({ reachable: false, schemaVersion: null });
  const answer = await readinessAnswer(
    databaseProbes(counted.read),
    runningLifecycle,
    request(),
  );
  assert.equal(answer.status, 503);
  assert.equal(answer.mediaType, problemMediaType);
  assert.equal(problemCode(answer.body), 'not_ready');
});

await test('an incomplete schema is degraded and keeps the database check', async () => {
  const counted = countedRead({
    reachable: true,
    schemaVersion: requiredSchemaVersion - 1,
  });
  const report = await evaluateReadiness(databaseProbes(counted.read), 'full');
  assert.equal(report.status, 'degraded');
  assert.equal(checkNamed(report, 'database').status, 'ok');
  assert.equal(checkNamed(report, 'migration').status, 'degraded');
});

await test('a database that reports no schema version is not migrated', async () => {
  const counted = countedRead({ reachable: true, schemaVersion: null });
  const report = await evaluateReadiness(databaseProbes(counted.read), 'full');
  assert.equal(checkNamed(report, 'database').status, 'ok');
  assert.equal(checkNamed(report, 'migration').status, 'degraded');
});

await test('a read that passes its deadline reports an unreachable database', async () => {
  // This read never answers, so only the deadline can end it.
  const report = await evaluateReadiness(
    databaseProbes(() => new Promise<DatabaseProbeResult>(() => {}), 10),
    'full',
  );
  assert.equal(checkNamed(report, 'database').status, 'degraded');
  assert.equal(checkNamed(report, 'migration').status, 'degraded');
});

await test('a process that drains answers before any probe runs', async () => {
  const lifecycle = createServiceLifecycle();
  const counted = countedRead({
    reachable: true,
    schemaVersion: requiredSchemaVersion,
  });
  const probes = databaseProbes(counted.read);
  lifecycle.beginDrain();
  const answer = await readinessAnswer(probes, lifecycle, request());
  assert.equal(answer.status, 503);
  assert.equal(answer.mediaType, problemMediaType);
  assert.equal(problemCode(answer.body), 'shutting_down');
  // The stop closes the pools, so a draining process reads no database.
  assert.equal(counted.calls(), 0);
});

await test('the drain answer names the address that the caller asked for', async () => {
  const lifecycle = createServiceLifecycle();
  lifecycle.beginDrain();
  for (const url of ['/ready', '/api/ready']) {
    const answer = await readinessAnswer(
      [],
      lifecycle,
      request(`${url}?detail=summary`),
    );
    assert.equal(answer.status, 503);
    assert.equal(problemCode(answer.body), 'shutting_down');
    assert.equal(
      answer.body !== null &&
        typeof answer.body === 'object' &&
        'instance' in answer.body
        ? answer.body.instance
        : '',
      url,
    );
  }
});

/** Every text of one answer body, at any depth. */
function textsOf(value: unknown): readonly string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => textsOf(item));
  if (value !== null && typeof value === 'object')
    return Object.values(value).flatMap((item) => textsOf(item));
  return [];
}

await test('a caller with no account reads no schema version number', async () => {
  // The probe addresses take no account (`security: []`), so any caller reads
  // them. A version number tells that caller which release runs here, so no
  // text of any answer holds a digit, whatever the state of the schema and
  // whatever detail the caller asks for.
  for (const schemaVersion of [
    null,
    0,
    requiredSchemaVersion - 1,
    requiredSchemaVersion,
    requiredSchemaVersion + 1,
  ]) {
    const probes = databaseProbes(
      countedRead({ reachable: true, schemaVersion }).read,
    );
    for (const url of ['/ready', '/api/ready'])
      for (const query of [{}, { detail: 'full' }, { detail: 'summary' }]) {
        const answer = await readinessAnswer(
          probes,
          runningLifecycle,
          request(url, query),
        );
        for (const text of textsOf(answer.body))
          assert.doesNotMatch(
            text,
            /\d/,
            `${url} ${JSON.stringify(query)} at version ${String(schemaVersion)}`,
          );
      }
  }
});

await test('a full report of an incomplete schema still names the migration', async () => {
  const report = await evaluateReadiness(
    databaseProbes(
      countedRead({
        reachable: true,
        schemaVersion: requiredSchemaVersion - 1,
      }).read,
    ),
    'full',
  );
  const migration = checkNamed(report, 'migration');
  assert.equal(migration.status, 'degraded');
  assert.doesNotMatch(migration.detail ?? '', /\d/);
});

await test('a summary report drops the detail of every check', async () => {
  const probe: ReadinessProbe = () =>
    Promise.resolve({ name: 'storage', status: 'ok', detail: 'A detail.' });
  const report = await evaluateReadiness([probe], 'summary');
  assert.equal(report.checks[0]?.detail, undefined);
});

await test('a read that ends answers before its deadline', async () => {
  const answer = await withDeadline(
    () => Promise.resolve('read'),
    50_000,
    'late',
  );
  assert.equal(answer, 'read');
});

await test('a read that fails answers with the late value', async () => {
  const answer = await withDeadline(
    () => Promise.reject(new Error('the read failed')),
    50_000,
    'late',
  );
  assert.equal(answer, 'late');
});

await test('one running read serves every caller that asks while it runs', async () => {
  let calls = 0;
  let release = (): void => {};
  const held = new Promise<void>((accept) => {
    release = accept;
  });
  const shared = singleFlight(async () => {
    calls += 1;
    await held;
    return calls;
  });
  const first = shared();
  const second = shared();
  release();
  assert.deepEqual(await Promise.all([first, second]), [1, 1]);
  assert.equal(calls, 1);
  // The next caller starts a new read, so no answer is held forever.
  assert.equal(await shared(), 2);
});
