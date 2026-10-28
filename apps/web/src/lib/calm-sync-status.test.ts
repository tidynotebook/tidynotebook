import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calmSyncTracker,
  calmSyncView,
  offlineLine,
  syncWaitCapMs,
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
  editing: false,
};
/** A keystroke that is not on this device yet. */
const keystroke: CalmSyncFacts = { ...synced, pending: true, editing: true };
/** The draft is on this device and waits for the server. */
const onDevice: CalmSyncFacts = { ...synced, pending: true };

/** A tracker with every view it reported. */
function track(initial: CalmSyncFacts): {
  readonly tracker: ReturnType<typeof calmSyncTracker>;
  readonly seen: CalmSyncView[];
} {
  const seen: CalmSyncView[] = [];
  const tracker = calmSyncTracker(initial, (view) => seen.push(view));
  return { tracker, seen };
}

/** Types for `ms` milliseconds, one key every 120 ms, as the editor saves. */
function typeFor(
  tracker: ReturnType<typeof calmSyncTracker>,
  tick: (ms: number) => void,
  ms: number,
): void {
  for (let at = 0; at < ms; at += 120) {
    tracker.update(keystroke);
    tick(60);
    tracker.update(onDevice);
    tick(60);
  }
}

await test('the grace period and the cap are named', () => {
  assert.equal(syncWaitGraceMs, 4000);
  assert.equal(syncWaitCapMs, 30_000);
});

await test('rapid typing changes nothing within the grace period', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const tick = (ms: number): void => t.mock.timers.tick(ms);
  const { tracker, seen } = track(synced);
  // Ten seconds of typing, then the pause of 2.5 s after which the editor
  // uploads, and an upload that the server takes 3 s after the last key.
  typeFor(tracker, tick, 10_000);
  tick(2440);
  tracker.update({ ...onDevice, state: { kind: 'sending' } });
  tick(500);
  tracker.update(synced);
  assert.deepEqual(seen, []);
  assert.deepEqual(tracker.view(), { line: syncedLine, dot: 'saved' });
  tracker.dispose();
});

await test('a long wait for the server shows Waiting to upload', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const tick = (ms: number): void => t.mock.timers.tick(ms);
  const { tracker, seen } = track(synced);
  tracker.update(keystroke);
  tracker.update(onDevice);
  tick(syncWaitGraceMs - 1);
  assert.deepEqual(seen, []);
  tick(1);
  assert.deepEqual(seen, [{ line: waitingLine, dot: 'pending' }]);
  // More typing does not flip it back while the work still waits.
  typeFor(tracker, tick, 1000);
  assert.equal(seen.length, 1);
  // The server takes the work: saved again, in one change.
  tracker.update(synced);
  assert.deepEqual(seen, [
    { line: waitingLine, dot: 'pending' },
    { line: syncedLine, dot: 'saved' },
  ]);
  tracker.dispose();
});

await test('typing without a pause shows the wait at the cap', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const tick = (ms: number): void => t.mock.timers.tick(ms);
  const { tracker, seen } = track(synced);
  typeFor(tracker, tick, syncWaitCapMs - 240);
  assert.deepEqual(seen, []);
  typeFor(tracker, tick, 480);
  assert.deepEqual(seen, [{ line: waitingLine, dot: 'pending' }]);
  tracker.dispose();
});

await test('a lost connection shows at once', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { tracker, seen } = track(synced);
  tracker.update({ ...keystroke, online: false });
  assert.deepEqual(seen, [{ line: offlineLine, dot: 'pending' }]);
  const retry = track(synced);
  retry.tracker.update({ ...onDevice, state: { kind: 'waiting' } });
  assert.deepEqual(retry.seen, [{ line: offlineLine, dot: 'pending' }]);
  tracker.dispose();
  retry.tracker.dispose();
});

await test('a failure shows its problem line at once', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { tracker, seen } = track(synced);
  tracker.update({ ...keystroke, failed: true });
  assert.deepEqual(seen, [{ line: 'Not saved', dot: 'attention' }]);
  tracker.update({ ...onDevice, state: { kind: 'signed-out' } });
  assert.deepEqual(seen.at(-1), {
    line: 'Sign in to upload',
    dot: 'attention',
  });
  tracker.update({ ...synced, state: { kind: 'attention', parked: 1 } });
  assert.deepEqual(seen.at(-1), { line: 'Needs attention', dot: 'attention' });
  tracker.dispose();
});

await test('the saved line stays green while waiting and offline lines stay muted', () => {
  for (const facts of [synced, keystroke, onDevice])
    assert.deepEqual(calmSyncView(facts, false), {
      line: syncedLine,
      dot: 'saved',
    });
  assert.deepEqual(calmSyncView(synced, true), {
    line: syncedLine,
    dot: 'saved',
  });
  for (const facts of [keystroke, onDevice])
    assert.deepEqual(calmSyncView(facts, true), {
      line: waitingLine,
      dot: 'pending',
    });
  for (const waitedLong of [false, true])
    assert.deepEqual(calmSyncView({ ...onDevice, online: false }, waitedLong), {
      line: offlineLine,
      dot: 'pending',
    });
});

await test('a paused sync keeps the dot of its state', () => {
  assert.deepEqual(
    calmSyncView({ ...synced, state: { kind: 'server-behind' } }, false),
    { line: 'Waiting for server update', dot: 'pending' },
  );
  assert.deepEqual(
    calmSyncView({ ...synced, state: { kind: 'stopped' } }, false),
    { line: 'Upload paused', dot: 'attention' },
  );
});
