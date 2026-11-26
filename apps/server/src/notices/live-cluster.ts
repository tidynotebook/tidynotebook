import { randomUUID } from 'node:crypto';
import type { CollaborationStore } from '@notesapp/core';
import type { Seal } from '../auth/seal.ts';
import { readProperty } from '../values.ts';
import { liveBounds } from './live-bounds.ts';
import { openLiveRelay } from './live-relay.ts';
import {
  createLiveRooms,
  noteOf,
  roomKey,
  type LiveConnection,
  type LiveRooms,
} from './live-rooms.ts';

const remoteLifetimeMs = 90_000;
const remoteHeartbeatMs = 30_000;

type Route = { readonly key: string; readonly epoch: 'local' | 'remote' };
type Local = {
  readonly id: string;
  readonly connection: LiveConnection;
  readonly routes: Map<string, Route>;
};
type Remote = { readonly connection: LiveConnection; validUntil: number };

function record(value: unknown): Record<string, unknown> | null {
  return value === null || typeof value !== 'object' || Array.isArray(value)
    ? null
    : Object.fromEntries(Object.entries(value));
}

export function createLiveCluster(input: {
  readonly databaseUrl: string;
  readonly seal: Seal;
  readonly store: CollaborationStore;
  readonly noticeAccess: (
    sessionId: string,
    accountId: string,
  ) => Promise<readonly string[] | null>;
}): LiveRooms & { start(): void; close(): Promise<void> } {
  const instance = randomUUID();
  const physical = new Map<LiveConnection, Local>();
  const localById = new Map<string, Local>();
  const remoteById = new Map<string, Remote>();
  let heartbeat: NodeJS.Timeout | null = null;
  const relay = openLiveRelay(input.databaseUrl, input.seal, dispatch, reset);
  const rooms = createLiveRooms({ ...input, onRoomEmpty: relay.release });

  function reset(): void {
    rooms.reset();
    for (const local of physical.values()) {
      for (const [roomId, route] of local.routes)
        if (route.epoch === 'remote')
          local.connection.emit({
            kind: 'noteStopped',
            roomId,
            reason: 'unavailable',
          });
      local.routes.clear();
    }
    for (const remote of remoteById.values()) rooms.remove(remote.connection);
    remoteById.clear();
  }

  async function remoteFrame(incoming: Record<string, unknown>): Promise<void> {
    const {
      connectionId,
      kind,
      gateway,
      key,
      message: value,
      accountId,
      sessionId,
      name,
    } = incoming;
    if (
      typeof connectionId !== 'string' ||
      typeof kind !== 'string' ||
      typeof gateway !== 'string'
    )
      return;
    const remoteId = `${gateway}:${connectionId}`;
    const entry = remoteById.get(remoteId);
    if (kind === 'close') {
      if (entry !== undefined) {
        rooms.remove(entry.connection);
        remoteById.delete(remoteId);
      }
      return;
    }
    if (kind === 'refresh') {
      if (entry !== undefined) {
        entry.validUntil = Date.now() + remoteLifetimeMs;
        await rooms.recheck(entry.connection);
      }
      return;
    }
    if (typeof key !== 'string' || !relay.owns(key)) return;
    const message = record(value);
    if (message === null) return;
    let remote = entry;
    if (remote === undefined) {
      if (
        remoteById.size >=
          liveBounds.roomsPerProcess * liveBounds.connectionsPerRoom ||
        kind !== 'joinNote' ||
        typeof accountId !== 'string' ||
        typeof sessionId !== 'string' ||
        typeof name !== 'string'
      )
        return;
      remote = {
        validUntil: Date.now() + remoteLifetimeMs,
        connection: {
          accountId,
          sessionId,
          name,
          emit: (output) => {
            void relay.post({ mode: 'out', gateway, connectionId, output });
          },
        },
      };
      remoteById.set(remoteId, remote);
    }
    remote.validUntil = Date.now() + remoteLifetimeMs;
    await rooms.handle(remote.connection, kind, message);
  }

  function dispatch(value: unknown): void {
    const message = record(value);
    if (message === null) return;
    if (message['mode'] === 'out' && message['gateway'] === instance) {
      const id = message['connectionId'];
      const output = record(message['output']);
      if (typeof id === 'string' && output !== null)
        localById.get(id)?.connection.emit(output);
    } else if (message['mode'] === 'in' && message['gateway'] !== instance) {
      void remoteFrame(message).catch(() => {});
    }
  }

  function connectionRecord(connection: LiveConnection): Local {
    const known = physical.get(connection);
    if (known !== undefined) return known;
    const routes = new Map<string, Route>();
    const id = randomUUID();
    const wrapped = {
      ...connection,
      emit: (message: Record<string, unknown>): void => {
        const roomId = readProperty(message, 'roomId');
        if (
          typeof roomId === 'string' &&
          (message['kind'] === 'noteStopped' || message['access'] === 'removed')
        )
          routes.delete(roomId);
        connection.emit(message);
      },
    };
    const local = { id, connection: wrapped, routes };
    physical.set(connection, local);
    localById.set(id, local);
    return local;
  }

  function forward(
    local: Local,
    kind: string,
    route?: Route,
    message?: Record<string, unknown>,
  ): Promise<void> {
    const { accountId, sessionId, name } = local.connection;
    return relay.post({
      mode: 'in',
      gateway: instance,
      connectionId: local.id,
      accountId,
      sessionId,
      name,
      kind,
      key: route?.key,
      message,
    });
  }

  return {
    start() {
      relay.start();
      heartbeat = setInterval(() => {
        const now = Date.now();
        for (const [id, remote] of remoteById)
          if (remote.validUntil <= now) {
            rooms.remove(remote.connection);
            remoteById.delete(id);
          }
        for (const local of physical.values())
          if (
            [...local.routes.values()].some((route) => route.epoch === 'remote')
          )
            void forward(local, 'refresh');
      }, remoteHeartbeatMs);
      heartbeat.unref();
    },
    async handle(connection, kind, payload) {
      const local = connectionRecord(connection);
      if (kind === 'watchWorkspacePresence') {
        await rooms.handle(local.connection, kind, payload);
        return;
      }
      const roomId = payload['roomId'];
      if (typeof roomId !== 'string') return;
      if (kind === 'joinNote') {
        const note = noteOf(payload);
        if (note === null) return;
        if (
          local.routes.size >= liveBounds.roomsPerConnection &&
          !local.routes.has(roomId)
        ) {
          connection.emit({ kind: 'noteStopped', roomId, reason: 'capacity' });
          return;
        }
        const key = roomKey(note);
        if (!relay.listening()) {
          connection.emit({
            kind: 'noteStopped',
            roomId,
            reason: 'unavailable',
          });
          return;
        }
        const owned = await relay.acquire(key);
        if (!physical.has(connection)) {
          if (owned && !rooms.hasRoom?.(key)) relay.release(key);
          return;
        }
        const route = {
          key,
          epoch: owned ? ('local' as const) : ('remote' as const),
        };
        local.routes.set(roomId, route);
        if (owned) {
          await rooms.handle(local.connection, kind, payload);
          if (!rooms.hasRoom?.(key)) relay.release(key);
        } else await forward(local, kind, route, { ...payload });
        return;
      }
      const route = local.routes.get(roomId);
      if (route === undefined) return;
      if (kind === 'leaveNote') local.routes.delete(roomId);
      if (route.epoch === 'local')
        await rooms.handle(local.connection, kind, payload);
      else await forward(local, kind, route, { ...payload });
    },
    remove(connection) {
      const local = physical.get(connection);
      if (local === undefined) return;
      physical.delete(connection);
      localById.delete(local.id);
      rooms.remove(local.connection);
      if ([...local.routes.values()].some((route) => route.epoch === 'remote'))
        void forward(local, 'close');
    },
    async recheck(connection) {
      const local = physical.get(connection);
      if (local === undefined) return;
      await rooms.recheck(local.connection);
      if ([...local.routes.values()].some((route) => route.epoch === 'remote'))
        await forward(local, 'refresh');
    },
    reset,
    async close() {
      if (heartbeat !== null) clearInterval(heartbeat);
      reset();
      await relay.close();
    },
  };
}
