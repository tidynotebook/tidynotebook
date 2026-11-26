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
  accepted: Uint8Array;
  work: Promise<void>;
};
type Watch = { generation: number; workspaceIds: Set<string> };
type NoteState = {
  bytes: Uint8Array;
  epoch: number;
  role: Role;
  writable: boolean;
};

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

function colorSlot(accountId: string): number {
  const value = accountId.replaceAll('-', '');
  let slot = 0;
  for (let index = 0; index < value.length; index += 1)
    slot = (slot * 31 + value.charCodeAt(index)) % 6;
  return slot;
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

function canonicalAwareness(peer: Peer, entry: AwarenessEntry): AwarenessEntry {
  const rawCursor = readProperty(entry.state, 'cursor');
  const anchor = relativePoint(readProperty(rawCursor, 'anchor'));
  const head = relativePoint(readProperty(rawCursor, 'head'));
  const slot = colorSlot(peer.connection.accountId);
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
  const read = async (
    connection: LiveConnection,
    note: LiveNote,
    bind = false,
  ): Promise<NoteState | null> => {
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
        const current = await tx.liveNote(note.fileId);
        if (current === null || current.epoch !== note.epoch) return null;
        if (
          bind &&
          !(await tx.bindNoteClient(note.fileId, note.epoch, note.clientId))
        )
          return null;
        return current;
      },
    );
  };

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
        for (const target of room.members)
          if (await currentPeer(target)) writeAwareness(target, entry);
      }).catch(() => {});
    }
    void presence(peer.workspaceId).catch(() => {});
  }

  async function currentPeer(peer: Peer): Promise<NoteState | null> {
    const current = await read(peer.connection, peer);
    if (!peer.room.members.has(peer)) return null;
    if (current === null) {
      peer.connection.emit({
        kind: 'noteAccess',
        roomId: peer.roomId,
        access: 'removed',
      });
      removePeer(peer);
      return null;
    }
    const role = current.writable ? current.role : 'viewer';
    if (peer.role !== role) {
      if (
        peer.role === 'viewer' &&
        role !== 'viewer' &&
        !(await read(peer.connection, peer, true))
      ) {
        stop(peer.connection, peer.roomId, 'client_id_conflict');
        removePeer(peer);
        return null;
      }
      peer.role = role;
      peer.connection.emit({
        kind: 'noteAccess',
        roomId: peer.roomId,
        access: role,
      });
      if (peer.awareness !== null)
        peer.awareness = canonicalAwareness(peer, peer.awareness);
    }
    return current;
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

  function apply(room: Room, update: Uint8Array): boolean {
    const next = applyDocumentUpdate(room.document, update);
    if (!next.ok) return false;
    const delta = next.value.document.byteLength - room.document.byteLength;
    if (memory + delta > liveBounds.roomMemory) return false;
    if (rooms.get(room.key) !== room) return false;
    room.document = next.value.document;
    memory += delta;
    return true;
  }

  async function join(
    connection: LiveConnection,
    note: LiveNote,
  ): Promise<void> {
    const known = peers.get(connection);
    const existing = known?.get(note.roomId);
    if (existing !== undefined) {
      const current = await currentPeer(existing);
      if (
        current !== null &&
        note.clientId === existing.clientId &&
        roomKey(note) === existing.room.key
      ) {
        existing.sequence = 0;
        connection.emit({
          kind: 'noteJoined',
          roomId: existing.roomId,
          epoch: existing.epoch,
          role: existing.role,
        });
      }
      return;
    }
    if ((known?.size ?? 0) >= liveBounds.roomsPerConnection)
      return stop(connection, note.roomId, 'capacity');
    const current = await read(connection, note);
    if (current === null) return stop(connection, note.roomId, 'forbidden');
    if (rooms.size >= liveBounds.roomsPerProcess && !rooms.has(roomKey(note)))
      return stop(connection, note.roomId, 'capacity');
    if (!(await read(connection, note, true)))
      return stop(connection, note.roomId, 'client_id_conflict');
    let room = rooms.get(roomKey(note));
    if (room === undefined) {
      if (memory + current.bytes.byteLength > liveBounds.roomMemory)
        return stop(connection, note.roomId, 'capacity');
      room = {
        key: roomKey(note),
        members: new Set(),
        document: current.bytes,
        accepted: current.bytes,
        work: Promise.resolve(),
      };
      rooms.set(room.key, room);
      memory += room.document.byteLength;
    }
    const target = room;
    await serial(target, async () => {
      if (rooms.get(target.key) !== target)
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
        const current = await currentPeer(peer);
        if (current === null) return;
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
            if (target !== peer && (await currentPeer(target)))
              writeAwareness(target, entry);
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
        if (Buffer.compare(current.bytes, peer.room.accepted) !== 0) {
          const delta = encodeDocumentDelta(
            current.bytes,
            documentStateVector(peer.room.document),
          );
          if (!apply(peer.room, delta)) {
            stop(connection, roomId, 'unavailable');
            removePeer(peer);
            return;
          }
          peer.room.accepted = current.bytes;
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
        if (peer.role === 'viewer') return;
        try {
          const { clientIds } = updateActors(decoded.bytes);
          if (clientIds.some((id) => id !== peer.clientId))
            throw new Error('Unexpected client ID.');
          if (!apply(peer.room, decoded.bytes))
            throw new Error('Invalid live update.');
        } catch {
          stop(connection, roomId, 'invalid_update');
          removePeer(peer);
          return;
        }
        for (const target of peer.room.members)
          if (target !== peer && (await currentPeer(target)))
            sendSync(target, 'update', decoded.bytes);
      });
    },
    remove(connection) {
      watches.delete(connection);
      for (const peer of [...(peers.get(connection)?.values() ?? [])])
        removePeer(peer);
    },
    async recheck(connection) {
      for (const peer of [...(peers.get(connection)?.values() ?? [])])
        await currentPeer(peer);
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
