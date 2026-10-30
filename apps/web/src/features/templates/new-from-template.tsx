import { useState, type ReactNode } from 'react';
import { Button, TemplateIcon, deferredDialog } from '@notesapp/ui';
export const NewFromTemplateDialog = deferredDialog(
  async () => ({
    default: (await import('./new-from-template-dialog.tsx'))
      .NewFromTemplateDialog,
  }),
  'New note from template',
  'template',
);
/** Preview and choose a template before making a note in the stated folder. */
export function NewFromTemplate({
  workspaceId,
  folder,
}: {
  readonly workspaceId: string;
  readonly folder: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        icon={<TemplateIcon />}
        onPointerEnter={() => {
          void NewFromTemplateDialog.preload();
        }}
        onFocus={() => {
          void NewFromTemplateDialog.preload();
        }}
        onClick={() => setOpen(true)}
      >
        Use template
      </Button>
      <NewFromTemplateDialog
        workspaceId={workspaceId}
        folder={folder}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export type { Chosen } from './new-from-template-dialog.tsx';
