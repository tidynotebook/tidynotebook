/**
 * Verified actors and the workspace role and action matrix.
 *
 * A permission decision uses two independent facts: the account's current role
 * in the workspace, and the verified grants that the transport attached to the
 * request. Both must permit the action.
 */
import { fail, ok, type Result } from '../files/model.ts';

export const workspaceRoles = ['owner', 'admin', 'editor', 'viewer'] as const;
export type Role = (typeof workspaceRoles)[number];
export type InviteRole = Exclude<Role, 'owner'>;

export function inviteRole(value: unknown): InviteRole | null {
  return value === 'admin' || value === 'editor' || value === 'viewer'
    ? value
    : null;
}

/** A permitted kind of operation inside one workspace. */
export type Action =
  'read' | 'write' | 'history' | 'purge' | 'publish' | 'manage_members';

/** The verified actions of one account in one workspace. */
export type Grant = {
  readonly workspaceId: string;
  readonly actions: readonly Action[];
};

/**
 * One grant as a caller read it, before the actions are checked.
 *
 * A scope reaches this package from a stored row or from a session record, so
 * an action can be a text that the union no longer contains. A caller states
 * what it read and `verifyActor` decides, instead of claiming a shape that
 * nothing proved.
 */
export type StoredGrant = {
  readonly workspaceId: string;
  readonly actions: readonly string[];
};

/**
 * Marker of a verified actor.
 *
 * The marker keeps verified identity apart from user supplied input. A parsed
 * request body cannot carry this symbol, so it cannot be used where an `Actor`
 * is required. Only `verifyActor` creates the marker, and only the identity
 * adapter calls it after it has checked a session. The package
 * entry point does not export the symbol, so no other package can build an
 * actor by hand. `tools/actor-brand/fixture.ts` proves the compile-time part
 * of this rule.
 */
export const verifiedActorMark: unique symbol = Symbol(
  'notesapp.verified-actor',
);

/**
 * An authenticated account and its verified grants.
 *
 * The grants are the scope that the transport proved. The current role comes
 * from storage inside the same transaction, because a role can change between
 * the moment a request arrives and the moment a change commits.
 */
export type Actor = {
  readonly accountId: string;
  readonly grants: readonly Grant[];
  readonly [verifiedActorMark]: true;
};

/** The actions that a current workspace role permits. */
const readActions = ['read', 'history'] as const;
const editorActions = [...readActions, 'write'] as const;
const adminActions = [
  ...editorActions,
  'purge',
  'publish',
  'manage_members',
] as const;
const roleActions: Readonly<Record<Role, readonly Action[]>> = {
  owner: adminActions,
  admin: adminActions,
  editor: editorActions,
  viewer: readActions,
};
/**
 * The same matrix, read by a plain string key.
 *
 * A role reaches this package from storage, so a value outside the union can
 * arrive when a database row holds an unexpected string. The lookup then finds
 * nothing and the decision is a denial instead of a thrown error.
 */
const actionsOfRole = new Map<string, readonly Action[]>(
  Object.entries(roleActions),
);
/** Every action, for the runtime check of a supplied grant. */
const knownActions: readonly Action[] = roleActions.owner;

/**
 * Creates a verified actor.
 *
 * Call this only after the identity adapter has verified the session and has
 * read the role from storage. The grants are copied, so a later change to the
 * caller's array cannot change a decision.
 *
 * The values are checked at run time as well, because a role can come from a
 * stored row that no longer matches the current union. An empty account
 * identifier, an empty workspace identifier, or an unknown action rejects the
 * whole actor with `forbidden`. Nothing is dropped silently: a partly
 * understood scope must not become a smaller scope that then looks verified.
 */
export function verifyActor(
  accountId: string,
  grants: readonly StoredGrant[],
): Result<Actor> {
  if (accountId.length === 0) return fail('forbidden');
  const copied: Grant[] = [];
  for (const grant of grants) {
    if (grant.workspaceId.length === 0) return fail('forbidden');
    const actions: Action[] = [];
    for (const action of grant.actions) {
      const known = knownActions.find((entry) => entry === action);
      if (known === undefined) return fail('forbidden');
      actions.push(known);
    }
    copied.push({ workspaceId: grant.workspaceId, actions });
  }
  return ok({
    accountId,
    grants: copied,
    [verifiedActorMark]: true,
  });
}

/**
 * The actions that one stored role text permits.
 *
 * The identity adapter uses this to build the grants of a browser session,
 * which carries the full role. The parameter is text, because a role reaches
 * this package from a stored row that can hold a value the union no longer
 * contains. Such a text returns no action, so every decision that reads it is
 * a denial.
 */
export function actionsForRole(role: string): readonly Action[] {
  return actionsOfRole.get(role) ?? [];
}

/**
 * Decides whether the actor may perform the action in the workspace.
 *
 * The decision is the intersection of the current role and the verified grants
 * for that workspace. A grant for another workspace never applies. The failure
 * is `forbidden` with no file identifiers, so the answer does not disclose
 * which files exist.
 */
export function authorize(
  actor: Actor,
  workspaceId: string,
  role: Role,
  action: Action,
): Result<void> {
  const permitted = actionsForRole(role);
  if (!permitted.includes(action)) return fail('forbidden');
  const grant = actor.grants.find((entry) => entry.workspaceId === workspaceId);
  if (grant === undefined || !grant.actions.includes(action))
    return fail('forbidden');
  return ok(undefined);
}
