import assert from 'node:assert/strict';
import test from 'node:test';
import { transportFailedCode, type SyncNotice } from '@notesapp/sync';
import {
  startingSyncState,
  syncDot,
  syncDotClassName,
  syncNeedsAttention,
  syncStateFileId,
  syncStateMessage,
  syncStateOfNotice,
  syncStateOfQueue,
  type SyncState,
} from './sync-state.ts';

const notices: readonly SyncNotice[] = [
  { kind: 'pushed', mutationIds: ['m1'], fileIds: ['f1'] },
  {
    kind: 'preserved',
    mutationId: 'm2',
    code: 'path_conflict',
    fileIds: ['f2'],
  },
  { kind: 'superseded', fileId: 'f3', path: 'plans/roadmap.md' },
  { kind: 'delete-refused', fileId: 'f4', path: 'plans/old.md' },
  { kind: 'retry', attempt: 2, delayMs: 7000 },
  { kind: 'snapshot-restart', reason: 'cursor' },
  { kind: 'snapshot-activated', count: 12 },
  { kind: 'changes-applied', count: 3 },
  { kind: 'paused', reason: 'session' },
  { kind: 'access-lost' },
  { kind: 'lease-held' },
  { kind: 'lease-lost' },
  { kind: 'protocol', fit: 'client-behind' },
  { kind: 'protocol', fit: 'server-behind' },
  { kind: 'protocol', fit: 'compatible' },
  { kind: 'cycle-error', code: 'network' },
];

await test('every engine notice maps to a typed state or to nothing', () => {
  for (const notice of notices) {
    const state = syncStateOfNotice(notice);
    if (notice.kind === 'snapshot-restart') {
      assert.equal(state, null);
      continue;
    }
    assert.notEqual(state, null);
  }
});

await test('a refused save names the file it kept', () => {
  const state = syncStateOfNotice({
    kind: 'preserved',
    mutationId: 'm2',
    code: 'path_conflict',
    fileIds: ['f2'],
  });
  assert.deepEqual(state, { kind: 'attention', fileId: 'f2' });
  assert.equal(syncStateFileId(state ?? { kind: 'starting' }), 'f2');
});

const states: readonly SyncState[] = [
  { kind: 'starting' },
  { kind: 'in-step' },
  { kind: 'sending' },
  { kind: 'waiting' },
  { kind: 'attention', fileId: 'f2' },
  { kind: 'superseded', path: 'plans/roadmap.md' },
  { kind: 'delete-refused', path: 'plans/old.md' },
  { kind: 'signed-out' },
  { kind: 'other-tab' },
  { kind: 'update-required' },
  { kind: 'server-behind' },
  { kind: 'stopped' },
];

await test('every state has one sentence with no code and no identifier', () => {
  for (const state of states) {
    const message = syncStateMessage(state, 'roadmap');
    assert.ok(message.length > 0, state.kind);
    assert.ok(message.endsWith('.'), state.kind);
    assert.ok(!message.includes('_'), state.kind);
    assert.ok(!message.includes('.md'), state.kind);
    assert.ok(!/\bf\d\b/.test(message), state.kind);
  }
});

await test('a state without a known note still reads as a sentence', () => {
  assert.ok(
    syncStateMessage({ kind: 'attention', fileId: undefined }).startsWith(
      'A note',
    ),
  );
});

await test('only the states that need an answer ask for one', () => {
  assert.equal(syncNeedsAttention({ kind: 'in-step' }), false);
  assert.equal(syncNeedsAttention({ kind: 'waiting' }), false);
  assert.equal(syncNeedsAttention({ kind: 'other-tab' }), false);
  assert.equal(syncNeedsAttention({ kind: 'attention', fileId: 'f' }), true);
  assert.equal(syncNeedsAttention({ kind: 'signed-out' }), true);
  assert.equal(syncNeedsAttention({ kind: 'stopped' }), true);
  // An update is an action that the person takes. A server that runs an
  // earlier version is not, so it waits like a lost connection.
  assert.equal(syncNeedsAttention({ kind: 'update-required' }), true);
  assert.equal(syncNeedsAttention({ kind: 'server-behind' }), false);
});

await test('a protocol misfit names its cause and a fit starts over', () => {
  assert.deepEqual(
    syncStateOfNotice({ kind: 'protocol', fit: 'client-behind' }),
    { kind: 'update-required' },
  );
  assert.deepEqual(
    syncStateOfNotice({ kind: 'protocol', fit: 'server-behind' }),
    { kind: 'server-behind' },
  );
  const resumed = syncStateOfNotice({ kind: 'protocol', fit: 'compatible' });
  assert.deepEqual(resumed, startingSyncState);
  // The next queue read may then replace it, because the state is quiet.
  assert.deepEqual(syncStateOfQueue(resumed ?? startingSyncState, 0), {
    kind: 'in-step',
  });
  assert.deepEqual(syncStateOfQueue({ kind: 'update-required' }, 0), {
    kind: 'update-required',
  });
});

await test('an empty queue reports that everything reached the server', () => {
  const next = syncStateOfQueue({ kind: 'sending' }, 0);
  assert.deepEqual(next, { kind: 'in-step' });
  assert.equal(syncStateMessage(next), 'Everything is saved to the server.');
});

await test('a queued save reports that a send is in progress', () => {
  assert.deepEqual(syncStateOfQueue({ kind: 'starting' }, 2), {
    kind: 'sending',
  });
});

await test('a queue count never overwrites a state the person must read', () => {
  const parked: SyncState = { kind: 'attention', fileId: 'file' };
  assert.deepEqual(syncStateOfQueue(parked, 0), parked);
  const offline: SyncState = { kind: 'waiting' };
  assert.deepEqual(syncStateOfQueue(offline, 0), offline);
});

await test('a lost connection says that there is no connection', () => {
  // The defect this covers: every cycle failure mapped to the stopped state,
  // whose sentence is "Saving to the server stopped." A request that never
  // reached the server takes that path, so a person whose connection died
  // while the browser still reported it online read the wrong cause.
  const state = syncStateOfNotice({
    kind: 'cycle-error',
    code: transportFailedCode,
  });
  assert.deepEqual(state, { kind: 'waiting' });
  assert.match(syncStateMessage(state ?? startingSyncState), /No connection/);
});

await test('a refusal still says that saving stopped', () => {
  const state = syncStateOfNotice({
    kind: 'cycle-error',
    code: 'unexpected_response',
  });
  assert.deepEqual(state, { kind: 'stopped' });
  assert.match(
    syncStateMessage(state ?? startingSyncState),
    /Saving to the server stopped/,
  );
});

await test('the dot of the footer states where the work stands', () => {
  assert.equal(syncDot({ kind: 'in-step' }, true), 'saved');
  assert.equal(syncDot({ kind: 'superseded', path: 'a.md' }, true), 'saved');
  assert.equal(syncDot({ kind: 'starting' }, true), 'pending');
  assert.equal(syncDot({ kind: 'sending' }, true), 'pending');
  assert.equal(syncDot({ kind: 'waiting' }, true), 'pending');
  assert.equal(syncDot({ kind: 'other-tab' }, true), 'pending');
  assert.equal(syncDot({ kind: 'attention', fileId: 'f' }, true), 'attention');
  assert.equal(syncDot({ kind: 'signed-out' }, true), 'attention');
  assert.equal(syncDot({ kind: 'stopped' }, true), 'attention');
  assert.equal(
    syncDot({ kind: 'delete-refused', path: 'a.md' }, true),
    'attention',
  );
});

await test('a device with no connection is pending and not a failure', () => {
  // The saves are on this device and they go up when the connection returns,
  // so the dot must not say that the person has to act.
  assert.equal(syncDot({ kind: 'in-step' }, false), 'pending');
  assert.equal(syncDot({ kind: 'starting' }, false), 'pending');
  // A state that does need the person keeps its tone offline as well.
  assert.equal(syncDot({ kind: 'signed-out' }, false), 'attention');
});

await test('every dot is one size and one token of the palette', () => {
  const fills = new Set<string>();
  for (const dot of ['saved', 'pending', 'attention'] as const) {
    const classes = syncDotClassName(dot).split(' ');
    assert.ok(classes.includes('size-1.5'));
    assert.ok(classes.includes('rounded-full'));
    const fill = classes.find((one) => one.startsWith('bg-'));
    assert.ok(fill !== undefined, dot);
    fills.add(fill);
  }
  // Three states, three fills: a dot that repeats a colour states nothing.
  assert.equal(fills.size, 3);
});
