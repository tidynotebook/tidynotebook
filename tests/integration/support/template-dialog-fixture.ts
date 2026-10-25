import type { LocalCachedNote, LocalStore } from '@notesapp/sync';

export const templateId = 'template-note';
export const reads: {
  workspaceId: string;
  fileId: string;
  finish: (note: LocalCachedNote | null) => void;
}[] = [];
export const creations: { folder: string; text: string | undefined }[] = [];
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
    loading: false,
    limitNotice: null,
  };
}
export function useTemplates() {
  return { settings: { status: 'ready', settings: { folder: 'Templates' } } };
}
function create(folder: string, text?: string): void {
  creations.push({ folder, text });
}
export function useCreateNote() {
  return { create, error: null };
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
