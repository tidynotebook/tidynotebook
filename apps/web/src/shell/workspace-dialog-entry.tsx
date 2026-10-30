import { deferredDialog } from '@notesapp/ui';
export const NewWorkspaceDialog = deferredDialog(
  async () => ({
    default: (await import('./workspace-dialogs.tsx')).NewWorkspaceDialog,
  }),
  'New workspace',
);
export const RenameWorkspaceDialog = deferredDialog(
  async () => ({
    default: (await import('./workspace-dialogs.tsx')).RenameWorkspaceDialog,
  }),
  'Rename workspace',
);
export const DeleteWorkspaceDialog = deferredDialog(
  async () => ({
    default: (await import('./workspace-dialogs.tsx')).DeleteWorkspaceDialog,
  }),
  'Delete workspace',
);
