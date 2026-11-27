import type { ReactNode } from 'react';
import { Toast, ToastStack } from '@notesapp/ui';
import { WorkspaceJoinedToast } from './workspace-joined.tsx';
import { WorkspaceRecoveryToast } from './workspace-recovery-toast.tsx';

export function WorkspaceToastsView({
  workspaceId,
  roleChanged,
}: {
  readonly workspaceId: string;
  readonly roleChanged: boolean;
}): ReactNode {
  return (
    <ToastStack>
      <WorkspaceJoinedToast workspaceId={workspaceId} />
      {roleChanged ? (
        <Toast message="Your role changed to Viewer. Editing is off." />
      ) : null}
      <WorkspaceRecoveryToast />
    </ToastStack>
  );
}
