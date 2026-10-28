import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calmSyncTracker,
  calmSyncView,
  offlineLine,
  syncWaitGraceMs,
  syncedLine,
  waitingLine,
  type CalmSyncFacts,
  type CalmSyncView,
} from './calm-sync-status.ts';

const synced: CalmSyncFacts = {
  state: { kind: 'in-step' },
  online: true,
  failed: false,
  pending: false,
};
const typing: CalmSyncFacts = { ...synced, pending: true };

/** A tracker on fake timers, with every view it reported. */
function track(initial: CalmSyncFacts): {
  readonly tracker: ReturnType<typeof calmSyncTracker>;
  readonly seen: CalmSyncView[];
} {
  const seen: CalmSyncView[] = [];
  const tracker = calmSyncTracker(initial, (view) => seen.push(view));
  return { tracker, seen };
}

await test('the grace period is a few seconds', () => {
  assert.equal(syncWaitGraceMs, 4000);
});

await test('rapid typing changes nothing within the grace period', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { tracker, seen } = track(synced);
  assert.equal(tracker.view().line, syncedLine);
  // Each keystroke makes a short pending period that the server then ends.
  for (let key = 0; key < 20; key += 1) {
    tracker.update(typing);
    t.mock.timers.tick(150);
    tracker.update({ ...typing, state: { kind: 'sending' } });
    t.mock.timers.tick(150);
    tracker.update(synced);
    t.mock.timers.tick(50);
  }
  // Typing that stays pending, but for less than the grace period.
  tracker.update(typing);
  t.mock.timers.tick(syncWaitGraceMs - 1);
  assert.deepEqual(seen, []);
  assert.deepEqual(tracker.view(), { line: syncedLine, dot: 'pending' });
  tracker.dispose();
});

await test('a long wait for the server shows Waiting to upload', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { tracker, seen } = track(synced);
  tracker.update(typing);
  t.mock.timers.tick(1000);
  // More typing inside one wait keeps the start of the wait.
  tracker.update({ ...typing, state: { kind: 'sending' } });
  t.mock.timers.tick(syncWaitGraceMs - 1000);
  assert.deepEqual(seen, [{ line: waitingLine, dot: 'pending' }]);
  // The server takes the work: Saved again, in one change.
  tracker.update(synced);
  assert.deepEqual(seen.at(-1), { line: syncedLine, dot: 'pending' });
  assert.equal(seen.length, 2);
  tracker.dispose();
});

await test('a lost connection shows at once', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { tracker, seen } = track(synced);
  tracker.update({ ...typing, online: false });
  assert.deepEqual(seen, [{ line: offlineLine, dot: 'pending' }]);
  const retry = track(synced);
  retry.tracker.update({ ...synced, state: { kind: 'waiting' } });
  assert.deepEqual(retry.seen, [{ line: offlineLine, dot: 'pending' }]);
  tracker.dispose();
  retry.tracker.dispose();
});

await test('a failure shows its problem line at once', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { tracker, seen } = track(synced);
  tracker.update({ ...typing, failed: true });
  assert.deepEqual(seen, [{ line: 'Not saved', dot: 'attention' }]);
  tracker.update({ ...synced, state: { kind: 'signed-out' } });
  assert.deepEqual(seen.at(-1), {
    line: 'Sign in to upload',
    dot: 'attention',
  });
  tracker.update({ ...synced, state: { kind: 'attention', parked: 1 } });
  assert.deepEqual(seen.at(-1), { line: 'Needs attention', dot: 'attention' });
  tracker.dispose();
});

await test('a quiet line never changes the colour of its dot', () => {
  for (const facts of [
    synced,
    typing,
    { ...typing, online: false },
  ] satisfies CalmSyncFacts[])
    for (const waited of [null, 0, syncWaitGraceMs])
      assert.equal(calmSyncView(facts, waited).dot, 'pending');
});

await test('a paused sync keeps the dot of its state', () => {
  assert.deepEqual(
    calmSyncView({ ...synced, state: { kind: 'server-behind' } }, null),
    { line: 'Waiting for server update', dot: 'pending' },
  );
  assert.deepEqual(
    calmSyncView({ ...synced, state: { kind: 'stopped' } }, null),
    { line: 'Upload paused', dot: 'attention' },
  );
});
