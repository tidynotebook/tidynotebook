import { createElement, useSyncExternalStore } from 'react';
import type { LocalStore } from '@notesapp/sync';
import type { NoteSummary } from '../../../apps/web/src/lib/note-list.ts';

const initialNote: NoteSummary = {
  fileId: 'folder-note',
  path: 'Projects/Note.md',
  createdAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T00:00:00.000Z',
  localOnly: false,
  unsent: false,
};
let state = {
  notes: [initialNote],
  emptyFolders: [],
  loading: false,
  limitNotice: null,
};
const listeners = new Set<() => void>();
let finished = Promise.withResolvers<void>();
export let started = Promise.withResolvers<void>();
export const effects: {
  sync: number;
  announced: number;
  removed: string[];
  moved: string[];
} = {
  sync: 0,
  announced: 0,
  removed: [],
  moved: [],
};
/** Publish a new note list to the subscribed pages. */
function change(notes: NoteSummary[]): void {
  state = { ...state, notes };
  for (const listener of listeners) listener();
}
const store: Pick<LocalStore, 'moveFiles' | 'trashFiles'> = {
  moveFiles: async (_account, _workspace, moves) => {
    change(
      state.notes.map((note) => ({
        ...note,
        path:
          moves.find((move) => move.fileId === note.fileId)?.toPath ??
          note.path,
      })),
    );
    started.resolve();
    await finished.promise;
    return [];
  },
  trashFiles: async (_account, _workspace, ids) => {
    change(state.notes.filter((note) => !ids.includes(note.fileId)));
    started.resolve();
    await finished.promise;
    return [];
  },
};
/** Reset the note list, pending operation and recorded effects for a test. */
export function resetFolderOperation(loading = false): void {
  state = {
    notes: loading ? [] : [initialNote],
    emptyFolders: [],
    loading,
    limitNotice: null,
  };
  finished = Promise.withResolvers<void>();
  started = Promise.withResolvers<void>();
  effects.sync = 0;
  effects.announced = 0;
  effects.removed = [];
  effects.moved = [];
}
/** Complete the delayed public file-list read without mounting another page. */
export function finishInitialFolderLoad(): void {
  state = { ...state, notes: [initialNote], loading: false };
  for (const listener of listeners) listener();
}
/** Let the pending move or Trash operation complete. */
export function finishFolderOperation(): void {
  finished.resolve();
}
/** Return the live test file list with the folder update helpers. */
export function useFiles() {
  const files = useSyncExternalStore(
    (changed) => {
      listeners.add(changed);
      return () => listeners.delete(changed);
    },
    () => state,
    () => state,
  );
  return {
    ...files,
    namesInUse: files.notes.map(({ fileId, path }) => ({ fileId, path })),
    addEmptyFolder: () => {},
    removeEmptyFolders: (path: string) => {
      effects.removed.push(path);
    },
    moveEmptyFolders: (from: string, to: string) => {
      effects.moved.push(`${from}:${to}`);
    },
  };
}
/** Return the delayed test store. */
export function useLocalStore() {
  return { store };
}
/** Return a signed-in test account. */
export function useSession() {
  return { account: { accountId: 'folder-account' } };
}
/** Count sync requests. */
export function useRequestSync() {
  return () => {
    effects.sync += 1;
  };
}
/** Count delete notices. */
export function useDeleteNotice() {
  return {
    announce: () => {
      effects.announced += 1;
    },
  };
}
/** Return a note creator that does nothing. */
export function useCreateNote() {
  return { create: () => {}, error: null };
}
/** Return a fixed time. */
export function useNow() {
  return Date.parse('2026-10-27T00:00:00.000Z');
}
/** Ignore document title changes. */
export function useDocumentTitle() {}
/** Render a placeholder Use template button. */
export function NewFromTemplate() {
  return createElement('button', null, 'Use template');
}
