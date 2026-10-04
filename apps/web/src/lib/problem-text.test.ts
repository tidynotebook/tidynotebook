import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasProblemSentence,
  problemCode,
  problemSentence,
  problemStatus,
} from './problem-text.ts';

/** Every code that a server answer can carry today. */
const codes = [
  'account_locked',
  'account_unavailable',
  'controls_changed',
  'address_unverified',
  'deleted_remotely',
  'forbidden',
  'internal_error',
  'invalid_content',
  'invalid_graph',
  'invalid_path',
  'invalid_request',
  'invalid_response',
  'mutation_reused',
  'not_found',
  'not_ready',
  'origin_required',
  'path_conflict',
  'payload_too_large',
  'precondition_required',
  'purged',
  'quota_exceeded',
  'route_not_found',
  'snapshot_required',
  'stale_head',
  'unauthenticated',
  'unauthorized',
  'unrenderable_note',
  'unsupported_media_type',
];

await test('every known code has one sentence', () => {
  for (const code of codes) {
    assert.ok(hasProblemSentence(code), code);
    const sentence = problemSentence(code, 400);
    assert.ok(sentence.endsWith('.'), code);
    assert.ok(!sentence.includes(code), code);
    assert.ok(!sentence.includes('_'), code);
  }
});

await test('an unknown code falls back to the status', () => {
  assert.equal(
    problemSentence('a_reason_from_a_newer_server', 404),
    problemSentence('not_found', 404),
  );
  assert.ok(
    !problemSentence('a_reason_from_a_newer_server', 418).includes('_'),
  );
});

await test('no answer at all reads as a connection problem', () => {
  const message = problemSentence(null, 0);
  assert.ok(message.includes('on this device'));
  assert.equal(problemSentence(null, null), message);
});

await test('a server failure asks the person to try again', () => {
  assert.ok(problemSentence(null, 503).includes('Try again'));
});

await test('a problem document gives up its code and its status', () => {
  assert.equal(
    problemCode({ code: 'path_conflict', status: 409 }),
    'path_conflict',
  );
  assert.equal(problemStatus({ code: 'path_conflict', status: 409 }), 409);
});

await test('a failure that carries no problem gives nothing', () => {
  // The generated client answers with a network error, a plain string, or
  // nothing at all. Each of them must read as no code and no status, so the
  // sentence falls back instead of showing a wrong one.
  for (const value of [null, undefined, 'failed', 7, [], new Error('x')]) {
    assert.equal(problemCode(value), null);
    assert.equal(problemStatus(value), null);
  }
});

await test('a member of the wrong kind reads as none', () => {
  assert.equal(problemCode({ code: 404 }), null);
  assert.equal(problemCode({ code: '' }), null);
  assert.equal(problemStatus({ status: '404' }), null);
});

await test('an inherited member cannot pass as a problem', () => {
  const inherited: unknown = Object.create({ code: 'forbidden', status: 403 });
  assert.equal(problemCode(inherited), null);
  assert.equal(problemStatus(inherited), null);
});

await test('a note over a limit of the grammar reads as its cause and the action', () => {
  // Record 0182. The sentence said that the note could not be rendered, and
  // not what the person can change.
  assert.equal(
    problemSentence('unrenderable_note', 422),
    'This note has too much Markdown to show formatted. Divide a long paragraph or table, or make the note smaller.',
  );
});
