import { lazy, Suspense, type ReactNode } from 'react';
import { useWorkspace } from '../app.tsx';

const RecoveryToastView = lazy(async () => ({
  default: (await import('./workspace-recovery-toast-view.tsx'))
    .RecoveryToastView,
}));

export function WorkspaceRecoveryToast(): ReactNode {
  const { recoveryNotice, dismissRecoveryNotice } = useWorkspace();
  if (recoveryNotice == null || dismissRecoveryNotice === undefined)
    return null;
  return (
    <Suspense>
      <RecoveryToastView
        notice={recoveryNotice}
        dismiss={dismissRecoveryNotice}
      />
    </Suspense>
  );
}
