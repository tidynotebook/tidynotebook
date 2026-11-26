import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button, Inline, Toast } from '@notesapp/ui';
import type { WorkspaceRecoveryNotice } from '../lib/workspace-recovery.ts';

export function RecoveryToastView({
  notice,
  dismiss,
}: {
  readonly notice: WorkspaceRecoveryNotice;
  readonly dismiss: () => void;
}): ReactNode {
  const navigate = useNavigate();
  const note = notice.note;
  return (
    <Toast message={notice.message}>
      <Inline gap={2}>
        {note === undefined ? null : (
          <Button
            size="compact"
            variant="secondary"
            onClick={() => {
              dismiss();
              void navigate(`/w/${note.workspaceId}/notes/${note.fileId}`);
            }}
          >
            Open
          </Button>
        )}
        <Button size="compact" variant="ghost" onClick={dismiss}>
          Dismiss
        </Button>
      </Inline>
    </Toast>
  );
}
