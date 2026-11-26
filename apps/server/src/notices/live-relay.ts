import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { openPool } from '@notesapp/storage-server';
import type { Seal } from '../auth/seal.ts';
import { readProperty } from '../values.ts';
import { liveBounds } from './live-bounds.ts';

const relayChannel = 'notesapp_live_rooms';
const reconnectMs = 1000;
const rawChunk = liveBounds.relayChunkBytes - 80;
const maxPieces = Math.ceil((liveBounds.frameBytes * 2) / rawChunk);
const maxRemembered = 2048;

type Assembly = {
  readonly deadline: number;
  readonly total: number;
  readonly pieces: Map<number, string>;
};

export type LiveRelay = {
  start(): void;
  listening(): boolean;
  hasPeers(): Promise<boolean>;
  owns(room: string): boolean;
  acquire(room: string): Promise<boolean>;
  release(room: string): void;
  post(value: object): Promise<void>;
  close(): Promise<void>;
};

/** Keeps room locks and the shared listener on one owned database session. */
export function openLiveRelay(
  databaseUrl: string,
  seal: Seal,
  receive: (message: unknown) => void,
  reset: () => void,
): LiveRelay {
  const pool = openPool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5000,
    application_name: 'notesapp-live-relay',
  });
  const owned = new Set<string>();
  const pending = new Map<string, Promise<boolean>>();
  const assemblies = new Map<string, Assembly>();
  const seen = new Map<string, number>();
  let client: pg.PoolClient | null = null;
  let ready = false;
  let closing = false;
  let retry: NodeJS.Timeout | null = null;
  let connecting = false;

  function receivePiece(message: pg.Notification): void {
    if (
      message.channel !== relayChannel ||
      message.payload === undefined ||
      message.payload.length > liveBounds.relayChunkBytes
    )
      return;
    const [id, partText, totalText, body] = message.payload.split(':');
    const part = Number(partText);
    const total = Number(totalText);
    if (
      id === undefined ||
      !/^[a-f0-9-]{36}$/.test(id) ||
      body === undefined ||
      seen.has(id) ||
      !Number.isInteger(part) ||
      !Number.isInteger(total) ||
      part < 0 ||
      part >= total ||
      total > maxPieces
    )
      return;
    const now = Date.now();
    for (const [key, old] of assemblies)
      if (old.deadline <= now) assemblies.delete(key);
    for (const [key, deadline] of seen) if (deadline <= now) seen.delete(key);
    let item = assemblies.get(id);
    if (item === undefined) {
      if (assemblies.size >= liveBounds.relayAssemblies) return;
      item = {
        deadline: now + liveBounds.relayTtlMs,
        total,
        pieces: new Map(),
      };
      assemblies.set(id, item);
    }
    if (item.total !== total) return;
    item.pieces.set(part, body);
    if (item.pieces.size !== total) return;
    assemblies.delete(id);
    const envelope = Array.from(
      { length: total },
      (_, index) => item?.pieces.get(index) ?? '',
    ).join('');
    const text = seal.open(envelope);
    if (text === null || Buffer.byteLength(text) > liveBounds.frameBytes)
      return;
    try {
      const decoded: unknown = JSON.parse(text);
      if (
        readProperty(decoded, 'id') !== id ||
        typeof readProperty(decoded, 'expires') !== 'number' ||
        Number(readProperty(decoded, 'expires')) <= now
      )
        return;
      if (seen.size >= maxRemembered) {
        const first = seen.keys().next().value;
        if (first !== undefined) seen.delete(first);
      }
      seen.set(id, now + liveBounds.relayTtlMs);
      receive(readProperty(decoded, 'message'));
    } catch {
      // An unrelated or expired notification changes no live state.
    }
  }

  function lose(connection: pg.PoolClient): void {
    if (client !== connection) return;
    client = null;
    ready = false;
    pending.clear();
    owned.clear();
    assemblies.clear();
    connection.removeListener('notification', receivePiece);
    connection.release(true);
    if (closing) return;
    reset();
    retry = setTimeout(() => {
      retry = null;
      void connect();
    }, reconnectMs);
    retry.unref();
  }

  async function connect(): Promise<void> {
    if (client !== null || connecting || closing) return;
    connecting = true;
    try {
      const connection = await pool.connect();
      if (closing) {
        connection.release(true);
        return;
      }
      client = connection;
      connection.on('error', () => lose(connection));
      connection.on('end', () => lose(connection));
      connection.on('notification', receivePiece);
      try {
        await connection.query(`listen ${relayChannel}`);
        if (client === connection) ready = true;
      } catch {
        lose(connection);
      }
    } catch {
      if (!closing) {
        retry = setTimeout(() => {
          retry = null;
          void connect();
        }, reconnectMs);
        retry.unref();
      }
    } finally {
      connecting = false;
    }
  }

  return {
    start: () => {
      void connect();
    },
    listening: () => ready,
    async hasPeers() {
      const connection = client;
      if (connection === null || !ready) return false;
      const found = await connection.query<{ peers: boolean }>(
        "select exists(select 1 from pg_stat_activity where datname = current_database() and application_name = 'notesapp-live-relay' and pid <> pg_backend_pid()) as peers",
      );
      return found.rows[0]?.peers === true;
    },

    owns: (room) => owned.has(room),
    async acquire(room) {
      if (owned.has(room)) return true;
      if (!ready || client === null) return false;
      const old = pending.get(room);
      if (old !== undefined) return old;
      const connection = client;
      const next = connection
        .query<{ held: boolean }>(
          "select pg_try_advisory_lock(hashtextextended('notesapp-live:' || $1, 0)) as held",
          [room],
        )
        .then(({ rows }) => {
          if (client !== connection || rows[0]?.held !== true) return false;
          owned.add(room);
          return true;
        })
        .finally(() => {
          if (pending.get(room) === next) pending.delete(room);
        });
      pending.set(room, next);
      return next;
    },
    release(room) {
      const connection = client;
      if (!owned.delete(room) || connection === null) return;
      void connection
        .query(
          "select pg_advisory_unlock(hashtextextended('notesapp-live:' || $1, 0))",
          [room],
        )
        .catch(() => {
          lose(connection);
        });
    },
    async post(message) {
      const connection = client;
      if (connection === null || !ready) return;
      const id = randomUUID();
      const text = JSON.stringify({
        id,
        expires: Date.now() + liveBounds.relayTtlMs,
        message,
      });
      if (Buffer.byteLength(text) > liveBounds.frameBytes) return;
      const envelope = seal.seal(text);
      const count = Math.ceil(envelope.length / rawChunk);
      const pieces = Array.from(
        { length: count },
        (_, index) =>
          `${id}:${index}:${count}:${envelope.slice(index * rawChunk, (index + 1) * rawChunk)}`,
      );
      try {
        await connection.query(
          'select pg_notify($1, chunk) from unnest($2::text[]) chunk',
          [relayChannel, pieces],
        );
      } catch {
        lose(connection);
      }
    },
    async close() {
      closing = true;
      if (retry !== null) clearTimeout(retry);
      if (client !== null) lose(client);
      await pool.end();
    },
  };
}
