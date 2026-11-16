import assert from 'node:assert/strict';
import test from 'node:test';
import { saveProblem, syncProblemLine } from './save-status-words.ts';
import type { SyncState } from './sync-state.ts';

const quiet = [
  { kind: 'starting' },
  { kind: 'in-step' },
  { kind: 'sending' },
  { kind: 'waiting' },
] satisfies readonly SyncState[];

await test('a saved, saving, offline or uploading note shows no status', () => {
  for (const state of quiet) {
    assert.equal(saveProblem({ state, failed: false }), null);
    assert.equal(syncProblemLine({ state, failed: false }), null);
  }
});

await test('a failed device write always shows Not saved', () => {
  for (const state of [
    ...quiet,
    { kind: 'other-account' },
    { kind: 'attention', parked: 1 },
  ] satisfies readonly SyncState[]) {
    const problem = saveProblem({ state, failed: true });
    assert.equal(problem?.kind, 'not-saved');
    assert.equal(problem.label, 'Not saved');
    assert.match(problem.detail, /Copy your text/);
    assert.equal(syncProblemLine({ state, failed: true }), 'Not saved');
  }
});

await test('a signed out or other account asks to sign in', () => {
  const out = saveProblem({ state: { kind: 'signed-out' }, failed: false });
  assert.equal(out?.kind, 'sign-in');
  assert.equal(out.label, 'Upload paused');
  assert.match(out.detail, /signed out/);
  const other = saveProblem({
    state: { kind: 'other-account' },
    failed: false,
  });
  assert.equal(other?.kind, 'sign-in');
  assert.match(other.detail, /Another account/);
  assert.equal(
    syncProblemLine({ state: { kind: 'signed-out' }, failed: false }),
    'Sign in to upload',
  );
});

await test('parked saves point at Needs attention', () => {
  const state: SyncState = { kind: 'attention', parked: 2 };
  const problem = saveProblem({ state, failed: false, noteName: 'Plan' });
  assert.equal(problem?.kind, 'attention');
  assert.equal(problem.label, 'Needs attention');
  assert.ok(problem.detail.length > 0);
  assert.equal(syncProblemLine({ state, failed: false }), 'Needs attention');
});

await test('a paused sync keeps its footer line and no header control', () => {
  const lines: ReadonlyArray<readonly [SyncState, string]> = [
    [{ kind: 'server-behind' }, 'Waiting for server update'],
    [{ kind: 'update-required' }, 'Waiting for server update'],
    [{ kind: 'download-limit' }, 'Download paused'],
    [{ kind: 'delete-refused', path: 'a.md' }, 'Upload paused'],
    [{ kind: 'stopped' }, 'Upload paused'],
  ];
  for (const [state, line] of lines) {
    assert.equal(syncProblemLine({ state, failed: false }), line);
    assert.equal(saveProblem({ state, failed: false }), null);
  }
});
