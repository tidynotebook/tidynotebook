import { deferredDialog } from '@notesapp/ui';
export const NewFolderDialog = deferredDialog(
  async () => ({
    default: (await import('./folder-dialogs.tsx')).NewFolderDialog,
  }),
  'New folder',
);
export const MoveItemsDialog = deferredDialog(
  async () => ({
    default: (await import('./folder-dialogs.tsx')).MoveItemsDialog,
  }),
  'Move to folder',
);
