/**
 * The operator invitation command, `pnpm account:invite`.
 *
 * An operator invites one address from a shell, as an administrator does in
 * the application (record 0108). The command makes the same invitation: the
 * link goes by mail when the installation has a mail transport, from the
 * environment or from the settings of the application (record 0148), and the
 * command prints it otherwise. The invited person opens the link, chooses a
 * password, and the account exists.
 */
import process from 'node:process';
import { normalizeEmail } from '@notesapp/core';
import { openIdentityStore } from '@notesapp/storage-server';
import type { ServerConfig } from '../config.ts';
import { loadProtectedEnvironment, loadServerConfig } from '../config.ts';
import { issueInvitation, mailInvitation } from '../auth/invitations.ts';
import { createMailTransport, type MailTransport } from '../auth/mail.ts';
import { createMailPasswordSeal } from '../auth/seal.ts';
import { createInstallationSettings } from '../installation-settings.ts';
import { readArgument } from './prompt.ts';

/** What the invitation command made. */
export type InviteResult = {
  readonly email: string;
  /** The link, or `null` when it went by mail. */
  readonly link: string | null;
  readonly expiresAt: string;
};

/** Makes one invitation for one address. */
export async function inviteAccount(input: {
  readonly config: ServerConfig;
  readonly email: string;
  /**
   * The mail transport of the environment. The configured one when it is
   * not given. Without one, the settings of the application decide.
   */
  readonly mail?: MailTransport | null;
  readonly now?: Date;
}): Promise<InviteResult> {
  const email = normalizeEmail(input.email);
  if (email === null)
    throw new Error('notesapp: pass one sign-in address with --email.');
  const lifetimeHours = input.config.accounts.invitationLifetimeHours;
  const identity = openIdentityStore(input.config.databaseUrl, { poolSize: 1 });
  try {
    const settings = createInstallationSettings({
      config: input.config,
      reader: identity,
      environmentMail:
        input.mail === undefined
          ? createMailTransport(input.config.mail)
          : input.mail,
      environmentTexts: { terms: null, privacy: null },
      passwordSeal: createMailPasswordSeal(input.config.authSecret),
    });
    const mailed = await settings.mailer.available();
    const issued = issueInvitation({
      origin: input.config.origin,
      email,
      lifetimeHours,
      mailed,
      now: input.now ?? new Date(),
    });
    const stored = await identity.operatorInvite(issued.record);
    if (stored === null)
      throw new Error(
        'notesapp: an account already signs in with that address.',
      );
    if (mailed)
      await mailInvitation(settings.mailer, {
        origin: input.config.origin,
        email,
        link: issued.link,
        lifetimeHours,
      });
    return {
      email,
      link: mailed ? null : issued.link,
      expiresAt: issued.record.expiresAt,
    };
  } finally {
    await identity.close();
  }
}

/** The command entry point. */
export async function main(argv: readonly string[]): Promise<void> {
  const email = readArgument(argv, 'email');
  if (email === null)
    throw new Error(
      'notesapp: pass --email <address> of the person to invite.',
    );
  const config = loadServerConfig(await loadProtectedEnvironment(process.env));
  const result = await inviteAccount({ config, email });
  // The link is the secret of the invitation. It goes to standard output
  // once, for the operator to pass on, and to no log.
  process.stdout.write(
    result.link === null
      ? `notesapp: mailed an invitation to ${result.email}. It expires at ${result.expiresAt}.\n`
      : `notesapp: invited ${result.email}. Send this link to the person. It expires at ${result.expiresAt}.\n${result.link}\n`,
  );
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'notesapp: the invitation failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
