/**
 * Checks of the frame boundary of the sync notice channel.
 *
 * The validators come from the payload schemas of `asyncapi.yaml`, which
 * `openapi.yaml` also lists, so these tests prove what the server accepts and
 * sends against the one source that the client types come from.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertMessageHandlers,
  checkServerMessage,
  findChannel,
  readClientMessage,
} from './index.ts';

const workspaceId = '0f8e2b1c-3d4a-4b5c-8d6e-7f8091a2b3c4';

function subscribe(members: Record<string, unknown>): string {
  return JSON.stringify({
    kind: 'subscribe',
    generation: 1,
    workspaceIds: [workspaceId],
    ...members,
  });
}

await test('the channel states its address and subprotocol', () => {
  const channel = findChannel('syncNotices');
  assert.equal(channel?.address, '/api/sync/notices');
  assert.equal(channel?.subprotocol, 'notesapp.sync.1');
  assert.equal(channel?.operationId, 'openSyncNotices');
});

await test('a valid subscription set is read with its kind', () => {
  const read = readClientMessage('syncNotices', subscribe({}));
  assert.equal(read.ok, true);
  if (read.ok) {
    assert.equal(read.kind, 'subscribe');
    assert.deepEqual(read.message.workspaceIds, [workspaceId]);
  }
});

await test('an empty subscription set is valid', () => {
  assert.equal(
    readClientMessage('syncNotices', subscribe({ workspaceIds: [] })).ok,
    true,
  );
});

/** Asserts the refusal reason of one frame. */
function refused(frame: string, reason: string): void {
  const read = readClientMessage('syncNotices', frame);
  assert.equal(read.ok, false, frame);
  if (!read.ok) assert.equal(read.reason, reason, frame);
}

await test('a frame that is not JSON is refused', () => {
  refused('{"kind":', 'not_json');
});

await test('a frame that is not an object is refused', () => {
  refused('[1]', 'not_object');
  refused('null', 'not_object');
});

await test('an unknown kind and a server kind are refused', () => {
  refused('{"kind":"shout"}', 'unknown_kind');
  refused('{"generation":1}', 'unknown_kind');
  // A client cannot send a notice that only the server sends.
  refused(
    JSON.stringify({ kind: 'changed', generation: 1, workspaceId }),
    'unknown_kind',
  );
});

await test('a message outside its schema is refused with the member', () => {
  const cases: readonly (readonly [Record<string, unknown>, string])[] = [
    [{ generation: 0 }, '/generation'],
    [{ generation: 1.5 }, '/generation'],
    [{ generation: 9007199254740992 }, '/generation'],
    [{ workspaceIds: ['not-a-uuid'] }, '/workspaceIds/0'],
    [{ workspaceIds: [workspaceId, workspaceId] }, '/workspaceIds'],
    [{ extra: true }, '/'],
  ];
  for (const [members, path] of cases) {
    const read = readClientMessage('syncNotices', subscribe(members));
    assert.equal(read.ok, false, JSON.stringify(members));
    if (!read.ok) {
      assert.equal(read.reason, 'invalid');
      assert.equal(read.issues[0]?.path, path, JSON.stringify(members));
    }
  }
});

await test('a subscription set above the workspace bound is refused', () => {
  const many = Array.from(
    { length: 1001 },
    (_, index) =>
      `0f8e2b1c-3d4a-4b5c-8d6e-${index.toString(16).padStart(12, '0')}`,
  );
  const read = readClientMessage(
    'syncNotices',
    subscribe({ workspaceIds: many }),
  );
  assert.equal(read.ok, false);
  if (!read.ok) assert.equal(read.issues[0]?.path, '/workspaceIds');
  assert.equal(
    readClientMessage(
      'syncNotices',
      subscribe({ workspaceIds: many.slice(0, 1000) }),
    ).ok,
    true,
  );
});

await test('a refusal names members and copies no value', () => {
  const secret = 'secret-value-that-must-not-leak';
  const read = readClientMessage(
    'syncNotices',
    subscribe({ workspaceIds: [secret] }),
  );
  assert.equal(read.ok, false);
  assert.equal(JSON.stringify(read).includes(secret), false);
});

await test('every server message is checked against its schema', () => {
  const valid: readonly Record<string, unknown>[] = [
    { kind: 'ready', accountId: workspaceId },
    { kind: 'subscribed', generation: 2 },
    { kind: 'refused', generation: 2, reason: 'forbidden' },
    { kind: 'refused', generation: 2, reason: 'stale_generation' },
    { kind: 'changed', generation: 2, workspaceId },
    { kind: 'reconcile', generation: 2 },
    { kind: 'account' },
    { kind: 'stop', reason: 'session_ended' },
    { kind: 'stop', reason: 'unavailable' },
  ];
  for (const message of valid)
    assert.equal(
      checkServerMessage('syncNotices', message),
      null,
      JSON.stringify(message),
    );
});

await test('a server message outside its schema is refused', () => {
  const invalid: readonly (readonly [unknown, string])[] = [
    [{ kind: 'changed', generation: 2 }, 'invalid'],
    [{ kind: 'changed', generation: 2, workspaceId, cursor: '9' }, 'invalid'],
    [{ kind: 'stop', reason: 'bored' }, 'invalid'],
    // The message of a changed account names nothing of the change.
    [{ kind: 'account', standing: 'locked' }, 'invalid'],
    [{ kind: 'refused', generation: 2 }, 'invalid'],
    // A server never sends the message that only a client sends.
    [{ kind: 'subscribe', generation: 1, workspaceIds: [] }, 'unknown_kind'],
    ['changed', 'not_object'],
  ];
  for (const [message, reason] of invalid)
    assert.equal(
      checkServerMessage('syncNotices', message)?.reason,
      reason,
      JSON.stringify(message),
    );
});

await test('the handlers of a channel must cover its client messages', () => {
  assertMessageHandlers('syncNotices', ['subscribe']);
  assert.throws(() => {
    assertMessageHandlers('syncNotices', []);
  }, /Missing handler for message subscribe of syncNotices/);
  assert.throws(() => {
    assertMessageHandlers('syncNotices', ['subscribe', 'shout']);
  }, /Handler shout has no client message in syncNotices/);
});
