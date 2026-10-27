import { createElement } from 'react';

let directNote = false;
export function setDirectNote(value: boolean): void {
  directNote = value;
}

/** Context boundaries for the real folder page layout. */
export function useFiles() {
  return {
    notes: [
      {
        fileId: 'nested-note',
        path: 'Projects/Archive/Note.md',
        updatedAt: '2026-10-27T00:00:00.000Z',
      },
      ...(directNote
        ? [
            {
              fileId: 'direct-note',
              path: 'Projects/Direct.md',
              updatedAt: '2026-10-27T00:00:00.000Z',
            },
          ]
        : []),
    ],
    emptyFolders: [],
    loading: false,
    limitNotice: null,
  };
}
export function useSession() {
  return { account: { accountId: 'folder-test-account' } };
}
export function useLocalStore() {
  return { store: {} };
}
export function useCreateNote() {
  return { create: () => {}, error: null };
}
export function useNow() {
  return 0;
}
export function useDocumentTitle() {}
export function WritingStart() {
  return null;
}
export function NewFromTemplate() {
  return createElement('button', null, 'Use template');
}
export function FolderPageActions() {
  return createElement('button', null, 'Folder actions');
}
