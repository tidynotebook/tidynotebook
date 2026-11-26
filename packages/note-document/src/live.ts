import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import {
  messageYjsSyncStep1,
  messageYjsSyncStep2,
  messageYjsUpdate,
  writeUpdate,
} from 'y-protocols/sync';
import * as Y from 'yjs';

export type NoteSync = {
  readonly kind: 'vector' | 'state' | 'update';
  readonly bytes: Uint8Array;
};

export function decodeNoteSync(payload: Uint8Array): NoteSync | null {
  try {
    const decoder = decoding.createDecoder(payload);
    const type = decoding.readVarUint(decoder);
    const kind =
      type === messageYjsSyncStep1
        ? 'vector'
        : type === messageYjsSyncStep2
          ? 'state'
          : type === messageYjsUpdate
            ? 'update'
            : null;
    const bytes = decoding.readVarUint8Array(decoder);
    return kind === null || decoding.hasContent(decoder)
      ? null
      : { kind, bytes };
  } catch {
    return null;
  }
}

export function encodeNoteSync(message: NoteSync): Uint8Array {
  const encoder = encoding.createEncoder();
  if (message.kind === 'update') writeUpdate(encoder, message.bytes);
  else {
    encoding.writeVarUint(
      encoder,
      message.kind === 'vector' ? messageYjsSyncStep1 : messageYjsSyncStep2,
    );
    encoding.writeVarUint8Array(encoder, message.bytes);
  }
  return encoding.toUint8Array(encoder);
}

export function updateActors(
  update: Uint8Array,
  knownVector?: Uint8Array,
  previousObserved?: Uint8Array,
): {
  readonly clientIds: readonly number[];
  readonly deletes: boolean;
} {
  const known =
    knownVector === undefined ? null : Y.decodeStateVector(knownVector);
  const decoded = Y.decodeUpdate(update);
  const previous =
    previousObserved === undefined
      ? null
      : Y.decodeSnapshot(previousObserved).ds.clients;
  const deletes = [...decoded.ds.clients].some(([client, ranges]) => {
    const seen = previous?.get(client) ?? [];
    return ranges.some((range) => {
      let next = range.clock;
      const end = next + range.len;
      for (const prior of seen) {
        if (prior.clock > next) return true;
        next = Math.max(next, prior.clock + prior.len);
        if (next >= end) return false;
      }
      return next < end;
    });
  });
  return {
    clientIds: [
      ...new Set(
        decoded.structs
          .filter(
            (item) =>
              item.id.clock + item.length > (known?.get(item.id.client) ?? 0),
          )
          .map((item) => item.id.client),
      ),
    ],
    deletes,
  };
}

export type AwarenessEntry = {
  readonly clientId: number;
  readonly clock: number;
  readonly state: unknown;
};

export function decodeNoteAwareness(
  payload: Uint8Array,
  maxEntries: number,
): AwarenessEntry[] | null {
  try {
    const decoder = decoding.createDecoder(payload);
    const count = decoding.readVarUint(decoder);
    if (count > maxEntries) return null;
    const entries: AwarenessEntry[] = [];
    for (let i = 0; i < count; i += 1) {
      const clientId = decoding.readVarUint(decoder);
      const clock = decoding.readVarUint(decoder);
      const state: unknown = JSON.parse(decoding.readVarString(decoder));
      if (clientId > 4294967295 || !Number.isSafeInteger(clock)) return null;
      entries.push({ clientId, clock, state });
    }
    return decoding.hasContent(decoder) ? null : entries;
  } catch {
    return null;
  }
}

export function encodeNoteAwareness(
  entries: readonly AwarenessEntry[],
): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, entries.length);
  for (const entry of entries) {
    encoding.writeVarUint(encoder, entry.clientId);
    encoding.writeVarUint(encoder, entry.clock);
    encoding.writeVarString(encoder, JSON.stringify(entry.state));
  }
  return encoding.toUint8Array(encoder);
}
