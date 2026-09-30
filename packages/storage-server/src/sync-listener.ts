/**
 * The one PostgreSQL listener of the sync notices of a server process
 * (records 0125 and 0129).
 *
 * A trigger queues a hint in the transaction that wrote a feed row, a session
 * end, or an account change, and PostgreSQL delivers it to every listening
 * connection after commit. This module holds one such connection per process.
 * It comes from `openPool` (record 0090), so an idle error and the close follow
 * the rules of every other pool.
 *
 * A notice is a hint, not data. A listener that is down misses hints, so the
 * owner learns of each loss and each restore and decides what its streams do.
 * The listener reconnects on its own, with a delay that grows to a cap.
 */
import pg from 'pg';
import { openPool, poolSizes } from './pool.ts';
import { syncHintChannel } from './sync-hints.ts';
import { defaultConnectionTimeoutMs } from './workspace-store/index.ts';

export { syncHintChannel };

/**
 * The application name of the listening connection.
 *
 * An operator reads it in `pg_stat_activity`, and a test finds the connection
 * by it to end it.
 */
export const syncListenerName = 'notesapp-sync-listener';

/** One hint of the channel. */
export type SyncHint =
  | { readonly kind: 'workspace'; readonly workspaceId: string }
  | { readonly kind: 'session'; readonly sessionId: string }
  | { readonly kind: 'account'; readonly accountId: string };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Reads one payload of the channel, or `null` for a payload of no hint. */
export function parseSyncHint(payload: string): SyncHint | null {
  const value = payload.slice(2);
  if (payload.startsWith('w:') && uuidPattern.test(value))
    return { kind: 'workspace', workspaceId: value };
  if (payload.startsWith('a:') && uuidPattern.test(value))
    return { kind: 'account', accountId: value };
  if (payload.startsWith('s:') && value.length > 0 && value.length <= 256)
    return { kind: 'session', sessionId: value };
  return null;
}

/** What the owner of the listener hears. */
export type SyncListenerEvents = {
  /** One hint that a commit sent. */
  readonly onHint: (hint: SyncHint) => void;
  /** The connection was lost, so hints can be missed from now on. */
  readonly onLost: () => void;
  /** The connection listens again, after the start or after a loss. */
  readonly onListening: () => void;
};

/** The listener of one process. */
export type SyncListener = {
  /** Whether the connection listens now. */
  readonly listening: () => boolean;
  /** Stops the listener and closes its connection. */
  readonly close: () => Promise<void>;
};

/** The shortest and the longest delay before a reconnect, in milliseconds. */
export const listenerRetryMs = { first: 250, cap: 10_000 } as const;

/**
 * Runs `run` once after `ms` milliseconds, and answers the call that cancels
 * it. The listener waits for a reconnect through it.
 */
export type ListenerSchedule = (ms: number, run: () => void) => () => void;

/** The default schedule, on the timers of the runtime. */
export const listenerTimerSchedule: ListenerSchedule = (ms, run) => {
  const timer = setTimeout(run, ms);
  return () => {
    clearTimeout(timer);
  };
};

/** What a caller can choose about the listener besides its events. */
export type SyncListenerOptions = {
  /**
   * When a reconnect runs. A deployment takes the timers of the runtime. A
   * test holds the reconnect, so a commit falls in the gap by construction.
   */
  readonly schedule?: ListenerSchedule;
};

/**
 * Starts the listener. It connects in the background, so a database that is
 * down at the start delays the listening and not the start of the server.
 */
export function openSyncListener(
  databaseUrl: string,
  events: SyncListenerEvents,
  options: SyncListenerOptions = {},
): SyncListener {
  const scheduleRun = options.schedule ?? listenerTimerSchedule;
  const pool = openPool({
    connectionString: databaseUrl,
    max: poolSizes.listener,
    connectionTimeoutMillis: defaultConnectionTimeoutMs,
    application_name: syncListenerName,
  });
  let client: pg.PoolClient | null = null;
  let listening = false;
  let closed = false;
  let delay: number = listenerRetryMs.first;
  let cancelRetry: (() => void) | null = null;

  const onNotification = (message: pg.Notification): void => {
    if (message.channel !== syncHintChannel) return;
    const hint = parseSyncHint(message.payload ?? '');
    if (hint !== null) events.onHint(hint);
  };

  const lose = (lost: pg.PoolClient): void => {
    if (client !== lost) return;
    client = null;
    lost.removeListener('notification', onNotification);
    // The connection is broken, so the pool must not hand it out again.
    lost.release(true);
    if (listening) {
      listening = false;
      events.onLost();
    }
    schedule();
  };

  const schedule = (): void => {
    if (closed || cancelRetry !== null) return;
    cancelRetry = scheduleRun(delay, () => {
      cancelRetry = null;
      void connect();
    });
    delay = Math.min(delay * 2, listenerRetryMs.cap);
  };

  const connect = async (): Promise<void> => {
    if (closed) return;
    let next: pg.PoolClient;
    try {
      next = await pool.connect();
    } catch {
      schedule();
      return;
    }
    client = next;
    next.on('notification', onNotification);
    next.on('error', () => {
      lose(next);
    });
    next.on('end', () => {
      lose(next);
    });
    try {
      // The LISTEN commits before the owner hears of it, so a stream that
      // opens after `onListening` cannot miss a commit that follows.
      await next.query(`LISTEN ${syncHintChannel}`);
    } catch {
      lose(next);
      return;
    }
    if (closed || client !== next) return;
    delay = listenerRetryMs.first;
    listening = true;
    events.onListening();
  };

  void connect();

  return {
    listening: () => listening,
    close: async () => {
      closed = true;
      listening = false;
      cancelRetry?.();
      cancelRetry = null;
      const current = client;
      client = null;
      if (current !== null) {
        current.removeListener('notification', onNotification);
        current.release(true);
      }
      await pool.end();
    },
  };
}
