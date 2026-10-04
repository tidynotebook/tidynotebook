/**
 * The host rules of the Host allowlist: the host name of a header, and the
 * operations that answer any host (records 0039 and 0199).
 *
 * The allowlist itself runs in `src/app.ts`, and
 * `tests/integration/served-origins.test.ts` proves it on a real server.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { operations } from '@notesapp/api-contract';
import { answersAnyHost, hostName } from './host.ts';

await test('the host name drops the port and keeps the brackets of IPv6', () => {
  assert.equal(hostName('Notes.Example.com:8080'), 'notes.example.com');
  assert.equal(hostName('[::1]:3000'), '[::1]');
  assert.equal(hostName(undefined), '');
});

await test('every probe operation answers any host', () => {
  for (const id of [
    'getHealth',
    'getRootHealth',
    'getReadiness',
    'getRootReadiness',
  ])
    assert.equal(answersAnyHost(id), true, id);
});

await test('every other operation, and an address with no operation, is checked', () => {
  for (const id of ['getPreferences', 'getAuthSession', 'getPublishedPage'])
    assert.equal(answersAnyHost(id), false, id);
  assert.equal(answersAnyHost(undefined), false);
  assert.equal(answersAnyHost(''), false);
});

await test('every operator operation answers any host, and no other operation of a session does', () => {
  // A service on a private network names the core by an internal host
  // (record 0190), so every operator operation answers it.
  const operator = operations.filter((operation) =>
    operation.path.startsWith('/api/operator/'),
  );
  assert.ok(operator.length > 0);
  for (const operation of operator)
    assert.equal(answersAnyHost(operation.id), true, operation.id);
  // An operation of a session or of the reader path keeps the allowlist.
  for (const operation of operations)
    if (
      operation.security.length > 0 &&
      !operation.path.startsWith('/api/operator/')
    )
      assert.equal(answersAnyHost(operation.id), false, operation.id);
});
