/**
 * Which workspace the application opens, and what it remembers.
 *
 * A person chooses the workspace (record 0049), and that choice belongs to the
 * device, like the sidebar width of record 0035. The account is not asked,
 * because one device reading work notes and another reading personal notes is
 * a normal thing to want.
 *
 * Everything here is a pure function of the answer of `listWorkspaces` and one
 * stored value, so the rules are tested without a browser. `app.tsx` owns the
 * browser storage and the state.
 */
import type { Workspace } from '@notesapp/api-client';

/** The local settings key of the chosen workspace of one account. */
export function workspaceChoiceKey(accountId: string): string {
  return `notesapp.workspace:${accountId}`;
}

/** The local settings key of the cached workspace list of one account. */
export function workspaceListKey(accountId: string): string {
  return `notesapp.workspaces:${accountId}`;
}

/**
 * The workspace to open, given the list and what this device last chose.
 *
 * The order is the stored choice, then the workspace the account started with,
 * then the first one the server named. A stored identifier that the list no
 * longer holds falls through, because a workspace the person deleted on
 * another device must not leave this one with nowhere to go. An empty list
 * answers `null`, which is a state the product refuses to reach (record 0051)
 * and which the caller still has to report rather than assume away.
 */
export function chooseWorkspace(
  workspaces: readonly Workspace[],
  storedId: string | null,
): Workspace | null {
  const stored =
    storedId === null
      ? undefined
      : workspaces.find((workspace) => workspace.workspaceId === storedId);
  if (stored !== undefined) return stored;
  return (
    workspaces.find((workspace) => workspace.personal) ?? workspaces[0] ?? null
  );
}

/** Whether the account may open this workspace. */
export function isMemberOf(
  workspaces: readonly Workspace[],
  workspaceId: string,
): boolean {
  return workspaces.some((workspace) => workspace.workspaceId === workspaceId);
}

/**
 * The workspace that takes over when this one goes away.
 *
 * A delete moves the person somewhere, and that somewhere is the next
 * workspace in the list rather than the first one, so deleting the top of a
 * long list does not throw the person to the other end of it.
 */
export function workspaceAfterRemoval(
  workspaces: readonly Workspace[],
  removedId: string,
): Workspace | null {
  const remaining = workspaces.filter(
    (workspace) => workspace.workspaceId !== removedId,
  );
  const position = workspaces.findIndex(
    (workspace) => workspace.workspaceId === removedId,
  );
  if (position < 0) return chooseWorkspace(remaining, null);
  return (
    remaining[position] ??
    remaining[position - 1] ??
    chooseWorkspace(remaining, null)
  );
}

/**
 * The address that opens a path of no workspace inside the chosen one.
 *
 * Every page a signed in person opens is a page of the workspace frame
 * (record 0091). The root address, a link from before that record such as
 * `/settings`, and an address nobody knows each name no workspace, so each
 * opens the same path under the chosen workspace. The frame then shows the
 * page, or Page not found inside the frame, and the person still reads the
 * address they opened. The search and the hash stay with it.
 */
export function addressInWorkspace(
  workspaceId: string,
  address: {
    readonly pathname: string;
    readonly search: string;
    readonly hash: string;
  },
): string {
  const home = `/w/${workspaceId}`;
  const rest = address.pathname.replace(/^\/+/, '');
  return `${rest === '' ? home : `${home}/${rest}`}${address.search}${address.hash}`;
}

/** Reads one member of an unknown stored value without claiming its shape. */
function member(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value))[key];
}

/**
 * Reads one cached workspace row, or `null` when it is not one.
 *
 * The cache is written by an earlier release of this application, or by
 * another page of this origin, so nothing about its shape is assumed. A row
 * that does not carry every member of a workspace is dropped whole: a partly
 * understood row must not become a workspace that then looks read.
 */
function parseWorkspace(value: unknown): Workspace | null {
  const workspaceId = member(value, 'workspaceId');
  const name = member(value, 'name');
  const role = member(value, 'role');
  const personal = member(value, 'personal');
  const memberCount = member(value, 'memberCount');
  if (typeof workspaceId !== 'string' || workspaceId === '') return null;
  if (typeof name !== 'string' || name === '') return null;
  if (
    role !== 'owner' &&
    role !== 'admin' &&
    role !== 'editor' &&
    role !== 'viewer'
  )
    return null;
  if (typeof personal !== 'boolean') return null;
  return {
    workspaceId,
    name,
    role,
    personal,
    ...(typeof memberCount === 'number' &&
    Number.isSafeInteger(memberCount) &&
    memberCount > 1
      ? { memberCount }
      : {}),
  };
}

/**
 * The cached workspace list of one account, for a start with no connection.
 *
 * A device that opens offline still shows the switcher and still reaches the
 * notes it holds, so the list is cached beside the choice. Anything that does
 * not parse answers an empty list, which the caller reports as a failed read
 * rather than as an account with no workspace (record 0038).
 */
export function parseCachedWorkspaces(
  source: string | null,
): readonly Workspace[] {
  if (source === null || source === '') return [];
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const parsed: Workspace[] = [];
  for (const row of value) {
    const workspace = parseWorkspace(row);
    if (workspace === null) return [];
    parsed.push(workspace);
  }
  return parsed;
}
