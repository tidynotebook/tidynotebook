/**
 * The host rules of the Host allowlist: the host name of a header, and the
 * operations that answer any host (records 0039 and 0199).
 *
 * The allowlist itself runs in `src/app.ts`, and
 * `tests/integration/served-origins.test.ts` proves it on a real server.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
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
