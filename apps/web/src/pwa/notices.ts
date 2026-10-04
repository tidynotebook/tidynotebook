/**
 * The sync notices of one tab and one account (records 0124, 0130).
 *
 * This module joins the parts of `@notesapp/sync` for the browser. The lease
 * keeper holds the sender lease for the tab. The tabs of the account state
 * their open workspace on a `BroadcastChannel`, and the lease tab serves the
 * live ones. The coordinator holds the one stream while the tab holds the
 * lease, and it turns notices into wakes of the engines that registered here.
 *
 * Each engine of the tab reads the gate and the interval below, and each
 * registers its wake. A wake asks for a pass and changes no local state.
 * Everything that touches the browser or the network is injected, so a test
 * drives the channel, the clock and the stream itself.
 */
import { encodeSyncNoticesMessage } from '@notesapp/api-client';
import {
  createInterestTable,
  createLeaseKeeper,
  createNoticeCoordinator,
  engineInterval,
  interestHeartbeatMs,
  maxSubscribedWorkspaces,
  subscriptionSet,
  type LeaseGate,
  type LeaseStore,
  type NoticeHandlers,
  type NoticeSocket,
  type Schedule,
} from '@notesapp/sync';

/** The poll interval of an engine without an accepted set. */
export const pollIntervalMs = 15_000;

/** How long the sender lease of a tab lasts. */
export const leaseTtlMs = 30_000;

/**
 * How long a suspended tab waits before it asks for the lease again. A tab
 * whose session serves another account cannot send, so it gives the lease to
 * a tab that can, and it checks again after this time.
 */
export const suspendMs = 60_000;

/** One channel between the tabs of one account. */
export type TabChannel = {
  readonly post: (message: unknown) => void;
  readonly onMessage: (listener: (message: unknown) => void) => void;
  readonly close: () => void;
};

/** What the notices of one tab need from the browser and the network. */
export type TabNoticeDependencies = {
  readonly store: LeaseStore;
  readonly accountId: string;
  /** The owner of the lease, which every engine of the tab shares. */
  readonly tabId: string;
  readonly channel: (name: string) => TabChannel;
  /** Whether the server offers the stream now. */
  readonly offered: () => Promise<boolean>;
  /** Opens the stream. */
  readonly connect: (handlers: NoticeHandlers) => NoticeSocket;
  readonly schedule: Schedule;
  readonly clock: () => number;
  readonly random: () => number;
};

/** The notices of one tab, which its engines read. */
export type TabNotices = {
  /** The lease gate of every engine of the tab. */
  readonly gate: LeaseGate;
  /** The rest of every engine of the tab between two passes. */
  readonly interval: () => number;
  /** Registers the wake of one engine, and answers its removal. */
  readonly register: (workspaceId: string, wake: () => void) => () => void;
  /** States the workspace that this tab has open, or none. */
  readonly open: (workspaceId: string | null) => void;
  /** States every workspace of the account with queued work. */
  readonly queued: (workspaceIds: readonly string[]) => void;
  /** The workspaces that other tabs read, while this tab serves them. */
  readonly served: () => readonly string[];
  /** Hears each change of `served`, and answers the function that stops it. */
  readonly onServed: (listener: () => void) => () => void;
  /**
   * Gives the lease back because the session of this tab does not serve its
   * account now. The tab asks for the lease again after `suspendMs`.
   */
  readonly suspend: () => Promise<void>;
  /**
   * Hears each change of the account that the stream of any tab of the
   * account reports, and answers the function that stops it (record 0201).
   */
  readonly onAccountChanged: (listener: () => void) => () => void;
  /** Stops the stream and the channel, and gives the lease back. */
  readonly stop: () => Promise<void>;
};

/** One message between two tabs. */
type TabMessage =
  | {
      readonly kind: 'interest';
      readonly tabId: string;
      readonly workspaceId: string | null;
    }
  | { readonly kind: 'bye'; readonly tabId: string }
  /** The stream of the lease tab says that the account changed. */
  | { readonly kind: 'account'; readonly tabId: string };

/** Reads one message of the channel, or `null` for anything else. */
export function readTabMessage(value: unknown): TabMessage | null {
  if (value === null || typeof value !== 'object') return null;
  const members: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  );
  const { kind, tabId, workspaceId } = members;
  if (typeof tabId !== 'string' || tabId === '') return null;
  if (kind === 'bye' || kind === 'account') return { kind, tabId };
  if (
    kind === 'interest' &&
    (workspaceId === null || typeof workspaceId === 'string')
  )
    return { kind, tabId, workspaceId };
  return null;
}

/** The channel name of one account, so two accounts never share one. */
export function interestChannelName(accountId: string): string {
  return `notesapp-sync-interest:${accountId}`;
}

/** Starts the notices of one tab. */
export function startTabNotices(deps: TabNoticeDependencies): TabNotices {
  const wakes = new Map<string, Set<() => void>>();
  const servedListeners = new Set<() => void>();
  const accountListeners = new Set<() => void>();
  const accountChanged = (): void => {
    for (const listener of [...accountListeners]) listener();
  };
  const table = createInterestTable();
  let own: string | null = null;
  let queuedIds: readonly string[] = [];
  let served: readonly string[] = [];
  let stopped = false;
  let cancelResume: () => void = () => {};

  const wakeAll = (): void => {
    for (const set of wakes.values()) for (const wake of [...set]) wake();
  };

  const keeper = createLeaseKeeper(deps.store, {
    ownerId: deps.tabId,
    ttlMs: leaseTtlMs,
    clock: deps.clock,
    schedule: deps.schedule,
  });

  const coordinator = createNoticeCoordinator(deps.accountId, {
    keeper,
    offered: deps.offered,
    open: deps.connect,
    encode: (generation, workspaceIds) =>
      encodeSyncNoticesMessage({
        kind: 'subscribe',
        generation,
        workspaceIds: [...workspaceIds],
      }),
    wake: (workspaceId) => {
      for (const wake of [...(wakes.get(workspaceId) ?? [])]) wake();
    },
    wakeAll,
    // Each engine checks the session before its next pass.
    sessionEnded: wakeAll,
    // Only the lease tab holds the stream, so it tells the other tabs of
    // the account too.
    accountChanged: () => {
      accountChanged();
      channel.post({ kind: 'account', tabId: deps.tabId });
    },
    schedule: deps.schedule,
  });

  const recompute = (): void => {
    const now = deps.clock();
    const next = keeper.held()
      ? table.live(now).filter((id) => id !== own)
      : [];
    if (next.join(' ') !== served.join(' ')) {
      served = next;
      for (const listener of [...servedListeners]) listener();
    }
    coordinator.want(
      subscriptionSet(own, served, queuedIds, maxSubscribedWorkspaces),
    );
  };

  const channel = deps.channel(interestChannelName(deps.accountId));
  const post = (): void => {
    channel.post({ kind: 'interest', tabId: deps.tabId, workspaceId: own });
  };
  channel.onMessage((value) => {
    const message = readTabMessage(value);
    if (message === null || message.tabId === deps.tabId) return;
    if (message.kind === 'account') {
      accountChanged();
      return;
    }
    const now = deps.clock();
    const changed =
      message.kind === 'bye'
        ? table.forget(message.tabId, now)
        : table.note(message, now);
    if (changed) recompute();
  });

  let cancelBeat: () => void = () => {};
  const beat = (): void => {
    if (stopped) return;
    post();
    if (table.expire(deps.clock())) recompute();
    cancelBeat = deps.schedule(interestHeartbeatMs, beat);
  };

  const stopLease = keeper.onChange(() => {
    recompute();
    // A tab that took the lease starts every engine at once, and a tab that
    // lost it stops them sending at their next pass.
    wakeAll();
  });

  keeper.start();
  coordinator.start();
  beat();

  return {
    gate: keeper.gate,
    interval: () =>
      engineInterval(coordinator.healthy(), pollIntervalMs, deps.random),
    register: (workspaceId, wake) => {
      const set = wakes.get(workspaceId) ?? new Set<() => void>();
      set.add(wake);
      wakes.set(workspaceId, set);
      return () => {
        set.delete(wake);
        if (set.size === 0) wakes.delete(workspaceId);
      };
    },
    open: (workspaceId) => {
      if (workspaceId === own) return;
      own = workspaceId;
      post();
      recompute();
    },
    queued: (workspaceIds) => {
      queuedIds = [...workspaceIds];
      recompute();
    },
    served: () => served,
    onServed: (listener) => {
      servedListeners.add(listener);
      return () => {
        servedListeners.delete(listener);
      };
    },
    onAccountChanged: (listener) => {
      accountListeners.add(listener);
      return () => {
        accountListeners.delete(listener);
      };
    },
    suspend: async () => {
      if (stopped) return;
      cancelResume();
      await keeper.stop();
      cancelResume = deps.schedule(suspendMs, () => {
        if (!stopped) keeper.start();
      });
    },
    stop: async () => {
      if (stopped) return;
      stopped = true;
      cancelResume();
      cancelBeat();
      stopLease();
      channel.post({ kind: 'bye', tabId: deps.tabId });
      channel.close();
      coordinator.stop();
      await keeper.stop();
    },
  };
}
