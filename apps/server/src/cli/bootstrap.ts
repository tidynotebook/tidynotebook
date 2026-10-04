/**
 * The one-time bootstrap command, `pnpm owner:bootstrap`.
 *
 * An installation needs one way to make its first account without a browser.
 * The command makes it through the one registration path with the first-run
 * ground (record 0108), so it makes an administrator, and it refuses to run
 * when an account exists. Every later account comes in through an invitation,
 * which `pnpm account:invite` makes.
 *
 * The password comes from a protected file or from a hidden prompt. It never
 * travels in a command argument and it is never written to standard output.
 */
import process from 'node:process';
import {
  createDocumentService,
  openIdentityStore,
  openWorkspaceStore,
} from '@notesapp/storage-server';
import type { ServerConfig } from '../config.ts';
import { createAuth } from '../auth/better-auth.ts';
import { registerIdentity } from '../auth/registration.ts';
import { seedWelcomeNote } from '../auth/welcome-note.ts';
import { loadProtectedEnvironment, loadServerConfig } from '../config.ts';
import { assertNewPassword, readArgument, readSecret } from './prompt.ts';

/** What the bootstrap command created. */
export type BootstrapResult = {
  /** Identifier of the account inside the identity provider. */
  readonly authUserId: string;
  /** Application account identifier. */
  readonly accountId: string;
  /** Sign-in address of the first account. */
  readonly email: string;
};

/** What the bootstrap command needs. */
export type BootstrapInput = {
  readonly config: ServerConfig;
  readonly email: string;
  readonly name: string;
  readonly password: string;
};

/**
 * Creates the first account and its personal workspace.
 *
 * The account, the map row, the personal workspace, its usage record, its
 * cursor, and the owner membership are written by the one registration
 * function, so a failure leaves no half created account.
 */
export async function bootstrapOwner(
  input: BootstrapInput,
): Promise<BootstrapResult> {
  assertNewPassword(input.password);
  const identity = openIdentityStore(input.config.databaseUrl, { poolSize: 2 });
  const content = openWorkspaceStore(
    input.config.databaseUrl,
    createDocumentService(),
    { poolSize: 2 },
  );
  // The command starts no session, so the hook refuses every one.
  const auth = createAuth(input.config, {
    mail: null,
    allowSignUp: true,
    sessionAllowed: () => Promise.resolve(false),
  });
  try {
    if (await identity.hasAccount())
      throw new Error('notesapp: the first account already exists.');
    // The check above runs outside the write, so it can only report early.
    // The registration function decides: it takes the installation lock and
    // makes the first account only while no account exists.
    const made = await registerIdentity(auth.auth, identity, {
      email: input.email,
      name: input.name,
      password: input.password,
      ground: { kind: 'first-run' },
      newAccount: input.config.accounts,
    });
    if (!made.ok)
      throw new Error(
        made.error.code === 'password_breached'
          ? 'notesapp: that password is in a list of leaked passwords. Choose another one.'
          : 'notesapp: the first account already exists.',
      );
    const [membership] = await identity.memberships(made.value.accountId);
    if (membership !== undefined)
      await seedWelcomeNote(
        content,
        made.value.accountId,
        membership.workspaceId,
      );
    return {
      authUserId: made.value.authUserId,
      accountId: made.value.accountId,
      email: made.value.email,
    };
  } finally {
    await auth.close();
    await content.close();
    await identity.close();
  }
}

/** The command entry point. */
export async function main(argv: readonly string[]): Promise<void> {
  const email = readArgument(argv, 'email');
  const name = readArgument(argv, 'name') ?? 'Owner';
  if (email === null)
    throw new Error('notesapp: pass --email <address> for the first account.');
  const password = await readSecret(
    {
      fileVariable: 'NOTESAPP_BOOTSTRAP_PASSWORD_FILE',
      label: 'Password for the first account: ',
    },
    process.env,
    { input: process.stdin, output: process.stderr },
  );
  const config = loadServerConfig(await loadProtectedEnvironment(process.env));
  const result = await bootstrapOwner({ config, email, name, password });
  // The address and the identifiers are operator data. The password is not
  // repeated anywhere.
  process.stdout.write(
    `notesapp: created the first account ${result.email} (${result.accountId}) and its personal workspace\n`,
  );
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'notesapp: the bootstrap failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
