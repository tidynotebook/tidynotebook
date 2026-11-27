import { fail, ok, type Result } from '../files/model.ts';
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

export function workspacePresenceColor(slot: number): string {
  if (slot < 6) return `var(--color-live-${slot})`;
  const hue = (slot * 137.50776405) % 360;
  const lightness = (slot % 5) / 100;
  return `oklch(calc(var(--live-extra-lightness) + ${lightness}) var(--live-extra-chroma) ${hue})`;
}

export type WorkspaceMember = {
  readonly accountId: string;
  readonly displayName: string | null;
  readonly email: string;
  readonly role: Role;
  readonly colorSlot: number;
  readonly ownerWorkspaceMemberships: number;
};

export type WorkspaceInvite = {
  readonly invitationId: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly email: string;
  readonly role: InviteRole;
  readonly inviterName: string | null;
  readonly expiresAt: string;
  readonly collaborationEnabled: boolean;
  readonly seatOwnerName: string | null;
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

export type WorkspaceSeats = {
  readonly memberLimit: number;
  readonly membersUsed: number;
  readonly pendingInvites: number;
  readonly freePlaces: number;
};

export type WorkspaceSeatPreview = {
  readonly seats: WorkspaceSeats | null;
  readonly additionalPlaces: number;
};

export function workspaceSeatUsage(
  memberLimit: number,
  membersUsed: number,
  pendingInvites: number,
): WorkspaceSeats {
  return {
    memberLimit,
    membersUsed,
    pendingInvites,
    freePlaces: Math.max(0, memberLimit - membersUsed - pendingInvites),
  };
}

export function checkWorkspaceSeatPreview(
  preview: WorkspaceSeatPreview,
): Result<void> {
  const { seats, additionalPlaces } = preview;
  if (
    seats !== null &&
    seats.membersUsed + seats.pendingInvites + additionalPlaces >
      seats.memberLimit
  )
    return {
      ok: false,
      error: {
        code: 'member_limit',
        fileIds: [],
        freePlaces: seats.freePlaces,
      },
    };
  return ok(undefined);
}

export type CollaborationTransaction = {
  role(): Promise<Role | null>;
  invitationEnabled(): Promise<boolean>;
  seatPreview(
    emails: readonly string[],
    lock: boolean,
  ): Promise<WorkspaceSeatPreview>;
  liveNoteAccess(fileId: string): Promise<{
    head: string | null;
    epoch: number;
    role: Role;
    writable: boolean;
    colorSlot: number;
  } | null>;
  liveNote(fileId: string): Promise<{
    readonly head: string | null;
    bytes: Uint8Array;
    epoch: number;
    role: Role;
    writable: boolean;
    colorSlot: number;
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

export async function workspaceCollaboration<T>(
  store: CollaborationStore,
  actor: Actor,
  workspaceId: string,
  action: Extract<Action, 'read' | 'manage_members'> | 'invite',
  run: (tx: CollaborationTransaction) => Promise<Result<T>>,
): Promise<Result<T>> {
  const result = await workspaceInvitationWrite(() =>
    store.collaboration<Result<T>>(actor, workspaceId, async (tx) => {
      const role = await tx.role();
      const permission = action === 'invite' ? 'manage_members' : action;
      if (role === null || !authorize(actor, workspaceId, role, permission).ok)
        return fail('forbidden');
      if (action === 'invite' && !(await tx.invitationEnabled()))
        return fail('collaboration_off');
      return run(tx);
    }),
  );
  return result.ok ? result.value : result;
}

/** A workspace invitation write met the owner's switch after it took the lock. */
export class WorkspaceInvitationsOff extends Error {}

export class WorkspaceMemberLimitExceeded extends Error {
  readonly freePlaces: number;

  constructor(freePlaces: number) {
    super('The workspace member limit would be exceeded.');
    this.freePlaces = freePlaces;
  }
}

export async function workspaceInvitationWrite<T>(
  write: () => Promise<T>,
): Promise<Result<T>> {
  try {
    return ok(await write());
  } catch (error) {
    if (error instanceof WorkspaceMemberLimitExceeded)
      return {
        ok: false,
        error: {
          code: 'member_limit',
          fileIds: [],
          freePlaces: error.freePlaces,
        },
      };
    if (error instanceof WorkspaceInvitationsOff)
      return fail('collaboration_off');
    throw error;
  }
}
