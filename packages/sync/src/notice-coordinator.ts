/**
 * The notice coordinator of one account in the lease tab (records 0124, 0130).
 *
 * The coordinator holds the one notice stream of the tab while the tab holds
 * the sender lease and the server offers the stream. It sends the whole
 * subscription set with a newer generation each time the set changes, and it
 * turns what the server sends into wakes of the engines:
 *
 * - An accepted set wakes every engine of the set, so each one reads its feed
 *   from its stored cursor. A commit before the answer is covered by that
 *   read, and a commit after it sends a notice.
 * - A notice of the accepted set wakes its engine. A notice of an older set is
 *   late and changes nothing.
 * - `reconcile` and a refused set wake every engine.
 *
 * A wake only asks for a pass. Only an applied feed page or snapshot moves a
 * cursor, and only a server answer marks a save accepted, so a missed, a
 * repeated or a late notice changes no result. While no set is accepted, the
 * engines read on their own interval, which is the fallback for an old
 * server, a closed stream, and notices that are off.
 *
 * A stream that closes wakes every engine, so each reads soon and then rests
 * on its poll interval until a set is accepted again. The wake waits a random
 * part of `closeWakeSpreadMs`, because a server restart closes the stream of
 * every device at one time.
 *
 * The transport reconnects on its own. `session_ended`, `malformed`, a frame
 * that the client cannot read, and a stream of another account stop the
 * stream for this coordinator: reconnecting would repeat the refusal.
 */
import type { SyncNoticesServerMessage } from '@notesapp/api-client';
import type { LeaseKeeper, Schedule } from './lease-keeper.ts';

/** How often the coordinator asks again whether the server offers notices. */
export const offerRetryMs = 5 * 60_000;

/** The longest wait of the wake that a closed stream gives the engines. */
export const closeWakeSpreadMs = 5_000;

/** The most workspaces of one set, the bound of the contract. */
export const maxSubscribedWorkspaces = 1000;

/** One open transport. It reconnects by itself until it is closed. */
export type NoticeSocket = {
  readonly send: (text: string) => void;
  readonly close: () => void;
};

/** What the transport tells the coordinator. */
export type NoticeHandlers = {
  /** The connection opened, the first time or after a reconnect. */
  readonly onOpen: () => void;
  /** One frame: its message, or `null` for a frame outside the contract. */
  readonly onMessage: (message: SyncNoticesServerMessage | null) => void;
  /** The connection closed. The transport can open it again. */
  readonly onClose: () => void;
};

/** What the coordinator needs from the tab. */
export type CoordinatorPorts = {
  readonly keeper: LeaseKeeper;
  /** Whether the server offers the subprotocol of the stream now. */
  readonly offered: () => Promise<boolean>;
  /** Opens the transport. */
  readonly open: (handlers: NoticeHandlers) => NoticeSocket;
  /** Encodes one subscription set as a frame. */
  readonly encode: (
    generation: number,
    workspaceIds: readonly string[],
  ) => string;
  /** Asks the engine of one workspace for a pass. */
  readonly wake: (workspaceId: string) => void;
  /** Asks every engine for a pass. */
  readonly wakeAll: () => void;
  /** The session ended, so the tab checks it through the HTTP operations. */
  readonly sessionEnded: () => void;
  /**
   * The state or the controls of the account changed, so the tab reads the
   * account again (records 0189 and 0201).
   */
  readonly accountChanged: () => void;
  readonly schedule: Schedule;
  /** A number from 0 up to 1. Defaults to `Math.random`. */
  readonly random?: () => number;
};

/** Why the stream stopped for good in this coordinator. */
export type StreamEnd = 'session_ended' | 'malformed' | 'other_account';

/** The coordinator of one account. */
export type NoticeCoordinator = {
  readonly start: () => void;
  readonly stop: () => void;
  /** Replaces the wanted set. The stream sends it as a new generation. */
  readonly want: (workspaceIds: readonly string[]) => void;
  /** Whether a set is accepted now, so the engines read less often. */
  readonly healthy: () => boolean;
  /** Hears each change of `healthy`. */
  readonly onHealth: (listener: (healthy: boolean) => void) => () => void;
  /** Why the stream ended for good, or `null` while it may still open. */
  readonly ended: () => StreamEnd | null;
};

/** Builds the coordinator of one account. */
export function createNoticeCoordinator(
  accountId: string,
  ports: CoordinatorPorts,
): NoticeCoordinator {
  const listeners = new Set<(healthy: boolean) => void>();
  let running = false;
  let socket: NoticeSocket | null = null;
  let ready = false;
  let wanted: readonly string[] = [];
  let generation = 0;
  let accepted: number | null = null;
  let end: StreamEnd | null = null;
  let retry: (() => void) | null = null;
  // The wake that a closed stream asked for and that waits, or `null`.
  let closeWake: (() => void) | null = null;
  const random = ports.random ?? Math.random;
  let checking = false;
  let stopLease: (() => void) | null = null;

  const setAccepted = (next: number | null): void => {
    const before = accepted !== null;
    accepted = next;
    if (before !== (accepted !== null))
      for (const listener of [...listeners]) listener(accepted !== null);
  };

  const close = (): void => {
    const current = socket;
    socket = null;
    ready = false;
    setAccepted(null);
    current?.close();
  };

  const finish = (reason: StreamEnd): void => {
    end = reason;
    close();
    // The engines read on their own interval again, and each reads now.
    ports.wakeAll();
  };

  const sendSet = (): void => {
    if (socket === null || !ready) return;
    generation += 1;
    socket.send(ports.encode(generation, wanted));
  };

  const onMessage = (message: SyncNoticesServerMessage | null): void => {
    if (!running) return;
    if (message === null) {
      finish('malformed');
      return;
    }
    if (message.kind === 'ready') {
      if (message.accountId !== accountId) {
        finish('other_account');
        return;
      }
      ready = true;
      sendSet();
      return;
    }
    if (message.kind === 'subscribed') {
      if (message.generation !== generation) return;
      setAccepted(generation);
      ports.wakeAll();
      return;
    }
    if (message.kind === 'changed') {
      if (message.generation === accepted) ports.wake(message.workspaceId);
      return;
    }
    if (message.kind === 'reconcile') {
      ports.wakeAll();
      return;
    }
    if (message.kind === 'account') {
      ports.accountChanged();
      return;
    }
    if (message.kind === 'refused') {
      if (message.generation !== generation) return;
      // The HTTP reads of the engines tell which access the account holds.
      setAccepted(null);
      ports.wakeAll();
      return;
    }
    // A stop comes last. The ones that a reconnect would repeat end the
    // stream here, and the transport reconnects after the others.
    setAccepted(null);
    if (message.reason === 'session_ended') {
      finish('session_ended');
      ports.sessionEnded();
    } else if (message.reason === 'malformed') {
      finish('malformed');
    } else if (message.reason === 'unavailable') {
      close();
      ports.wakeAll();
      later();
    } else {
      ports.wakeAll();
    }
  };

  /** Asks again after a while whether the stream is offered. */
  const later = (): void => {
    retry?.();
    retry = ports.schedule(offerRetryMs, () => {
      retry = null;
      void connect();
    });
  };

  const connect = async (): Promise<void> => {
    if (!running || socket !== null || end !== null || checking) return;
    if (!ports.keeper.held()) return;
    checking = true;
    let offered = false;
    try {
      offered = await ports.offered();
    } catch {
      offered = false;
    } finally {
      checking = false;
    }
    if (!running || socket !== null || end !== null) return;
    if (!offered || !ports.keeper.held()) {
      later();
      return;
    }
    socket = ports.open({
      onOpen: () => {
        // The server sends ready first. The set goes after it, on each
        // connection, because a new connection holds no set.
        ready = false;
      },
      onMessage,
      onClose: () => {
        ready = false;
        const wasHealthy = accepted !== null;
        setAccepted(null);
        // The engines rest on the long safety interval while a set is
        // accepted. Without the stream they read soon, and then on the poll
        // interval until a set is accepted again (record 0176). Every device
        // loses its stream when the server restarts, so the wake waits a
        // random time and the devices do not read at one moment.
        if (wasHealthy && closeWake === null) {
          const spread = Math.round(closeWakeSpreadMs * random());
          closeWake = ports.schedule(spread, () => {
            closeWake = null;
            if (running) ports.wakeAll();
          });
        }
      },
    });
  };

  return {
    start: () => {
      if (running) return;
      running = true;
      stopLease = ports.keeper.onChange((held) => {
        if (held) void connect();
        else close();
      });
      void connect();
    },
    stop: () => {
      running = false;
      closeWake?.();
      closeWake = null;
      stopLease?.();
      stopLease = null;
      retry?.();
      retry = null;
      close();
    },
    want: (workspaceIds) => {
      const next = [...new Set(workspaceIds)]
        .sort()
        .slice(0, maxSubscribedWorkspaces);
      if (next.join(' ') === wanted.join(' ')) return;
      wanted = next;
      sendSet();
    },
    healthy: () => accepted !== null,
    onHealth: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ended: () => end,
  };
}

/**
 * The rest of an engine between two passes.
 *
 * While a set is accepted, a notice asks for each pass that matters, so the
 * engine reads only as a safety check, at a long interval with a random part
 * that keeps many tabs apart. Without one, the engine reads on its poll
 * interval, as a device with no stream always did.
 */
export function engineInterval(
  healthy: boolean,
  pollMs: number,
  random: () => number,
): number {
  if (!healthy) return pollMs;
  const safetyMs = 5 * 60_000;
  return Math.round(safetyMs * (0.8 + 0.4 * random()));
}
