/**
 * The installation role and action matrix (record 0109).
 *
 * The installation matrix decides who administers the installation. It stands
 * beside the workspace matrix of `actor.ts`, and the two never read each
 * other: an installation role grants no workspace action, and a workspace
 * role grants no installation action. An administrator therefore sees the
 * names, the addresses, the states and the usage of the accounts, and never a
 * note of another account.
 */

/** The role of an account in the installation. */
export type InstallationRole = 'administrator' | 'member';

/** Whether an account can sign in. */
export type AccountState = 'enabled' | 'disabled';

/** Who can make an account (record 0108). */
export type RegistrationPolicy = 'invitation' | 'open';

/** Every installation role, for a transport that narrows a stored text. */
export const installationRoles: readonly InstallationRole[] = [
  'administrator',
  'member',
];

/** Every account state, for a transport that narrows a stored text. */
export const accountStates: readonly AccountState[] = ['enabled', 'disabled'];

/** Every registration policy, for a transport that narrows a stored text. */
export const registrationPolicies: readonly RegistrationPolicy[] = [
  'invitation',
  'open',
];

/** One action on the installation, as record 0109 lists them. */
export type InstallationAction =
  | 'list-accounts'
  | 'invite'
  | 'revoke-invitation'
  | 'change-state'
  | 'remove-account'
  | 'change-role'
  | 'change-limit'
  | 'change-controls'
  | 'change-policy'
  | 'change-settings'
  | 'list-reports'
  | 'close-report'
  | 'take-down';

/**
 * The actions of each installation role.
 *
 * A member administers nothing. The actions that a person takes on their own
 * account, such as the removal of it, are not installation actions: they
 * need only an enabled account.
 */
const roleActions: Readonly<
  Record<InstallationRole, readonly InstallationAction[]>
> = {
  administrator: [
    'list-accounts',
    'invite',
    'revoke-invitation',
    'change-state',
    'remove-account',
    'change-role',
    'change-limit',
    'change-controls',
    'change-policy',
    'change-settings',
    'list-reports',
    'close-report',
    'take-down',
  ],
  member: [],
};

/**
 * What the installation knows about one account, read in the transaction of
 * the action.
 */
export type AccountStanding = {
  readonly accountId: string;
  readonly role: InstallationRole;
  readonly state: AccountState;
};

/**
 * Whether an account may take one installation action.
 *
 * A disabled account takes no action, whatever its role, so a disabled
 * administrator cannot act through a session that outlived the change.
 */
export function mayAdminister(
  standing: AccountStanding | null,
  action: InstallationAction,
): boolean {
  if (standing === null || standing.state !== 'enabled') return false;
  return roleActions[standing.role].includes(action);
}

/** Whether an account counts as an enabled administrator (record 0110). */
export function isEnabledAdministrator(standing: AccountStanding): boolean {
  return standing.role === 'administrator' && standing.state === 'enabled';
}

/**
 * Whether a change of one account leaves the installation with no enabled
 * administrator (record 0110).
 *
 * `enabledAdministrators` is the count that the transaction read under the
 * installation lock, with the target in it when the target is one. A change
 * that keeps the target an enabled administrator, or a target that is not
 * one, never leaves the installation without one.
 */
export function leavesNoAdministrator(
  target: AccountStanding,
  after: AccountStanding | null,
  enabledAdministrators: number,
): boolean {
  if (!isEnabledAdministrator(target)) return false;
  if (after !== null && isEnabledAdministrator(after)) return false;
  return enabledAdministrators <= 1;
}
