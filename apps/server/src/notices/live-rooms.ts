import {
  applyDocumentUpdate,
  decodeNoteAwareness,
  decodeNoteSync,
  documentStateVector,
  encodeDocumentDelta,
  encodeNoteAwareness,
  encodeNoteSync,
  updateActors,
  type AwarenessEntry,
} from '@notesapp/storage-server';
import {
  verifyActor,
  presenceColorSlot,
  type CollaborationStore,
  type Role,
} from '@notesapp/core';
import { readProperty } from '../values.ts';
import { liveBounds } from './live-bounds.ts';

type Out = Record<string, unknown>;
export type LiveConnection = {
  readonly accountId: string;
  readonly sessionId: string;
  readonly name: string;
  readonly emit: (message: Out) => void;
};
type LiveNote = {
  readonly workspaceId: string;
  readonly fileId: string;
  readonly epoch: number;
  readonly clientId: number;
  readonly roomId: string;
};
type Peer = LiveNote & {
  readonly connection: LiveConnection;
  readonly room: Room;
  role: Role;
  sequence: number;
  awareness: AwarenessEntry | null;
};
type Room = {
  readonly key: string;
  readonly members: Set<Peer>;
  document: Uint8Array;
  head: string | null;
  refreshing: boolean;
  retryHeadAfter: number;
  work: Promise<void>;
};
const bindingConflict = Symbol('bindingConflict');

type Watch = { generation: number; workspaceIds: Set<string> };
export type OpenNotePresence = {
  workspaceId: string;
  fileId: string;
  accountId: string;
};
export type LiveRooms = {
  readonly handle: (
    connection: LiveConnection,
    kind: string,
    message: Readonly<Record<string, unknown>>,
  ) => Promise<void>;
  readonly remove: (connection: LiveConnection) => void;
  readonly recheck: (connection: LiveConnection) => Promise<void>;
  readonly reset: () => void;
  readonly hasRoom?: (key: string) => boolean;
  readonly refreshWorkspace?: (workspaceId: string) => void;
  readonly refreshPresence?: (workspaceId: string) => Promise<void>;
};

export function noteOf(
  value: Readonly<Record<string, unknown>>,
): LiveNote | null {
  const { workspaceId, fileId, epoch, clientId, roomId } = value;
  return typeof workspaceId === 'string' &&
    typeof fileId === 'string' &&
    typeof epoch === 'number' &&
    typeof clientId === 'number' &&
    typeof roomId === 'string'
    ? { workspaceId, fileId, epoch, clientId, roomId }
    : null;
}

export function roomKey(note: LiveNote): string {
  return `${note.workspaceId}:${note.fileId}:${note.epoch}`;
}

function relativePoint(value: unknown): unknown {
  function id(value: unknown): unknown {
    const client = readProperty(value, 'client');
    const clock = readProperty(value, 'clock');
    return typeof client === 'number' &&
      Number.isSafeInteger(client) &&
      client >= 0 &&
      client <= 4294967295 &&
      typeof clock === 'number' &&
      Number.isSafeInteger(clock) &&
      clock >= 0
      ? { client, clock }
      : null;
  }
  const type = id(readProperty(value, 'type'));
  const item = id(readProperty(value, 'item'));
  const tname = readProperty(value, 'tname') === 'text' ? 'text' : null;
  const assoc = readProperty(value, 'assoc') === -1 ? -1 : 0;
  return typeof value === 'object' &&
    value !== null &&
    (type !== null || item !== null || tname !== null)
    ? { type, item, tname, assoc }
    : null;
}

function canWrite(peer: Peer): boolean {
  return peer.role !== 'viewer';
}

function canonicalAwareness(peer: Peer, entry: AwarenessEntry): AwarenessEntry {
  const rawCursor = readProperty(entry.state, 'cursor');
  const anchor = relativePoint(readProperty(rawCursor, 'anchor'));
  const head = relativePoint(readProperty(rawCursor, 'head'));
  const slot = presenceColorSlot(peer.connection.accountId);
  return {
    clientId: entry.clientId,
    clock: entry.clock,
    state:
      entry.state === null
        ? null
        : {
            accountId: peer.connection.accountId,
            displayName: peer.connection.name,
            slot,
            user: {
              name: peer.connection.name,
              color: `var(--color-live-${slot})`,
              colorLight: `var(--color-live-selection-${slot})`,
            },
            mode: peer.role === 'viewer' ? 'viewing' : 'editing',
            idle: readProperty(entry.state, 'idle') === true,
            cursor: anchor === null || head === null ? null : { anchor, head },
          },
  };
}

export function createLiveRooms(input: {
  readonly store: CollaborationStore;
  readonly onRoomEmpty?: (key: string) => void;
  readonly remotePresence?: () => readonly OpenNotePresence[];

  readonly noticeAccess: (
    sessionId: string,
    accountId: string,
  ) => Promise<readonly string[] | null>;
}): LiveRooms {
  const rooms = new Map<string, Room>();
  const peers = new Map<LiveConnection, Map<string, Peer>>();
  const watches = new Map<LiveConnection, Watch>();
  let memory = 0;

  const stop = (
    connection: LiveConnection,
    roomId: string,
    reason: string,
  ): void => {
    connection.emit({ kind: 'noteStopped', roomId, reason });
  };
  async function read(
    connection: LiveConnection,
    note: LiveNote,
    options: {
      bind?: boolean;
      bindIfWritable?: boolean;
      knownHead?: string | null;
    } = {},
  ) {
    const readable = await input.noticeAccess(
      connection.sessionId,
      connection.accountId,
    );
    if (!readable?.includes(note.workspaceId)) return null;
    const actor = verifyActor(connection.accountId, []);
    if (!actor.ok) return null;
    return input.store.collaboration(
      actor.value,
      note.workspaceId,
      async (tx) => {
        const current = await tx.liveNoteAccess(note.fileId);
        if (current === null || current.epoch !== note.epoch) return null;
        if (
          (options.bind ||
            (options.bindIfWritable &&
              current.writable &&
              current.role !== 'viewer')) &&
          !(await tx.bindNoteClient(note.fileId, note.epoch, note.clientId))
        )
          return bindingConflict;
        if (options.knownHead === current.head)
          return { ...current, bytes: null };
        const document = await tx.liveNote(note.fileId);
        return document === null || document.epoch !== note.epoch
          ? null
          : document;
      },
    );
  }

  function serial(room: Room, run: () => Promise<void>): Promise<void> {
    const next = room.work.then(run);
    room.work = next.catch(() => {});
    return next;
  }

  function writeAwareness(peer: Peer, entry: AwarenessEntry): void {
    const payload = encodeNoteAwareness([entry]);
    if (payload.byteLength > liveBounds.awarenessBytes) return;
    peer.connection.emit({
      kind: 'noteAwareness',
      roomId: peer.roomId,
      payload: Buffer.from(payload).toString('base64'),
    });
  }

  async function presence(workspaceId: string): Promise<void> {
    for (const [connection, watch] of watches) {
      if (!watch.workspaceIds.has(workspaceId)) continue;
      const allowed = await input.noticeAccess(
        connection.sessionId,
        connection.accountId,
      );
      if (!allowed?.includes(workspaceId) || watches.get(connection) !== watch)
        continue;
      const byNote = new Map<string, Set<string>>();
      for (const room of rooms.values())
        for (const peer of room.members) {
          if (
            peer.workspaceId !== workspaceId ||
            peer.connection.accountId === connection.accountId
          )
            continue;
          const others = byNote.get(peer.fileId) ?? new Set<string>();
          others.add(peer.connection.accountId);
          byNote.set(peer.fileId, others);
        }
      for (const peer of input.remotePresence?.() ?? []) {
        if (
          peer.workspaceId !== workspaceId ||
          peer.accountId === connection.accountId
        )
          continue;
        const others = byNote.get(peer.fileId) ?? new Set<string>();
        if (others.size >= liveBounds.connectionsPerRoom) continue;
        others.add(peer.accountId);
        byNote.set(peer.fileId, others);
      }
      connection.emit({
        kind: 'workspacePresence',
        workspaceId,
        generation: watch.generation,
        notes: [...byNote]
          .slice(0, liveBounds.presenceNotes)
          .map(([fileId, accounts]) => ({
            fileId,
            accountCount: accounts.size,
            colorSlots: [...accounts].sort().slice(0, 3).map(presenceColorSlot),
          })),
      });
    }
  }

  function removePeer(peer: Peer): void {
    const held = peers.get(peer.connection);
    held?.delete(peer.roomId);
    if (held?.size === 0) peers.delete(peer.connection);
    const room = peer.room;
    if (!room.members.delete(peer)) return;
    if (room.members.size === 0) {
      if (rooms.delete(room.key)) {
        memory -= room.document.byteLength;
        input.onRoomEmpty?.(room.key);
      }
    } else if (peer.awareness !== null) {
      const entry = {
        ...peer.awareness,
        clock: peer.awareness.clock + 1,
        state: null,
      };
      void serial(room, async () => {
        for (const target of room.members) writeAwareness(target, entry);
      }).catch(() => {});
    }
    void presence(peer.workspaceId).catch(() => {});
  }

  async function currentPeer(peer: Peer): Promise<boolean> {
    const current = await read(peer.connection, peer, {
      knownHead: peer.room.head,
      bindIfWritable: peer.role === 'viewer',
    });
    if (!peer.room.members.has(peer)) return false;
    if (current === bindingConflict) {
      stop(peer.connection, peer.roomId, 'client_id_conflict');
      removePeer(peer);
      return false;
    }
    if (current === null) {
      peer.connection.emit({
        kind: 'noteAccess',
        roomId: peer.roomId,
        access: 'removed',
      });
      removePeer(peer);
      return false;
    }
    const role = current.writable ? current.role : 'viewer';
    if (peer.role !== role) {
      peer.role = role;
      peer.connection.emit({
        kind: 'noteAccess',
        roomId: peer.roomId,
        access: role,
      });
      if (peer.awareness !== null)
        peer.awareness = canonicalAwareness(peer, peer.awareness);
    }
    if (
      current.bytes !== null &&
      !refreshHead(peer.room, current.head, current.bytes)
    ) {
      stop(peer.connection, peer.roomId, 'unavailable');
      removePeer(peer);
      return false;
    }
    return true;
  }

  function sendSync(
    peer: Peer,
    kind: 'state' | 'vector' | 'update',
    bytes: Uint8Array,
  ): boolean {
    const payload = encodeNoteSync({ kind, bytes });
    if (payload.byteLength > liveBounds.syncBytes) {
      stop(peer.connection, peer.roomId, 'capacity');
      removePeer(peer);
      return false;
    }
    peer.sequence += 1;
    peer.connection.emit({
      kind: 'noteSync',
      roomId: peer.roomId,
      sequence: peer.sequence,
      payload: Buffer.from(payload).toString('base64'),
    });
    return true;
  }

  function apply(room: Room, update: Uint8Array) {
    const next = applyDocumentUpdate(room.document, update);
    if (!next.ok) return next.refusal;
    const delta = next.value.document.byteLength - room.document.byteLength;
    if (memory + delta > liveBounds.roomMemory) return 'too-large';
    if (rooms.get(room.key) !== room) return 'unavailable';
    room.document = next.value.document;
    memory += delta;
    return null;
  }

  function refreshHead(
    room: Room,
    head: string | null,
    bytes: Uint8Array,
  ): boolean {
    const delta = encodeDocumentDelta(
      bytes,
      documentStateVector(room.document),
    );
    if (apply(room, delta) !== null) return false;
    room.head = head;
    return true;
  }

  async function join(
    connection: LiveConnection,
    note: LiveNote,
  ): Promise<void> {
    const known = peers.get(connection);
    const existing = known?.get(note.roomId);
    if (existing !== undefined) {
      await serial(existing.room, async () => {
        if (
          !existing.room.members.has(existing) ||
          note.clientId !== existing.clientId ||
          roomKey(note) !== existing.room.key
        )
          return;
        existing.sequence = 0;
        connection.emit({
          kind: 'noteJoined',
          roomId: existing.roomId,
          epoch: existing.epoch,
          role: existing.role,
        });
      });
      return;
    }
    if ((known?.size ?? 0) >= liveBounds.roomsPerConnection)
      return stop(connection, note.roomId, 'capacity');
    let room = rooms.get(roomKey(note));
    if (rooms.size >= liveBounds.roomsPerProcess && room === undefined)
      return stop(connection, note.roomId, 'capacity');
    const knownHead = room?.head;
    const current = await read(connection, note, {
      bind: true,
      ...(knownHead === undefined ? {} : { knownHead }),
    });
    if (current === null) return stop(connection, note.roomId, 'forbidden');
    if (current === bindingConflict)
      return stop(connection, note.roomId, 'client_id_conflict');
    room = rooms.get(roomKey(note));
    if (room === undefined) {
      if (current.bytes === null)
        return stop(connection, note.roomId, 'unavailable');
      if (memory + current.bytes.byteLength > liveBounds.roomMemory)
        return stop(connection, note.roomId, 'capacity');
      room = {
        key: roomKey(note),
        members: new Set(),
        document: current.bytes,
        head: current.head,
        refreshing: false,
        retryHeadAfter: 0,
        work: Promise.resolve(),
      };
      rooms.set(room.key, room);
      memory += room.document.byteLength;
    }
    const target = room;
    await serial(target, async () => {
      if (rooms.get(target.key) !== target)
        return stop(connection, note.roomId, 'unavailable');
      if (
        current.bytes !== null &&
        target.head === knownHead &&
        !refreshHead(target, current.head, current.bytes)
      )
        return stop(connection, note.roomId, 'unavailable');
      if (target.members.size >= liveBounds.connectionsPerRoom)
        return stop(connection, note.roomId, 'capacity');
      if ([...target.members].some((entry) => entry.clientId === note.clientId))
        return stop(connection, note.roomId, 'client_id_conflict');
      const peer: Peer = {
        ...note,
        connection,
        room: target,
        role: current.writable ? current.role : 'viewer',
        sequence: 0,
        awareness: null,
      };
      target.members.add(peer);
      const entries = peers.get(connection) ?? new Map<string, Peer>();
      entries.set(note.roomId, peer);
      peers.set(connection, entries);
      connection.emit({
        kind: 'noteJoined',
        roomId: peer.roomId,
        epoch: peer.epoch,
        role: peer.role,
      });
      for (const other of target.members)
        if (other !== peer && other.awareness !== null)
          writeAwareness(peer, other.awareness);
      await presence(note.workspaceId);
    });
  }

  return {
    hasRoom: (key) => rooms.has(key),
    refreshPresence: presence,
    async handle(connection, kind, message) {
      if (kind === 'watchWorkspacePresence') {
        const { workspaceIds, generation } = message;
        if (!Array.isArray(workspaceIds) || typeof generation !== 'number')
          return;
        if ((watches.get(connection)?.generation ?? 0) >= generation) return;
        const allowed = await input.noticeAccess(
          connection.sessionId,
          connection.accountId,
        );
        const ids = new Set(
          workspaceIds.filter(
            (id: unknown): id is string =>
              typeof id === 'string' && allowed?.includes(id) === true,
          ),
        );
        watches.set(connection, { generation, workspaceIds: ids });
        for (const id of ids) await presence(id);
        return;
      }
      const { roomId, payload } = message;
      if (typeof roomId !== 'string') return;
      if (kind === 'joinNote') {
        const note = noteOf(message);
        if (note !== null) await join(connection, note);
        return;
      }
      const peer = peers.get(connection)?.get(roomId);
      if (peer === undefined) return;
      if (kind === 'leaveNote') {
        removePeer(peer);
        return;
      }
      if (typeof payload !== 'string') return;
      const bytes = Buffer.from(payload, 'base64');
      await serial(peer.room, async () => {
        if (!peer.room.members.has(peer)) return;
        if (kind === 'sendNoteAwareness') {
          const decoded =
            bytes.byteLength <= liveBounds.awarenessBytes
              ? decodeNoteAwareness(bytes, 1)
              : null;
          const first = decoded?.[0];
          if (first === undefined || first.clientId !== peer.clientId) {
            stop(connection, roomId, 'invalid_update');
            removePeer(peer);
            return;
          }
          if (first.clock <= (peer.awareness?.clock ?? -1)) return;
          const entry = canonicalAwareness(peer, first);
          peer.awareness = entry;
          for (const target of peer.room.members)
            if (target !== peer) writeAwareness(target, entry);
          return;
        }
        const decoded =
          bytes.byteLength <= liveBounds.syncBytes
            ? decodeNoteSync(bytes)
            : null;
        if (decoded === null) {
          stop(connection, roomId, 'invalid_update');
          removePeer(peer);
          return;
        }
        if (decoded.kind === 'vector') {
          try {
            const delta = encodeDocumentDelta(
              peer.room.document,
              decoded.bytes,
            );
            if (sendSync(peer, 'state', delta))
              sendSync(peer, 'vector', documentStateVector(peer.room.document));
          } catch {
            stop(connection, roomId, 'invalid_update');
            removePeer(peer);
          }
          return;
        }
        if (!canWrite(peer)) return;
        try {
          const { clientIds } = updateActors(decoded.bytes);
          if (clientIds.some((id) => id !== peer.clientId))
            throw new Error('Unexpected client ID.');
          let refusal = apply(peer.room, decoded.bytes);
          if (
            refusal === 'missing-dependency' &&
            Date.now() >= peer.room.retryHeadAfter
          ) {
            peer.room.retryHeadAfter = Date.now() + liveBounds.recheckHeadMs;
            if (!(await currentPeer(peer)) || !canWrite(peer)) return;
            refusal = apply(peer.room, decoded.bytes);
          }
          if (refusal !== null) throw new Error('Invalid live update.');
        } catch {
          stop(connection, roomId, 'invalid_update');
          removePeer(peer);
          return;
        }
        for (const target of peer.room.members)
          if (target !== peer) sendSync(target, 'update', decoded.bytes);
      });
    },
    remove(connection) {
      watches.delete(connection);
      for (const peer of [...(peers.get(connection)?.values() ?? [])])
        removePeer(peer);
    },
    async recheck(connection) {
      const pending = [...(peers.get(connection)?.values() ?? [])].map((peer) =>
        serial(peer.room, async () => {
          if (!peer.room.members.has(peer)) return;
          try {
            await currentPeer(peer);
          } catch {
            stop(peer.connection, peer.roomId, 'unavailable');
            removePeer(peer);
          }
        }),
      );
      const watch = watches.get(connection);
      if (watch !== undefined) {
        const allowed = await input.noticeAccess(
          connection.sessionId,
          connection.accountId,
        );
        if (watches.get(connection) === watch)
          for (const id of watch.workspaceIds)
            if (!allowed?.includes(id)) watch.workspaceIds.delete(id);
      }
      await Promise.all(pending);
    },
    refreshWorkspace(workspaceId) {
      for (const room of rooms.values()) {
        if (!room.key.startsWith(`${workspaceId}:`) || room.refreshing)
          continue;
        room.refreshing = true;
        void serial(room, async () => {
          room.refreshing = false;
          for (const peer of room.members) {
            if (await currentPeer(peer)) break;
          }
        }).catch(() => {
          for (const peer of room.members) {
            stop(peer.connection, peer.roomId, 'unavailable');
            removePeer(peer);
          }
        });
      }
    },
    reset() {
      for (const [connection, list] of peers)
        for (const peer of [...list.values()]) {
          stop(connection, peer.roomId, 'unavailable');
          removePeer(peer);
        }
    },
  };
}
