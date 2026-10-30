import { deferredDialog } from '@notesapp/ui';
export const PublishDialog = deferredDialog(
  async () => ({
    default: (await import('./publish-dialog.tsx')).PublishDialog,
  }),
  'Publish',
);
