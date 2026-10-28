import { createElement } from 'react';

let directNote = false;
/** Add or remove a note directly inside Projects for the next render. */
export function setDirectNote(value: boolean): void {
  directNote = value;
}

/** Context boundaries for the complete note list. */
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
/** Return a signed-in test account. */
export function useSession() {
  return { account: { accountId: 'folder-test-account' } };
}
/** Return an empty device store. */
export function useLocalStore() {
  return { store: {} };
}
/** Return a note creator that does nothing. */
export function useCreateNote() {
  return { create: () => {}, error: null };
}
/** Return a fixed time. */
export function useNow() {
  return 0;
}
/** Ignore document title changes. */
export function useDocumentTitle() {}
/** Render a placeholder Use template button. */
export function NewFromTemplate() {
  return createElement('button', null, 'Use template');
}
