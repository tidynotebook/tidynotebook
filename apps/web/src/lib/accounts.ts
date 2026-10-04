/**
 * What the account screens show and offer (records 0108 to 0112).
 *
 * The accounts page of an administrator, the page that accepts an
 * invitation, and the account section of Settings read every word, every
 * fact of a row, and every offered action from here, so a rule that decides
 * what a person sees has one unit test and no screen repeats it.
 *
 * The interface hides an action that would fail. That is a courtesy and not
 * the guarantee: the server and the database refuse the same change
 * (record 0110).
 */
import type { AccountSummary, Invitation } from '@notesapp/api-client';
import type { OpenRegistrationPart } from '@notesapp/core';
import { relativeTime } from './relative-time.ts';

/** The title of the accounts page, which is also its breadcrumb part. */
export const accountsTitle = 'Accounts';

/**
 * The path of the page that accepts an invitation. The server writes the
 * same path into every invitation link, in
 * `apps/server/src/auth/invitations.ts`.
 */
export const invitationRoute = '/invitation';

/** The problem with a display name, or `null` when it can be saved. */
export function profileNameProblem(value: string): string | null {
  const name = value.trim();
  if (name === '') return 'Enter a name.';
  if (Array.from(name).length > 256)
    return 'Use a name with no more than 256 characters.';
  return null;
}

/** The shape of an invitation token, as the contract states it. */
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

/**
 * The token of an invitation link, or `null` when the fragment holds none.
 *
 * The token travels in the fragment, so no server log and no `Referer`
 * header holds it.
 */
export function invitationTokenOf(hash: string): string | null {
  const token = hash.startsWith('#') ? hash.slice(1) : hash;
  return tokenPattern.test(token) ? token : null;
}

/**
 * The words of each part that open registration needs (records 0114 and
 * 0191). The type of the core holds the keys, so a part that the core adds or
 * drops fails the type check here.
 */
const words: Readonly<Record<OpenRegistrationPart, string>> = {
  mail: 'a mail server',
  'legal-documents': 'the terms and the privacy notice',
};

/** The words of a part, by the name that a refusal carries. */
const partWords: ReadonlyMap<string, string> = new Map(Object.entries(words));

/** The missing parts that a refusal of open registration names. */
export function missingPartsOf(error: unknown): string[] {
  if (error === null || typeof error !== 'object') return [];
  const missing: unknown = Object.fromEntries(Object.entries(error))['missing'];
  return Array.isArray(missing)
    ? missing.filter((part): part is string => typeof part === 'string')
    : [];
}

/**
 * The sentence of a refused change to open registration, which names each
 * missing part so the operator knows what to set.
 */
export function openRegistrationMissingText(
  missing: readonly string[],
): string {
  const named = missing.map((part) => partWords.get(part) ?? part);
  if (named.length === 0)
    return 'Open registration needs parts that this installation does not have.';
  const list =
    named.length === 1
      ? (named[0] ?? '')
      : `${named.slice(0, -1).join(', ')} and ${named.at(-1) ?? ''}`;
  // An administrator sets the mail server and the legal documents on the
  // accounts page (record 0148).
  const here = [
    missing.includes('mail') ? 'the mail server' : '',
    missing.includes('legal-documents') ? 'the legal documents' : '',
  ].filter(Boolean);
  return [
    `Anybody can sign up only when the installation has ${list}.`,
    ...(here.length === 0
      ? []
      : [`Set up ${here.join(' and ')} on this page.`]),
  ].join(' ');
}

/** The page of a sign-up under open registration (record 0114). */
export const signUpRoute = '/signup';

/** The page that a verification link opens. The server writes this path. */
export const verificationRoute = '/verify';

/** The shape of a verification token, as the contract states it. */
const verificationTokenPattern = /^[A-Za-z0-9_.-]{1,512}$/;

/** The token of a verification link, or `null` when the fragment holds none. */
export function verificationTokenOf(hash: string): string | null {
  const token = hash.startsWith('#') ? hash.slice(1) : hash;
  return verificationTokenPattern.test(token) ? token : null;
}

/** The page that asks for a password reset message (record 0141). */
export const forgotPasswordRoute = '/forgot-password';

/**
 * The page that a reset link opens. The server writes the same path into
 * every reset message, in `apps/server/src/auth/better-auth.ts`.
 */
export const resetPasswordRoute = '/reset-password';

/** The shape of a reset token, as the contract states it. */
const resetTokenPattern = /^[A-Za-z0-9_-]{1,512}$/;

/** The token of a reset link, or `null` when the fragment holds none. */
export function resetTokenOf(hash: string): string | null {
  const token = hash.startsWith('#') ? hash.slice(1) : hash;
  return resetTokenPattern.test(token) ? token : null;
}

/** The units of a byte count, each 1024 times the one before. */
const byteUnits = ['bytes', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * A byte count in words, such as `512 bytes` or `1.5 GB`.
 *
 * One decimal under ten of a unit and none above, so a number reads at a
 * glance and does not change its width with every byte.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < byteUnits.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${String(Math.round(value))} bytes`;
  const shown = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${String(shown)} ${byteUnits[unit] ?? 'bytes'}`;
}

/**
 * The storage line of an account, such as `1.2 MB of 5 GB used`.
 *
 * An account cached by an earlier release knows no limit, and the line is
 * then empty rather than wrong.
 */
export function storageLine(storage: {
  readonly usedBytes: number;
  readonly limitBytes: number;
}): string {
  if (storage.limitBytes <= 0) return '';
  return `${formatBytes(storage.usedBytes)} of ${formatBytes(storage.limitBytes)} used`;
}

/** The bytes of one gigabyte, the unit in which a person states a limit. */
const gigabyte = 1024 * 1024 * 1024;

/** A limit in gigabytes, as the limit field shows it. */
export function gigabytesOf(bytes: number): string {
  return String(Math.round((bytes / gigabyte) * 100) / 100);
}

/**
 * The bytes of a limit that a person typed in gigabytes, or `null` for a text
 * that is not a positive number.
 */
export function bytesOfGigabytes(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const bytes = Math.round(Number(trimmed) * gigabyte);
  if (!Number.isSafeInteger(bytes) || bytes < 1) return null;
  return bytes;
}

/**
 * The name of an account in a row.
 *
 * Registration stores the address as the name when a person gives none, so a
 * name that repeats the address is no name.
 */
export function accountName(account: AccountSummary): string {
  if (
    account.name !== null &&
    account.name !== '' &&
    account.name !== account.email
  )
    return account.name;
  return account.email ?? 'Account';
}

/** The word of an installation role. */
export function roleWord(role: AccountSummary['installationRole']): string {
  return role === 'administrator' ? 'Administrator' : 'Member';
}

/**
 * The facts of one account row, in the order a person reads them.
 *
 * The first two show on the row. The rest go to the tooltip of the line,
 * because a row states one name and a small number of facts.
 */
export function accountFacts(account: AccountSummary, now: number): string[] {
  const facts: string[] = [];
  if (account.self) facts.push('You');
  facts.push(roleWord(account.installationRole));
  if (account.state === 'disabled') facts.push('Disabled');
  // A locked account keeps only the way to unlock it (record 0201).
  if (account.controls.standing === 'locked') facts.push('Locked');
  facts.push(
    // The last activity is the last use of a session that still exists, so
    // an account that signed out on every device has none.
    account.lastActiveAt === null
      ? 'Not signed in'
      : `Active ${relativeTime(account.lastActiveAt, now)}`,
  );
  const line = storageLine(account.storage);
  if (line !== '') facts.push(line);
  if (
    account.name !== null &&
    account.name !== account.email &&
    account.email !== null
  )
    facts.push(account.email);
  return facts;
}

/** How many accounts are enabled administrators. */
export function enabledAdministrators(
  accounts: readonly AccountSummary[],
): number {
  return accounts.filter(
    (account) =>
      account.installationRole === 'administrator' &&
      account.state === 'enabled',
  ).length;
}

/** One change that an administrator can make to one account. */
export type AccountAction =
  | 'make-administrator'
  | 'make-member'
  | 'disable'
  | 'enable'
  | 'change-controls'
  | 'remove';

/**
 * The actions that one account row offers.
 *
 * The last enabled administrator offers no change that would leave the
 * installation without one (record 0110). The account of the reader offers
 * no removal here, because an own account is removed from Settings with the
 * password (record 0111).
 */
export function accountActions(
  account: AccountSummary,
  administrators: number,
): AccountAction[] {
  const lastAdministrator =
    account.installationRole === 'administrator' &&
    account.state === 'enabled' &&
    administrators <= 1;
  const actions: AccountAction[] = [];
  if (account.installationRole === 'member') actions.push('make-administrator');
  else if (!lastAdministrator) actions.push('make-member');
  if (account.state === 'disabled') actions.push('enable');
  else if (!lastAdministrator) actions.push('disable');
  actions.push('change-controls');
  if (!account.self && !lastAdministrator) actions.push('remove');
  return actions;
}

/** The label of one account action. */
export function accountActionLabel(action: AccountAction): string {
  switch (action) {
    case 'make-administrator':
      return 'Make administrator';
    case 'make-member':
      return 'Make member';
    case 'disable':
      return 'Disable';
    case 'enable':
      return 'Enable';
    case 'change-controls':
      return 'Change limits and access';
    case 'remove':
      return 'Remove account';
  }
}

/** The sentence after one account action succeeded. */
export function accountActionNotice(
  action: Exclude<AccountAction, 'remove' | 'change-controls'>,
  name: string,
): string {
  switch (action) {
    case 'make-administrator':
      return `${name} is an administrator now.`;
    case 'make-member':
      return `${name} is a member now.`;
    case 'disable':
      return `${name} is disabled. The account is signed out and cannot sign in.`;
    case 'enable':
      return `${name} is enabled. The account can sign in again.`;
  }
}

/** The facts of one invitation row. */
export function invitationFacts(invitation: Invitation, now: number): string[] {
  return [
    invitation.state === 'expired'
      ? 'Expired'
      : `Expires ${relativeTime(invitation.expiresAt, now)}`,
    invitation.mailed ? 'Sent by mail' : 'Link shown once',
  ];
}

/** The sentence of a registration policy. */
export function registrationPolicyText(policy: 'invitation' | 'open'): string {
  return policy === 'invitation'
    ? 'Only a person with an invitation can make an account.'
    : 'A person who proves their address can make an account.';
}
