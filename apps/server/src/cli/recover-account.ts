/**
 * The operator recovery command, `pnpm account:recover`.
 *
 * An installation without a mail transport cannot send a reset link, so an
 * operator sets a new password directly. The command refuses to run when the
 * installation requires the configured provider, because a local password
 * would then be a way around that policy.
 *
 * The new password comes from a protected file or from a hidden prompt. Every
 * session of the account is revoked, and the change is recorded as a content
 * free audit event.
 */
import process from 'node:process';
import { openIdentityStore } from '@notesapp/storage-server';
import type { ServerConfig } from '../config.ts';
import { loadProtectedEnvironment, loadServerConfig } from '../config.ts';
import { checkBreach } from '../auth/breach-check.ts';
import { createAuth, pwnedRangeQuery } from '../auth/better-auth.ts';
import { assertNewPassword, readArgument, readSecret } from './prompt.ts';

/** What the recovery command changed. */
export type RecoveryResult = {
  /** Identifier of the account inside the identity provider. */
  readonly authUserId: string;
  /** Application account identifier, or `null` when none is linked yet. */
  readonly accountId: string | null;
  /** Sign-in address of the account. */
  readonly email: string;
};

/** What the recovery command needs. */
export type RecoveryInput = {
  readonly config: ServerConfig;
  readonly email: string;
  readonly password: string;
};

/**
 * Sets a new local password and revokes every session of that account.
 *
 * An account that has no local credential signs in through the configured
 * provider. Creating a password for it here would add a second way into the
 * account that the provider does not control, so the command refuses instead.
 */
export async function recoverAccount(
  input: RecoveryInput,
): Promise<RecoveryResult> {
  assertNewPassword(input.password);
  // The command sets the password without the library, so it runs the same
  // breach check itself (record 0116). No answer accepts the password.
  if (
    input.config.breachCheck &&
    (await checkBreach(input.password, pwnedRangeQuery)) === 'breached'
  )
    throw new Error(
      'notesapp: that password is in a list of leaked passwords. Choose another one.',
    );
  const identity = openIdentityStore(input.config.databaseUrl, { poolSize: 2 });
  // The command starts no session, so the hook refuses every one.
  const auth = createAuth(input.config, {
    mail: null,
    sessionAllowed: () => Promise.resolve(false),
  });
  try {
    const context = await auth.auth.$context;
    const found = await context.internalAdapter.findUserByEmail(input.email);
    if (found === null)
      throw new Error('notesapp: no account uses that address.');
    const credential = await context.internalAdapter.findCredentialAccount(
      found.user.id,
    );
    if (credential === null)
      throw new Error(
        'notesapp: that account has no local password. It signs in through the configured provider.',
      );
    await context.internalAdapter.updatePassword(
      found.user.id,
      await context.password.hash(input.password),
    );
    // A stolen session must not survive a recovery.
    await context.internalAdapter.deleteUserSessions(found.user.id);
    const accountId = await identity.accountOf(found.user.id);
    if (accountId !== null)
      await identity.recordAccountAudit(accountId, 'account.recover');
    return { authUserId: found.user.id, accountId, email: input.email };
  } finally {
    await auth.close();
    await identity.close();
  }
}

/** The command entry point. */
export async function main(argv: readonly string[]): Promise<void> {
  const email = readArgument(argv, 'email');
  if (email === null)
    throw new Error('notesapp: pass --email <address> of the account.');
  const password = await readSecret(
    {
      fileVariable: 'NOTESAPP_RECOVERY_PASSWORD_FILE',
      label: 'New password for the account: ',
    },
    process.env,
    { input: process.stdin, output: process.stderr },
  );
  const config = loadServerConfig(await loadProtectedEnvironment(process.env));
  const result = await recoverAccount({ config, email, password });
  process.stdout.write(
    `notesapp: set a new password for ${result.email} and revoked its sessions\n`,
  );
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'notesapp: the recovery failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
