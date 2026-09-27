/**
 * The use cases of an administrator and of a person who removes their own
 * account (records 0109 to 0112).
 *
 * Each use case runs in one installation transaction. It reads the standing
 * of the caller and of the target inside that transaction, because a role or
 * a state can change between the moment a request arrives and the moment it
 * commits. The installation lock orders two administrators who change each
 * other at the same time, so the count of enabled administrators that one of
 * them reads is the count that the other one left.
 *
 * A refused permission answers `forbidden`, and an unknown or removed target
 * answers `not_found`. A change that leaves no enabled administrator answers
 * `last_administrator`, and the database function refuses it again.
 */
import { fail, ok, type Result } from '../files/model.ts';
import type { Actor } from './actor.ts';
import {
  accountStates,
  installationRoles,
  leavesNoAdministrator,
  mayAdminister,
  registrationPolicies,
  type AccountStanding,
  type InstallationAction,
  type RegistrationPolicy,
} from './installation.ts';
import type {
  AccountRecord,
  InstallationStore,
  InstallationTransaction,
  InvitationRecord,
  LinkReportRecord,
  NewInvitation,
} from './ports.ts';
import {
  invitationState,
  maxAccountLimitBytes,
  normalizeEmail,
  openRegistrationMissing,
  type OpenRegistrationReadiness,
} from './registration.ts';

/** Whether the caller of a transaction may take one action. */
async function permitted(
  tx: InstallationTransaction,
  actor: Actor,
  action: InstallationAction,
): Promise<boolean> {
  return mayAdminister(await tx.standing(actor.accountId), action);
}

/** Every account of the installation, for an administrator. */
export function listAccounts(
  store: InstallationStore,
  actor: Actor,
): Promise<Result<readonly AccountRecord[]>> {
  return store.installation(actor, async (tx) => {
    if (!(await permitted(tx, actor, 'list-accounts')))
      return fail<readonly AccountRecord[]>('forbidden');
    return ok(await tx.accounts());
  });
}

/**
 * One change of an account, as the transport read it.
 *
 * The role and the state reach this package from a request body, so each is
 * a text that the use case narrows. A member that is absent keeps its value.
 */
export type AccountChange = {
  readonly role?: string | undefined;
  readonly state?: string | undefined;
  readonly limitBytes?: bigint | undefined;
};

/**
 * Changes the role, the state, or the limit of one account.
 *
 * Every member of the change needs its own action, and the whole change is
 * refused when one of them is not permitted, so a change never lands in part.
 */
export function updateAccount(
  store: InstallationStore,
  actor: Actor,
  accountId: string,
  change: AccountChange,
): Promise<Result<AccountRecord>> {
  return store.installation(actor, async (tx) => {
    const caller = await tx.standing(actor.accountId);
    const needed: InstallationAction[] = [];
    if (change.role !== undefined) needed.push('change-role');
    if (change.state !== undefined) needed.push('change-state');
    if (change.limitBytes !== undefined) needed.push('change-limit');
    if (needed.length === 0) return fail<AccountRecord>('forbidden');
    if (!needed.every((action) => mayAdminister(caller, action)))
      return fail<AccountRecord>('forbidden');
    const role =
      change.role === undefined
        ? undefined
        : installationRoles.find((known) => known === change.role);
    const state =
      change.state === undefined
        ? undefined
        : accountStates.find((known) => known === change.state);
    if (change.role !== undefined && role === undefined)
      return fail<AccountRecord>('forbidden');
    if (change.state !== undefined && state === undefined)
      return fail<AccountRecord>('forbidden');
    if (
      change.limitBytes !== undefined &&
      (change.limitBytes < 1n || change.limitBytes > maxAccountLimitBytes)
    )
      return fail<AccountRecord>('forbidden');
    const target = await tx.standing(accountId);
    if (target === null) return fail<AccountRecord>('not_found');
    const after: AccountStanding = {
      accountId,
      role: role ?? target.role,
      state: state ?? target.state,
    };
    if (leavesNoAdministrator(target, after, await tx.enabledAdministrators()))
      return fail<AccountRecord>('last_administrator');
    if (role !== undefined && role !== target.role)
      await tx.setRole(accountId, role);
    if (state !== undefined && state !== target.state)
      await tx.setState(accountId, state);
    if (change.limitBytes !== undefined)
      await tx.setLimit(accountId, change.limitBytes);
    const changed = (await tx.accounts()).find(
      (record) => record.accountId === accountId,
    );
    return changed === undefined
      ? fail<AccountRecord>('not_found')
      : ok(changed);
  });
}

/** Removes the account of a target and keeps its tombstone. */
async function removeTarget(
  tx: InstallationTransaction,
  target: AccountStanding,
): Promise<Result<void>> {
  if (leavesNoAdministrator(target, null, await tx.enabledAdministrators()))
    return fail('last_administrator');
  await tx.remove(target.accountId);
  return ok(undefined);
}

/**
 * Removes another account, for an administrator (record 0111).
 *
 * An administrator does not remove their own account here. That path asks
 * for the password again, so it is `removeOwnAccount`.
 */
export function removeAccount(
  store: InstallationStore,
  actor: Actor,
  accountId: string,
): Promise<Result<void>> {
  return store.installation(actor, async (tx) => {
    if (!(await permitted(tx, actor, 'remove-account')))
      return fail<void>('forbidden');
    if (accountId === actor.accountId) return fail<void>('forbidden');
    const target = await tx.standing(accountId);
    if (target === null) return fail<void>('not_found');
    return removeTarget(tx, target);
  });
}

/**
 * Removes the account of the caller (record 0111).
 *
 * The transport checks the password before it calls this. Any enabled
 * account may remove itself, except the last enabled administrator.
 */
export function removeOwnAccount(
  store: InstallationStore,
  actor: Actor,
): Promise<Result<void>> {
  return store.installation(actor, async (tx) => {
    const self = await tx.standing(actor.accountId);
    if (self === null || self.state !== 'enabled')
      return fail<void>('forbidden');
    return removeTarget(tx, self);
  });
}

/** One waiting invitation and whether it still opens anything. */
export type InvitationView = InvitationRecord & {
  readonly state: 'pending' | 'expired';
};

/** Every invitation that nobody used or revoked, for an administrator. */
export function listInvitations(
  store: InstallationStore,
  actor: Actor,
  now: Date,
): Promise<Result<readonly InvitationView[]>> {
  return store.installation(actor, async (tx) => {
    if (!(await permitted(tx, actor, 'invite')))
      return fail<readonly InvitationView[]>('forbidden');
    return ok(
      (await tx.invitations()).map((invitation) => ({
        ...invitation,
        state: invitationState(invitation, now),
      })),
    );
  });
}

/**
 * Stores one invitation, for an administrator.
 *
 * The address is compared in its one written form. An address that already
 * signs in answers `account_exists`: the administrator sees every address
 * anyway, so the answer reveals nothing to them.
 */
export function createInvitation(
  store: InstallationStore,
  actor: Actor,
  invitation: NewInvitation,
): Promise<Result<InvitationRecord>> {
  return store.installation(actor, async (tx) => {
    if (!(await permitted(tx, actor, 'invite')))
      return fail<InvitationRecord>('forbidden');
    const email = normalizeEmail(invitation.email);
    if (email === null || !/^[0-9a-f]{64}$/.test(invitation.tokenDigest))
      return fail<InvitationRecord>('forbidden');
    const stored = await tx.invite({ ...invitation, email });
    return stored === null
      ? fail<InvitationRecord>('account_exists')
      : ok(stored);
  });
}

/** Revokes one waiting invitation, for an administrator. */
export function revokeInvitation(
  store: InstallationStore,
  actor: Actor,
  invitationId: string,
): Promise<Result<void>> {
  return store.installation(actor, async (tx) => {
    if (!(await permitted(tx, actor, 'revoke-invitation')))
      return fail<void>('forbidden');
    return (await tx.revokeInvitation(invitationId))
      ? ok(undefined)
      : fail<void>('not_found');
  });
}

/** Every open report of a published link, for an administrator (0119). */
export function listReports(
  store: InstallationStore,
  actor: Actor,
): Promise<Result<readonly LinkReportRecord[]>> {
  return store.installation(actor, async (tx) => {
    if (!(await permitted(tx, actor, 'list-reports')))
      return fail<readonly LinkReportRecord[]>('forbidden');
    return ok(await tx.reports());
  });
}

/** Closes one open report and keeps its link, for an administrator. */
export function dismissReport(
  store: InstallationStore,
  actor: Actor,
  reportId: string,
): Promise<Result<void>> {
  return store.installation(actor, async (tx) => {
    if (!(await permitted(tx, actor, 'close-report')))
      return fail<void>('forbidden');
    return (await tx.dismissReport(reportId))
      ? ok(undefined)
      : fail<void>('not_found');
  });
}

/**
 * Takes down the link of one open report, for an administrator (0119).
 *
 * The takedown revokes the link and adds no membership, so the administrator
 * still reads no note of the workspace. The owner cannot make it live again.
 */
export function takeDownReportedLink(
  store: InstallationStore,
  actor: Actor,
  reportId: string,
): Promise<Result<void>> {
  return store.installation(actor, async (tx) => {
    if (!(await permitted(tx, actor, 'take-down')))
      return fail<void>('forbidden');
    return (await tx.takeDown(reportId))
      ? ok(undefined)
      : fail<void>('not_found');
  });
}

/** The registration policy, for an administrator. */
export function readRegistrationPolicy(
  store: InstallationStore,
  actor: Actor,
): Promise<Result<RegistrationPolicy>> {
  return store.installation(actor, async (tx) => {
    if (!(await permitted(tx, actor, 'change-policy')))
      return fail<RegistrationPolicy>('forbidden');
    return ok(await tx.registrationPolicy());
  });
}

/**
 * Changes the registration policy, for an administrator.
 *
 * The open policy needs every part that record 0114 names. The transport
 * states what the installation has, and the answer is
 * `open_registration_unavailable` while one part is missing, so no
 * installation opens to strangers before it can verify an address.
 */
export function setRegistrationPolicy(
  store: InstallationStore,
  actor: Actor,
  policy: string,
  readiness: OpenRegistrationReadiness,
): Promise<Result<RegistrationPolicy>> {
  return store.installation(actor, async (tx) => {
    if (!(await permitted(tx, actor, 'change-policy')))
      return fail<RegistrationPolicy>('forbidden');
    const known = registrationPolicies.find((entry) => entry === policy);
    if (known === undefined) return fail<RegistrationPolicy>('forbidden');
    if (known === 'open' && openRegistrationMissing(readiness).length > 0)
      return fail<RegistrationPolicy>('open_registration_unavailable');
    await tx.setRegistrationPolicy(known);
    return ok(known);
  });
}
