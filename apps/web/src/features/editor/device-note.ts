/**
 * The read that opens one note from this device, and the one open read of
 * each note that a navigation waits for.
 *
 * The snapshot and the feed keep the text and the document of every note on
 * this device, so a note that a person opens is almost always here already.
 * The note screen suspends on this read while the router holds the screen a
 * person left, so the next note replaces the last one in one commit and no
 * placeholder shows between them. A read that lasts longer than the hold
 * answers `slow`, and the screen then shows the placeholder, so a click never
 * waits without an answer.
 *
 * React asks for the read again on each render until it settles, so the read
 * of one note must be the same promise each time. `createDeviceOpens` keeps
 * that promise outside the screen, because a screen that has not committed
 * keeps no state of its own. A kept read is only as new as the store: any
 * change of its note drops it, so no open mounts the editor on an answer that
 * a later write replaced (record 0085).
 */
import type { LocalCachedNote, LocalChange, LocalStore } from '@notesapp/sync';
import {
  opensFromDevice,
  type DeviceOpen,
  type NoteLoadIdentity,
  type NoteLoadStatus,
} from '../../lib/note-load-state.ts';

/** The reads of the local store that open one note. */
export type DeviceNoteStore = Pick<
  LocalStore,
  'readCachedNote' | 'readFileSaveSnapshot'
>;

/**
 * Reads one note from this device, or `null` when the server must answer.
 *
 * A note that this device does not hold, or holds without the document that
 * the server made for it, opens from the server read. A failed local read
 * answers `null` too, because the server read can still show the note.
 */
export async function readDeviceNote(
  store: DeviceNoteStore,
  identity: NoteLoadIdentity,
): Promise<NoteLoadStatus | null> {
  const { accountId, workspaceId, fileId } = identity;
  try {
    const cached = await store.readCachedNote(accountId, workspaceId, fileId);
    if (cached === null) return null;
    if (cached.deleted) return { kind: 'deleted', path: cached.path };
    // The editor binds to the document of the note, and the cached read
    // gives it with the text from one moment (records 0081, 0133). A
    // document read apart from the text could hold work that arrived between
    // the two reads, and the open would write that difference as new work
    // of this device.
    const document = cached.document;
    const held = await store.readFileSaveSnapshot(
      accountId,
      workspaceId,
      fileId,
    );
    if (!opensFromDevice(document?.bytes ?? null, held.acceptedHeadRevisionId))
      return null;
    return {
      kind: 'ready',
      path: cached.path,
      text: cached.text,
      headRevisionId: cached.baseRevisionId,
      workingCopyId: cached.workingCopyId,
      sequence: cached.sequence,
      ...(cached.stale &&
      cached.workingCopyId !== undefined &&
      cached.acceptedText !== null
        ? {
            recovery: {
              workingCopyId: cached.workingCopyId,
              acceptedText: cached.acceptedText,
            },
          }
        : {}),
      document,
    };
  } catch {
    // A server read can still show content. A later local write failure
    // keeps the in-memory buffer visible and closes unsafe reload.
    return null;
  }
}

/** What the open reads need of a store: its announcements of change. */
export type WatchedStore = Pick<LocalStore, 'subscribe'>;

/** Whether one change of the store can change what a note reads as. */
function touchesNote(change: LocalChange, identity: NoteLoadIdentity): boolean {
  return (
    change.accountId === identity.accountId &&
    change.workspaceId === identity.workspaceId &&
    (change.fileId === null || change.fileId === identity.fileId)
  );
}

/** The open read of one note. */
export type DeviceOpenRead = {
  /** The answer of the device, whenever it comes. */
  readonly read: Promise<NoteLoadStatus | null>;
  /** The answer of the device, or `slow` once the hold is spent. */
  readonly held: Promise<DeviceOpen>;
};

/** The open reads of every note that a navigation waits for. */
export type DeviceOpens<Store extends WatchedStore> = {
  /** The one open read of a note, which starts on the first ask. */
  open(store: Store, identity: NoteLoadIdentity): DeviceOpenRead;
  /** The open read of a note that started, or `null` when none did. */
  peek(store: Store, identity: NoteLoadIdentity): DeviceOpenRead | null;
  /**
   * Forgets every open read of one store.
   *
   * The screen calls this once it holds the state of a note, so a later open
   * of any note reads the device again and never an answer that is old.
   */
  forget(store: Store): void;
};

/** The key of one note in one account and one workspace. */
function keyOf(identity: NoteLoadIdentity): string {
  return JSON.stringify([
    identity.accountId,
    identity.workspaceId,
    identity.fileId,
  ]);
}

/** One kept read, and the end of its watch over the store. */
type Kept = { readonly opened: DeviceOpenRead; readonly stop: () => void };

/**
 * Keeps the one open read of each note until the screen holds it, or until
 * the store changes that note.
 *
 * The watch starts before the read, so a write that lands while the read runs
 * drops it too. A render that still waits on a dropped read asks again when it
 * settles, and that ask reads the device afresh. `wait` ends the hold. The
 * screen passes a timer, and a test passes a promise that it settles itself,
 * so no test waits on a clock.
 */
export function createDeviceOpens<Store extends WatchedStore>(
  readDevice: (
    store: Store,
    identity: NoteLoadIdentity,
  ) => Promise<NoteLoadStatus | null>,
  wait: () => Promise<void>,
): DeviceOpens<Store> {
  const reads = new WeakMap<Store, Map<string, Kept>>();
  return {
    open(store, identity): DeviceOpenRead {
      const key = keyOf(identity);
      const ofStore = reads.get(store) ?? new Map<string, Kept>();
      reads.set(store, ofStore);
      const existing = ofStore.get(key);
      if (existing !== undefined) return existing.opened;
      // The store announces a change after its write commits, never inside
      // this call, so the watch can name the read that it drops.
      const unsubscribe = store.subscribe((change) => {
        if (!touchesNote(change, identity)) return;
        unsubscribe();
        if (ofStore.get(key) === kept) ofStore.delete(key);
      });
      const read = readDevice(store, identity);
      const answered: Promise<DeviceOpen> = read.then((status) =>
        status === null ? 'server' : status,
      );
      const spent: Promise<DeviceOpen> = wait().then(() => 'slow');
      const kept: Kept = {
        opened: { read, held: Promise.race([answered, spent]) },
        stop: unsubscribe,
      };
      ofStore.set(key, kept);
      return kept.opened;
    },
    peek(store, identity): DeviceOpenRead | null {
      return reads.get(store)?.get(keyOf(identity))?.opened ?? null;
    },
    forget(store): void {
      for (const kept of reads.get(store)?.values() ?? []) kept.stop();
      reads.delete(store);
    },
  };
}

/**
 * Watches the cached note and also reads it after subscribing. This closes
 * the gap between the loader read and the arrival of a restore. Only the
 * newest read can update the screen.
 */
export function watchDeviceNote(
  store: Pick<LocalStore, 'subscribe' | 'readCachedNote'>,
  identity: NoteLoadIdentity,
  onRead: (note: Awaited<ReturnType<LocalStore['readCachedNote']>>) => void,
  onPurge: () => void,
): () => void {
  let sequence = 0;
  let stopped = false;
  const recheck = async (): Promise<void> => {
    const current = ++sequence;
    let note: LocalCachedNote | null = null;
    try {
      note = await store.readCachedNote(
        identity.accountId,
        identity.workspaceId,
        identity.fileId,
      );
    } catch {
      // A deleted note can retry through the loader when this read fails.
      // A ready editor keeps its buffer when no cached answer is available.
    }
    if (!stopped && current === sequence) onRead(note);
  };
  const unsubscribe = store.subscribe((change) => {
    if (!touchesNote(change, identity)) return;
    if (change.kind === 'purge') {
      sequence += 1;
      onPurge();
    } else if (change.kind === 'file') void recheck();
  });
  void recheck();
  return () => {
    stopped = true;
    unsubscribe();
  };
}
