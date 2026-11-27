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
