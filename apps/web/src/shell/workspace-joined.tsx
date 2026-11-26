import { lazy, Suspense, type ReactNode } from 'react';
import { useLocation } from 'react-router';

const WorkspaceJoinedToastView = lazy(async () => ({
  default: (await import('./workspace-joined-toast.tsx'))
    .WorkspaceJoinedToastView,
}));

export function WorkspaceJoinedToast(): ReactNode {
  const location = useLocation();
  const state: unknown = location.state;
  const value =
    state != null && typeof state === 'object' && 'joinedWorkspace' in state
      ? state.joinedWorkspace
      : null;
  if (
    value === null ||
    typeof value !== 'object' ||
    !('message' in value) ||
    typeof value.message !== 'string' ||
    !('id' in value) ||
    typeof value.id !== 'string'
  )
    return null;
  return (
    <Suspense>
      <WorkspaceJoinedToastView
        key={location.key}
        message={value.message}
        id={value.id}
      />
    </Suspense>
  );
}
