/** Context boundaries for the real folder dialog, Shell creation hook and tree. */
import { createContext, useContext } from 'react';
import type { LocalStore } from '@notesapp/sync';
import type { CreateFolderReveal } from '../../../apps/web/dist/features/folders/created-folder-reveal.js';
import type { FilesValue } from '../../../apps/web/dist/shell/files.js';
import type {
  CreatedFolderReveal,
  CreatedFolderRevealOwner,
} from '../../../apps/web/dist/shell/tree.js';
export * from '../../../apps/web/dist/app.js';
export * from '../../../apps/web/dist/shell/files.js';
export * from '@notesapp/api-client';

// The test loader exposes private existing bindings without changing their bodies.
declare module '../../../apps/web/dist/shell/shell.js' {
  export function useFolderCreation(
    owner: CreatedFolderRevealOwner,
    add: (path: string) => void,
    open: (path: string) => void,
    select: (path: string) => void,
  ): {
    readonly request: CreatedFolderReveal | null;
    readonly onCreated: (
      path: string,
      createReveal: CreateFolderReveal,
    ) => void;
    readonly isCurrent: (request: CreatedFolderReveal) => boolean;
    readonly finish: (request: CreatedFolderReveal) => void;
    readonly cancel: (event?: Event) => void;
  };
}
declare module '../../../apps/web/dist/shell/files.js' {
  export function useEmptyFolders(
    workspaceId: string,
    paths: readonly string[],
  ): {
    readonly emptyFolders: readonly string[];
    readonly addEmptyFolder: (path: string) => void;
    readonly moveEmptyFolders: (from: string, to: string) => void;
    readonly removeEmptyFolders: (path: string) => void;
  };
}

export const Files = createContext<FilesValue | null>(null);
export let accountId: string | null = 'folder-account';
let store: LocalStore | null = null;
export const refused: string[] = [];
export function setAccount(next: string | null): void {
  accountId = next;
}
export function setStore(next: LocalStore | null): void {
  store = next;
}
export function useFiles(): FilesValue {
  const value = useContext(Files);
  if (value === null)
    throw Error('The folder fixture requires its file context.');
  return value;
}
export function useSession() {
  return { account: accountId === null ? null : { accountId } };
}
export function useLocalStore() {
  return { store };
}
export function useRequestSync() {
  return () => {
    refused.push('Unexpected sync request');
  };
}
export async function getFile(): Promise<never> {
  refused.push('Unexpected server note read');
  throw Error('Only cached synthetic notes may open.');
}
export async function listDeletedFiles(): Promise<never> {
  refused.push('Unexpected deleted-note read');
  throw Error('No server read is allowed.');
}
