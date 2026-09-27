/**
 * The attempt counter of this server, shared by every route of one group.
 *
 * The limit plugin already builds the key of an attempt from the caller and
 * the group name of the route, so two routes of one group ask about one key.
 * It then builds a child store for each route, and the store it ships gives
 * each child a map of its own, so the two keys landed in two maps and counted
 * apart. Measured with a limit of two: two attempts on the page form of a
 * published link, and the unlock operation still answered twice before it
 * refused. One caller therefore had four attempts at one password by moving
 * between the two paths.
 *
 * Every child here answers from one map, so the group is the bucket. Nothing
 * else changes: the key still carries the caller and the group, so two groups
 * and two callers stay apart.
 *
 * A deployment counts in PostgreSQL, so every server process of one
 * installation reads one count and a limit survives a restart (record 0121).
 * `databaseAttemptCounter` is that counter, and `app.ts` builds the store of
 * the plugin over it with `attemptStoreFor`. The map of this process stays for
 * a server that has no database, which is what a test of the boundary runs.
 * This file is the one place that decides where a count lives.
 */
import { isIPv4, isIPv6 } from 'node:net';

/** What one key holds right now. */
type Attempt = {
  current: number;
  /** Milliseconds until the window of this key ends. */
  ttl: number;
  /** When the window of this key started, in milliseconds. */
  startedMs: number;
};

/** The result the limit plugin reads back. */
export type AttemptState = { readonly current: number; readonly ttl: number };

/** The callback shape of the limit plugin. */
type AttemptCallback = (error: Error | null, result?: AttemptState) => void;

/**
 * Where the counts live. The map of this process answers at once, and the
 * table of the installation answers after a round trip.
 */
export type AttemptCounter = {
  count(
    key: string,
    timeWindow: number,
    now: number,
  ): AttemptState | Promise<AttemptState>;
  read(
    key: string,
    timeWindow: number,
    now: number,
  ): AttemptState | Promise<AttemptState>;
};

/** What the counter of the installation needs from the database. */
export type SharedCounterStore = {
  countAttempt(key: string, windowMs: number): Promise<AttemptState>;
  readAttempt(key: string, windowMs: number): Promise<AttemptState>;
};

/**
 * The counter of the installation, which every server process shares.
 *
 * The database clock decides the window, so two processes with two clocks
 * still read one window.
 */
export function databaseAttemptCounter(
  store: SharedCounterStore,
): AttemptCounter {
  return {
    count: (key, timeWindow) => store.countAttempt(key, timeWindow),
    read: (key, timeWindow) => store.readAttempt(key, timeWindow),
  };
}

/** Hands one answer of a counter to the callback of the plugin. */
function answer(
  result: AttemptState | Promise<AttemptState>,
  callback: AttemptCallback,
): void {
  if (!(result instanceof Promise)) {
    callback(null, result);
    return;
  }
  result.then(
    (state) => {
      callback(null, state);
    },
    (error: unknown) => {
      callback(
        error instanceof Error ? error : new Error('notesapp: no count.'),
      );
    },
  );
}

/**
 * How many keys one server holds.
 *
 * The map is bounded, so a caller that invents keys cannot grow it without
 * end. The oldest key goes first, which costs that caller nothing: a key that
 * left the map starts its window again, and a window is a minute.
 */
export const maxAttemptKeys = 20_000;

/** One counter map, which every child of one store shares. */
export class AttemptCounters implements AttemptCounter {
  private readonly keys = new Map<string, Attempt>();

  /** Counts one attempt against `key` and answers the state after it. */
  count(key: string, timeWindow: number, now: number): AttemptState {
    const held = this.keys.get(key);
    if (held === undefined || held.startedMs + timeWindow <= now) {
      const started: Attempt = { current: 1, ttl: timeWindow, startedMs: now };
      this.keys.delete(key);
      this.keys.set(key, started);
      this.evict();
      return { current: started.current, ttl: started.ttl };
    }
    held.current += 1;
    held.ttl = timeWindow - (now - held.startedMs);
    // The key moves to the end, so the oldest key is the first to go.
    this.keys.delete(key);
    this.keys.set(key, held);
    return { current: held.current, ttl: held.ttl };
  }

  /** Answers the state of `key` without counting an attempt against it. */
  read(key: string, timeWindow: number, now: number): AttemptState {
    const held = this.keys.get(key);
    if (held === undefined || held.startedMs + timeWindow <= now)
      return { current: 0, ttl: 0 };
    return { current: held.current, ttl: timeWindow - (now - held.startedMs) };
  }

  /** How many keys the map holds. The bound of this map is tested by it. */
  get size(): number {
    return this.keys.size;
  }

  private evict(): void {
    while (this.keys.size > maxAttemptKeys) {
      const oldest = this.keys.keys().next();
      if (oldest.done === true) return;
      this.keys.delete(oldest.value);
    }
  }
}

/**
 * An attempt store for the limit plugin.
 *
 * The plugin builds it once with `new`, then calls `child` for each route that
 * carries a limit. Every child answers from the counters of the store it came
 * from, which is the whole point of this file.
 */
export class SharedAttemptStore {
  readonly #counters: AttemptCounter;
  /** The map of this process, when the counts live there. */
  readonly #local: AttemptCounters | null;
  readonly #now: () => number;

  /**
   * The plugin builds this store with its own options object, which carries
   * neither member below, so the store it builds owns fresh counters and the
   * system clock. `child` passes both on, which is what shares them.
   */
  constructor(options?: {
    readonly now?: (() => number) | undefined;
    readonly counters?: AttemptCounter | undefined;
  }) {
    const counters = options?.counters ?? new AttemptCounters();
    this.#counters = counters;
    this.#local = counters instanceof AttemptCounters ? counters : null;
    this.#now = options?.now ?? ((): number => Date.now());
  }

  /** Counts one attempt. The signature is the one the plugin calls. */
  incr(key: string, callback: AttemptCallback, timeWindow: number): void {
    answer(this.#counters.count(key, timeWindow, this.#now()), callback);
  }

  /** Reads the state of a key without counting an attempt against it. */
  read(key: string, callback: AttemptCallback, timeWindow: number): void {
    answer(this.#counters.read(key, timeWindow, this.#now()), callback);
  }

  /** The store of one route, which shares the counters of this one. */
  child(): SharedAttemptStore {
    return new SharedAttemptStore({
      now: this.#now,
      counters: this.#counters,
    });
  }

  /** How many keys the map of this process holds, or zero for none. */
  get keyCount(): number {
    return this.#local?.size ?? 0;
  }
}

/**
 * The store class that the limit plugin builds, over one counter.
 *
 * The plugin builds its store with `new` and its own options, so the counter
 * travels in the class. Every child of the store shares that counter.
 */
export function attemptStoreFor(
  counter: AttemptCounter,
): new () => SharedAttemptStore {
  return class extends SharedAttemptStore {
    constructor() {
      super({ counters: counter });
    }
  };
}

/**
 * The client part of the key of a report attempt (record 0119).
 *
 * An IPv4 address counts alone. A host of IPv6 usually holds a whole /64
 * prefix and can draw a new address from it for each attempt, so an IPv6
 * address counts by its /64 prefix. An IPv4 address that IPv6 carries counts
 * as that IPv4 address.
 */
export function attemptAddress(ip: string): string {
  const address = ip.trim().toLowerCase();
  if (isIPv4(address)) return address;
  if (!isIPv6(address)) return address;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mapped?.[1] !== undefined) return mapped[1];
  const [head = '', tail] = address.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const groups =
    tail === undefined
      ? left
      : [
          ...left,
          ...Array.from<string>({
            length: 8 - left.length - right.length,
          }).fill('0'),
          ...right,
        ];
  const prefix = groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':');
  return `${prefix}::/64`;
}
