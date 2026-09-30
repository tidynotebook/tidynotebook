/**
 * Account and workspace use cases.
 *
 * A use case receives a verified actor and a store. It reads the current role
 * inside the same transaction that performs the write, because a role can
 * change between the moment a request arrives and the moment it commits. The
 * workspace transaction holds the same lock as a content write, so a
 * workspace change and a write of one workspace have a defined order.
 *
 * Expected failures are returned as `Result`. `forbidden` covers both a denied
 * permission and a denied rule, so an answer never tells a stranger which
 * workspace or account exists.
 */
import type { Action, Actor, Role } from '../identity/actor.ts';
import { actionsForRole, authorize } from '../identity/actor.ts';
import { fail, ok, type Result } from '../files/model.ts';
import { settingsOf } from './themes.ts';
import type {
  AccountOwnStanding,
  AccountSettings,
  AppearanceChoice,
  Preferences,
  PreferencesChange,
  WorkspaceAdminStore,
  WorkspaceSummary,
} from './ports.ts';

/**
 * The appearance choices, for a transport that narrows an unknown value.
 */
export const appearanceChoices: readonly AppearanceChoice[] = [
  'system',
  'light',
  'dark',
];

/**
 * The shape a theme family identifier must have.
 *
 * The registry of families is a client concern, so the rule here is only the
 * slug shape and its length. A family the client does not know falls back to
 * the default one when the page paints.
 */
export const themeFamilyPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The longest theme family identifier the store accepts.
 *
 * The family of an imported theme is `custom-` and a UUID, 43 characters
 * (record 0141).
 */
export const themeFamilyMaximumLength = 64;

/** True when a value can be stored as a theme family identifier. */
export function isThemeFamilyId(value: string): boolean {
  return (
    value.length <= themeFamilyMaximumLength && themeFamilyPattern.test(value)
  );
}

/**
 * Whether an account that never chose has its spelling checked.
 *
 * The migration that adds the column states the same default, because SQL
 * cannot read this value.
 */
export const defaultSpellCheck = true;

/**
 * Both permission checks of one workspace action.
 *
 * The role comes from storage inside the open transaction. The grants come
 * from the transport that verified the request. Both must permit the action.
 */
function permit(
  actor: Actor,
  workspaceId: string,
  role: Role | null,
  action: Action,
): Result<Role> {
  if (role === null) return fail('forbidden');
  const decision = authorize(actor, workspaceId, role, action);
  return decision.ok ? ok(role) : fail('forbidden');
}

/** Every workspace of the account, with its role in each. */
export function listWorkspaces(
  store: WorkspaceAdminStore,
  actor: Actor,
): Promise<Result<readonly WorkspaceSummary[]>> {
  return store.account(actor, async (tx) => ok(await tx.workspaces()));
}

/**
 * Creates a workspace whose creator becomes its owner.
 *
 * Any authenticated account may create a workspace, because the new workspace
 * contains nothing that belongs to another account.
 */
export function createWorkspace(
  store: WorkspaceAdminStore,
  actor: Actor,
  input: { readonly workspaceId: string; readonly name: string },
): Promise<Result<WorkspaceSummary>> {
  return store.account(actor, async (tx) => {
    // The store takes the workspace lock before it creates anything, so the
    // owner membership row is recorded in the same order as every later
    // membership change of that workspace.
    await tx.createWorkspace(input);
    await tx.recordMembershipChange(input.workspaceId, {
      accountId: actor.accountId,
      removed: false,
    });
    return ok({
      workspaceId: input.workspaceId,
      name: input.name,
      role: 'owner' as const,
      personal: false,
    });
  });
}

/** Renames a workspace. Only the owner may do this. */
export function updateWorkspace(
  store: WorkspaceAdminStore,
  actor: Actor,
  workspaceId: string,
  name: string,
): Promise<Result<WorkspaceSummary>> {
  return store.workspace(actor, workspaceId, async (tx) => {
    const role = await tx.role(actor.accountId);
    const allowed = permit(actor, workspaceId, role, 'write');
    if (!allowed.ok) return fail<WorkspaceSummary>(allowed.error.code);
    if (role !== 'owner') return fail<WorkspaceSummary>('forbidden');
    await tx.rename(name);
    const described = await tx.describe();
    return ok({
      workspaceId,
      name,
      role: allowed.value,
      personal: described?.personal ?? false,
    });
  });
}

/**
 * Deletes a workspace and every record that belongs to it.
 *
 * Only the owner may do this, and an account never deletes its last workspace.
 * An account with no workspace has nowhere to read or write a note, and no
 * screen of the product can make one from that state, so the rule is a domain
 * refusal and not a hidden control (record 0051). The database function
 * refuses the same call, so a caller that reaches the store without this use
 * case is refused as well.
 *
 * The storage call removes the membership rows, so every session loses its
 * access to the workspace. Attachment bytes on the private volume are
 * reclaimed by the cleanup job that owns them.
 */
export function deleteWorkspace(
  store: WorkspaceAdminStore,
  actor: Actor,
  workspaceId: string,
): Promise<Result<void>> {
  return store.workspace(actor, workspaceId, async (tx) => {
    const role = await tx.role(actor.accountId);
    const allowed = permit(actor, workspaceId, role, 'purge');
    if (!allowed.ok) return fail<void>(allowed.error.code);
    if (role !== 'owner') return fail<void>('forbidden');
    // The count is read here and not before the transaction opened, because
    // this transaction holds the workspace lock. Two tabs that each delete one
    // of the last two workspaces are therefore ordered, and the second one
    // reads the count that the first one left.
    if ((await tx.accountWorkspaceCount()) <= 1) return fail<void>('forbidden');
    // The record of the deletion goes to the account trail, because `destroy`
    // removes every row of this workspace and the actor may have had no other
    // workspace at all.
    await tx.auditAccount({ action: 'workspace.delete' });
    await tx.destroy();
    return ok(undefined);
  });
}

/** The installation role and the storage of the account. */
export function readOwnStanding(
  store: WorkspaceAdminStore,
  actor: Actor,
): Promise<Result<AccountOwnStanding>> {
  return store.account(actor, async (tx) => ok(await tx.standing()));
}

/** The stored settings of the account, with the themes it imported. */
export function readPreferences(
  store: WorkspaceAdminStore,
  actor: Actor,
): Promise<Result<AccountSettings>> {
  return store.account(actor, async (tx) => ok(await settingsOf(tx)));
}

/**
 * Stores the settings that a change names and keeps every other one.
 *
 * The stored value is read inside the same transaction as the write, so two
 * changes of two different settings never undo each other (record 0103).
 * Every member that the change names is checked before anything is written.
 */
export function updatePreferences(
  store: WorkspaceAdminStore,
  actor: Actor,
  change: PreferencesChange,
): Promise<Result<AccountSettings>> {
  return store.account(actor, async (tx) => {
    const current = await tx.preferences();
    let appearance = current.appearance;
    if (change.appearance !== undefined) {
      const known = appearanceChoices.find(
        (choice) => choice === change.appearance,
      );
      if (known === undefined) return fail<AccountSettings>('forbidden');
      appearance = known;
    }
    const themeFamily = change.themeFamily ?? current.themeFamily;
    if (!isThemeFamilyId(themeFamily))
      return fail<AccountSettings>('forbidden');
    const checked: Preferences = {
      appearance,
      themeFamily,
      spellCheck: change.spellCheck ?? current.spellCheck,
    };
    await tx.savePreferences(checked);
    return ok({ ...checked, themes: await tx.themes() });
  });
}

/**
 * The grants of a browser session.
 *
 * A cookie session carries the full role, so the grants are exactly the
 * actions of the current role in every workspace the account belongs to.
 */
export function sessionGrants(
  memberships: readonly { workspaceId: string; role: Role }[],
): readonly { workspaceId: string; actions: readonly Action[] }[] {
  return memberships.map((entry) => ({
    workspaceId: entry.workspaceId,
    actions: actionsForRole(entry.role),
  }));
}
