/**
 * Storage ports of the installation: accounts, invitations, and the
 * registration policy (records 0108 to 0112).
 *
 * The core owns these interfaces and `packages/storage-server` implements
 * them. Every write of an installation transaction goes through a database
 * function that checks the same rule again, so a caller that bypasses a use
 * case is refused as well.
 */
import type { Actor } from './actor.ts';
import type {
  AccountStanding,
  AccountState,
  InstallationRole,
  RegistrationPolicy,
} from './installation.ts';
import type {
  LegalDocumentName,
  StoredInstallationSettings,
  StoredLegalDocument,
  StoredMailSettings,
} from './installation-settings.ts';
import type {
  ReportReason,
  ReportedLinkState,
} from '../publications/report.ts';

/** One account as an administrator sees it. It names no note. */
export type AccountRecord = {
  readonly accountId: string;
  readonly email: string | null;
  readonly name: string | null;
  readonly role: InstallationRole;
  readonly state: AccountState;
  /** Instant at which the account was made, as an ISO 8601 text. */
  readonly createdAt: string;
  /** Last use of a session of the account, or `null` for none. */
  readonly lastActiveAt: string | null;
  readonly usedBytes: bigint;
  readonly limitBytes: bigint;
};

/** One invitation that nobody used or revoked. It holds no token. */
export type InvitationRecord = {
  readonly invitationId: string;
  readonly email: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  /** Whether the link went to the address by mail. */
  readonly mailed: boolean;
};

/**
 * One open report of a published link, as an administrator reads it (record
 * 0119). It holds no fact of a note and no fact of the workspace. The address
 * of the link is sealed with a key of the server (record 0123).
 */
export type LinkReportRecord = {
  readonly reportId: string;
  readonly publicationId: string;
  readonly reason: ReportReason;
  readonly note: string | null;
  /** The sealed address of the link, or `null` when none was kept. */
  readonly sealedAddress: string | null;
  readonly linkState: ReportedLinkState;
  readonly createdAt: string;
};

/** What a new invitation stores. The token itself never reaches storage. */
export type NewInvitation = {
  readonly invitationId: string;
  /** SHA-256 of the token, in lower case hexadecimal. */
  readonly tokenDigest: string;
  readonly email: string;
  readonly expiresAt: string;
  readonly mailed: boolean;
};

/**
 * Reads and writes of the installation, under the installation lock.
 *
 * The transaction is bound to the actor that opened it, and the lock is the
 * first lock of the one lock order of record 0112, so two administrators who
 * change each other at the same time are ordered.
 */
export type InstallationTransaction = {
  /** The standing of one account, or `null` for no account or a removed one. */
  standing(accountId: string): Promise<AccountStanding | null>;
  /** How many accounts are enabled administrators. */
  enabledAdministrators(): Promise<number>;
  /** Every account that is not removed, oldest first. */
  accounts(): Promise<readonly AccountRecord[]>;
  /** Changes the installation role of one account. */
  setRole(accountId: string, role: InstallationRole): Promise<void>;
  /**
   * Changes the state of one account. Disabling it also ends every session
   * of it, in the same transaction.
   */
  setState(accountId: string, state: AccountState): Promise<void>;
  /** Changes the byte limit of one account. */
  setLimit(accountId: string, limitBytes: bigint): Promise<void>;
  /**
   * Removes one account and every workspace it owns, and keeps its row as a
   * tombstone (record 0111).
   */
  remove(accountId: string): Promise<void>;
  /** Every invitation that nobody used or revoked, newest first. */
  invitations(): Promise<readonly InvitationRecord[]>;
  /**
   * Stores one invitation and answers it. Answers `null` when an account
   * already signs in with the address.
   */
  invite(invitation: NewInvitation): Promise<InvitationRecord | null>;
  /** Revokes one invitation. Answers `false` when it does not wait. */
  revokeInvitation(invitationId: string): Promise<boolean>;
  /** Every open report of a published link, newest first. */
  reports(): Promise<readonly LinkReportRecord[]>;
  /** Closes one open report. Answers `false` when it is not open. */
  dismissReport(reportId: string): Promise<boolean>;
  /**
   * Takes down the link of one open report and closes every open report of
   * it. Answers `false` when the report is not open.
   */
  takeDown(reportId: string): Promise<boolean>;
  /** The registration policy of the installation. */
  registrationPolicy(): Promise<RegistrationPolicy>;
  /** Changes the registration policy of the installation. */
  setRegistrationPolicy(policy: RegistrationPolicy): Promise<void>;
  /** The mail transport and the legal documents (record 0148). */
  settings(): Promise<StoredInstallationSettings>;
  /** Sets the mail transport, or removes it with `null`. */
  setMailSettings(mail: StoredMailSettings | null): Promise<void>;
  /** Sets one legal document, or removes it with `null`. */
  setLegalDocument(
    name: LegalDocumentName,
    document: StoredLegalDocument | null,
  ): Promise<void>;
};

/** Opens the transactions of the installation use cases. */
export type InstallationStore = {
  /** Runs `run` in one transaction that holds the installation lock. */
  installation<T>(
    actor: Actor,
    run: (tx: InstallationTransaction) => Promise<T>,
  ): Promise<T>;
};

/**
 * Why a registration may make an account (record 0108).
 *
 * `first-run` makes the first account, as an administrator, and only while
 * no account exists. `invitation` names the digest of the token of a valid
 * invitation that binds the address of the identity user.
 */
export type RegistrationGround =
  | { readonly kind: 'first-run' }
  | { readonly kind: 'invitation'; readonly tokenDigest: string }
  | { readonly kind: 'open' };

/** What one registration asks the store to make. */
export type RegistrationRequest = {
  /** The identity user that the account links. */
  readonly authUserId: string;
  readonly ground: RegistrationGround;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly limitBytes: bigint;
};

/** The one registration path of the installation. */
export type RegistrationStore = {
  /**
   * Makes the account, its personal workspace and its settings in one
   * transaction, and answers the account. The answer is `null` when no
   * ground allows the account, for example a used invitation or a first run
   * after the first account.
   */
  register(request: RegistrationRequest): Promise<string | null>;
  /**
   * The address that a valid invitation binds, or `null` when the digest
   * opens nothing.
   */
  invitationAddress(tokenDigest: string): Promise<string | null>;
  /** The registration policy, which is a public fact of the installation. */
  registrationPolicy(): Promise<RegistrationPolicy>;
};

/**
 * The mail transport and the legal documents (record 0148), which the server
 * reads with no session: to send a message that a stranger causes and to
 * serve a legal page. The password stays sealed.
 */
export type InstallationSettingsReader = {
  installationSettings(): Promise<StoredInstallationSettings>;
};
