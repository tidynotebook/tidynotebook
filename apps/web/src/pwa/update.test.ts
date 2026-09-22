import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closeForUpdate,
  readUpdateMessage,
  readyWorker,
  runUpdate,
  UpdateFailedError,
  updateFailureMessage,
  type LeaderPorts,
  type UpdateFailure,
  type UpdateRegistration,
  type UpdateWorker,
} from './update.ts';

/** A worker whose state the test moves, with its posted messages. */
function fakeWorker(
  initial: ServiceWorkerState,
  onSkipWaiting: ServiceWorkerState = 'activated',
): UpdateWorker & {
  move: (state: ServiceWorkerState) => void;
  readonly posted: string[];
} {
  let state = initial;
  const listeners = new Set<() => void>();
  const posted: string[] = [];
  const move = (next: ServiceWorkerState): void => {
    state = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    state: () => state,
    postMessage: (message) => {
      posted.push(message.type);
      queueMicrotask(() => {
        move(onSkipWaiting);
      });
    },
    onStateChange: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    move,
    posted,
  };
}

/** A registration over fixed workers and one update behaviour. */
function registrationOf(parts: {
  waiting?: UpdateWorker | null;
  installing?: UpdateWorker | null;
  update?: () => Promise<void>;
}): UpdateRegistration {
  return {
    waiting: () => parts.waiting ?? null,
    installing: () => parts.installing ?? null,
    update: parts.update ?? (() => Promise.resolve()),
  };
}

/** Leader ports that write every step to one log. */
function leaderPorts(
  log: string[],
  overrides: Partial<LeaderPorts> = {},
  othersClose = true,
): LeaderPorts {
  return {
    registration: registrationOf({ waiting: fakeWorker('installed') }),
    flushDrafts: () => {
      log.push('flush');
      return Promise.resolve();
    },
    stopQueue: () => {
      log.push('stop');
      return Promise.resolve();
    },
    closeStore: () => {
      log.push('close');
      return Promise.resolve();
    },
    tabs: {
      closeOthers: () => {
        log.push('close-others');
        return Promise.resolve(othersClose);
      },
      reopen: () => {
        log.push('reopen');
      },
    },
    post: (message) => {
      log.push(message.type);
    },
    reload: () => {
      log.push('reload');
    },
    ...overrides,
  };
}

/** Whether a failure is an update failure of one reason. */
function failedWith(reason: UpdateFailure) {
  return (error: unknown): boolean =>
    error instanceof UpdateFailedError && error.reason === reason;
}

await test('an update message names its sender and its type', () => {
  assert.deepEqual(
    readUpdateMessage({ from: 'tab-a', type: 'NOTESAPP_CLOSE_FOR_UPDATE' }),
    { from: 'tab-a', message: { type: 'NOTESAPP_CLOSE_FOR_UPDATE' } },
  );
  assert.deepEqual(
    readUpdateMessage({ from: 'tab-a', type: 'NOTESAPP_UPDATE_SETTLED' }),
    { from: 'tab-a', message: { type: 'NOTESAPP_UPDATE_SETTLED' } },
  );
  // A message without a sender could come from this tab, so it is refused.
  assert.equal(readUpdateMessage({ type: 'NOTESAPP_CLOSE_FOR_UPDATE' }), null);
  assert.equal(readUpdateMessage({ from: 'tab-a', type: 'OTHER' }), null);
  assert.equal(readUpdateMessage('NOTESAPP_CLOSE_FOR_UPDATE'), null);
  assert.equal(readUpdateMessage(null), null);
});

await test('a waiting worker is used as it is', async () => {
  const waiting = fakeWorker('installed');
  let updated = false;
  const ready = await readyWorker(
    registrationOf({
      waiting,
      update: () => {
        updated = true;
        return Promise.resolve();
      },
    }),
  );
  assert.equal(ready, waiting);
  assert.equal(updated, false);
});

await test('a missing worker is installed first', async () => {
  const worker = fakeWorker('installing');
  let installing: UpdateWorker | null = null;
  let waiting: UpdateWorker | null = null;
  const registration: UpdateRegistration = {
    waiting: () => waiting,
    installing: () => installing,
    update: () => {
      installing = worker;
      queueMicrotask(() => {
        installing = null;
        waiting = worker;
        worker.move('installed');
      });
      return Promise.resolve();
    },
  };
  assert.equal(await readyWorker(registration), worker);
});

await test('each failure to get a worker changes nothing and names its cause', async () => {
  await assert.rejects(
    readyWorker(
      registrationOf({ update: () => Promise.reject(new Error('offline')) }),
    ),
    failedWith('offline'),
  );
  const broken = fakeWorker('installing');
  const install = readyWorker(registrationOf({ installing: broken }));
  broken.move('redundant');
  await assert.rejects(install, failedWith('install-failed'));
  // The server answered with the same worker, so nothing new waits.
  await assert.rejects(
    readyWorker(registrationOf({})),
    failedWith('not-ready'),
  );
});

await test('no registration means a reload loads the new version', async () => {
  assert.equal(await readyWorker(null), null);
  const log: string[] = [];
  await runUpdate(leaderPorts(log, { registration: null }));
  assert.equal(log.at(-1), 'reload');
});

await test('an update stores every text before the new worker starts', async () => {
  const log: string[] = [];
  const worker = fakeWorker('installed');
  await runUpdate(
    leaderPorts(log, { registration: registrationOf({ waiting: worker }) }),
  );
  assert.deepEqual(log, [
    'flush',
    'NOTESAPP_CLOSE_FOR_UPDATE',
    'close-others',
    'flush',
    'stop',
    'close',
    'NOTESAPP_UPDATE_SETTLED',
    'reload',
  ]);
  assert.deepEqual(worker.posted, ['NOTESAPP_SKIP_WAITING']);
  assert.equal(worker.state(), 'activated');
});

await test('a tab that stays open stops the update with this tab usable', async () => {
  const log: string[] = [];
  const worker = fakeWorker('installed');
  await assert.rejects(
    runUpdate(
      leaderPorts(
        log,
        { registration: registrationOf({ waiting: worker }) },
        false,
      ),
    ),
    failedWith('other-tab-open'),
  );
  // Nothing stopped or closed, the worker still waits, and the tabs that did
  // close are told to reload into the version that is still active.
  assert.deepEqual(log, [
    'flush',
    'NOTESAPP_CLOSE_FOR_UPDATE',
    'close-others',
    'reopen',
    'NOTESAPP_UPDATE_SETTLED',
  ]);
  assert.deepEqual(worker.posted, []);
});

await test('a text that cannot be stored stops the update before any tab closes', async () => {
  const log: string[] = [];
  const failure = new Error('the draft write did not commit');
  await assert.rejects(
    runUpdate(
      leaderPorts(log, {
        flushDrafts: () => Promise.reject(failure),
      }),
    ),
    (error: unknown) => error === failure,
  );
  assert.deepEqual(log, []);
});

await test('a worker that fails to start asks for a reload and never reloads alone', async () => {
  const log: string[] = [];
  const worker = fakeWorker('installed', 'redundant');
  await assert.rejects(
    runUpdate(
      leaderPorts(log, { registration: registrationOf({ waiting: worker }) }),
    ),
    failedWith('start-failed'),
  );
  assert.equal(log.includes('reload'), false);
  // The text was stored before the store closed, so the reload is safe.
  assert.ok(log.indexOf('flush', 1) < log.indexOf('close'));
  assert.equal(log.at(-1), 'NOTESAPP_UPDATE_SETTLED');
});

await test('a tab asked to close stores its text before it closes', async () => {
  const log: string[] = [];
  const ports = {
    flushDrafts: () => {
      log.push('flush');
      return Promise.resolve();
    },
    stopQueue: () => {
      log.push('stop');
      return Promise.resolve();
    },
    closeStore: () => {
      log.push('close');
      return Promise.resolve();
    },
    leave: () => {
      log.push('leave');
    },
  };
  assert.equal(await closeForUpdate(ports), 'closed');
  assert.deepEqual(log, ['flush', 'stop', 'close', 'leave']);

  log.length = 0;
  const kept = await closeForUpdate({
    ...ports,
    flushDrafts: () => Promise.reject(new Error('quota')),
  });
  // The tab keeps its lock, so the leader cannot start the new version.
  assert.equal(kept, 'kept');
  assert.deepEqual(log, []);
});

await test('every failure has one sentence with no code', () => {
  const reasons: readonly UpdateFailure[] = [
    'offline',
    'install-failed',
    'not-ready',
    'other-tab-open',
    'start-failed',
  ];
  for (const reason of reasons) {
    const message = updateFailureMessage(reason);
    assert.ok(message.endsWith('.'), reason);
    assert.ok(!message.includes('_'), reason);
    assert.ok(!message.includes('-'), reason);
  }
});
