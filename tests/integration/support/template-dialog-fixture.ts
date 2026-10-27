import type { LocalCachedNote, LocalStore } from '@notesapp/sync';

export const templateId = 'template-note';
export const reads: {
  workspaceId: string;
  fileId: string;
  finish: (note: LocalCachedNote | null) => void;
}[] = [];
export const creations: { folder: string; text: string | undefined }[] = [];
let creationError: string | null = null;
export function setCreationError(message: string | null): void {
  creationError = message;
}
const store: Pick<LocalStore, 'readCachedNote'> = {
  readCachedNote: (_accountId, workspaceId, fileId) =>
    new Promise((finish) => reads.push({ workspaceId, fileId, finish })),
};

// Replace only the dialog's context boundaries. Its effects, template rules,
// note reader, shared dialog and buttons remain the built application code.
export function useLocalStore() {
  return { store };
}
export function useSession() {
  return { account: { accountId: 'template-test-account' } };
}
export function useFiles() {
  return {
    notes: [{ fileId: templateId, path: 'Templates/Meeting.md' }],
    emptyFolders: [],
    loading: false,
    limitNotice: null,
  };
}
export function useTemplates() {
  return { settings: { status: 'ready', settings: { folder: 'Templates' } } };
}
export function useCreateNote(
  _store: unknown,
  _accountId: string | null,
  _workspaceId: string,
  onError?: (message: string | null) => void,
  onCreationStart?: () => (message: string | null) => boolean | void,
) {
  return {
    create: (folder: string, text?: string): void => {
      creations.push({ folder, text });
      const completed = onCreationStart?.() ?? onError;
      completed?.(creationError);
    },
    error: creationError,
  };
}

export function templateNote(text: string): LocalCachedNote {
  return {
    fileId: templateId,
    path: 'Templates/Meeting.md',
    text,
    deleted: false,
    sequence: 0,
    baseRevisionId: null,
    stale: false,
    acceptedText: null,
    acceptedPath: null,
    acceptedRevisionId: null,
    document: null,
  };
}
