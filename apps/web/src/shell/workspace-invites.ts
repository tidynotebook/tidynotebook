import {
  acceptWorkspaceInvite,
  declineWorkspaceInvite,
  type PendingWorkspaceInvite,
  type WorkspaceInviteRole,
} from '@notesapp/api-client';
import type { ReactNode } from 'react';
import type { MenuItem } from '@notesapp/ui';

import { problemMessage } from '../app.tsx';

export function workspaceInviteItems(
  invites: readonly PendingWorkspaceInvite[],
  roleName: (role: string) => string,
  answer: (invite: PendingWorkspaceInvite, accept: boolean) => void,
  icons: { mail: ReactNode; accept: ReactNode; decline: ReactNode },
): MenuItem[] {
  return invites.map((invite) => ({
    id: invite.invitationId,
    label: invite.workspaceName,
    icon: icons.mail,
    hint: roleName(invite.role),
    group: 'Invites',
    submenu: [
      {
        id: 'accept-invite',
        label: 'Accept invite',
        icon: icons.accept,
        disabled: invite.acceptanceMessage !== null,
        detail: invite.acceptanceMessage ?? undefined,
        onSelect: () => answer(invite, true),
      },
      {
        id: 'decline-invite',
        label: 'Decline invite',
        icon: icons.decline,
        danger: true,
        onSelect: () => answer(invite, false),
      },
    ],
  }));
}

export async function answerWorkspaceInvite(
  invite: PendingWorkspaceInvite,
  accept: boolean,
  reportProblem: (message: string) => void,
) {
  try {
    const { data, error } = await (
      accept ? acceptWorkspaceInvite : declineWorkspaceInvite
    )({
      path: { invitationId: invite.invitationId },
    });
    if (data === undefined) {
      reportProblem(error?.title ?? problemMessage(error));
      return undefined;
    }
    return 'workspaceId' in data
      ? { workspace: data, state: joinedWorkspaceState(invite) }
      : null;
  } catch {
    reportProblem(problemMessage(undefined));
    return undefined;
  }
}

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
