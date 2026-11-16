import assert from 'node:assert/strict';
import test from 'node:test';
import {
  downloadLimitCode,
  transportFailedCode,
  type SyncNotice,
} from '@notesapp/sync';
import {
  noticeReadsQueue,
  noticeRechecksAccount,
  noticeStartsOver,
  startingSyncState,
  syncDot,
  syncDotClassName,
  syncFooter,
  syncNeedsAttention,
  syncQueueOf,
  syncStateMessage,
  syncStateOfNotice,
  syncStateOfQueue,
  syncStateOnline,
  syncLineBudget,
  syncStatusClassNames,
  type SyncQueue,
  type SyncState,
} from './sync-state.ts';

/** A queue of one workspace with the counts a test names. */
function queueOf(unsent: number, parked: number): SyncQueue {
  return { unsent, parked };
}

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
  { kind: 'connected' },
  { kind: 'paused', reason: 'session' },
  { kind: 'paused', reason: 'other-account' },
  { kind: 'access-lost' },
  { kind: 'resumed' },
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
    if (
      notice.kind === 'snapshot-restart' ||
      notice.kind === 'preserved' ||
      notice.kind === 'superseded' ||
      notice.kind === 'lease-held' ||
      notice.kind === 'lease-lost'
    ) {
      assert.equal(state, null);
      continue;
    }
    assert.notEqual(state, null);
  }
});

await test('a refused save lets the queue state what waits', () => {
  // A refusal that parks the save leaves it in the queue, and a refusal that
  // keeps the text as a new note parks nothing. Only the queue knows which,
  // so the notice changes no state and asks for a queue read.
  const notice: SyncNotice = {
    kind: 'preserved',
    mutationId: 'm2',
    code: 'path_conflict',
    fileIds: ['f2'],
  };
  assert.equal(syncStateOfNotice(notice), null);
  assert.equal(noticeReadsQueue(notice), true);
});

await test('every notice that changes the queue reads the queue', () => {
  const reads = notices.filter(noticeReadsQueue).map((notice) => notice.kind);
  assert.deepEqual(reads, [
    'pushed',
    'preserved',
    'snapshot-activated',
    'changes-applied',
    'connected',
    'resumed',
    'protocol',
  ]);
});

await test('a recovered connection rechecks the account without polling it on every change', () => {
  assert.equal(noticeRechecksAccount({ kind: 'account-locked' }), true);
  assert.equal(noticeRechecksAccount({ kind: 'connected' }), true);
  for (const notice of notices) {
    if (notice.kind !== 'connected')
      assert.equal(noticeRechecksAccount(notice), false);
  }
});

const states: readonly SyncState[] = [
  { kind: 'starting' },
  { kind: 'in-step' },
  { kind: 'sending' },
  { kind: 'waiting' },
  { kind: 'download-limit' },
  { kind: 'attention', parked: 1 },
  { kind: 'attention', parked: 3 },
  { kind: 'delete-refused', path: 'plans/old.md' },
  { kind: 'signed-out' },
  { kind: 'other-account' },
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
    syncStateMessage({ kind: 'delete-refused', path: 'a.md' }).startsWith(
      'A note',
    ),
  );
});

await test('only the states that need an answer ask for one', () => {
  assert.equal(syncNeedsAttention({ kind: 'in-step' }), false);
  assert.equal(syncNeedsAttention({ kind: 'waiting' }), false);
  assert.equal(syncNeedsAttention({ kind: 'attention', parked: 1 }), true);
  assert.equal(syncNeedsAttention({ kind: 'signed-out' }), true);
  assert.equal(syncNeedsAttention({ kind: 'stopped' }), true);
  // An update is an action that the person takes. A server that runs an
  // earlier version is not, so it waits like a lost connection.
  assert.equal(syncNeedsAttention({ kind: 'update-required' }), true);
  assert.equal(syncNeedsAttention({ kind: 'server-behind' }), false);
});

await test('another account on this browser is its own cause', () => {
  const state = syncStateOfNotice({ kind: 'paused', reason: 'other-account' });
  assert.deepEqual(state, { kind: 'other-account' });
  assert.equal(syncNeedsAttention({ kind: 'other-account' }), true);
  // The work waits for its account, so the queue never hides the cause.
  assert.deepEqual(syncStateOfQueue({ kind: 'other-account' }, queueOf(0, 0)), {
    kind: 'other-account',
  });
  assert.match(
    syncStateMessage({ kind: 'other-account' }),
    /^Another account signed in\./,
  );
});

await test('a session that serves the engine again starts over', () => {
  assert.equal(noticeStartsOver({ kind: 'resumed' }), true);
  assert.equal(noticeStartsOver({ kind: 'protocol', fit: 'compatible' }), true);
  assert.equal(
    noticeStartsOver({ kind: 'protocol', fit: 'client-behind' }),
    false,
  );
  assert.equal(noticeStartsOver({ kind: 'access-lost' }), false);
  assert.deepEqual(syncStateOfNotice({ kind: 'resumed' }), startingSyncState);
});

await test('the lease of the sending tab says nothing to the person', () => {
  // Every tab of the browser shares one queue, and the tab that holds the
  // lease sends it for all of them. Which tab sends is no cause a person can
  // act on, and the queue already states where the work stands. A tab that
  // waited for the lease of a closed tab read that another tab was saving for
  // as long as it stayed open.
  assert.equal(syncStateOfNotice({ kind: 'lease-held' }), null);
  assert.equal(syncStateOfNotice({ kind: 'lease-lost' }), null);
  assert.deepEqual(syncStateOfQueue(startingSyncState, queueOf(0, 0)), {
    kind: 'in-step',
  });
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
  assert.deepEqual(
    syncStateOfQueue(resumed ?? startingSyncState, queueOf(0, 0)),
    {
      kind: 'in-step',
    },
  );
  assert.deepEqual(
    syncStateOfQueue({ kind: 'update-required' }, queueOf(0, 0)),
    {
      kind: 'update-required',
    },
  );
});

await test('an empty queue reports that everything reached the server', () => {
  const next = syncStateOfQueue({ kind: 'sending' }, queueOf(0, 0));
  assert.deepEqual(next, { kind: 'in-step' });
  assert.equal(syncStateMessage(next), 'Everything is saved to the server.');
});

await test('a queued save reports that a send is in progress', () => {
  assert.deepEqual(syncStateOfQueue({ kind: 'starting' }, queueOf(2, 0)), {
    kind: 'sending',
  });
});

await test('a queue count never overwrites a state the person must read', () => {
  const offline: SyncState = { kind: 'waiting' };
  assert.deepEqual(syncStateOfQueue(offline, queueOf(0, 1)), offline);
  const signedOut: SyncState = { kind: 'signed-out' };
  assert.deepEqual(syncStateOfQueue(signedOut, queueOf(0, 1)), signedOut);
});

await test('a parked save counts as no send', () => {
  // A parked entry stays in the queue with its state `conflict`, and the
  // engine never sends it again.
  assert.deepEqual(syncQueueOf([]), queueOf(0, 0));
  assert.deepEqual(
    syncQueueOf([
      { state: 'conflict' },
      { state: 'pending' },
      { state: 'sending' },
      { state: 'conflict' },
    ]),
    queueOf(2, 2),
  );
});

/** The footer of one queue read, online, after a quiet first state. */
function footerOfQueue(current: SyncState, queue: SyncQueue) {
  return syncFooter({
    state: syncStateOfQueue(current, queue),
    online: true,
    noteName: null,
    openNoteWriteFailed: false,
  });
}

await test('a parked save alone never reads as a send', () => {
  // The defect this covers: a save the server refused waited in Needs
  // attention, and the footer said "Sending your save to the server." with
  // a neutral dot, because the queue count held the parked entry.
  const queue = syncQueueOf([{ state: 'conflict' }]);
  for (const current of [
    startingSyncState,
    { kind: 'sending' } as const,
    { kind: 'in-step' } as const,
  ])
    assert.deepEqual(footerOfQueue(current, queue), {
      line: '1 save needs attention.',
      dot: 'attention',
    });
  assert.deepEqual(footerOfQueue(startingSyncState, queueOf(0, 2)), {
    line: '2 saves need attention.',
    dot: 'attention',
  });
});

await test('a parked save outranks a send that ends on its own', () => {
  assert.deepEqual(footerOfQueue({ kind: 'sending' }, queueOf(3, 1)), {
    line: '1 save needs attention.',
    dot: 'attention',
  });
});

await test('a send of another note keeps the parked save in view', () => {
  // A push sets the quiet state, and the last queue read states it.
  const pushed = syncStateOfNotice({
    kind: 'pushed',
    mutationIds: ['m1'],
    fileIds: ['f1'],
  });
  assert.deepEqual(
    syncStateOfQueue(pushed ?? startingSyncState, queueOf(0, 1)),
    {
      kind: 'attention',
      parked: 1,
    },
  );
});

await test('the footer follows the parked save when the person acts', () => {
  const parked = syncStateOfQueue(startingSyncState, queueOf(0, 1));
  // Retry and Save as new note queue the text again: it is a send now.
  const retried = syncStateOfQueue(parked, queueOf(1, 0));
  assert.deepEqual(retried, { kind: 'sending' });
  assert.deepEqual(syncStateOfQueue(retried, queueOf(0, 0)), {
    kind: 'in-step',
  });
  // Discard empties the queue, and no engine notice follows it.
  assert.deepEqual(footerOfQueue(parked, queueOf(0, 0)), {
    line: 'Everything is saved to the server.',
    dot: 'saved',
  });
  // One of two parked saves is discarded, so one still waits.
  assert.deepEqual(
    syncStateOfQueue({ kind: 'attention', parked: 2 }, queueOf(0, 1)),
    {
      kind: 'attention',
      parked: 1,
    },
  );
});

await test('a parked save with no connection states the connection', () => {
  // The device cannot send anything, and the Needs attention link below the
  // line states the parked save. The line and the dot state one fact.
  const offline = syncStateOfQueue({ kind: 'waiting' }, queueOf(1, 1));
  assert.deepEqual(
    syncFooter({
      state: offline,
      online: false,
      noteName: null,
      openNoteWriteFailed: false,
    }),
    { line: 'No connection. Notes stay on this device.', dot: 'pending' },
  );
  // When the connection returns, the queue states where the work stands.
  const online = syncStateOnline(offline);
  assert.deepEqual(online, startingSyncState);
  assert.deepEqual(syncStateOfQueue(online, queueOf(0, 1)), {
    kind: 'attention',
    parked: 1,
  });
});

await test('a returned connection with nothing to send is in step', () => {
  // The defect this covers: no engine notice follows an empty pass, so the
  // footer said "No connection." while the device was online again.
  const online = syncStateOnline({ kind: 'waiting' });
  assert.deepEqual(syncStateOfQueue(online, queueOf(0, 0)), {
    kind: 'in-step',
  });
  // A state the person must read stays.
  assert.deepEqual(syncStateOnline({ kind: 'signed-out' }), {
    kind: 'signed-out',
  });
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

await test('a first sync past the download limit names its cause, not the connection', () => {
  // Record 0193. A new device whose snapshot waits for the next month read
  // that it had no connection, which was not the cause.
  const state = syncStateOfNotice({
    kind: 'cycle-error',
    code: downloadLimitCode,
  });
  assert.deepEqual(state, { kind: 'download-limit' });
  assert.equal(
    syncStateMessage(state ?? startingSyncState),
    'Sync waits for the next month. Saves wait here.',
  );
  assert.equal(syncDot(state ?? startingSyncState, true), 'pending');
});

await test('a refusal still says that saving stopped', () => {
  const state = syncStateOfNotice({
    kind: 'cycle-error',
    code: 'unexpected_response',
  });
  assert.deepEqual(state, { kind: 'stopped' });
  assert.match(
    syncStateMessage(state ?? startingSyncState),
    /^Saving stopped\./,
  );
});

await test('the dot of the footer states where the work stands', () => {
  assert.equal(syncDot({ kind: 'in-step' }, true), 'saved');
  assert.equal(syncDot({ kind: 'starting' }, true), 'pending');
  assert.equal(syncDot({ kind: 'sending' }, true), 'pending');
  assert.equal(syncDot({ kind: 'waiting' }, true), 'pending');
  assert.equal(syncDot({ kind: 'attention', parked: 1 }, true), 'attention');
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

await test('a save that passed a newer head is not a message of its own', () => {
  // The save joined the work of that head, so the text of the other device
  // is in the note and not only in History. A merge offers Review on the
  // note, and that is the one message of the cause (record 0087).
  assert.equal(
    syncStateOfNotice({
      kind: 'superseded',
      fileId: 'f3',
      path: 'plans/roadmap.md',
    }),
    null,
  );
});

await test('a failed local write of the open note takes the footer', () => {
  // Sync reports that the server holds every save it saw, but the text of
  // the open note never reached local storage, so that line would be false.
  const footer = syncFooter({
    state: { kind: 'in-step' },
    online: true,
    noteName: null,
    openNoteWriteFailed: true,
  });
  assert.equal(footer.dot, 'attention');
  assert.doesNotMatch(footer.line, /Everything is saved/);
  assert.match(footer.line, /not saved/);
  // The failure outranks a lost connection too, because the connection only
  // delays work that is safe on the device.
  assert.deepEqual(
    syncFooter({
      state: { kind: 'waiting' },
      online: false,
      noteName: null,
      openNoteWriteFailed: true,
    }),
    footer,
  );
});

await test('the footer states sync while local writes succeed', () => {
  assert.deepEqual(
    syncFooter({
      state: { kind: 'in-step' },
      online: true,
      noteName: null,
      openNoteWriteFailed: false,
    }),
    { line: 'Everything is saved to the server.', dot: 'saved' },
  );
  assert.deepEqual(
    syncFooter({
      state: { kind: 'in-step' },
      online: false,
      noteName: null,
      openNoteWriteFailed: false,
    }),
    { line: 'No connection. Notes stay on this device.', dot: 'pending' },
  );
});

await test('pending editor work replaces only the server-saved claim', () => {
  const input = {
    state: { kind: 'in-step' } as const,
    online: true,
    noteName: null,
    openNoteWriteFailed: false,
  };
  assert.deepEqual(syncFooter({ ...input, openNotePending: true }), {
    line: 'Saving the open note to the server.',
    dot: 'pending',
  });
  for (const state of states.filter((state) => state.kind !== 'in-step')) {
    assert.deepEqual(
      syncFooter({ ...input, state, openNotePending: true }),
      syncFooter({ ...input, state }),
    );
  }
  assert.deepEqual(
    syncFooter({ ...input, online: false, openNotePending: true }),
    syncFooter({ ...input, online: false }),
  );
  assert.deepEqual(
    syncFooter({ ...input, openNoteWriteFailed: true, openNotePending: true }),
    syncFooter({ ...input, openNoteWriteFailed: true }),
  );
});

await test('every footer sentence fits two lines of the narrowest sidebar', () => {
  // The defect this covers: the footer cut its sentence at one line, so a
  // person read "No connection. Your notes stay on..." and never the end.
  const lines = [
    ...states.map((state) => syncStateMessage(state, 'roadmap')),
    syncFooter({
      state: { kind: 'in-step' },
      online: false,
      noteName: null,
      openNoteWriteFailed: false,
    }).line,
    syncFooter({
      state: { kind: 'in-step' },
      online: true,
      noteName: null,
      openNoteWriteFailed: true,
    }).line,
  ];
  for (const line of lines)
    assert.ok(
      line.length <= syncLineBudget,
      `${String(line.length)} characters: ${line}`,
    );
});

await test('the footer sentence wraps and is never cut', () => {
  const line = syncStatusClassNames.line.split(' ');
  for (const cut of ['truncate', 'whitespace-nowrap', 'overflow-hidden'])
    assert.ok(!line.includes(cut), cut);
  assert.ok(!line.some((part) => part.startsWith('line-clamp')));
  // The dot stays beside the first line: its frame is one line of
  // `text-control` high, and the status aligns to the start.
  assert.ok(syncStatusClassNames.dotFrame.split(' ').includes('h-5'));
  assert.ok(syncStatusClassNames.status.split(' ').includes('items-start'));
});
