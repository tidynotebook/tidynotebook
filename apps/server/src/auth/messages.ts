/** Every server email, from one content value for both parts (record 0232). */
import { productName } from '@notesapp/core';
import { renderEmail, type EmailContent } from './email-template.ts';
import { emailLogoImages } from './email-logo.ts';
import type { MailMessage } from './mail.ts';

/** The host of the installation, from configuration rather than a request. */
export function installationHost(origin: string): string {
  return new URL(origin).host;
}

/** A time in hours, using whole days where possible. */
export function lifetimeWords(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? '1 day' : `${String(days)} days`;
  }
  return hours === 1 ? '1 hour' : `${String(hours)} hours`;
}

type MessageInput = {
  readonly to: string;
  readonly origin: string;
  readonly supportUrl?: string | null;
};
type LinkInput = MessageInput & {
  readonly link: string;
  readonly lifetimeHours: number;
};

function keepTogether(value: string): string {
  return value.replaceAll(' ', '\u00a0');
}

function utcDate(instant: string): string {
  return keepTogether(
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(instant)),
  );
}

function signature(origin: string): string {
  return `${keepTogether(productName)} at ${installationHost(origin)}`;
}

function message(
  input: MessageInput,
  subject: string,
  content: EmailContent,
): MailMessage {
  return {
    to: input.to,
    subject: subject.replaceAll('\u00a0', ' '),
    inlineImages: emailLogoImages,
    ...renderEmail({
      ...input,
      subject,
      content,
      footer: {
        attribution: `Sent by ${signature(input.origin)} because ${content.reason}.`,
        receipt: `You're receiving this email because ${content.reason}.`,
        installationName: signature(input.origin),
        help: content.providerSupport
          ? 'For help, contact support at your provider.'
          : 'For help, contact your installation administrator.',
        supportIntro: 'For help, ',
        supportLabel: keepTogether('contact support'),
        linkFallback:
          'Button not working? Copy and paste this link into your browser:',
        automatic: "This is an automated email, so replies aren't read.",
      },
    }),
  };
}

/** A new invitation, with a sender name only when the sender already has it. */
export function invitationMessage(
  input: LinkInput & { readonly inviterName?: string | null },
): MailMessage {
  const name = signature(input.origin);
  const inviter = input.inviterName?.trim();
  const lifetime = `The link works once, for ${lifetimeWords(input.lifetimeHours)}.`;
  return message(input, `Your invitation to ${name}`, {
    label: 'Invitation',
    heading: `You're invited to ${keepTogether(productName)}`,
    preview: `Choose a password to create your account. ${lifetime}`,
    paragraphs: [
      inviter
        ? `${inviter} invited you to create an account on ${name}.`
        : `You're invited to create an account on ${name}.`,
      'Write in Markdown, keep drafts offline, and use version history to return to earlier work.',
      "Choose a password to accept your invitation. This link is just for you, so don't share it.",
    ],
    action: { label: 'Accept invitation', url: input.link },
    lifetime,
    panel: "If you don't want an account, you can ignore this email.",
    reason: inviter
      ? `${inviter} invited you to create an account`
      : 'an administrator invited you to create an account',
  });
}

/** Address verification for an open sign-up. */
export function verificationMessage(input: LinkInput): MailMessage {
  const name = signature(input.origin);
  const lifetime = `The link works for ${lifetimeWords(input.lifetimeHours)}.`;
  return message(input, `Confirm your email address on ${name}`, {
    label: 'Confirm your email',
    heading: 'Confirm your email address',
    preview: `Confirm your email address to start. ${lifetime}`,
    paragraphs: [
      `Someone asked to create an account on ${name} with this email address.`,
      'Write in Markdown, keep drafts offline, and use version history to return to earlier work.',
      'Confirm that the address is yours to finish creating your account.',
    ],
    action: { label: 'Confirm email address', url: input.link },
    lifetime,
    panel:
      "If you didn't ask for an account, you can ignore this email. No account is created unless you confirm.",
    reason: 'someone asked to create an account with this email address',
  });
}

/** A sign-up attempt with an address that already has an account. */
export function signUpAttemptMessage(input: MessageInput): MailMessage {
  const name = signature(input.origin);
  return message(
    input,
    `Someone tried to create an account on ${name} with your address`,
    {
      label: 'Account notice',
      heading: 'You already have an account',
      preview: 'A new sign-up used your address. Your account has not changed.',
      paragraphs: [
        `Someone asked to create a new account on ${name} with this email address. You already have an account, so nothing changed.`,
        `Sign in with your existing account. If you don't remember your password, select ${keepTogether('Forgot password')}.`,
      ],
      action: { label: 'Sign in', url: `${input.origin}/login` },
      panel:
        "If this wasn't you, you can ignore this email. Your account is safe.",
      reason: 'someone tried to sign up with your email address',
    },
  );
}

/** A password reset link. */
export function passwordResetMessage(input: LinkInput): MailMessage {
  const name = signature(input.origin);
  const lifetime = `The link works once, for ${lifetimeWords(input.lifetimeHours)}.`;
  return message(input, `Reset your password on ${name}`, {
    label: 'Password reset',
    heading: 'Reset your password',
    preview: `Choose a new password. ${lifetime}`,
    paragraphs: [
      `Someone asked to reset the password for your account on ${name}.`,
      "Choose a new password with the link below. This link is just for you, so don't share it.",
    ],
    action: { label: 'Choose a new password', url: input.link },
    lifetime,
    panel:
      "If you didn't ask for a new password, you can ignore this email. Your password stays the same.",
    reason: 'someone asked to reset your password',
  });
}

/** Confirmation with the time recorded by the password reset callback. */
export function passwordChangedMessage(
  input: MessageInput & { readonly changedAt: string },
): MailMessage {
  const name = signature(input.origin);
  const date = utcDate(input.changedAt);
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(new Date(input.changedAt));
  const changedAt = keepTogether(`${date} at ${time} UTC`);
  return message(input, `Your password on ${name} was changed`, {
    label: 'Security notice',
    heading: 'Your password was changed',
    warning: true,
    preview: "Your password was changed. If this wasn't you, reset it now.",
    paragraphs: [
      `The password for your account on ${name} was changed on ${changedAt}. All devices that were signed in have been signed out.`,
      "If you didn't make this change, reset your password now.",
    ],
    action: {
      label: 'Reset your password',
      url: `${input.origin}/forgot-password`,
    },
    panel: 'If you made this change, you can ignore this email.',
    reason: 'the password for your account was changed',
  });
}

/** An administrator checks mail delivery and both message parts. */
export function testMessage(input: MessageInput): MailMessage {
  const name = signature(input.origin);
  return message(input, `Test email from ${name}`, {
    label: 'Test email',
    heading: 'Your test email arrived',
    preview:
      'Check that the formatted email and its plain text version both read well.',
    paragraphs: [
      `This email checks the mail settings of ${name}.`,
      'Your mail settings work, so invitations and password resets will be delivered.',
      'This email has a formatted version and a plain text version. Check both in your mail application.',
    ],
    action: { label: 'Open your notebook', url: `${input.origin}/` },
    panel:
      "If this email landed in spam, check the sender address and your domain's SPF, DKIM and DMARC records.",
    reason: 'an administrator requested a test email to this address',
  });
}

/** A warning that uses the actual scheduled removal instant, in UTC. */
export function removalNoticeMessage(
  input: MessageInput & {
    readonly days: number;
    readonly removalAt: string;
    readonly portal: boolean;
  },
): MailMessage {
  const name = signature(input.origin);
  const when = lifetimeWords(input.days * 24);
  const date = utcDate(input.removalAt);
  return message(input, `Your account on ${name} will be deleted in ${when}`, {
    label: 'Account removal',
    heading: `Your account will be deleted on ${date}`,
    preview: `Your locked account and its notes will be permanently deleted on ${date}.`,
    warning: true,
    providerSupport: input.portal,
    paragraphs: [
      `Your account on ${installationHost(input.origin)} is locked. On\u00a0${date} the account and all its notes will be permanently deleted.`,
      input.portal
        ? 'To keep your account, sign in and open Billing to start or renew your plan.'
        : 'To keep your account, ask your administrator to unlock it.',
      `To download your notes, sign in and select ${keepTogether('Export my notes')}.`,
    ],
    action: {
      label: input.portal
        ? 'Sign in to renew your plan'
        : 'Sign in to export your notes',
      url: `${input.origin}/login`,
    },
    panel: "If you don't need this account, you don't have to do anything.",
    reason: 'your locked account is scheduled for deletion',
  });
}

/** A workspace invitation can be used by a member with an existing account. */
export function workspaceInvitationMessage(
  input: LinkInput & {
    readonly workspaceName: string;
    readonly inviterName: string | null;
  },
): MailMessage {
  const inviter = input.inviterName?.trim();
  const lifetime = 'The link works once, for 7 days.';
  return message(input, 'Your workspace invitation', {
    label: 'Workspace invitation',
    heading: `Join ${input.workspaceName}`,
    preview: `Open the invitation to join ${input.workspaceName}.`,
    paragraphs: [
      inviter
        ? `${inviter} invited you to join ${input.workspaceName}.`
        : `You have an invitation to join ${input.workspaceName}.`,
      'Sign in with this email address or create an account to join.',
    ],
    action: { label: 'Open invitation', url: input.link },
    lifetime,
    panel: 'If you do not want to join, you can ignore this email.',
    reason: 'someone invited you to a workspace',
  });
}
