import assert from 'node:assert/strict';
import test from 'node:test';
import { saveStatusWords } from './save-status-words.ts';
import type { SyncState } from './sync-state.ts';
const base = {
  state: { kind: 'in-step' },
  online: true,
  pending: false,
  failed: false,
} as const;
await test('status words use the approved pill and short menu line', () => {
  assert.equal(saveStatusWords(base).pill, 'Saved');
  assert.equal(saveStatusWords(base).line, 'All changes saved');
  assert.equal(saveStatusWords({ ...base, pending: true }).pill, 'Saving');
  assert.equal(
    saveStatusWords({ ...base, state: { kind: 'sending' } }).line,
    'Uploading...',
  );
  assert.equal(saveStatusWords({ ...base, online: false }).pill, 'Offline');
  assert.equal(
    saveStatusWords({ ...base, state: { kind: 'signed-out' } }).line,
    'Sign in to upload',
  );
  assert.equal(
    saveStatusWords({ ...base, state: { kind: 'server-behind' } }).pill,
    'Paused',
  );
});
await test('a failed device write always blocks a saved claim', () => {
  for (const state of [
    { kind: 'in-step' },
    { kind: 'starting' },
    { kind: 'sending' },
    { kind: 'other-account' },
    { kind: 'attention', parked: 1 },
  ] satisfies readonly SyncState[]) {
    const words = saveStatusWords({
      ...base,
      state,
      online: false,
      failed: true,
    });
    assert.equal(words.pill, 'Not saved');
    assert.equal(words.line, 'Not saved');
    assert.match(words.detail, /Copy your text/);
  }
});

await test('in-memory work never claims durable local storage', () => {
  for (const state of [
    { kind: 'in-step' },
    { kind: 'sending' },
    { kind: 'waiting' },
    { kind: 'signed-out' },
    { kind: 'other-account' },
  ] satisfies readonly SyncState[]) {
    for (const online of [true, false]) {
      const words = saveStatusWords({ ...base, state, online, pending: true });
      assert.equal(words.pill, 'Saving');
      assert.equal(words.line, 'Saving...');
      assert.equal(words.detail, 'Saving on this device.');
    }
  }
});

await test('existing device-write proof permits offline and uploading details', () => {
  const durable = { ...base, pending: true, localWritePending: false };
  assert.equal(
    saveStatusWords({ ...durable, online: false }).title,
    'Saved on this device',
  );
  assert.equal(
    saveStatusWords({ ...durable, state: { kind: 'sending' } }).detail,
    'Saved on this device. Uploading now.',
  );
  assert.equal(
    saveStatusWords({ ...durable, state: { kind: 'signed-out' } }).pill,
    'Paused',
  );
});

await test('durable work distinguishes connecting, waiting and actual uploading', () => {
  const durable = { ...base, pending: true, localWritePending: false };
  const connecting = saveStatusWords({
    ...durable,
    state: { kind: 'starting' },
  });
  assert.equal(connecting.line, 'Connecting to the server.');
  assert.equal(connecting.detail, 'Connecting to the server.');
  const waiting = saveStatusWords(durable);
  assert.equal(waiting.line, 'Waiting to upload');
  assert.equal(waiting.detail, 'Saved on this device. Waiting to upload.');
  const uploading = saveStatusWords({ ...durable, state: { kind: 'sending' } });
  assert.equal(uploading.line, 'Uploading...');
  assert.equal(uploading.detail, 'Saved on this device. Uploading now.');
  assert.equal(saveStatusWords({ ...durable, failed: true }).pill, 'Not saved');
});
