import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Toast } from '@notesapp/ui';
import type { Role } from '@notesapp/core';
import { useWorkspace } from '../app.tsx';

export function WorkspaceRoleToast({
  workspaceId,
}: {
  readonly workspaceId: string;
}): ReactNode {
  const { state } = useWorkspace();
  const role =
    state.status === 'ready'
      ? state.workspaces.find((space) => space.workspaceId === workspaceId)
          ?.role
      : undefined;
  const previous = useRef<{ workspaceId: string; role: Role } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (role === undefined) return;
    const before = previous.current;
    previous.current = { workspaceId, role };
    if (
      before?.workspaceId !== workspaceId ||
      before.role === 'viewer' ||
      role !== 'viewer'
    ) {
      setNotice(null);
      return;
    }
    setNotice(workspaceId);
    const timer = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [workspaceId, role]);
  return notice === workspaceId ? (
    <Toast message="Your role changed to Viewer. Editing is off." />
  ) : null;
}
