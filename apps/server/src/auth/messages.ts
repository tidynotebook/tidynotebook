/**
 * Every message that the server sends (record 0141).
 *
 * One module writes the words of each message, so every message names the
 * product and the installation the same way and follows one set of rules:
 *
 * - The body is plain text. It holds no remote picture and no tracking link,
 *   and every mail program shows it as it is.
 * - The subject and the first line name the product and the host of the
 *   installation, so a person knows which server wrote to them.
 * - A link stands alone on its line, so a mail program can open it.
 * - A time is a whole phrase with its count, for example `1 hour` and
 *   `7 days`.
 * - A message that a person did not ask for says what to do, which is often
 *   nothing.
 *
 * No function here sends a message or reads a store. `mail.ts` sends, and the
 * caller decides whether a message goes at all.
 */
import type { MailMessage } from './mail.ts';

/** The name of the product, in its own case. */
export const productName = 'NotesApp';

/** The host of the installation, as a person reads it in a message. */
export function installationHost(origin: string): string {
  return new URL(origin).host;
}

/** How a person reads a life in hours: whole days when it is some. */
export function lifetimeWords(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? '1 day' : `${String(days)} days`;
  }
  return hours === 1 ? '1 hour' : `${String(hours)} hours`;
}

/** The name of the installation in a subject and a signature. */
function signature(origin: string): string {
  return `${productName} at ${installationHost(origin)}`;
}

/** Joins the paragraphs of one body, with one empty line between two. */
function body(paragraphs: readonly string[]): string {
  return `${paragraphs.join('\n\n')}\n`;
}

/** The message that carries the link of one invitation (record 0108). */
export function invitationMessage(input: {
  readonly to: string;
  readonly origin: string;
  readonly link: string;
  readonly lifetimeHours: number;
}): MailMessage {
  const name = signature(input.origin);
  return {
    to: input.to,
    subject: `Your invitation to ${name}`,
    text: body([
      `You have an invitation to make an account on ${name}.`,
      `Open this link to choose a password:\n${input.link}`,
      `The link works once, for ${lifetimeWords(input.lifetimeHours)}.`,
      'If you do not want an account, ignore this message.',
      `-- \n${name}`,
    ]),
  };
}

/** The message that proves the address of an open sign-up (record 0114). */
export function verificationMessage(input: {
  readonly to: string;
  readonly origin: string;
  readonly link: string;
  readonly lifetimeHours: number;
}): MailMessage {
  const name = signature(input.origin);
  return {
    to: input.to,
    subject: `Finish your account on ${name}`,
    text: body([
      `Somebody asked for an account on ${name} with this address.`,
      `Open this link to prove that the address is yours and finish the account:\n${input.link}`,
      `The link works for ${lifetimeWords(input.lifetimeHours)}.`,
      'If you did not ask for an account, ignore this message. Without the link, no account is made.',
      `-- \n${name}`,
    ]),
  };
}

/**
 * The message to the owner of an address that already has an account, after
 * a sign-up with that address (record 0114). It changes nothing, so it says
 * how to sign in and how to get a new password.
 */
export function signUpAttemptMessage(input: {
  readonly to: string;
  readonly origin: string;
}): MailMessage {
  const name = signature(input.origin);
  return {
    to: input.to,
    subject: `Somebody tried to make an account on ${name} with your address`,
    text: body([
      `Somebody asked for a new account on ${name} with this address. The address already has an account, so nothing changed.`,
      `To sign in, open this page:\n${input.origin}/login`,
      'If you do not know your password, select Forgot password on that page.',
      'If you asked for the account yourself, you already have one. Otherwise, ignore this message.',
      `-- \n${name}`,
    ]),
  };
}

/** The message that carries the link of a password reset (record 0141). */
export function passwordResetMessage(input: {
  readonly to: string;
  readonly origin: string;
  readonly link: string;
  readonly lifetimeHours: number;
}): MailMessage {
  const name = signature(input.origin);
  return {
    to: input.to,
    subject: `Reset your password on ${name}`,
    text: body([
      `Somebody asked to reset the password of your account on ${name}.`,
      `Open this link to choose a new password:\n${input.link}`,
      `The link works once, for ${lifetimeWords(input.lifetimeHours)}.`,
      'If you did not ask for a new password, ignore this message. Your password does not change.',
      `-- \n${name}`,
    ]),
  };
}

/** The notice after a password reset (record 0141). */
export function passwordChangedMessage(input: {
  readonly to: string;
  readonly origin: string;
}): MailMessage {
  const name = signature(input.origin);
  return {
    to: input.to,
    subject: `Your password on ${name} changed`,
    text: body([
      `The password of your account on ${name} changed. Every device that was signed in is signed out.`,
      'If you changed it, you need to do nothing.',
      `If you did not change it, reset your password at once on this page, and then tell an administrator:\n${input.origin}/forgot-password`,
      `-- \n${name}`,
    ]),
  };
}

/**
 * The message that an administrator sends to check the mail transport
 * (record 0148).
 */
export function testMessage(input: {
  readonly to: string;
  readonly origin: string;
}): MailMessage {
  const name = signature(input.origin);
  return {
    to: input.to,
    subject: `Test message from ${name}`,
    text: body([
      `This message checks the mail settings of ${name}.`,
      'It arrived, so invitations, sign-up links and password resets can reach a person too.',
      'If it is in your spam folder, check the SPF, DKIM and DMARC records of the domain of the sender.',
      `-- \n${name}`,
    ]),
  };
}
