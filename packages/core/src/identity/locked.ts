/**
 * The operations that a locked account keeps (record 0201).
 *
 * A locked account must still reach the portal that unlocks it, take its
 * notes out, and erase itself. This is the one list of what it keeps, by
 * operation id of the contract. Every other operation that a session reaches
 * answers `account_locked`, so a new operation is refused for a locked account
 * unless this list names it. `apps/server/src/auth/locked-operations.test.ts`
 * holds the list to the contract.
 */
export const lockedAccountOperations = [
  // The identity operations: sign-in, sign-out, the session, the password
  // reset, and the sessions of the account.
  'signInWithPassword',
  'signOut',
  'getAuthSession',
  'requestPasswordReset',
  'resetPassword',
  'listSessions',
  'revokeSession',
  'revokeOtherSessions',
  // The check of an address, which a sign-up needs before any account.
  'verifyAddress',
  // The consent to a new version of the legal documents (record 0120).
  'acceptLegalDocuments',
  // The read of its own account, controls and usage, and of its workspaces.
  'getAccount',
  'listWorkspaces',
  // The export of a workspace, and the check that comes before it.
  'inspectWorkspaceExport',
  'exportWorkspace',
  // The portal that unlocks the account (record 0190).
  'openAccountPortal',
  // The notice stream, so the open application sees the unlock.
  'openSyncNotices',
  // The removal of the account.
  'removeOwnAccount',
] as const;

/** Whether a locked account keeps one operation of the contract. */
export function lockedAccountKeeps(operationId: string): boolean {
  return lockedAccountOperations.some((kept) => kept === operationId);
}
