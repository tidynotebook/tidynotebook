import { lazy, Suspense, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useWorkspace } from '../app.tsx';
import { useWorkspaceRoleChange } from './workspace-role-change.ts';

const Toasts = lazy(async () => ({
  default: (await import('./workspace-toasts-view.tsx')).WorkspaceToastsView,
}));

export function WorkspaceToasts({
  workspaceId,
}: {
  readonly workspaceId: string;
}): ReactNode {
  const { recoveryNotice } = useWorkspace();
  const state: unknown = useLocation().state;
  const joined =
    state !== null && typeof state === 'object' && 'joinedWorkspace' in state;
  const changed = useWorkspaceRoleChange(workspaceId);
  if (!joined && !changed && recoveryNotice == null) return null;
  return (
    <Suspense>
      <Toasts workspaceId={workspaceId} roleChanged={changed} />
    </Suspense>
  );
}
