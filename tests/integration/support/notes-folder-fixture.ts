import { createElement } from 'react';

/** Context boundaries for the real folder page layout. */
export function useFiles() {
  return {
    notes: [{ fileId: 'nested-note', path: 'Projects/Archive/Note.md' }],
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
