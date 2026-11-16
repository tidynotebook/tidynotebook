/** Controlled account and generated operations for the real Restore screen. */
import type { LocalStore } from '@notesapp/sync';
export * from '@notesapp/api-client';
export * from '../../../apps/web/dist/app.js';

export const accountId = 'restore-focus-account';
export const workspaceId = 'restore-focus-workspace';
export let fileId = '';
export let path = '';
let activeStore: LocalStore | null = null;
let deleted = true;
export const syncs: string[] = [];
export const unexpected: string[] = [];
type RestoreReply = {
  readonly data?: { readonly revision: { readonly path: string } };
  readonly error?: unknown;
  readonly response?: { readonly status: number };
};
export const restores: {
  readonly workspaceId: string;
  readonly fileId: string;
  readonly deviceId: string;
  readonly reply: ReturnType<typeof Promise.withResolvers<RestoreReply>>;
}[] = [];

/** Each case owns an isolated in-memory local store and one synthetic note. */
export function reset(store: LocalStore, noteId: string, notePath: string) {
  activeStore = store;
  fileId = noteId;
  path = notePath;
  deleted = true;
  syncs.length = 0;
  restores.length = 0;
}

export function useSession() {
  return { account: { accountId } };
}
export function useLocalStore() {
  return { store: activeStore };
}
export function useRequestSync() {
  return () => syncs.push('Requested existing sync');
}
export async function listDeletedFiles() {
  return {
    data: {
      files: deleted
        ? [
            {
              fileId,
              path,
              kind: 'note',
              headRevisionId: 'deleted-head',
              createdAt: '2026-01-01T00:00:00Z',
              deletedAt: '2026-01-02T00:00:00Z',
            },
          ]
        : [],
      nextCursor: null,
    },
  };
}

/** The real restoreNote handler awaits this generated-operation boundary. */
export async function restoreFile(options: {
  readonly path: { readonly workspaceId: string; readonly fileId: string };
  readonly body: { readonly deviceId: string };
}) {
  const reply = Promise.withResolvers<RestoreReply>();
  restores.push({ ...options.path, deviceId: options.body.deviceId, reply });
  const result = await reply.promise;
  if (result.data !== undefined) deleted = false;
  return result;
}

/** A cached note must open from the real local store without a service read. */
export async function getFile(): Promise<never> {
  unexpected.push('Unexpected server note read');
  throw Error('The focus fixture note must open from its local store.');
}
export async function purgeFiles(): Promise<never> {
  unexpected.push('Unexpected purge');
  throw Error('No permanent deletion is allowed in the focus fixture.');
}
