import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogger, createMemorySink, logEventCatalog } from './index.ts';

await test('a bound logger writes one fixed record shape', () => {
  const memory = createMemorySink();
  const logger = createLogger(memory.sink, () => '2026-09-14T10:00:00.000Z')
    .bind({ requestId: 'request-one' })
    .bind({ actorId: 'actor-one' });

  logger.emit('web.problem', { problemCode: 'not_found' });

  assert.deepEqual(memory.records, [
    {
      event: 'web.problem',
      level: 'warn',
      time: '2026-09-14T10:00:00.000Z',
      requestId: 'request-one',
      actorId: 'actor-one',
      problemCode: 'not_found',
    },
  ]);
});

await test('the logger drops a field that the event does not declare', () => {
  const memory = createMemorySink();
  const logger = createLogger(memory.sink);
  const fields = {
    problemCode: 'forbidden',
    password: 'must-not-leave',
  };

  logger.emit('web.problem', fields);

  assert.equal(memory.records[0]?.['problemCode'], 'forbidden');
  assert.equal('password' in (memory.records[0] ?? {}), false);
});

await test('the catalog has no secret-shaped field', () => {
  const forbidden = /token|password|secret|cookie|note.?text|content.?path/i;
  for (const [event, definition] of Object.entries(logEventCatalog)) {
    for (const field of definition.fields)
      assert.doesNotMatch(field, forbidden, `${event}.${field}`);
  }
});

await test('a render failure names its boundary and never its message', () => {
  const memory = createMemorySink();
  const logger = createLogger(memory.sink, () => '2026-10-02T10:00:00.000Z');
  const fields = {
    scope: 'page',
    cause: 'stop',
    errorName: 'TypeError',
    message: 'Cannot read the text of My private note',
  } as const;

  logger.emit('web.render_failed', fields);

  assert.deepEqual(memory.records, [
    {
      event: 'web.render_failed',
      level: 'error',
      time: '2026-10-02T10:00:00.000Z',
      scope: 'page',
      cause: 'stop',
      errorName: 'TypeError',
    },
  ]);
});

await test('a failed run of a job names the job and nothing of an account', () => {
  const memory = createMemorySink();
  const logger = createLogger(memory.sink, () => '2026-10-04T10:00:00.000Z');
  // The removal of locked accounts is a job of the hourly run (record 0201).
  logger.emit('maintenance.failed', { job: 'removals' });
  assert.deepEqual(memory.records, [
    {
      event: 'maintenance.failed',
      level: 'error',
      time: '2026-10-04T10:00:00.000Z',
      job: 'removals',
    },
  ]);
});
