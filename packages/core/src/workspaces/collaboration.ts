import { fail, type Result } from '../files/model.ts';
import {
  authorize,
  type Action,
  type Actor,
  type InviteRole,
  type Role,
} from '../identity/actor.ts';
import type { WorkspaceSummary } from './ports.ts';

export const workspaceInviteBatchSize = 20;
export const workspaceMemberPageSize = 100;

export function presenceColorSlot(accountId: string): number {
  let slot = 0;
  for (let index = 0; index < accountId.length; index += 1) {
    if (accountId[index] !== '-')
      slot = (slot * 31 + accountId.charCodeAt(index)) % 6;
  }
  return slot;
}

export function availablePresenceSlot(
  accountId: string,
  used: ReadonlySet<number>,
): number {
  const preferred = presenceColorSlot(accountId);
  for (let offset = 0; offset < 6; offset += 1) {
    const slot = (preferred + offset) % 6;
    if (!used.has(slot)) return slot;
  }
  return preferred;
}

export type WorkspaceMember = {
  readonly accountId: string;
  readonly displayName: string | null;
  readonly email: string;
  readonly role: Role;
};

export type WorkspaceInvite = {
  readonly invitationId: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly email: string;
  readonly role: InviteRole;
  readonly inviterName: string | null;
  readonly expiresAt: string;
};

export type NewWorkspaceInvite = {
  readonly invitationId: string;
  readonly email: string;
  readonly role: InviteRole;
  readonly digest: string;
  readonly seal: string;
};

export type WorkspaceInviteOutcome =
  | {
      readonly outcome: 'created' | 'pending_invite';
      readonly invitationId: string;
    }
  | { readonly outcome: 'already_member' | 'pending_limit' };

export type CollaborationTransaction = {
  role(): Promise<Role | null>;
  liveNoteAccess(fileId: string): Promise<{
    head: string | null;
    epoch: number;
    role: Role;
    writable: boolean;
  } | null>;
  liveNote(fileId: string): Promise<{
    readonly head: string | null;
    bytes: Uint8Array;
    epoch: number;
    role: Role;
    writable: boolean;
  } | null>;
  bindNoteClient(
    fileId: string,
    epoch: number,
    clientId: number,
  ): Promise<boolean>;
  members(after: string | null): Promise<{
    members: WorkspaceMember[];
    memberCount: number;
    nextAfterAccountId: string | null;
  }>;
  changeMember(
    accountId: string,
    role: InviteRole | null,
    leave: boolean,
  ): Promise<'ok' | 'last_workspace' | 'forbidden' | 'not_found'>;
  member(accountId: string): Promise<WorkspaceMember | null>;
  invites(after: string | null): Promise<WorkspaceInvite[]>;
  inspectInvite(digest: string): Promise<WorkspaceInvite | null>;
  createInvite(invite: NewWorkspaceInvite): Promise<WorkspaceInviteOutcome>;
  adminInvite(invitationId: string, revoke: boolean): Promise<string | null>;
  answerInvite(
    invitationId: string,
    accept: boolean,
  ): Promise<WorkspaceSummary | null>;
};

export type CollaborationStore = {
  collaboration<T>(
    actor: Actor | null,
    workspaceId: string | null,
    run: (tx: CollaborationTransaction) => Promise<T>,
  ): Promise<T>;
};

export function workspaceCollaboration<T>(
  store: CollaborationStore,
  actor: Actor,
  workspaceId: string,
  action: Extract<Action, 'read' | 'manage_members'>,
  run: (tx: CollaborationTransaction) => Promise<Result<T>>,
): Promise<Result<T>> {
  return store.collaboration(actor, workspaceId, async (tx) => {
    const role = await tx.role();
    if (role === null || !authorize(actor, workspaceId, role, action).ok)
      return fail('forbidden');
    return run(tx);
  });
}
