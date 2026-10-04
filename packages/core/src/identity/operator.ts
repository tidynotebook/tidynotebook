/**
 * The use cases of the operator API and of the portal handoff (record 0190).
 *
 * A service of the operator, such as a billing service, reaches the controls
 * of an account through these use cases with one bearer token and no session.
 * None of them reads or writes a note, a workspace or a published link: the
 * port below has no method that could.
 *
 * The handoff lets the portal of the operator learn which person opened it.
 * The application asks for a single-use token that works for 60 seconds, the
 * store keeps only its digest, and the portal redeems it here once.
 */
import { fail, ok, type Result } from '../files/model.ts';
import type { Actor } from './actor.ts';
import {
  applyControlsChange,
  controlsFitRole,
  type AccountControls,
  type ControlsChange,
  type ControlsWrite,
} from './controls.ts';
import type { AccountState, InstallationRole } from './installation.ts';
import { normalizeEmail } from './registration.ts';

/** What an account used, with the transfer of one month in UTC. */
export type AccountUsage = {
  readonly usedBytes: bigint;
  readonly textBytes: bigint;
  /** The month of the two transfer counts, as `YYYY-MM`. */
  readonly month: string;
  readonly publishedTransferBytes: bigint;
  readonly downloadBytes: bigint;
};

/** One account as the operator reads it. It names no note. */
export type OperatorAccountRecord = {
  readonly accountId: string;
  readonly email: string | null;
  readonly role: InstallationRole;
  readonly state: AccountState;
  readonly createdAt: string;
  readonly controls: AccountControls;
  readonly usage: AccountUsage;
};

/** The totals of the installation for one month in UTC (record 0193). */
export type OperatorTotals = {
  readonly month: string;
  readonly publishedTransferBytes: bigint;
  readonly downloadBytes: bigint;
  readonly objectWrites: bigint;
  readonly objectReads: bigint;
};

/** What happened to an account. */
export type AccountEventKind = 'made' | 'verified' | 'removed';

/** One account event, in the order of its commit. */
export type AccountEvent = {
  readonly cursor: number;
  readonly accountId: string;
  readonly kind: AccountEventKind;
  readonly occurredAt: string;
};

/** The account that one handoff names. */
export type HandoffAccount = {
  readonly accountId: string;
  readonly email: string | null;
};

/** What a removal through the operator answers. */
export type OperatorRemoval = 'removed' | 'missing' | 'last_administrator';

/** Reads and writes of the operator, in one transaction with no account. */
export type OperatorTransaction = {
  /** The account of one address, or `null`. */
  findAccount(email: string): Promise<string | null>;
  /** One account with its controls and its usage of one month, or `null`. */
  account(
    accountId: string,
    month: string,
  ): Promise<OperatorAccountRecord | null>;
  /** Writes every control of one account with the revision that it read. */
  setControls(
    accountId: string,
    revision: number,
    controls: AccountControls,
  ): Promise<ControlsWrite>;
  /** Removes one account through the removal of record 0111. */
  remove(accountId: string): Promise<OperatorRemoval>;
  /** The totals of the installation for one month. */
  totals(month: string): Promise<OperatorTotals>;
  /** The account events after a cursor, oldest first. */
  events(after: number, limit: number): Promise<readonly AccountEvent[]>;
  /** Marks one handoff used and answers its account, or `null`. */
  redeemHandoff(tokenDigest: string): Promise<HandoffAccount | null>;
};

/** Opens the transactions of the operator. */
export type OperatorStore = {
  operator<T>(run: (tx: OperatorTransaction) => Promise<T>): Promise<T>;
};

/** The most events of one answer, and the number when a reader names none. */
export const maxAccountEventPage = 500;
export const defaultAccountEventPage = 100;

/** The calendar month in UTC of one instant, as `YYYY-MM`. */
export function usageMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

/** Whether a digest is a SHA-256 in lower case hexadecimal. */
function isDigest(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/** Finds one account by its address and reads it. */
export function findOperatorAccount(
  store: OperatorStore,
  email: string,
  now: Date,
): Promise<Result<OperatorAccountRecord>> {
  const address = normalizeEmail(email);
  if (address === null)
    return Promise.resolve(fail<OperatorAccountRecord>('not_found'));
  return store.operator(async (tx) => {
    const accountId = await tx.findAccount(address);
    if (accountId === null) return fail<OperatorAccountRecord>('not_found');
    const found = await tx.account(accountId, usageMonth(now));
    return found === null
      ? fail<OperatorAccountRecord>('not_found')
      : ok(found);
  });
}

/** Reads one account, its controls with their revision, and its usage. */
export function readOperatorAccount(
  store: OperatorStore,
  accountId: string,
  now: Date,
): Promise<Result<OperatorAccountRecord>> {
  return store.operator(async (tx) => {
    const found = await tx.account(accountId, usageMonth(now));
    return found === null
      ? fail<OperatorAccountRecord>('not_found')
      : ok(found);
  });
}

/**
 * Changes the controls of one account with the revision that the service
 * read (record 0189).
 *
 * The change is decided by `applyControlsChange`, as the change of an
 * administrator is. An old revision answers `controls_changed` and writes
 * nothing, and the database checks the revision again in the write.
 */
export function setOperatorControls(
  store: OperatorStore,
  accountId: string,
  change: ControlsChange,
  now: Date,
): Promise<Result<OperatorAccountRecord>> {
  return store.operator(async (tx) => {
    const month = usageMonth(now);
    const found = await tx.account(accountId, month);
    if (found === null) return fail<OperatorAccountRecord>('not_found');
    const next = applyControlsChange(found.controls, change);
    if (!next.ok) return fail<OperatorAccountRecord>(next.error.code);
    if (!controlsFitRole(found.role, next.value))
      return fail<OperatorAccountRecord>('forbidden');
    const written = await tx.setControls(
      accountId,
      change.revision,
      next.value,
    );
    if (written === 'missing') return fail<OperatorAccountRecord>('not_found');
    if (written === 'changed')
      return fail<OperatorAccountRecord>('controls_changed');
    const after = await tx.account(accountId, month);
    return after === null
      ? fail<OperatorAccountRecord>('not_found')
      : ok(after);
  });
}

/** Removes one account through the removal of record 0111. */
export function removeOperatorAccount(
  store: OperatorStore,
  accountId: string,
): Promise<Result<void>> {
  return store.operator(async (tx) => {
    const removed = await tx.remove(accountId);
    if (removed === 'missing') return fail<void>('not_found');
    if (removed === 'last_administrator')
      return fail<void>('last_administrator');
    return ok(undefined);
  });
}

/** The totals of one month, the current month in UTC when none is named. */
export function readOperatorTotals(
  store: OperatorStore,
  month: string | null,
  now: Date,
): Promise<Result<OperatorTotals>> {
  const named = month ?? usageMonth(now);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(named))
    return Promise.resolve(fail<OperatorTotals>('forbidden'));
  return store.operator(async (tx) => ok(await tx.totals(named)));
}

/** The account events after a cursor, and the cursor to read after next. */
export function listAccountEvents(
  store: OperatorStore,
  after: number,
  limit: number | null,
): Promise<
  Result<{ readonly events: readonly AccountEvent[]; readonly cursor: number }>
> {
  const page = Math.min(
    maxAccountEventPage,
    Math.max(1, limit ?? defaultAccountEventPage),
  );
  return store.operator(async (tx) => {
    const events = await tx.events(Math.max(0, after), page);
    return ok({ events, cursor: events.at(-1)?.cursor ?? Math.max(0, after) });
  });
}

/**
 * Redeems one handoff. A used, an expired and an unknown token all answer
 * `not_found`, so the answer states nothing about the token.
 */
export function redeemHandoff(
  store: OperatorStore,
  tokenDigest: string,
): Promise<Result<HandoffAccount>> {
  if (!isDigest(tokenDigest))
    return Promise.resolve(fail<HandoffAccount>('not_found'));
  return store.operator(async (tx) => {
    const account = await tx.redeemHandoff(tokenDigest);
    return account === null ? fail<HandoffAccount>('not_found') : ok(account);
  });
}

/** What the handoff of one portal needs from the account side. */
export type HandoffStore = {
  account<T>(
    actor: Actor,
    run: (tx: {
      openHandoff(tokenDigest: string): Promise<void>;
    }) => Promise<T>,
  ): Promise<T>;
};

/**
 * The address of the portal with the token in its query.
 *
 * The path joins the address of the portal as text, so the portal can live
 * under a path of its own, and the contract holds the path to parts that
 * cannot leave it.
 */
export function portalAddress(
  portal: string,
  path: string,
  token: string,
): string {
  const url = new URL(`${portal.replace(/\/+$/, '')}${path}`);
  url.searchParams.set('token', token);
  return url.href;
}

/**
 * Opens the portal for the account of a session (record 0190).
 *
 * The store keeps the digest of the token, which lives 60 seconds and works
 * once. An installation that names no portal answers `not_found`. A locked
 * account opens it too, because the portal is the way to unlock it (record
 * 0201).
 */
export function openAccountPortal(
  store: HandoffStore,
  actor: Actor,
  input: {
    readonly portal: string | null;
    readonly path: string;
    readonly token: string;
    readonly tokenDigest: string;
  },
): Promise<Result<string>> {
  const portal = input.portal;
  if (portal === null) return Promise.resolve(fail<string>('not_found'));
  if (!isDigest(input.tokenDigest))
    return Promise.resolve(fail<string>('forbidden'));
  return store.account(actor, async (tx) => {
    await tx.openHandoff(input.tokenDigest);
    return ok(portalAddress(portal, input.path, input.token));
  });
}
