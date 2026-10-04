/**
 * The sync notice gateway of one server process (records 0124, 0125, 0129).
 *
 * The gateway admits a stream after the upgrade passed the identity and the
 * contract checks, binds it to its session and account, and replaces its
 * subscription set on each subscribe message. A hint of the listener marks a
 * workspace as changed. Before each outbound batch the gateway asks which
 * workspaces the session may still read, and it never caches that answer.
 *
 * Every piece of work of one stream runs in one queue, so a subscription set
 * and a batch never interleave. A hint only marks work, and one queued batch
 * takes every mark, so a burst of commits costs one access check. A stream
 * that breaks a bound stops, and the client reads the feed on its own
 * schedule. Notices are hints: a missed one costs time, not data.
 */
import { randomUUID } from 'node:crypto';
import {
  assertMessageHandlers,
  checkServerMessage,
  findChannel,
  readClientMessage,
} from '@notesapp/api-contract';
import {
  emptySubscription,
  noticeBatch,
  replaceSubscription,
  type NoticeSubscription,
} from '@notesapp/core';
import type { StreamSocket } from '../plugins/websocket.ts';
import type { NoticeBounds } from './bounds.ts';

/** The shared state that the gateway reads and writes. */
export type GatewayStores = {
  readonly noticeAccess: (
    sessionId: string,
    accountId: string,
  ) => Promise<readonly string[] | null>;
  readonly reserveStream: (
    id: string,
    accountId: string,
    ttlMs: number,
    limit: number,
  ) => Promise<boolean>;
  readonly renewStream: (id: string, ttlMs: number) => Promise<boolean>;
  readonly releaseStream: (id: string) => Promise<void>;
};

/** One hint of the listener. */
export type GatewayHint =
  | { readonly kind: 'workspace'; readonly workspaceId: string }
  | { readonly kind: 'session'; readonly sessionId: string }
  | { readonly kind: 'account'; readonly accountId: string };

/** Opens the listener of the process with the events of the gateway. */
export type GatewayListenerFactory = (events: {
  readonly onHint: (hint: GatewayHint) => void;
  readonly onLost: () => void;
  readonly onListening: () => void;
}) => {
  readonly listening: () => boolean;
  readonly close: () => Promise<void>;
};

/** Why an upgrade is refused. The reason reaches the log, not the client. */
export type AdmissionRefusal =
  | 'draining'
  | 'listener'
  | 'process_limit'
  | 'account_limit'
  | 'store_unavailable';

/** Why a stream stops. Each one but the last two is a stop message. */
type StopReason =
  | 'session_ended'
  | 'malformed'
  | 'draining'
  | 'overloaded'
  | 'unavailable'
  | 'client_closed'
  | 'heartbeat';

/** The close code of each stop. */
const closeCodes: Readonly<Record<StopReason, number>> = {
  session_ended: 1000,
  malformed: 1008,
  draining: 1001,
  overloaded: 1013,
  unavailable: 1013,
  client_closed: 1000,
  heartbeat: 1001,
};

/** What the gateway writes to the log: a reason, never an identifier. */
export type GatewayLog = {
  readonly opened: () => void;
  readonly closed: (reason: string) => void;
  readonly refused: (reason: string) => void;
  readonly listenerLost: () => void;
  readonly listenerRestored: () => void;
};

/** The gateway of one process. */
export type NoticeGateway = {
  /** Opens the listener and starts the timers. */
  readonly start: () => void;
  /** The subprotocols that a client may open now. */
  readonly offered: () => readonly string[];
  /** Admits one upgrade of a verified session, or names the refusal. */
  readonly admit: (binding: {
    readonly accountId: string;
    readonly sessionId: string;
  }) => Promise<
    | { readonly ok: true; readonly open: (socket: StreamSocket) => void }
    | { readonly ok: false; readonly reason: AdmissionRefusal }
  >;
  /** Stops every stream and refuses new ones. */
  readonly drain: () => Promise<void>;
  /** Drains, then closes the listener and the timers. */
  readonly close: () => Promise<void>;
  /** The number of open streams. */
  readonly streamCount: () => number;
};

/** One open stream. */
type Stream = {
  readonly socket: StreamSocket;
  readonly accountId: string;
  readonly sessionId: string;
  readonly reservationId: string;
  subscription: NoticeSubscription;
  changed: Set<string>;
  /** The account of the stream changed, so the next batch says so. */
  accountChanged: boolean;
  batchQueued: boolean;
  work: Promise<void>;
  sent: number[];
  alive: boolean;
  closed: boolean;
};

const channel = findChannel('syncNotices');
if (channel === undefined)
  throw new Error('The contract has no syncNotices channel.');
const subprotocol = channel.subprotocol;

/** The generation and the set of a subscribe message that the contract read. */
function readSubscribe(
  message: Readonly<Record<string, unknown>>,
): { generation: number; workspaceIds: string[] } | null {
  const { generation, workspaceIds } = message;
  if (typeof generation !== 'number' || !Array.isArray(workspaceIds))
    return null;
  const ids = workspaceIds.filter((id): id is string => typeof id === 'string');
  return ids.length === workspaceIds.length
    ? { generation, workspaceIds: ids }
    : null;
}

/** Builds the gateway of one process. */
export function createNoticeGateway(options: {
  readonly stores: GatewayStores;
  readonly listener: GatewayListenerFactory;
  readonly bounds: NoticeBounds;
  readonly log: GatewayLog;
}): NoticeGateway {
  const { stores, bounds, log } = options;
  const streams = new Set<Stream>();
  const byWorkspace = new Map<string, Set<Stream>>();
  let pending = 0;
  let draining = false;
  let gap = false;
  let graceTimer: NodeJS.Timeout | null = null;
  let listener: ReturnType<GatewayListenerFactory> | null = null;
  const timers: NodeJS.Timeout[] = [];

  // Each message that a client can send has its handler here, and the
  // contract check stops the start when one is missing or unknown.
  const handlers = {
    subscribe: (stream: Stream, message: Readonly<Record<string, unknown>>) => {
      const request = readSubscribe(message);
      if (request === null) {
        stop(stream, 'malformed');
        return;
      }
      enqueue(stream, async () => {
        const readable = await access(stream);
        if (readable === null) return;
        const decision = replaceSubscription(
          stream.subscription,
          request,
          readable,
        );
        if (!decision.ok) {
          send(stream, {
            kind: 'refused',
            generation: request.generation,
            reason: decision.reason,
          });
          return;
        }
        // The set is registered before the client hears that it was
        // accepted, so a commit after the answer always sends a notice.
        setSubscription(stream, decision.subscription);
        send(stream, { kind: 'subscribed', generation: request.generation });
      });
    },
  } as const;
  assertMessageHandlers('syncNotices', Object.keys(handlers));

  const every = (ms: number, run: () => void): void => {
    const timer = setInterval(run, ms);
    timer.unref();
    timers.push(timer);
  };

  /** Writes one checked message. A defect in it ends the stream. */
  const write = (stream: Stream, message: Record<string, unknown>): boolean => {
    if (checkServerMessage('syncNotices', message) !== null) {
      log.closed('invalid_message');
      stream.socket.terminate();
      finish(stream, 'unavailable');
      return false;
    }
    stream.socket.send(JSON.stringify(message));
    return true;
  };

  /** Sends one message of an open stream and holds the buffer bound. */
  const send = (stream: Stream, message: Record<string, unknown>): void => {
    if (stream.closed || !write(stream, message)) return;
    if (stream.socket.bufferedBytes() > bounds.maxBufferedBytes)
      stop(stream, 'overloaded');
  };

  /** Runs one piece of work of a stream after the pieces before it. */
  const enqueue = (stream: Stream, task: () => Promise<void>): void => {
    stream.work = stream.work.then(async () => {
      if (stream.closed) return;
      try {
        await task();
      } catch {
        // A check that cannot complete sends nothing and stops the stream.
        stop(stream, 'unavailable');
      }
    });
  };

  /** The readable workspaces of a stream, or null after it stopped. */
  const access = async (stream: Stream): Promise<readonly string[] | null> => {
    const readable = await stores.noticeAccess(
      stream.sessionId,
      stream.accountId,
    );
    if (stream.closed) return null;
    if (readable === null) {
      stop(stream, 'session_ended');
      return null;
    }
    return readable;
  };

  const setSubscription = (stream: Stream, next: NoticeSubscription): void => {
    for (const id of stream.subscription.workspaceIds)
      if (!next.workspaceIds.has(id)) byWorkspace.get(id)?.delete(stream);
    for (const id of next.workspaceIds) {
      const set = byWorkspace.get(id) ?? new Set<Stream>();
      set.add(stream);
      byWorkspace.set(id, set);
    }
    stream.subscription = next;
  };

  /** Queues one batch of a stream, unless one is queued already. */
  const queueBatch = (stream: Stream): void => {
    if (stream.batchQueued || stream.closed) return;
    stream.batchQueued = true;
    enqueue(stream, async () => {
      stream.batchQueued = false;
      const changed = stream.changed;
      stream.changed = new Set();
      const accountChanged = stream.accountChanged;
      stream.accountChanged = false;
      const readable = await access(stream);
      if (readable === null) return;
      // The account still reads the stream, so the client reads the account
      // again and sees a lock or an unlock at once (records 0189 and 0201).
      if (accountChanged) send(stream, { kind: 'account' });
      const batch = noticeBatch(stream.subscription, changed, readable);
      setSubscription(stream, batch.subscription);
      for (const workspaceId of batch.notify)
        send(stream, {
          kind: 'changed',
          generation: stream.subscription.generation,
          workspaceId,
        });
    });
  };

  /** Removes a stream and gives back its reservation. */
  const finish = (stream: Stream, reason: StopReason): void => {
    if (!streams.delete(stream)) return;
    stream.closed = true;
    for (const id of stream.subscription.workspaceIds)
      byWorkspace.get(id)?.delete(stream);
    void stores.releaseStream(stream.reservationId).catch(() => {
      // The reservation expires on its own.
    });
    log.closed(reason);
  };

  /** Stops a stream with its stop message and close code. */
  const stop = (stream: Stream, reason: StopReason): void => {
    if (stream.closed) return;
    // The stream is closed before the stop message goes, so the message is
    // the last one and no bound can stop the stream a second time.
    stream.closed = true;
    if (reason !== 'client_closed' && reason !== 'heartbeat')
      write(stream, { kind: 'stop', reason });
    stream.socket.close(closeCodes[reason]);
    finish(stream, reason);
  };

  const stopAll = (reason: StopReason): void => {
    for (const stream of [...streams]) stop(stream, reason);
  };

  const onMessage = (stream: Stream, text: string | null): void => {
    if (stream.closed) return;
    if (text === null) {
      stop(stream, 'malformed');
      return;
    }
    const now = Date.now();
    stream.sent = stream.sent.filter((at) => now - at < bounds.messageWindowMs);
    stream.sent.push(now);
    if (stream.sent.length > bounds.messagesPerWindow) {
      stop(stream, 'overloaded');
      return;
    }
    const read = readClientMessage('syncNotices', text);
    if (!read.ok) {
      stop(stream, 'malformed');
      return;
    }
    handlers[read.kind](stream, read.message);
  };

  const open = (
    binding: { readonly accountId: string; readonly sessionId: string },
    reservationId: string,
    socket: StreamSocket,
  ): void => {
    const stream: Stream = {
      socket,
      accountId: binding.accountId,
      sessionId: binding.sessionId,
      reservationId,
      subscription: emptySubscription,
      changed: new Set(),
      accountChanged: false,
      batchQueued: false,
      work: Promise.resolve(),
      sent: [],
      alive: true,
      closed: false,
    };
    streams.add(stream);
    socket.onMessage((text) => {
      onMessage(stream, text);
    });
    socket.onPong(() => {
      stream.alive = true;
    });
    socket.onClose(() => {
      finish(stream, 'client_closed');
    });
    log.opened();
    send(stream, { kind: 'ready', accountId: binding.accountId });
  };

  const onHint = (hint: GatewayHint): void => {
    if (hint.kind === 'workspace') {
      for (const stream of byWorkspace.get(hint.workspaceId) ?? []) {
        stream.changed.add(hint.workspaceId);
        queueBatch(stream);
      }
      return;
    }
    // A session or an account changed, so each of its streams checks its
    // access again with no changed workspace.
    for (const stream of streams)
      if (hint.kind === 'session' && stream.sessionId === hint.sessionId)
        queueBatch(stream);
      else if (hint.kind === 'account' && stream.accountId === hint.accountId) {
        stream.accountChanged = true;
        queueBatch(stream);
      }
  };

  const onLost = (): void => {
    log.listenerLost();
    gap = true;
    if (graceTimer !== null) return;
    graceTimer = setTimeout(() => {
      graceTimer = null;
      if (listener?.listening() !== true) stopAll('unavailable');
    }, bounds.listenerGraceMs);
    graceTimer.unref();
  };

  const onListening = (): void => {
    if (!gap) return;
    gap = false;
    log.listenerRestored();
    if (graceTimer !== null) clearTimeout(graceTimer);
    graceTimer = null;
    // Hints could be missed in the gap, so every stream with a set reads
    // every workspace of it.
    for (const stream of streams)
      if (stream.subscription.generation > 0)
        send(stream, {
          kind: 'reconcile',
          generation: stream.subscription.generation,
        });
  };

  const drain = async (): Promise<void> => {
    draining = true;
    const open = [...streams];
    stopAll('draining');
    await Promise.race([
      Promise.all(open.map((stream) => stream.work)),
      new Promise((resolve) => {
        setTimeout(resolve, bounds.drainMs).unref();
      }),
    ]);
  };

  return {
    start: () => {
      if (listener !== null) return;
      listener = options.listener({ onHint, onLost, onListening });
      every(bounds.heartbeatMs, () => {
        for (const stream of [...streams]) {
          if (!stream.alive) {
            stream.socket.terminate();
            finish(stream, 'heartbeat');
            continue;
          }
          stream.alive = false;
          stream.socket.ping();
        }
      });
      every(bounds.accessCheckMs, () => {
        for (const stream of streams) queueBatch(stream);
      });
      every(bounds.reservationRenewMs, () => {
        for (const stream of [...streams])
          void stores
            .renewStream(stream.reservationId, bounds.reservationTtlMs)
            .then(
              (renewed) => {
                if (!renewed) stop(stream, 'unavailable');
              },
              () => {
                stop(stream, 'unavailable');
              },
            );
      });
    },

    offered: () =>
      !draining && listener?.listening() === true ? [subprotocol] : [],

    admit: async (binding) => {
      const refuse = (
        reason: AdmissionRefusal,
      ): { readonly ok: false; readonly reason: AdmissionRefusal } => {
        log.refused(reason);
        return { ok: false, reason };
      };
      if (draining) return refuse('draining');
      if (listener?.listening() !== true) return refuse('listener');
      if (streams.size + pending >= bounds.streamsPerProcess)
        return refuse('process_limit');
      pending += 1;
      let admitted = false;
      try {
        const reservationId = randomUUID();
        const reserved = await stores.reserveStream(
          reservationId,
          binding.accountId,
          bounds.reservationTtlMs,
          bounds.streamsPerAccount,
        );
        if (!reserved) return refuse('account_limit');
        admitted = true;
        let settled = false;
        const deadline = setTimeout(() => {
          if (settled) return;
          settled = true;
          pending -= 1;
          void stores.releaseStream(reservationId).catch(() => {});
        }, bounds.openDeadlineMs);
        deadline.unref();
        return {
          ok: true,
          open: (socket) => {
            if (settled || draining) {
              socket.close(closeCodes.draining);
              return;
            }
            settled = true;
            pending -= 1;
            clearTimeout(deadline);
            open(binding, reservationId, socket);
          },
        };
      } catch {
        return refuse('store_unavailable');
      } finally {
        if (!admitted) pending -= 1;
      }
    },

    drain,

    close: async () => {
      await drain();
      for (const timer of timers) clearInterval(timer);
      timers.length = 0;
      if (graceTimer !== null) clearTimeout(graceTimer);
      graceTimer = null;
      await listener?.close();
      listener = null;
    },

    streamCount: () => streams.size,
  };
}
