import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button, Toast } from '@notesapp/ui';
import type { WorkspaceInviteRole } from '@notesapp/api-client';

export function joinedWorkspaceState(invite: {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly role: WorkspaceInviteRole;
}): {
  readonly joinedWorkspace: { readonly message: string; readonly id: string };
} {
  const role = {
    admin: 'an Admin',
    editor: 'an Editor',
    viewer: 'a Viewer',
  }[invite.role];
  return {
    joinedWorkspace: {
      message: `You joined ${invite.workspaceName} as ${role}.`,
      id: invite.workspaceId,
    },
  };
}

export function WorkspaceJoinedToast(): ReactNode {
  const { key, state } = useLocation();
  const navigate = useNavigate();
  const [closed, setClosed] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setClosed(key), 8000);
    return () => window.clearTimeout(timer);
  }, [key]);
  const value: unknown =
    state != null && typeof state === 'object' && 'joinedWorkspace' in state
      ? state.joinedWorkspace
      : null;
  if (
    closed === key ||
    value === null ||
    typeof value !== 'object' ||
    !('message' in value) ||
    typeof value.message !== 'string' ||
    !('id' in value) ||
    typeof value.id !== 'string'
  )
    return null;
  const id = value.id;
  return (
    <Toast message={value.message}>
      <Button
        variant="secondary"
        size="compact"
        onClick={() => {
          setClosed(key);
          void navigate(`/w/${id}`, { replace: true });
        }}
      >
        Open
      </Button>
    </Toast>
  );
}
