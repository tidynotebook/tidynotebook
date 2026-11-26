import {
  inviteRole,
  workspaceMemberPageSize,
  workspaceRoles,
  type CollaborationTransaction,
  type Role,
  type WorkspaceInvite,
  type WorkspaceMember,
} from '@notesapp/core';
import type pg from 'pg';

type InviteRow = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  email: string;
  role: string;
  inviter_name: string | null;
  expires_at: Date;
};

type MemberRow = {
  account_id: string;
  display_name: string | null;
  email: string;
  role: string;
  member_count: string;
};

function storedRole(text: string): Role {
  const role = workspaceRoles.find((value) => value === text);
  if (role === undefined)
    throw new Error('The workspace contains an invalid role.');
  return role;
}

function inviteOf(row: InviteRow): WorkspaceInvite {
  const role = inviteRole(row.role);
  if (role === null)
    throw new Error('The invitation contains an invalid role.');
  return {
    invitationId: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    email: row.email,
    role,
    inviterName: row.inviter_name,
    expiresAt: row.expires_at.toISOString(),
  };
}

function memberOf(row: MemberRow): WorkspaceMember {
  return {
    accountId: row.account_id,
    displayName: row.display_name,
    email: row.email,
    role: storedRole(row.role),
  };
}

export function collaborationTransaction(
  client: pg.PoolClient,
  workspaceId: string | null,
): CollaborationTransaction {
  return {
    async role() {
      const { rows } = await client.query<{ role: string | null }>(
        'select notesapp_member_role($1) as role',
        [workspaceId],
      );
      const role = rows[0]?.role;
      return role == null ? null : storedRole(role);
    },
    async liveNote(fileId) {
      const { rows } = await client.query<{
        document: Buffer;
        epoch: number;
        role: string;
        writable: boolean;
      }>(
        `select d.bytes as document, d.epoch, notesapp_member_role($1) as role,
          notesapp_workspace_writable($1) as writable
         from note_documents d join files f on f.workspace_id = d.workspace_id and f.id = d.file_id
         where d.workspace_id = $1 and d.file_id = $2 and not f.deleted`,
        [workspaceId, fileId],
      );
      const row = rows[0];
      return row === undefined
        ? null
        : {
            bytes: row.document,
            epoch: row.epoch,
            role: storedRole(row.role),
            writable: row.writable,
          };
    },
    async bindNoteClient(fileId, epoch, clientId) {
      const { rows } = await client.query<{ bound: boolean }>(
        'select notesapp_bind_note_client($1, $2, $3, $4) as bound',
        [workspaceId, fileId, epoch, clientId],
      );
      return rows[0]?.bound === true;
    },
    async members(after) {
      const { rows } = await client.query<MemberRow>(
        'select * from notesapp_workspace_member_page($1, $2)',
        [workspaceId, after],
      );
      const members = rows.slice(0, workspaceMemberPageSize).map(memberOf);
      return {
        members,
        memberCount: Number(rows[0]?.member_count ?? 1),
        nextAfterAccountId:
          rows.length > workspaceMemberPageSize
            ? (members.at(-1)?.accountId ?? null)
            : null,
      };
    },
    async member(accountId) {
      const { rows } = await client.query<MemberRow>(
        'select * from notesapp_workspace_member_page($1, null, $2)',
        [workspaceId, accountId],
      );
      return rows[0] === undefined ? null : memberOf(rows[0]);
    },
    async changeMember(accountId, role, leave) {
      const { rows } = await client.query<{ outcome: string }>(
        'select notesapp_change_workspace_member($1, $2, $3, $4) as outcome',
        [workspaceId, accountId, role, leave],
      );
      const outcome = rows[0]?.outcome;
      if (
        outcome === 'ok' ||
        outcome === 'last_workspace' ||
        outcome === 'forbidden' ||
        outcome === 'not_found'
      )
        return outcome;
      throw new Error('The member change returned no outcome.');
    },
    async invites(after) {
      const { rows } = await client.query<InviteRow>(
        'select * from notesapp_workspace_invite_list($1, $2)',
        [workspaceId, after],
      );
      return rows.map(inviteOf);
    },
    async inspectInvite(digest) {
      const { rows } = await client.query<InviteRow>(
        'select * from notesapp_workspace_invite_details($1)',
        [digest],
      );
      return rows[0] === undefined ? null : inviteOf(rows[0]);
    },
    async createInvite(invite) {
      const { rows } = await client.query<{
        outcome: string;
        invitation_id: string | null;
      }>(
        'select * from notesapp_create_workspace_invite($1, $2, $3, $4, $5, $6)',
        [
          workspaceId,
          invite.invitationId,
          invite.email,
          invite.role,
          invite.digest,
          invite.seal,
        ],
      );
      const row = rows[0];
      if (row?.outcome === 'already_member' || row?.outcome === 'pending_limit')
        return { outcome: row.outcome };
      if (
        (row?.outcome === 'created' || row?.outcome === 'pending_invite') &&
        row.invitation_id !== null
      )
        return { outcome: row.outcome, invitationId: row.invitation_id };
      throw new Error('The workspace invitation returned no outcome.');
    },
    async adminInvite(invitationId, revoke) {
      const { rows } = await client.query<{ result: string | null }>(
        'select notesapp_admin_workspace_invite($1, $2, $3) as result',
        [workspaceId, invitationId, revoke],
      );
      return rows[0]?.result ?? null;
    },
    async answerInvite(invitationId, accept) {
      const { rows } = await client.query<{
        workspace_id: string;
        name: string;
        personal: boolean;
        role: string;
      }>('select * from notesapp_answer_workspace_invite($1, $2)', [
        invitationId,
        accept,
      ]);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        workspaceId: row.workspace_id,
        name: row.name,
        personal: row.personal,
        role: storedRole(row.role),
      };
    },
  };
}
