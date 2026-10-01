/**
 * The mail transport and the legal documents that an administrator sets
 * (record 0148).
 *
 * The one row of the installation settings holds both. The server
 * environment can set either group too, and a group that it sets wins and is
 * locked. `InstallationEnvironment` states what the environment sets, so a
 * use case refuses a write to a locked group and computes what open
 * registration has from both sources in the transaction of the change.
 *
 * The password of the mail server reaches this module sealed. The server
 * seals and opens it, because the key is a secret of the server and this
 * package holds no cipher.
 */
import { fail, ok, type Result } from '../files/model.ts';
import type { Actor } from './actor.ts';
import { maxLegalVersionLength } from './legal.ts';
import type { InstallationStore, InstallationTransaction } from './ports.ts';
import { mayAdminister, type InstallationAction } from './installation.ts';
import {
  normalizeEmail,
  openRegistrationMissing,
  type OpenRegistrationReadiness,
} from './registration.ts';

/** How the connection to the mail server is protected. */
export type MailSecurity = 'tls' | 'starttls' | 'none';

/** Every security mode, for a transport that narrows a stored text. */
export const mailSecurities: readonly MailSecurity[] = [
  'tls',
  'starttls',
  'none',
];

/** The mail transport that an administrator set. */
export type StoredMailSettings = {
  readonly host: string;
  readonly port: number;
  readonly security: MailSecurity;
  /** The user name that signs in, or `null` for a server with no sign-in. */
  readonly username: string | null;
  /** The sealed password of the user name, or `null` for none. */
  readonly passwordSealed: string | null;
  /** The sender of every message. */
  readonly sender: string;
};

/** The name of one legal document, as its page takes it. */
export type LegalDocumentName = 'terms' | 'privacy';

/** Both legal documents, in the order of a page. */
export const legalDocumentNames: readonly LegalDocumentName[] = [
  'terms',
  'privacy',
];

/** One legal document that an administrator set. */
export type StoredLegalDocument =
  | {
      readonly kind: 'text';
      readonly text: string;
      readonly version: string;
    }
  | {
      readonly kind: 'address';
      readonly url: string;
      readonly version: string;
    };

/** The settings row as the application holds it. */
export type StoredInstallationSettings = {
  readonly mail: StoredMailSettings | null;
  readonly terms: StoredLegalDocument | null;
  readonly privacy: StoredLegalDocument | null;
};

/** No setting at all, the row of a new installation. */
export const emptyInstallationSettings: StoredInstallationSettings = {
  mail: null,
  terms: null,
  privacy: null,
};

/**
 * What the server environment sets, and what the server can use. A group
 * that the environment sets is locked, and a published origin comes from the
 * environment only (record 0118).
 *
 * `mailUsable` answers whether the server can send with a stored transport.
 * The password of a transport is sealed with a key of the server, so a stored
 * transport whose password this key cannot open, after a change of the
 * server secret, sends nothing and counts as no transport.
 */
export type InstallationEnvironment = OpenRegistrationReadiness & {
  readonly mailUsable: (mail: StoredMailSettings) => boolean;
};

/** The largest legal text, in bytes of UTF-8. */
export const maxLegalTextBytes = 256 * 1024;

/** The longest host name of the DNS. */
const maxHostLength = 253;

/** The longest sender and user name. */
const maxSenderLength = 320;

/** The longest password of a mail server. */
const maxMailPasswordLength = 1024;

/** What open registration has, from the environment and the stored row. */
export function settingsReadiness(
  environment: InstallationEnvironment,
  stored: StoredInstallationSettings,
): OpenRegistrationReadiness {
  return {
    mail:
      environment.mail ||
      (stored.mail !== null && environment.mailUsable(stored.mail)),
    publishedOrigin: environment.publishedOrigin,
    legalDocuments:
      environment.legalDocuments ||
      (stored.terms !== null && stored.privacy !== null),
  };
}

/** The bytes of a text in UTF-8, with no encoder. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * The characters of a text, as the contract and the database count them: one
 * for each code point, so a character outside the basic plane counts once.
 */
export function characterCount(text: string): number {
  return Array.from(text).length;
}

/** A blank of a template: a word or words in double braces. */
const templateBlank = /\{\{[^{}\n]*\}\}/g;

/** The distinct blanks of a template that a text still holds. */
export function templateBlanks(text: string): readonly string[] {
  return [...new Set(text.match(templateBlank) ?? [])];
}

/** The words of one blank, with no braces. */
export function blankLabel(blank: string): string {
  return blank.slice(2, -2).trim();
}

/**
 * The text with each blank that `values` names replaced by its value.
 *
 * A value is keyed by the blank with its braces. An empty value leaves its
 * blank, so a field that a person did not fill keeps its marker.
 */
export function fillBlanks(
  text: string,
  values: Readonly<Record<string, string>>,
): string {
  return text.replace(templateBlank, (blank) => {
    const value = values[blank]?.trim() ?? '';
    return value === '' ? blank : value;
  });
}

/**
 * A host name or an address of a mail server, or `null`.
 *
 * A scheme, a path, a port or a space is refused, so a pasted address does
 * not reach the transport as a host.
 */
export function mailHost(value: string): string | null {
  const host = value.trim().toLowerCase();
  if (host === '' || host.length > maxHostLength) return null;
  if (/^\[[0-9a-f:.]+\]$/.test(host)) return host;
  if (
    !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(
      host,
    )
  )
    return null;
  return host;
}

/**
 * A sender, `address` or `Name <address>`, or `null`.
 *
 * The name holds no angle bracket, no quote inside it and no line break, so
 * it cannot add a header to a message. A name in double quotes, as a mail
 * program copies it, loses its quotes.
 */
export function mailSender(value: string): string | null {
  const sender = value.trim();
  const length = characterCount(sender);
  if (length < 3 || length > maxSenderLength) return null;
  if (/[\r\n]/.test(sender)) return null;
  const named = /^(?:"([^<>"]*)"|([^<>"]*))\s*<([^<>\s]+)>$/.exec(sender);
  if (named !== null) {
    const name = (named[1] ?? named[2] ?? '').trim();
    const address = normalizeEmail(named[3] ?? '');
    if (address === null) return null;
    return name === '' ? address : `${name} <${address}>`;
  }
  if (/[<>"\s]/.test(sender)) return null;
  return normalizeEmail(sender);
}

/** The address part of a sender. */
export function senderAddress(sender: string): string {
  const named = /<([^<>\s]+)>$/.exec(sender);
  return named?.[1] ?? sender;
}

/** What an administrator sends to set the mail transport. */
export type MailSettingsInput = {
  readonly host: string;
  readonly port: number;
  readonly security: string;
  readonly username: string | null;
  /** The new password, or `null` to keep the stored one. */
  readonly password: string | null;
  readonly sender: string;
};

/** Why a mail setting was refused. */
export type MailSettingsProblem =
  'host' | 'port' | 'security' | 'username' | 'password' | 'sender';

/**
 * The mail settings of a valid input, with the password not yet sealed, or
 * the first field that is not valid.
 */
export function readMailSettings(input: MailSettingsInput):
  | {
      readonly ok: true;
      readonly value: Omit<StoredMailSettings, 'passwordSealed'> & {
        readonly password: string | null;
      };
    }
  | { readonly ok: false; readonly problem: MailSettingsProblem } {
  const host = mailHost(input.host);
  if (host === null) return { ok: false, problem: 'host' };
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)
    return { ok: false, problem: 'port' };
  const security = mailSecurities.find((entry) => entry === input.security);
  if (security === undefined) return { ok: false, problem: 'security' };
  const sender = mailSender(input.sender);
  if (sender === null) return { ok: false, problem: 'sender' };
  const username = input.username?.trim() ?? '';
  const password = input.password ?? '';
  // A credential past its bound is refused and never cut, because a cut
  // password signs in as another password.
  if (characterCount(username) > maxSenderLength)
    return { ok: false, problem: 'username' };
  if (characterCount(password) > maxMailPasswordLength)
    return { ok: false, problem: 'password' };
  return {
    ok: true,
    value: {
      host,
      port: input.port,
      security,
      username: username === '' ? null : username,
      password: username === '' || password === '' ? null : password,
      sender,
    },
  };
}

/** What an administrator sends to set one legal document. */
export type LegalDocumentInput = {
  readonly kind: string;
  readonly text: string | null;
  readonly url: string | null;
  readonly version: string;
};

/** A full http or https address, or `null`. */
export function documentAddress(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Why a legal document was refused. */
export type LegalDocumentProblem =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unfinished'; readonly blanks: readonly string[] };

/**
 * The legal document of a valid input, or why it is refused.
 *
 * A text that still holds a blank of the template is refused, so a person
 * never reads a document that the operator did not finish (record 0140).
 */
export function readLegalDocument(
  input: LegalDocumentInput,
):
  | { readonly ok: true; readonly value: StoredLegalDocument }
  | { readonly ok: false; readonly problem: LegalDocumentProblem } {
  const version = input.version.trim();
  if (version === '' || version.length > maxLegalVersionLength)
    return { ok: false, problem: { kind: 'invalid' } };
  if (input.kind === 'text') {
    const text = input.text ?? '';
    if (text.trim() === '' || utf8Length(text) > maxLegalTextBytes)
      return { ok: false, problem: { kind: 'invalid' } };
    const blanks = templateBlanks(text);
    if (blanks.length > 0)
      return { ok: false, problem: { kind: 'unfinished', blanks } };
    return { ok: true, value: { kind: 'text', text, version } };
  }
  if (input.kind === 'address') {
    const url = documentAddress(input.url ?? '');
    if (url === null) return { ok: false, problem: { kind: 'invalid' } };
    return { ok: true, value: { kind: 'address', url, version } };
  }
  return { ok: false, problem: { kind: 'invalid' } };
}

/** Whether the caller of a transaction may take one action. */
async function permitted(
  tx: InstallationTransaction,
  actor: Actor,
  action: InstallationAction,
): Promise<boolean> {
  return mayAdminister(await tx.standing(actor.accountId), action);
}

/** The stored settings, for an administrator. */
export function readInstallationSettings(
  store: InstallationStore,
  actor: Actor,
): Promise<Result<StoredInstallationSettings>> {
  return store.installation(actor, async (tx) => {
    if (!(await permitted(tx, actor, 'change-settings')))
      return fail<StoredInstallationSettings>('forbidden');
    return ok(await tx.settings());
  });
}

/**
 * Whether a removal leaves open registration without a part it needs
 * (record 0114). The check reads the row in the transaction of the change.
 */
async function removalBreaksOpen(
  tx: InstallationTransaction,
  environment: InstallationEnvironment,
  after: StoredInstallationSettings,
): Promise<boolean> {
  if ((await tx.registrationPolicy()) !== 'open') return false;
  return (
    openRegistrationMissing(settingsReadiness(environment, after)).length > 0
  );
}

/**
 * What a change does with the password of the mail server: keep the one that
 * the row holds, or store a new sealed one, `null` for none.
 */
export type MailPasswordChange =
  | { readonly kind: 'keep' }
  | { readonly kind: 'set'; readonly sealed: string | null };

/**
 * Sets the mail transport, for an administrator. A transport that the
 * environment sets is locked.
 */
export function setMailSettings(
  store: InstallationStore,
  actor: Actor,
  settings: Omit<StoredMailSettings, 'passwordSealed'>,
  password: MailPasswordChange,
  environment: InstallationEnvironment,
): Promise<Result<StoredInstallationSettings>> {
  return store.installation(actor, async (tx) => {
    if (!(await permitted(tx, actor, 'change-settings')))
      return fail<StoredInstallationSettings>('forbidden');
    if (environment.mail)
      return fail<StoredInstallationSettings>('setting_locked');
    const stored = await tx.settings();
    const kept =
      password.kind === 'keep'
        ? settings.username === null
          ? null
          : (stored.mail?.passwordSealed ?? null)
        : password.sealed;
    const mail: StoredMailSettings = { ...settings, passwordSealed: kept };
    await tx.setMailSettings(mail);
    return ok({ ...stored, mail });
  });
}

/** Removes the mail transport, for an administrator. */
export function removeMailSettings(
  store: InstallationStore,
  actor: Actor,
  environment: InstallationEnvironment,
): Promise<Result<StoredInstallationSettings>> {
  return store.installation(actor, async (tx) => {
    if (!(await permitted(tx, actor, 'change-settings')))
      return fail<StoredInstallationSettings>('forbidden');
    if (environment.mail)
      return fail<StoredInstallationSettings>('setting_locked');
    const after = { ...(await tx.settings()), mail: null };
    if (await removalBreaksOpen(tx, environment, after))
      return fail<StoredInstallationSettings>('setting_required');
    await tx.setMailSettings(null);
    return ok(after);
  });
}

/**
 * Sets or removes one legal document, for an administrator. `document` is
 * `null` for a removal. Documents that the environment sets are locked.
 */
export function setLegalDocument(
  store: InstallationStore,
  actor: Actor,
  name: LegalDocumentName,
  document: StoredLegalDocument | null,
  environment: InstallationEnvironment,
): Promise<Result<StoredInstallationSettings>> {
  return store.installation(actor, async (tx) => {
    if (!(await permitted(tx, actor, 'change-settings')))
      return fail<StoredInstallationSettings>('forbidden');
    if (environment.legalDocuments)
      return fail<StoredInstallationSettings>('setting_locked');
    const stored = await tx.settings();
    const after =
      name === 'terms'
        ? { ...stored, terms: document }
        : { ...stored, privacy: document };
    if (document === null && (await removalBreaksOpen(tx, environment, after)))
      return fail<StoredInstallationSettings>('setting_required');
    await tx.setLegalDocument(name, document);
    return ok(after);
  });
}
