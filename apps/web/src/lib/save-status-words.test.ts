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
