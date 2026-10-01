/**
 * The keeper of the sender lease of one tab (record 0130).
 *
 * The lease names the one tab that sends and reads for the browser profile.
 * An engine that took and released the lease itself released it for its
 * siblings when it stopped, and a quiet engine let it expire. The keeper
 * takes the lease, renews it on its own timer, and gives it back only when
 * the tab stops, so traffic and the stop of one engine change nothing. An
 * engine reads the keeper through its gate.
 *
 * The timer is injected, so a test drives the clock and the ticks itself.
 */
import type { LeaseGate } from './engine.ts';
import {
  acquireWorkerLease,
  releaseWorkerLease,
  type LeaseStore,
} from './lease.ts';

/** Runs `run` after `ms`, and answers the function that cancels it. */
export type Schedule = (ms: number, run: () => void) => () => void;

/** The default schedule, on the timers of the runtime. */
export const timerSchedule: Schedule = (ms, run) => {
  const timer = setTimeout(run, ms);
  return () => {
    clearTimeout(timer);
  };
};

/** The lease of one tab, kept alive while the tab runs. */
export type LeaseKeeper = {
  /** Starts taking and renewing the lease. */
  readonly start: () => void;
  /** Whether this tab holds the lease at the last check. */
  readonly held: () => boolean;
  /** The gate that each engine of the tab reads. Its release does nothing. */
  readonly gate: LeaseGate;
  /** Hears each change of `held`. Answers the function that stops it. */
  readonly onChange: (listener: (held: boolean) => void) => () => void;
  /** Stops the renewal and gives the lease back when the tab holds it. */
  readonly stop: () => Promise<void>;
};

/** Builds the keeper of one tab. */
export function createLeaseKeeper(
  local: LeaseStore,
  options: {
    readonly ownerId: string;
    /** How long one taken lease lasts, in milliseconds. */
    readonly ttlMs: number;
    readonly clock?: () => number;
    readonly schedule?: Schedule;
  },
): LeaseKeeper {
  const schedule = options.schedule ?? timerSchedule;
  // A renewal at a third of the life leaves two more tries before it ends.
  const everyMs = Math.max(1, Math.floor(options.ttlMs / 3));
  const listeners = new Set<(held: boolean) => void>();
  let held = false;
  let running = false;
  let cancel: (() => void) | null = null;
  let ticking: Promise<void> = Promise.resolve();
  // The first check of a start. Until it ends, `held` only states that the
  // tab did not ask yet, and not that another tab holds the lease.
  let checked: Promise<void> = Promise.resolve();

  const set = (next: boolean): void => {
    if (next === held) return;
    held = next;
    for (const listener of [...listeners]) listener(held);
  };

  const tick = async (): Promise<void> => {
    if (!running) return;
    let taken = false;
    try {
      taken = await acquireWorkerLease(local, {
        ownerId: options.ownerId,
        ttlMs: options.ttlMs,
        ...(options.clock === undefined ? {} : { clock: options.clock }),
      });
    } catch {
      // A store that cannot answer holds no proof of the lease, so the tab
      // stops sending until the next tick proves it again.
      taken = false;
    }
    if (!running) return;
    set(taken);
    cancel = schedule(everyMs, () => {
      ticking = tick();
    });
  };

  return {
    start: () => {
      if (running) return;
      running = true;
      ticking = tick();
      checked = ticking;
    },
    held: () => held,
    gate: {
      // An engine that starts with the tab asks before the store answered
      // the first take. The gate waits for that answer, so the engine never
      // reads that another tab sends when no other tab is open.
      hold: async () => {
        await checked;
        return held;
      },
      release: () => Promise.resolve(),
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    stop: async () => {
      running = false;
      cancel?.();
      cancel = null;
      await ticking;
      const had = held;
      set(false);
      if (had) await releaseWorkerLease(local, options.ownerId);
    },
  };
}
