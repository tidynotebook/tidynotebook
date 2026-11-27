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
  type OpenNotePresence,
} from './live-rooms.ts';

const remoteLifetimeMs = 90_000;
const remoteHeartbeatMs = 30_000;

type Route = {
  readonly key: string;
  readonly epoch: 'local' | 'remote';
  readonly note: OpenNotePresence;
  joined: boolean;
  acknowledged: number;
};
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
}): LiveRooms & { start(): void; ready(): boolean; close(): Promise<void> } {
  const instance = randomUUID();
  const physical = new Map<LiveConnection, Local>();
  const localById = new Map<string, Local>();
  const remoteById = new Map<string, Remote>();
  const remotePending = new Map<
    string,
    { pending: number; tail: Promise<void> }
  >();
  const otherPresence = new Map<
    string,
    { expires: number; notes: OpenNotePresence[] }
  >();
  let heartbeat: NodeJS.Timeout | null = null;
  let presenceTimer: NodeJS.Timeout | null = null;

  const relay = openLiveRelay(input.databaseUrl, input.seal, dispatch, reset);
  const rooms = createLiveRooms({
    ...input,
    onRoomEmpty: (key) => relay.release(key),
    remotePresence: () =>
      [...otherPresence.values()].flatMap((entry) => entry.notes),
  });

  function sharePresence(): void {
    if (presenceTimer !== null) return;
    presenceTimer = setTimeout(() => {
      presenceTimer = null;
      void relay
        .hasPeers()
        .then((shared) => {
          if (!shared) return;
          const notes = [...physical.values()]
            .flatMap((local) =>
              [...local.routes.values()]
                .filter((route) => route.joined)
                .map((route) => route.note),
            )
            .slice(0, liveBounds.presenceNotes);
          return relay.post({ mode: 'presence', gateway: instance, notes });
        })
        .catch(() => {});
    }, 100);
    presenceTimer.unref();
  }

  async function receivedPresence(
    value: unknown,
    gateway: string,
  ): Promise<void> {
    if (!Array.isArray(value) || value.length > liveBounds.presenceNotes)
      return;
    const notes: OpenNotePresence[] = [];
    for (const item of value) {
      const workspaceId = readProperty(item, 'workspaceId');
      const fileId = readProperty(item, 'fileId');
      const accountId = readProperty(item, 'accountId');
      const colorSlot = readProperty(item, 'colorSlot');
      if (
        typeof workspaceId !== 'string' ||
        typeof fileId !== 'string' ||
        typeof accountId !== 'string'
      )
        continue;
      notes.push({
        workspaceId,
        fileId,
        accountId,
        ...(typeof colorSlot === 'number' &&
        Number.isInteger(colorSlot) &&
        colorSlot >= 0 &&
        colorSlot <= 2147483647
          ? { colorSlot }
          : {}),
      });
    }
    if (!otherPresence.has(gateway) && otherPresence.size >= 64) return;
    const changed = new Set(
      [...(otherPresence.get(gateway)?.notes ?? []), ...notes].map(
        (note) => note.workspaceId,
      ),
    );
    otherPresence.set(gateway, {
      expires: Date.now() + remoteLifetimeMs,
      notes,
    });
    for (const workspaceId of changed)
      await rooms.refreshPresence?.(workspaceId);
  }

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
    otherPresence.clear();
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
      if (entry !== undefined && typeof key === 'string' && relay.owns(key)) {
        entry.validUntil = Date.now() + remoteLifetimeMs;
        await rooms.recheck(entry.connection);
        await relay.post({ mode: 'alive', gateway, connectionId, key });
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
    const gateway = message['gateway'];
    const mode = message['mode'];
    const id = message['connectionId'];
    if (mode === 'out' && gateway === instance) {
      const output = record(message['output']);
      if (typeof id === 'string' && output !== null)
        localById.get(id)?.connection.emit(output);
    } else if (
      mode === 'alive' &&
      gateway === instance &&
      typeof id === 'string'
    ) {
      for (const route of localById.get(id)?.routes.values() ?? [])
        if (route.key === message['key']) route.acknowledged = Date.now();
    } else if (
      mode === 'presence' &&
      typeof gateway === 'string' &&
      gateway !== instance
    ) {
      void receivedPresence(message['notes'], gateway).catch(() => {});
    } else if (
      mode === 'in' &&
      typeof gateway === 'string' &&
      gateway !== instance &&
      typeof id === 'string'
    ) {
      const key = `${gateway}:${id}`;
      const queue = remotePending.get(key) ?? {
        pending: 0,
        tail: Promise.resolve(),
      };
      if (queue.pending >= liveBounds.pendingPerConnection) return;
      if (
        !remotePending.has(key) &&
        remotePending.size >=
          liveBounds.roomsPerProcess * liveBounds.connectionsPerRoom
      )
        return;
      queue.pending += 1;
      remotePending.set(key, queue);
      queue.tail = queue.tail
        .then(() => remoteFrame(message))
        .catch(() => {})
        .finally(() => {
          queue.pending -= 1;
          if (queue.pending === 0) remotePending.delete(key);
        });
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
        if (typeof roomId === 'string') {
          const route = routes.get(roomId);
          if (
            message['kind'] === 'noteStopped' ||
            message['access'] === 'removed'
          ) {
            if (routes.delete(roomId)) sharePresence();
          } else if (route !== undefined && message['kind'] === 'noteJoined') {
            route.joined = true;
            const slot = readProperty(message, 'colorSlot');
            if (typeof slot === 'number') route.note.colorSlot = slot;
            route.acknowledged = Date.now();
            sharePresence();
          }
        }
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
    refreshWorkspace: (workspaceId) => rooms.refreshWorkspace?.(workspaceId),
    ready: () => relay.listening(),
    start() {
      relay.start();
      heartbeat = setInterval(() => {
        const now = Date.now();
        for (const [id, remote] of remoteById)
          if (remote.validUntil <= now) {
            rooms.remove(remote.connection);
            remoteById.delete(id);
          }
        for (const local of physical.values()) {
          for (const [roomId, route] of local.routes) {
            if (route.epoch !== 'remote') continue;
            if (route.acknowledged + remoteLifetimeMs <= now)
              local.connection.emit({
                kind: 'noteStopped',
                roomId,
                reason: 'unavailable',
              });
            else void forward(local, 'refresh', route);
          }
        }
        for (const [host, state] of otherPresence) {
          if (state.expires > now) continue;
          otherPresence.delete(host);
          for (const workspaceId of new Set(
            state.notes.map((peer) => peer.workspaceId),
          )) {
            void rooms.refreshPresence?.(workspaceId).catch(() => {});
          }
        }
        if (physical.size > 0) sharePresence();
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
        const route: Route = {
          key,
          note: {
            workspaceId: note.workspaceId,
            fileId: note.fileId,
            accountId: connection.accountId,
          },
          acknowledged: Date.now(),
          joined: false,
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
      if (kind === 'leaveNote') {
        local.routes.delete(roomId);
        sharePresence();
      }
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
      sharePresence();
      if ([...local.routes.values()].some((route) => route.epoch === 'remote'))
        void forward(local, 'close');
    },
    async recheck(connection) {
      const local = physical.get(connection);
      if (local === undefined) return;
      await rooms.recheck(local.connection);
      for (const route of local.routes.values()) {
        if (route.epoch === 'remote') await forward(local, 'refresh', route);
      }
    },
    reset,
    async close() {
      if (heartbeat !== null) clearInterval(heartbeat);
      if (presenceTimer !== null) clearTimeout(presenceTimer);
      reset();
      await relay.close();
    },
  };
}
