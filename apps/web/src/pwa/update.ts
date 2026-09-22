/**
 * The update of the installed application across every open tab.
 *
 * Record 0086 asks a client to persist its working text before a waiting
 * worker takes over, to coordinate every open tab, and to keep the text when
 * any step fails. This module holds that order. Every effect is a port, so
 * a test drives each failure, and the browser adapters at the end are the
 * only code that reads a browser interface.
 *
 * One tab leads an update. Each open tab holds a shared tab lock for its
 * whole life. The leader asks the other tabs to close, and a tab closes only
 * after its text is stored: it stops its sync, closes its database, and then
 * gives up its lock. The leader takes the exclusive lock, which it gets only
 * when every other tab has closed, so no tab can hold unstored text when the
 * new version starts. A tab that cannot store its text keeps its lock, and
 * the update stops with every tab still usable.
 */
import {
  readWorkerLease,
  isLeaseExpired,
  type LocalStore,
} from '@notesapp/sync';

/** The channel that carries the messages of an update between tabs. */
export const updateChannelName = 'notesapp-update';

/** The Web Lock that every open tab holds in shared mode. */
export const openTabLockName = 'notesapp-open-tab';

/** How long the leader waits for every other tab to close. */
export const closeOthersTimeoutMs = 10_000;

/** A message of an update between tabs. */
export type UpdateMessage =
  /** Store your text, stop, and close, because a new version starts. */
  | { readonly type: 'NOTESAPP_CLOSE_FOR_UPDATE' }
  /**
   * The update ended, with the new version or without it. A closed tab
   * reloads, which is safe because it stored its text before it closed.
   */
  | { readonly type: 'NOTESAPP_UPDATE_SETTLED' };

/** One update message with the tab that sent it. */
export type SentUpdateMessage = {
  readonly from: string;
  readonly message: UpdateMessage;
};

/**
 * Reads an unknown channel message without asserting its shape.
 *
 * A channel delivers a message to every other channel object of its name,
 * and that includes the listener of the tab that sent it. The sender is
 * therefore part of the message, so a tab can ignore its own.
 */
export function readUpdateMessage(value: unknown): SentUpdateMessage | null {
  if (value === null || typeof value !== 'object') return null;
  const record = Object.fromEntries(Object.entries(value));
  const from = record['from'];
  const type = record['type'];
  if (typeof from !== 'string' || from === '') return null;
  if (type === 'NOTESAPP_CLOSE_FOR_UPDATE') return { from, message: { type } };
  if (type === 'NOTESAPP_UPDATE_SETTLED') return { from, message: { type } };
  return null;
}

/** Why an update stopped. Each reason has one sentence below. */
export type UpdateFailure =
  | 'offline'
  | 'install-failed'
  | 'not-ready'
  | 'other-tab-open'
  | 'start-failed';

/** An update that stopped for one known reason. */
export class UpdateFailedError extends Error {
  readonly reason: UpdateFailure;

  constructor(reason: UpdateFailure) {
    super(updateFailureMessage(reason));
    this.name = 'UpdateFailedError';
    this.reason = reason;
  }
}

/**
 * One sentence for each reason, with the action that helps.
 *
 * Every reason except `start-failed` leaves this tab as it was. A failed
 * start comes after this tab closed its database, so its action is a reload,
 * which is safe because the text is stored by then.
 */
export function updateFailureMessage(reason: UpdateFailure): string {
  if (reason === 'offline')
    return 'The new version needs a connection. Your work stays on this device. Try again when you are online.';
  if (reason === 'install-failed')
    return 'The new version could not install. Your work stays on this device. Try again later.';
  if (reason === 'not-ready')
    return 'The new version is not ready yet. Your work stays on this device. Try again later.';
  if (reason === 'other-tab-open')
    return 'Another tab of Notesapp did not close. Close the other tabs, then try again.';
  return 'The new version could not start. Your work is stored on this device. Reload this tab.';
}

/** One installed or installing worker, as the update needs it. */
export type UpdateWorker = {
  readonly state: () => ServiceWorkerState;
  readonly postMessage: (message: { readonly type: string }) => void;
  readonly onStateChange: (listener: () => void) => () => void;
};

/** The part of a worker registration that an update needs. */
export type UpdateRegistration = {
  readonly waiting: () => UpdateWorker | null;
  readonly installing: () => UpdateWorker | null;
  /** Asks the server for a new worker. Rejects when it cannot be reached. */
  readonly update: () => Promise<void>;
};

/** The open tabs of this browser, as the update needs them. */
export type OpenTabs = {
  /**
   * Waits until every other tab has closed and keeps that claim until this
   * tab reloads. Returns `false` when a tab stays open past the bound.
   */
  readonly closeOthers: () => Promise<boolean>;
  /** Gives up the claim after a failed update, so this tab is open again. */
  readonly reopen: () => void;
};

/** Every effect of the leading tab of an update. */
export type LeaderPorts = {
  /** The worker registration, or `null` where no worker is installed. */
  readonly registration: UpdateRegistration | null;
  /** Writes every in-memory buffer of this tab to the local store. */
  readonly flushDrafts: () => Promise<void>;
  /** Stops every sync engine of this tab and waits for its lease cleanup. */
  readonly stopQueue: () => Promise<void>;
  /** Closes the local database of this tab. */
  readonly closeStore: () => Promise<void>;
  readonly tabs: OpenTabs;
  /** Posts one message to every other tab. */
  readonly post: (message: UpdateMessage) => void;
  readonly reload: () => void;
};

/** Waits until one worker is installed or has failed to install. */
function installed(worker: UpdateWorker): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let remove = (): void => {};
    const settle = (): boolean => {
      const state = worker.state();
      if (state === 'installing' || state === 'parsed') return false;
      remove();
      resolve(state !== 'redundant');
      return true;
    };
    remove = worker.onStateChange(() => {
      settle();
    });
    settle();
  });
}

/**
 * The worker that waits to take over, installed first when it is missing.
 *
 * Returns `null` where no worker is registered: a reload then loads the new
 * version from the server with nothing to activate. Throws before any other
 * step, so a failure here changes nothing.
 */
export async function readyWorker(
  registration: UpdateRegistration | null,
): Promise<UpdateWorker | null> {
  if (registration === null) return null;
  const waiting = registration.waiting();
  if (waiting !== null) return waiting;
  if (registration.installing() === null) {
    try {
      await registration.update();
    } catch {
      throw new UpdateFailedError('offline');
    }
  }
  const installing = registration.installing();
  if (installing !== null && !(await installed(installing)))
    throw new UpdateFailedError('install-failed');
  const ready = registration.waiting();
  if (ready === null) throw new UpdateFailedError('not-ready');
  return ready;
}

/** Asks one waiting worker to take over and waits until it is active. */
function activate(worker: UpdateWorker): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let remove = (): void => {};
    const settle = (): void => {
      const state = worker.state();
      if (state === 'activated') {
        remove();
        resolve(true);
      } else if (state === 'redundant') {
        remove();
        resolve(false);
      }
    };
    remove = worker.onStateChange(settle);
    try {
      worker.postMessage({ type: 'NOTESAPP_SKIP_WAITING' });
      settle();
    } catch {
      remove();
      resolve(false);
    }
  });
}

/**
 * Leads one update of this browser.
 *
 * The order is the rule. A failure before the other tabs close leaves every
 * tab as it was. The text of this tab is stored before the other tabs are
 * asked to close and again before this tab closes, so the last keystrokes
 * are stored too. The new version starts only when no tab holds unstored
 * text, and this tab reloads only after the new worker is active.
 */
export async function runUpdate(ports: LeaderPorts): Promise<void> {
  const worker = await readyWorker(ports.registration);
  await ports.flushDrafts();
  ports.post({ type: 'NOTESAPP_CLOSE_FOR_UPDATE' });
  if (!(await ports.tabs.closeOthers())) {
    ports.tabs.reopen();
    // A tab that closed has stored its text, so it reloads into the version
    // that is still active and keeps working.
    ports.post({ type: 'NOTESAPP_UPDATE_SETTLED' });
    throw new UpdateFailedError('other-tab-open');
  }
  await ports.flushDrafts();
  await ports.stopQueue();
  await ports.closeStore();
  const started = worker === null ? true : await activate(worker);
  ports.post({ type: 'NOTESAPP_UPDATE_SETTLED' });
  if (!started) throw new UpdateFailedError('start-failed');
  ports.reload();
}

/** Every effect of a tab that another tab asks to close. */
export type FollowerPorts = {
  readonly flushDrafts: () => Promise<void>;
  readonly stopQueue: () => Promise<void>;
  readonly closeStore: () => Promise<void>;
  /** Gives up the shared tab lock of this tab. */
  readonly leave: () => void;
};

/**
 * Closes this tab for an update that another tab leads.
 *
 * Returns `kept` when the text could not be stored. The tab then keeps its
 * store, its sync and its lock, so the leader cannot start the new version
 * and nothing of this tab is lost. Returns `closed` when the tab stored its
 * text and closed. It then reloads when the leader settles.
 */
export async function closeForUpdate(
  ports: FollowerPorts,
): Promise<'closed' | 'kept'> {
  try {
    await ports.flushDrafts();
  } catch {
    return 'kept';
  }
  await ports.stopQueue();
  await ports.closeStore();
  ports.leave();
  return 'closed';
}

/** The tab lock of one browser tab, with the claim that an update needs. */
export type TabLock = OpenTabs & {
  /** Gives up the shared lock, when this tab closes for another update. */
  readonly leave: () => void;
};

/** Reads the Web Locks API of this browser, or `null`. */
function browserLocks(): LockManager | null {
  if (typeof navigator === 'undefined' || navigator.locks === undefined)
    return null;
  return navigator.locks;
}

/** What a tab lock reads besides the store, for injection in tests. */
export type TabLockOptions = {
  /** Milliseconds since the Unix epoch. Defaults to the system clock. */
  readonly clock?: () => number;
  /** The Web Locks API, or `null` where the browser has none. */
  readonly locks?: LockManager | null;
  /** How long the leader waits for every other tab to close. */
  readonly timeoutMs?: number;
};

/**
 * Holds the shared tab lock of this tab and returns its claim.
 *
 * A browser without the Web Locks API cannot state which tabs are open, so
 * the claim falls back to the sync lease: it refuses while another tab holds
 * a live lease, which is the check that this application made before record
 * 0086. The lock ends by itself when the tab unloads.
 */
export function holdTabLock(
  store: LocalStore | null,
  ownerId: string,
  options: TabLockOptions = {},
): TabLock {
  const clock = options.clock ?? Date.now;
  const timeoutMs = options.timeoutMs ?? closeOthersTimeoutMs;
  const locks = options.locks === undefined ? browserLocks() : options.locks;
  if (locks === null)
    return {
      closeOthers: async () => {
        if (store === null) return true;
        const lease = await readWorkerLease(store);
        return (
          lease === null ||
          lease.ownerId === ownerId ||
          isLeaseExpired(lease.expiresAt, clock())
        );
      },
      reopen: () => {},
      leave: () => {},
    };
  let releaseShared: (() => void) | null = null;
  const hold = (): void => {
    if (releaseShared !== null) return;
    const held = new Promise<void>((resolve) => {
      releaseShared = resolve;
    });
    void locks
      .request(openTabLockName, { mode: 'shared' }, () => held)
      .catch(() => undefined);
  };
  const leave = (): void => {
    const release = releaseShared;
    releaseShared = null;
    release?.();
  };
  hold();
  let releaseExclusive: (() => void) | null = null;
  return {
    leave,
    closeOthers: () => {
      leave();
      const stop = new AbortController();
      const timer = setTimeout(() => {
        stop.abort();
      }, timeoutMs);
      return new Promise<boolean>((resolve) => {
        void locks
          .request(
            openTabLockName,
            { mode: 'exclusive', signal: stop.signal },
            () => {
              clearTimeout(timer);
              resolve(true);
              return new Promise<void>((release) => {
                releaseExclusive = release;
              });
            },
          )
          .catch(() => {
            clearTimeout(timer);
            resolve(false);
          });
      });
    },
    reopen: () => {
      const release = releaseExclusive;
      releaseExclusive = null;
      release?.();
      hold();
    },
  };
}

/** Adapts one browser worker to the update port. */
function updateWorker(worker: ServiceWorker): UpdateWorker {
  return {
    state: () => worker.state,
    postMessage: (message) => {
      worker.postMessage(message);
    },
    onStateChange: (listener) => {
      worker.addEventListener('statechange', listener);
      return () => {
        worker.removeEventListener('statechange', listener);
      };
    },
  };
}

/** Reads the browser registration through the update port, or `null`. */
export async function currentUpdateRegistration(): Promise<UpdateRegistration | null> {
  if (typeof navigator === 'undefined') return null;
  const container = navigator.serviceWorker;
  if (container === undefined) return null;
  const registration = await container.getRegistration().catch(() => undefined);
  if (registration === undefined) return null;
  return {
    waiting: () =>
      registration.waiting === null ? null : updateWorker(registration.waiting),
    installing: () =>
      registration.installing === null
        ? null
        : updateWorker(registration.installing),
    update: () => registration.update().then(() => undefined),
  };
}

/** Posts one update message of this tab to every other tab. */
export function postUpdateMessage(tabId: string, message: UpdateMessage): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(updateChannelName);
  channel.postMessage({ from: tabId, type: message.type });
  channel.close();
}

/**
 * Listens for the update messages of every other tab until the return is
 * called. A message that this tab sent is not delivered.
 */
export function listenForUpdates(
  tabId: string,
  listener: (message: UpdateMessage) => void,
): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(updateChannelName);
  channel.onmessage = (event: MessageEvent<unknown>): void => {
    const sent = readUpdateMessage(event.data);
    if (sent !== null && sent.from !== tabId) listener(sent.message);
  };
  return () => {
    channel.close();
  };
}
