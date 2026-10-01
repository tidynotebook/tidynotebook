/**
 * The mail transport of the server.
 *
 * The transport comes from `NOTESAPP_SMTP_URL`, or from the settings that an
 * administrator sets in the application (record 0148).
 * `installation-settings.ts` decides which one applies, and every sender
 * reads a `Mailer`, which asks that decider at each message. An installation
 * with neither has no transport: recovery by email is then disabled and the
 * documented path is the operator command `pnpm account:recover`.
 *
 * This module never writes an address, a subject, a password or a token to a
 * log. `messages.ts` writes the words of every message.
 */
import { createTransport } from 'nodemailer';
import type { StoredMailSettings } from '@notesapp/core';
import type { MailConfig } from '../config.ts';

/** One message that the server sends. */
export type MailMessage = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
};

/** Sends one message. */
export type MailTransport = {
  send(message: MailMessage): Promise<void>;
};

/**
 * The transport that applies at the moment of a message.
 *
 * `available` answers whether a message can go now. `send` throws
 * `MailUnavailableError` when none can, so a caller that must not drop a
 * message learns it.
 */
export type Mailer = MailTransport & {
  available(): Promise<boolean>;
  /**
   * The transport that applies now, or `null`. An operation that decides
   * whether a message goes and then sends it takes the transport once, so a
   * change of the settings in between cannot split the two.
   */
  current(): Promise<MailTransport | null>;
};

/** The failure of a message when the installation has no transport. */
export class MailUnavailableError extends Error {
  constructor() {
    super('notesapp: the installation has no mail transport.');
    this.name = 'MailUnavailableError';
  }
}

/** The mailer of a process with no transport, such as an operator command. */
export const noMailer: Mailer = {
  available: () => Promise.resolve(false),
  current: () => Promise.resolve(null),
  send: () => Promise.reject(new MailUnavailableError()),
};

/** The mail settings of the application, with the password opened. */
export type ApplicationMail = Omit<StoredMailSettings, 'passwordSealed'> & {
  readonly password: string | null;
};

/**
 * The longest waits of one message, in milliseconds. A mail server that does
 * not answer must not hold a test message or the stop of the process for the
 * two minutes that the library waits by default.
 */
const mailTimeouts = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 30_000,
} as const;

/** What the transport library receives for the mail of the application. */
export function transportOptions(mail: ApplicationMail): {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly requireTLS: boolean;
  readonly ignoreTLS: boolean;
  readonly auth?: { readonly user: string; readonly pass: string };
  readonly connectionTimeout: number;
  readonly greetingTimeout: number;
  readonly socketTimeout: number;
} {
  return {
    host: mail.host.startsWith('[') ? mail.host.slice(1, -1) : mail.host,
    port: mail.port,
    // TLS from the first byte, an upgrade that must happen, or no protection
    // at all, so a STARTTLS server that drops the upgrade sends nothing.
    secure: mail.security === 'tls',
    requireTLS: mail.security === 'starttls',
    ignoreTLS: mail.security === 'none',
    ...(mail.username === null
      ? {}
      : { auth: { user: mail.username, pass: mail.password ?? '' } }),
    ...mailTimeouts,
  };
}

/** Builds the transport of the mail settings of the application. */
export function connectMailTransport(mail: ApplicationMail): MailTransport {
  const transport = createTransport(transportOptions(mail));
  return {
    async send(message: MailMessage): Promise<void> {
      await transport.sendMail({ ...envelopeOf(mail.sender, message) });
    },
  };
}

/** The kind of a failed message, which an administrator can act on. */
export type MailFailureReason =
  | 'unavailable'
  | 'connection'
  | 'authentication'
  | 'security'
  | 'sender'
  | 'other';

/** Reads a member of an unknown error value. */
function errorMember(error: unknown, key: string): unknown {
  if (error === null || typeof error !== 'object') return undefined;
  return Object.fromEntries(Object.entries(error))[key];
}

/**
 * The kind of one failure of the transport library.
 *
 * The answer of a mail server can name an address or a host, so only the
 * kind leaves this function.
 */
export function mailFailureReason(error: unknown): MailFailureReason {
  if (error instanceof MailUnavailableError) return 'unavailable';
  const code = errorMember(error, 'code');
  const responseCode = errorMember(error, 'responseCode');
  // The message of an `Error` is an own property that is not enumerable, so
  // it is read directly. It reaches only the test below, never an answer.
  const message =
    error instanceof Error ? error.message : errorMember(error, 'message');
  const text = typeof message === 'string' ? message : '';
  if (code === 'EAUTH' || responseCode === 535) return 'authentication';
  if (code === 'ETLS' || /ssl|tls|certificate|wrong version/i.test(text))
    return 'security';
  if (code === 'EENVELOPE' || responseCode === 550 || responseCode === 553)
    return 'sender';
  if (
    code === 'ECONNECTION' ||
    code === 'ETIMEDOUT' ||
    code === 'EDNS' ||
    code === 'ESOCKET' ||
    code === 'ECONNREFUSED'
  )
    return 'connection';
  return 'other';
}

/**
 * The headers of every message.
 *
 * Each message is written by a program in answer to an event, so it says so
 * (RFC 3834). A vacation responder then does not answer it, and a mail server
 * of Microsoft does not send an automatic reply either.
 */
export const automaticHeaders: Readonly<Record<string, string>> = {
  'Auto-Submitted': 'auto-generated',
  'X-Auto-Response-Suppress': 'All',
};

/** What the transport library receives for one message. */
export function envelopeOf(
  from: string,
  message: MailMessage,
): {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly headers: Readonly<Record<string, string>>;
} {
  return {
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    headers: automaticHeaders,
  };
}

/**
 * Builds the transport of `NOTESAPP_SMTP_URL`, or `null` when the
 * environment names none.
 *
 * A test supplies its own transport instead, so no integration check needs a
 * mail server.
 */
export function createMailTransport(
  mail: MailConfig | null,
): MailTransport | null {
  if (mail === null) return null;
  const transport = createTransport(mail.smtpUrl);
  return {
    async send(message: MailMessage): Promise<void> {
      await transport.sendMail({ ...envelopeOf(mail.from, message) });
    },
  };
}

/**
 * A transport that sends a message only while its address has budget left
 * (record 0141).
 *
 * A person with no session can cause a message to any address: a sign-up, a
 * repeated sign-up and a password reset. Each of those goes through this one
 * transport, so no sender can skip the budget. A message over the budget is
 * dropped in silence, because the answer to the person who caused it must
 * stay the same whatever the address is.
 */
export function budgetedTransport(
  mailer: Mailer,
  mayMail: (address: string) => Promise<boolean>,
): Mailer {
  /** One transport under the budget of each address. */
  const budgeted = (transport: MailTransport): MailTransport => ({
    async send(message: MailMessage): Promise<void> {
      if (!(await mayMail(message.to))) return;
      await transport.send(message);
    },
  });
  return {
    available: () => mailer.available(),
    async current(): Promise<MailTransport | null> {
      const transport = await mailer.current();
      return transport === null ? null : budgeted(transport);
    },
    send: (message) => budgeted(mailer).send(message),
  };
}
