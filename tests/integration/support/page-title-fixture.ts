/** Synthetic read boundaries for actual page title owners. No service writes. */
import type { HistoryRevisionItem } from '@notesapp/api-client';
export * from './auth-entry-fixture.ts';
export let currentPath: string | null = null;
export function setPath(path: string | null) {
  currentPath = path;
}
export function useFiles() {
  return {
    notes: currentPath === null ? [] : [{ fileId: 'note', path: currentPath }],
    folders: [],
    emptyFolders: [],
  };
}
export function useRequestSync() {
  return () => {};
}
export function MoveItemsDialog() {
  return null;
}
export function PublishDialog() {
  return null;
}
type Reply = {
  data?: {
    path: string;
    kind: string;
    headRevisionId: string | null;
    head: { text: string; deleted?: boolean } | null;
  };
  error?: unknown;
  response?: { status: number };
};
export const reads: string[] = [];
export const pending = new Map<
  string,
  ReturnType<typeof Promise.withResolvers<Reply>>
>();
export function hold(id: string) {
  const read = Promise.withResolvers<Reply>();
  pending.set(id, read);
  return read;
}
export function ready(path: string): Reply {
  return {
    data: {
      path,
      kind: 'note',
      headRevisionId: null,
      head: { text: 'Synthetic saved text' },
    },
  };
}
export async function getFile({
  path,
}: {
  path: { fileId: string };
}): Promise<Reply> {
  reads.push(path.fileId);
  return (
    pending.get(path.fileId)?.promise ?? {
      error: {},
      response: { status: 404 },
    }
  );
}
export async function listDeletedFiles() {
  if (trashHold !== null) await trashHold.promise;
  if (trashFailure) return { error: {} };
  return {
    data: {
      files: deleted.map((file) => ({
        ...file,
        headRevisionId: 'synthetic-head',
        createdAt: '2026-01-01T00:00:00Z',
        deletedAt: '2026-01-02T00:00:00Z',
      })),
      nextCursor: null,
    },
  };
}
export async function listHistory() {
  return { data: { revisions: historyRows, nextCursor: null } };
}
export function useSyncState() {
  return null;
}
export function useSpellCheck() {
  return false;
}
export function useTheme() {
  return {};
}
import { getSetupStatus as setup } from './auth-entry-fixture.ts';
export let failSetup = false;
export function setSetupFailure(value: boolean) {
  failSetup = value;
}
export async function getSetupStatus() {
  return failSetup ? { error: {} } : setup();
}
let deleted: { fileId: string; kind: string; path: string }[] = [];
export function setDeleted(files: typeof deleted) {
  deleted = files;
}

/** Any write from a title test is an error, including auth writes. */
export const writes: string[] = [];
function refuseWrite(): never {
  writes.push('Unexpected generated write');
  throw Error('Unexpected generated write in title fixture');
}
export const signInWithPassword = refuseWrite;
export const createOwner = refuseWrite;
export const signUpWithPassword = refuseWrite;

/** Hold only the NoteView lazy module boundary, not its loader implementation. */
export const loaderGate = Promise.withResolvers<void>();

let trashHold: ReturnType<typeof Promise.withResolvers<void>> | null = null;
let trashFailure = false;
export function setTrashFailure(value: boolean) {
  trashFailure = value;
}
export function holdTrash() {
  trashHold = Promise.withResolvers<void>();
  return trashHold;
}
export function clearTrashHold() {
  trashHold = null;
}

let historyRows: HistoryRevisionItem[] = [];
export function showHistoryRows(value: boolean) {
  historyRows = value
    ? [
        {
          revisionId: 'version',
          fileId: 'preview-note',
          path: 'History.md',
          deleted: false,
          parents: [],
          digest: 'synthetic',
          size: 1,
          actorAccountId: 'account',
          clientTime: '2026-01-02T00:00:00Z',
          serverTime: '2026-01-02T00:00:00Z',
          message: null,
          isCheckpoint: true,
          checkpointName: null,
          restoredFrom: null,
          text: null,
          objectId: null,
          merged: false,
        },
      ]
    : [];
}
export const versionRead = Promise.withResolvers<{ data: { text: string } }>();
export async function getRevision() {
  return versionRead.promise;
}
