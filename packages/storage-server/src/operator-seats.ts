import {
  workspaceMemberPageSize,
  type OperatorSeatInvite,
  type OperatorSeatUsage,
} from '@notesapp/core';
import type pg from 'pg';
import { collaborationTransaction } from './collaboration-store.ts';

type MemberStart = { account_id: string; since: Date };
type MemberProfile = {
  account_id: string;
  email: string;
  normalized_email: string;
  display_name: string | null;
};

export function operatorSeatsOf({
  memberLimit,
  seats,
  memberStarts,
  profiles,
  openInvites,
}: {
  memberLimit: number | null;
  seats: Pick<OperatorSeatUsage, 'membersUsed' | 'pendingInvites'> | null;
  memberStarts: readonly MemberStart[];
  profiles: ReadonlyMap<string, MemberProfile>;
  openInvites: readonly OperatorSeatInvite[];
}): OperatorSeatUsage {
  const members = memberStarts.map(({ account_id, since }) => {
    const profile = profiles.get(account_id);
    return {
      accountId: account_id,
      email: profile?.email ?? null,
      name: profile?.display_name ?? null,
      since: since.toISOString(),
    };
  });
  const reserved = new Set(
    Array.from(profiles.values(), (profile) => profile.normalized_email),
  );
  const invites: OperatorSeatInvite[] = [];
  const ordered = [...openInvites].sort(
    (first, next) =>
      first.expiresAt.localeCompare(next.expiresAt) ||
      first.workspaceId.localeCompare(next.workspaceId),
  );
  for (const { email, expiresAt, workspaceId } of ordered) {
    if (reserved.has(email)) continue;
    reserved.add(email);
    invites.push({ email, expiresAt, workspaceId });
  }
  return {
    memberLimit,
    // An unlimited account has no seat preview in Members.
    membersUsed: seats?.membersUsed ?? members.length,
    pendingInvites: seats?.pendingInvites ?? invites.length,
    members,
    invites,
  };
}

async function readProfiles(
  client: pg.PoolClient,
  workspaceId: string,
  profiles: Map<string, MemberProfile>,
): Promise<void> {
  let after: string | null = null;
  do {
    const result: pg.QueryResult<MemberProfile> = await client.query(
      `select account_id, email, lower(btrim(email)) as normalized_email, display_name
         from notesapp_workspace_member_page($1, $2)`,
      [workspaceId, after],
    );
    const { rows } = result;
    const page = rows.slice(0, workspaceMemberPageSize);
    for (const profile of page) profiles.set(profile.account_id, profile);
    after =
      rows.length > workspaceMemberPageSize
        ? (page.at(-1)?.account_id ?? null)
        : null;
  } while (after !== null);
}

export async function readOperatorSeatUsage(
  client: pg.PoolClient,
  accountId: string,
): Promise<OperatorSeatUsage | null> {
  const { rows: accounts } = await client.query<{
    member_limit: number | null;
  }>('select member_limit from accounts where id = $1 and removed_at is null', [
    accountId,
  ]);
  const account = accounts[0];
  if (account === undefined) return null;
  const memberLimit = account.member_limit;
  const { rows: owned } = await client.query<{ workspace_id: string }>(
    "select workspace_id from memberships where account_id = $1 and role = 'owner'",
    [accountId],
  );
  const first = owned[0];
  if (first === undefined)
    return {
      memberLimit,
      membersUsed: 0,
      pendingInvites: 0,
      members: [],
      invites: [],
    };

  const { seats } = await collaborationTransaction(
    client,
    first.workspace_id,
  ).seatPreview([], false);
  const { rows: memberStarts } = await client.query<MemberStart>(
    `select m.account_id, min(m.created_at) as since
       from memberships m join memberships owner using (workspace_id)
       where owner.account_id = $1 and owner.role = 'owner' and m.account_id <> $1
       group by m.account_id order by since, m.account_id`,
    [accountId],
  );
  const profiles = new Map<string, MemberProfile>();
  const openInvites: OperatorSeatInvite[] = [];
  for (const { workspace_id } of owned) {
    await readProfiles(client, workspace_id, profiles);
    const invites = await collaborationTransaction(
      client,
      workspace_id,
    ).invites(null);
    for (const invite of invites) openInvites.push(invite);
  }
  return operatorSeatsOf({
    memberLimit,
    seats,
    memberStarts,
    profiles,
    openInvites,
  });
}
